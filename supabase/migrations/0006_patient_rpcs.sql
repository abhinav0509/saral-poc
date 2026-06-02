-- ============================================================
-- SARAL · 0006 · PATIENT-FACING RPCs (anon)
-- Unauthenticated patients reach Saral only through these SECURITY
-- DEFINER functions, keyed by an opaque token or clinic code. They
-- never return other patients' PII and never allow listing/enumeration,
-- so after the P2 RLS flip anon can keep zero direct table access.
-- ============================================================

-- Public clinic info for the walk-in landing (/walkin/[code]).
CREATE OR REPLACE FUNCTION get_clinic_public(p_code text)
  RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'code', code, 'name', name, 'address', address, 'doctor_name', doctor_name
  )
  FROM clinics
  WHERE code = lower(btrim(p_code))
$$;

-- Everything the live visit page needs (/v/[public_token]) in one call:
-- the visit, its clinic, queue position + ETA, an anonymised mini-queue
-- (tokens only), and the prescription once the visit is done.
CREATE OR REPLACE FUNCTION get_visit_public(p_public_token uuid)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v       visits;
  c       clinics;
  v_ahead int;
  v_mini  jsonb;
  v_presc jsonb;
BEGIN
  SELECT * INTO v FROM visits WHERE public_token = p_public_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM clinics WHERE id = v.clinic_id;

  IF v.status = 'waiting' THEN
    SELECT count(*) INTO v_ahead
    FROM visits w
    WHERE w.clinic_id = v.clinic_id
      AND w.status = 'waiting'
      AND w.joined_at < v.joined_at;
  ELSE
    v_ahead := 0;
  END IF;

  -- Anonymised mini-queue: a 5-slot window around this patient, tokens only.
  WITH active AS (
    SELECT id, token, status,
           row_number() OVER (ORDER BY joined_at) AS rn,
           count(*) OVER () AS total
    FROM visits
    WHERE clinic_id = v.clinic_id AND status IN ('waiting', 'now_serving')
  ), mer AS (
    SELECT rn, total FROM active WHERE id = v.id
  )
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'token', a.token,
             'kind', CASE WHEN a.id = v.id THEN 'you'
                          WHEN a.status = 'now_serving' THEN 'now'
                          ELSE 'wait' END
           ) ORDER BY a.rn
         ), '[]'::jsonb)
  INTO v_mini
  FROM active a CROSS JOIN mer
  WHERE a.rn BETWEEN greatest(1, least(mer.rn - 2, mer.total - 4))
                 AND greatest(1, least(mer.rn - 2, mer.total - 4)) + 4;

  IF v.status = 'done' THEN
    SELECT jsonb_build_object(
      'photo_url', p.photo_url,
      'typed_meds', p.typed_meds,
      'follow_up_note', p.follow_up_note,
      'sent_at', p.sent_at
    ) INTO v_presc
    FROM prescriptions p
    WHERE p.visit_id = v.id
    ORDER BY p.created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'visit', jsonb_build_object(
      'public_token', v.public_token,
      'token', v.token,
      'patient_name', v.patient_name,
      'age', v.age,
      'gender', v.gender,
      'reason', v.reason,
      'status', v.status,
      'booked_for', v.booked_for,
      'ended_at', v.ended_at
    ),
    'clinic', jsonb_build_object(
      'code', c.code, 'name', c.name, 'address', c.address, 'doctor_name', c.doctor_name
    ),
    'ahead_count', v_ahead,
    'eta_minutes', v_ahead * 6,
    'mini_queue', coalesce(v_mini, '[]'::jsonb),
    'prescription', v_presc
  );
END;
$$;

-- Slot availability for a clinic on a given IST calendar day, for the
-- patient self-check-in slot picker. Returns raw booked timestamps +
-- doctor blocks (no patient identities); the client builds the booked map.
CREATE OR REPLACE FUNCTION get_slot_availability(p_code text, p_date date)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_start  timestamptz := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_end    timestamptz := (p_date::text || ' 23:59:59.999')::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_books  jsonb;
  v_blocks jsonb;
BEGIN
  SELECT id INTO v_clinic FROM clinics WHERE code = lower(btrim(p_code));
  IF v_clinic IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(booked_for) ORDER BY booked_for), '[]'::jsonb)
  INTO v_books
  FROM visits
  WHERE clinic_id = v_clinic
    AND booked_for IS NOT NULL
    AND status <> 'dropped'
    AND booked_for BETWEEN v_start AND v_end;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'starts_at', starts_at, 'ends_at', ends_at, 'kind', kind, 'title', title
         ) ORDER BY starts_at), '[]'::jsonb)
  INTO v_blocks
  FROM clinic_blocks
  WHERE clinic_id = v_clinic
    AND starts_at <= v_end
    AND ends_at >= v_start;

  RETURN jsonb_build_object('bookings', v_books, 'blocks', v_blocks);
END;
$$;

-- Atomic patient self-check-in: resolve clinic by code, allocate the
-- per-day token under an advisory lock, and insert the visit in one
-- transaction. Raises SLOT_CONFLICT if the chosen slot was just taken.
CREATE OR REPLACE FUNCTION create_self_checkin(
  p_code       text,
  p_name       text,
  p_age        int,
  p_gender     text,
  p_mobile     text,
  p_reason     text DEFAULT NULL,
  p_booked_for timestamptz DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_day    date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_max    int;
  v_token  text;
  v_row    visits;
BEGIN
  SELECT id INTO v_clinic FROM clinics WHERE code = lower(btrim(p_code));
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'CLINIC_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  IF coalesce(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;
  IF length(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'MOBILE_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_clinic::text || ':' || v_day::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(token, '\D', '', 'g'), '')::int), 0)
  INTO v_max
  FROM visits
  WHERE clinic_id = v_clinic
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_day;
  v_token := 'T-' || lpad((v_max + 1)::text, 2, '0');

  BEGIN
    INSERT INTO visits (clinic_id, token, patient_name, age, gender, mobile, source, status, reason, booked_for)
    VALUES (
      v_clinic, v_token, btrim(p_name), p_age, p_gender,
      right(regexp_replace(p_mobile, '\D', '', 'g'), 10),
      'qr', 'waiting', nullif(btrim(coalesce(p_reason, '')), ''), p_booked_for
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- The slot uniqueness index fired — someone took this time first.
    RAISE EXCEPTION 'SLOT_CONFLICT' USING errcode = '23505';
  END;

  RETURN jsonb_build_object('public_token', v_row.public_token, 'token', v_row.token);
END;
$$;

-- Patient cancels their own visit by token.
CREATE OR REPLACE FUNCTION cancel_visit_public(p_public_token uuid)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row visits;
BEGIN
  UPDATE visits
  SET status = 'dropped', ended_at = now()
  WHERE public_token = p_public_token
    AND status IN ('waiting', 'now_serving')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_row.status);
END;
$$;

-- anon (patients) + authenticated (staff app previews) may call these.
GRANT EXECUTE ON FUNCTION get_clinic_public(text)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_visit_public(uuid)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_slot_availability(text, date)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_self_checkin(text, text, int, text, text, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_visit_public(uuid)                       TO anon, authenticated;

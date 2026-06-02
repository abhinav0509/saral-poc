-- ============================================================
-- SARAL · 0005 · ONBOARDING + STAFF INVITE RPCs
-- SECURITY DEFINER so a brand-new clinic can self-serve and admins
-- can pre-authorise staff. All calls are gated by auth.uid()/role.
-- ============================================================

-- Create a clinic and make the caller its admin. Used the first time a
-- clinic signs up. Returns the new clinic row.
CREATE OR REPLACE FUNCTION create_clinic_and_admin(
  p_name        text,
  p_code        text,
  p_address     text DEFAULT NULL,
  p_doctor_name text DEFAULT NULL
)
  RETURNS clinics
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_clinic clinics;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;
  IF coalesce(btrim(p_name), '') = '' OR coalesce(btrim(p_code), '') = '' THEN
    RAISE EXCEPTION 'Clinic name and code are required';
  END IF;

  INSERT INTO clinics (code, name, address, doctor_name)
  VALUES (lower(btrim(p_code)), btrim(p_name), p_address, p_doctor_name)
  RETURNING * INTO v_clinic;

  INSERT INTO clinic_members (user_id, clinic_id, role)
  VALUES (v_uid, v_clinic.id, 'admin')
  ON CONFLICT (user_id, clinic_id) DO UPDATE SET role = 'admin';

  RETURN v_clinic;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A clinic with code "%" already exists', lower(btrim(p_code))
    USING errcode = '23505';
END;
$$;

-- Pre-authorise a staff phone for a clinic. Only that clinic's admins may
-- call. If the phone already belongs to the clinic, this is a no-op.
-- Returns the invite id (NULL when the person is already a member).
CREATE OR REPLACE FUNCTION invite_staff(
  p_clinic uuid,
  p_phone  text,
  p_role   staff_role DEFAULT 'receptionist'
)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_phone10 text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_invite  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;
  IF NOT is_clinic_admin(p_clinic) THEN
    RAISE EXCEPTION 'Only a clinic admin can invite staff' USING errcode = '42501';
  END IF;
  IF length(v_phone10) < 10 THEN
    RAISE EXCEPTION 'A valid 10-digit phone number is required';
  END IF;

  -- Already a member (via an existing profile with this phone)? No-op.
  IF EXISTS (
    SELECT 1
    FROM clinic_members cm
    JOIN profiles pr ON pr.id = cm.user_id
    WHERE cm.clinic_id = p_clinic
      AND right(regexp_replace(coalesce(pr.phone, ''), '\D', '', 'g'), 10) = v_phone10
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO clinic_invites (clinic_id, phone, role, invited_by)
  VALUES (p_clinic, v_phone10, p_role, v_uid)
  RETURNING id INTO v_invite;

  RETURN v_invite;
END;
$$;

GRANT EXECUTE ON FUNCTION create_clinic_and_admin(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION invite_staff(uuid, text, staff_role)            TO authenticated;

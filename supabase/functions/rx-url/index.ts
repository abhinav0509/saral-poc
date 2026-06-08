// rx-url — mint a short-lived signed URL for a patient's prescription image.
//
// The prescriptions bucket is PRIVATE (migration 0011). Patients are anonymous,
// so they can't read storage directly; this service-role function takes the
// visit's public_token, confirms the visit is `done` and has a prescription
// photo, and returns a time-boxed signed URL. Mirrors get_visit_public: only
// completed visits expose an Rx.
//   Deploy: supabase functions deploy rx-url --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SIGNED_URL_TTL = 3600; // 1 hour — long enough to view/download, not permanent.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string") return json({ error: "missing token" }, 400);
    // public_token is a uuid column — a malformed value would raise a cast error.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(token)) return json({ url: null });

    // Resolve the visit by its opaque public token. Only completed visits expose an Rx.
    const { data: visit, error: vErr } = await supabase
      .from("visits")
      .select("id, status")
      .eq("public_token", token)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!visit || visit.status !== "done") return json({ url: null });

    const { data: presc, error: pErr } = await supabase
      .from("prescriptions")
      .select("photo_url")
      .eq("visit_id", visit.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pErr) throw pErr;

    const path = presc?.photo_url as string | null | undefined;
    if (!path) return json({ url: null });

    const { data: signed, error: sErr } = await supabase
      .storage.from("prescriptions").createSignedUrl(path, SIGNED_URL_TTL);
    if (sErr) throw sErr;

    return json({ url: signed.signedUrl });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

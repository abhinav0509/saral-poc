// WhatsApp Cloud API webhook: GET verifies Meta's challenge; POST records
// delivery/read/failed receipts onto message_outbox by provider_id.
//   Deploy: supabase functions deploy whatsapp-webhook   (verify_jwt = false)
//   Point Meta's webhook URL at it + set WHATSAPP_VERIFY_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---- verification handshake ----
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  // ---- delivery receipts ----
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    try {
      const statuses = body?.entry?.flatMap((e: any) =>
        e?.changes?.flatMap((c: any) => c?.value?.statuses ?? []) ?? [],
      ) ?? [];
      for (const s of statuses) {
        if (!s?.id) continue;
        // delivered/read are informational; only 'failed' overrides a sent row.
        const patch = s.status === "failed"
          ? { status: "failed", error: JSON.stringify(s.errors ?? "failed").slice(0, 400) }
          : { sent_at: new Date(Number(s.timestamp ?? Date.now() / 1000) * 1000).toISOString() };
        await supabase.from("message_outbox").update(patch).eq("provider_id", s.id);
      }
    } catch (_e) {
      // Always 200 so Meta doesn't retry-storm us on a parse hiccup.
    }
    return new Response("ok", { status: 200 });
  }

  return new Response("method not allowed", { status: 405 });
});

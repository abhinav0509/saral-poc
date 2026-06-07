// Drains message_outbox → Expo push (staff) + WhatsApp Cloud API (patients).
// Invoked by pg_cron (sweep) and pg_net (instant wake). Service-role.
//   Deploy: supabase functions deploy dispatch-outbox
//   WhatsApp stays DORMANT (rows left pending) until these secrets exist:
//     supabase secrets set WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const WA_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en";
const BATCH = 25;

interface OutboxRow {
  id: string;
  channel: "push" | "whatsapp";
  recipient: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

async function sendPush(row: OutboxRow): Promise<{ ok: boolean; providerId?: string; prune?: boolean; error?: string }> {
  const p = row.payload;
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: row.recipient, title: p.title, body: p.body, data: p.data ?? {}, sound: "default" }),
  });
  const json = await res.json().catch(() => ({}));
  const ticket = json?.data;
  if (ticket?.status === "ok") return { ok: true, providerId: ticket.id };
  const code = ticket?.details?.error;
  return { ok: false, prune: code === "DeviceNotRegistered", error: code ?? JSON.stringify(json).slice(0, 300) };
}

async function sendWhatsapp(row: OutboxRow): Promise<{ ok: boolean; providerId?: string; error?: string; dormant?: boolean }> {
  if (!WA_TOKEN || !WA_PHONE_ID) return { ok: false, dormant: true };
  const p = row.payload as { template: string; variables?: string[] };
  const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: row.recipient.replace(/^\+/, ""),
      type: "template",
      template: {
        name: p.template,
        language: { code: WA_LANG },
        components: [{ type: "body", parameters: (p.variables ?? []).map((t) => ({ type: "text", text: t })) }],
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  const id = json?.messages?.[0]?.id;
  if (res.ok && id) return { ok: true, providerId: id };
  return { ok: false, error: JSON.stringify(json?.error ?? json).slice(0, 400) };
}

Deno.serve(async () => {
  const { data: rows, error } = await supabase
    .from("message_outbox")
    .select("id, channel, recipient, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0, failed = 0, dormant = 0;
  for (const row of (rows ?? []) as OutboxRow[]) {
    // Claim: bump attempts + schedule the next retry up-front (exponential backoff).
    const attempts = row.attempts + 1;
    const backoffMin = Math.min(60, 2 ** row.attempts);
    const { data: claimed } = await supabase
      .from("message_outbox")
      .update({ attempts, next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // another worker took it

    const r = row.channel === "push" ? await sendPush(row) : await sendWhatsapp(row);

    if ("dormant" in r && r.dormant) {
      // No WhatsApp creds yet — undo the claim so it stays ready for go-live.
      dormant++;
      await supabase.from("message_outbox").update({ attempts: row.attempts, next_attempt_at: new Date().toISOString() }).eq("id", row.id);
      continue;
    }
    if (r.ok) {
      sent++;
      await supabase.from("message_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: r.providerId ?? null, error: null }).eq("id", row.id);
    } else {
      failed++;
      if ("prune" in r && r.prune) {
        await supabase.from("device_push_tokens").delete().eq("expo_token", row.recipient);
      }
      const dead = attempts >= row.max_attempts;
      await supabase.from("message_outbox").update({ status: dead ? "failed" : "pending", error: r.error ?? "send failed" }).eq("id", row.id);
    }
  }
  return new Response(JSON.stringify({ processed: rows?.length ?? 0, sent, failed, dormant }), {
    headers: { "Content-Type": "application/json" },
  });
});

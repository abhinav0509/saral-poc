/**
 * Message templates — pure builders, no I/O. One source of truth for both the
 * Phase-4 outbox (WhatsApp Cloud API template variables) and the dormant-period
 * `wa.me` / SMS fallback text, plus staff push copy. The Edge dispatcher maps
 * `template` + `variables` onto the approved Meta template; until WhatsApp is
 * live, callers send `fallbackText` via `wa.me`.
 */

export type MessageChannel = "push" | "whatsapp";

export type MessageEvent =
  // patient · WhatsApp
  | "booking_confirmation"
  | "queue_your_turn_near"
  | "prescription_ready"
  | "appointment_delayed"
  | "clinic_closed"
  | "follow_up_reminder"
  // staff · push
  | "new_walkin"
  | "emergency_at_reception";

export interface WhatsappMessage {
  channel: "whatsapp";
  event: MessageEvent;
  /** Approved Meta template name (Utility category). */
  template: string;
  /** Ordered body variables for the template. */
  variables: string[];
  /** Human text for the `wa.me` / SMS fallback (used until Cloud API is live). */
  fallbackText: string;
}

export interface PushMessage {
  channel: "push";
  event: MessageEvent;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** First name for a warm greeting; falls back to a friendly generic. */
export function firstName(name: string | null | undefined): string {
  const f = (name ?? "").trim().split(/\s+/)[0];
  return f || "there";
}

/* ============================================================
   Patient · WhatsApp (Utility)
   ============================================================ */

export function bookingConfirmation(p: {
  patientName: string;
  clinicName: string;
  token: string;
  liveUrl: string;
}): WhatsappMessage {
  return {
    channel: "whatsapp",
    event: "booking_confirmation",
    template: "booking_confirmation",
    variables: [firstName(p.patientName), p.clinicName, p.token, p.liveUrl],
    fallbackText:
      `Namaste ${firstName(p.patientName)}, you're checked in at ${p.clinicName}. ` +
      `Your token is ${p.token}. Track your live queue position here: ${p.liveUrl}`,
  };
}

export function queueYourTurnNear(p: {
  patientName: string;
  clinicName: string;
  token: string;
  liveUrl: string;
}): WhatsappMessage {
  return {
    channel: "whatsapp",
    event: "queue_your_turn_near",
    template: "queue_your_turn_near",
    variables: [firstName(p.patientName), p.clinicName, p.token],
    fallbackText:
      `Namaste ${firstName(p.patientName)}, you're up next at ${p.clinicName} ` +
      `(token ${p.token}). Please head back now. ${p.liveUrl}`,
  };
}

export function prescriptionReady(p: {
  patientName: string;
  clinicName: string;
  liveUrl: string;
}): WhatsappMessage {
  return {
    channel: "whatsapp",
    event: "prescription_ready",
    template: "prescription_ready",
    variables: [firstName(p.patientName), p.clinicName, p.liveUrl],
    fallbackText:
      `Namaste ${firstName(p.patientName)}, your prescription from ${p.clinicName} is ready. ` +
      `View it here: ${p.liveUrl}`,
  };
}

export function appointmentDelayed(p: {
  patientName: string;
  clinicName: string;
  delayMinutes: number;
}): WhatsappMessage {
  return {
    channel: "whatsapp",
    event: "appointment_delayed",
    template: "appointment_delayed",
    variables: [firstName(p.patientName), p.clinicName, String(p.delayMinutes)],
    fallbackText:
      `Namaste ${firstName(p.patientName)}, the doctor at ${p.clinicName} is handling an emergency ` +
      `and is running about ${p.delayMinutes} minutes behind. Thank you for your patience.`,
  };
}

export function clinicClosed(p: {
  patientName: string;
  clinicName: string;
}): WhatsappMessage {
  return {
    channel: "whatsapp",
    event: "clinic_closed",
    template: "clinic_closed",
    variables: [firstName(p.patientName), p.clinicName],
    fallbackText:
      `Namaste ${firstName(p.patientName)}, ${p.clinicName} had to stop earlier than planned today ` +
      `due to an emergency. We're so sorry for the trouble — please book again and we'll see you soon.`,
  };
}

export function followUpReminder(p: {
  patientName: string;
  clinicName: string;
  whenLabel: string;
}): WhatsappMessage {
  return {
    channel: "whatsapp",
    event: "follow_up_reminder",
    template: "follow_up_reminder",
    variables: [firstName(p.patientName), p.clinicName, p.whenLabel],
    fallbackText:
      `Namaste ${firstName(p.patientName)}, hope you're feeling better. A gentle reminder from ` +
      `${p.clinicName} — your follow-up is due ${p.whenLabel}. Reply here or call us to confirm. Take care.`,
  };
}

/* ============================================================
   Staff · push
   ============================================================ */

export function newWalkinPush(p: { patientName: string; token: string }): PushMessage {
  return {
    channel: "push",
    event: "new_walkin",
    title: "New walk-in",
    body: `${firstName(p.patientName)} joined the queue (${p.token}).`,
    data: { route: "/queue" },
  };
}

export function emergencyPush(p: { patientName: string }): PushMessage {
  return {
    channel: "push",
    event: "emergency_at_reception",
    title: "🚨 Emergency at reception",
    body: `${firstName(p.patientName)} needs urgent attention.`,
    data: { route: "/queue" },
  };
}

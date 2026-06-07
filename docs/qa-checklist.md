# Saral — Device QA Checklist

Manual pass on a real device before each release. Staff app = Expo (Metro on
`apps/staff`, port 8082) or an EAS build; patient = mobile browser. Tick each;
note device + build at the top.

> Device: ________  · Build/commit: ________  · Date: ________

## 1. Auth & onboarding (staff)
- [ ] Cold start with no session → **Welcome to Saral** sign-in screen.
- [ ] (Dev build) email+password sign-in works; (prod) phone OTP sends + verifies.
- [ ] Brand-new user → **"What's your name?"** → save → proceeds.
- [ ] New user with no clinic → **onboarding** (create clinic) → lands in the clinic.
- [ ] Invited user (phone) → after login lands directly in the inviting clinic.
- [ ] Home greets by the **real name** + correct avatar initial (not "Phoolwati").
- [ ] **More → switch clinic** (if ≥2 memberships) changes the active clinic everywhere.
- [ ] **More → Invite staff** (admin) sends an invite; non-admins don't see it.
- [ ] **Sign out** → returns to Welcome; relaunch stays signed out.
- [ ] Kill + relaunch while signed in → goes straight to Home (session persists).

## 2. Queue (staff)
- [ ] Now-serving card shows the right patient + live consult timer.
- [ ] **Call in** the next patient; previous one ends correctly.
- [ ] **Save Rx & call next** (camera capture + meds) works; patient sees Rx after.
- [ ] **Drop** a patient → confirm sheet → removed; toast shown.
- [ ] **Dialler** button opens the phone app with the patient's number.
- [ ] Row **⋮** menu: bring-in-now (interrupt), mark/remove emergency, WhatsApp link, history.
- [ ] Per-row **ETA** looks right (position × 6 + any running-behind delay).
- [ ] Realtime: a self-check-in on another device appears in the queue within ~1–2s.

## 3. Emergency (staff)
- [ ] Dashboard **Emergency → Call ambulance** → confirm → dials 108.
- [ ] **Add emergency walk-in** → name-only intake → **Add as emergency** → lands at the **top** with the red badge.
- [ ] **Bring in now** interrupts the current consult (previous patient returns to front).
- [ ] **Push everyone's wait** (+15/+30/+60) → running-behind banner appears.
- [ ] Row **remove emergency flag** → drops back into normal FIFO order.
- [ ] Queue overflow → **Cancel remaining today** → confirm → waiting list clears; **future-dated bookings are NOT cancelled**.

## 4. Booking / Calendar / Reminders / Search (staff)
- [ ] **Booking → new**: pick a slot (incl. "Pick date"); double-book is blocked with a split suggestion.
- [ ] **Calendar** week view renders visits + blocks; create/delete a block.
- [ ] **Reminders** lists due/upcoming/sent; WhatsApp send opens the right draft.
- [ ] **Search** finds a patient by name/mobile; opens history.
- [ ] **Patient history** shows visits/Rx; "Book again" works.

## 5. Patient web (round-trip)
- [ ] Share link from staff → opens `saral-poc.vercel.app/walkin/<code>` (not `saral.vercel.app`).
- [ ] Self-check-in: fill form, pick slot, get a token → live visit page.
- [ ] Live page: token, position, ETA, mini-queue render; updates as staff act (instant or ≤30s).
- [ ] **Running-behind**: staff push wait → patient sees the warm amber banner + higher ETA.
- [ ] **Slot load failure** (toggle airplane briefly): shows the error + **Retry**, not a blank/"no slots".
- [ ] **Cancel visit** (patient) works; **clinic cancels day** → patient sees the warm "clinic had to close" screen.
- [ ] When done: prescription + meds + follow-up show on the patient page.

## 6. Edge / resilience
- [ ] Airplane mode mid-action shows a clear error (toast), not a crash.
- [ ] Emergency intake with **no mobile** → still adds; dialler/WhatsApp gracefully disabled.
- [ ] Rapid double-tap on call-in / bring-in-now doesn't create two now-serving.
- [ ] App backgrounded 10+ min → foreground refreshes session + data (no stale/blank).
- [ ] After the RLS flip: web-staff (anon) is expected to **not** load — that's intended (retired).

## Sign-off
- [ ] No console errors / red screens during the pass.
- [ ] All HIGH items above pass. Blockers logged: ________

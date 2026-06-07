import { describe, it, expect } from "vitest";
import {
  firstName,
  bookingConfirmation,
  queueYourTurnNear,
  prescriptionReady,
  appointmentDelayed,
  clinicClosed,
  newWalkinPush,
  emergencyPush,
} from "./templates";

describe("firstName", () => {
  it("takes the first token, trims, and falls back", () => {
    expect(firstName("Riya Sharma")).toBe("Riya");
    expect(firstName("  Asha  ")).toBe("Asha");
    expect(firstName("")).toBe("there");
    expect(firstName(null)).toBe("there");
  });
});

describe("whatsapp templates", () => {
  it("booking_confirmation carries ordered variables + a usable fallback", () => {
    const m = bookingConfirmation({
      patientName: "Riya Sharma",
      clinicName: "Dr. Mehta's Clinic",
      token: "T-07",
      liveUrl: "https://saral-poc.vercel.app/v/abc",
    });
    expect(m.template).toBe("booking_confirmation");
    expect(m.variables).toEqual(["Riya", "Dr. Mehta's Clinic", "T-07", "https://saral-poc.vercel.app/v/abc"]);
    expect(m.fallbackText).toContain("T-07");
    expect(m.fallbackText).toContain("https://saral-poc.vercel.app/v/abc");
  });

  it("queue_your_turn_near greets by first name + token", () => {
    const m = queueYourTurnNear({ patientName: "Asha", clinicName: "C", token: "T-02", liveUrl: "u" });
    expect(m.event).toBe("queue_your_turn_near");
    expect(m.variables[0]).toBe("Asha");
    expect(m.fallbackText).toContain("T-02");
  });

  it("prescription_ready links to the live page", () => {
    const m = prescriptionReady({ patientName: "Asha", clinicName: "C", liveUrl: "https://x/v/t" });
    expect(m.fallbackText).toContain("https://x/v/t");
  });

  it("appointment_delayed includes the delay minutes", () => {
    const m = appointmentDelayed({ patientName: "Asha", clinicName: "C", delayMinutes: 30 });
    expect(m.variables).toContain("30");
    expect(m.fallbackText).toContain("30 minutes");
  });

  it("clinic_closed is apologetic", () => {
    const m = clinicClosed({ patientName: "Asha", clinicName: "Dr. Mehta's Clinic" });
    expect(m.fallbackText.toLowerCase()).toContain("sorry");
  });
});

describe("staff push", () => {
  it("new_walkin + emergency route to the queue", () => {
    expect(newWalkinPush({ patientName: "Riya", token: "T-09" }).data?.route).toBe("/queue");
    const e = emergencyPush({ patientName: "Riya Sharma" });
    expect(e.title.toLowerCase()).toContain("emergency");
    expect(e.body).toContain("Riya");
  });
});

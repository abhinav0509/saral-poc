/**
 * Where the patient web app is hosted — used to build the self-check-in
 * (/walkin/[code]) and live-visit (/v/[token]) links shared with patients.
 * Override with EXPO_PUBLIC_PATIENT_WEB_BASE; defaults to the deployed project.
 */
export const PATIENT_WEB_BASE =
  process.env.EXPO_PUBLIC_PATIENT_WEB_BASE ?? "https://saral-poc.vercel.app";

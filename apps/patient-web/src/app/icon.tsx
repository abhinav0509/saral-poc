import { ImageResponse } from "next/og";

/**
 * Main app icon — 192×192, teal background + Saral Arch + Haldi bindi.
 * Used as the high-quality favicon and as the 192px PWA icon.
 */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0E5E5A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="120"
          height="144"
          viewBox="0 0 80 96"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 14 88 L 14 44 C 14 30 26 18 40 18 C 54 18 66 30 66 44 L 66 88"
            fill="none"
            stroke="#FAF8F4"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="40" cy="33" r="5" fill="#D97A3C" />
        </svg>
      </div>
    ),
    { ...size },
  );
}

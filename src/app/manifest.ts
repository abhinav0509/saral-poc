import type { MetadataRoute } from "next";

/**
 * PWA web app manifest.
 * Served at /manifest.webmanifest — Next.js auto-discovers this file
 * and links it from <head>.
 *
 * When a user "Adds to Home Screen" on iOS/Android, the OS reads
 * this and the icon at /icon, /apple-icon to install the app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saral · Care, made simple.",
    short_name: "Saral",
    description:
      "Saral is a calm operations layer for small clinics. Walk-ins, live queues, and prescriptions — all in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF8F4",
    theme_color: "#0E5E5A",
    categories: ["medical", "productivity", "health"],
    lang: "en-IN",
    dir: "ltr",
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Live queue",
        short_name: "Queue",
        description: "Open the receptionist queue",
        url: "/staff/queue",
      },
    ],
  };
}

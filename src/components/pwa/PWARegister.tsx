"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on first mount.
 * Runs in production only — Next dev mode breaks if you register a SW
 * while HMR is also trying to manage assets.
 */
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Silently ignore — SW registration failure shouldn't break the app
          console.warn("[Saral] Service worker registration failed:", err);
        });
    };

    // Wait until the page settles so SW install doesn't compete for bandwidth
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}

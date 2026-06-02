"use client";

import { useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
  clinicName: string;
  onClose: () => void;
}

/**
 * Bottom sheet for copying / WhatsApping the patient self-check-in URL.
 * Single source of truth — opened from the Walk-in screen, Dashboard
 * header, and Queue header.
 */
export function ShareLinkSheet({ url, clinicName, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleWhatsapp() {
    if (!url) return;
    const msg = `Hi! Self-check into ${clinicName} here — fast, no app needed, you get a live token: ${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-surface-inverse/55 animate-in fade-in duration-200"
      />
      <div
        className={cn(
          "relative w-full max-w-md bg-surface-canvas rounded-t-3xl px-5 pt-3 pb-8 shadow-lg",
          "animate-in slide-in-from-bottom duration-300 ease-out",
        )}
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-default" />

        <div className="flex items-start gap-3 mb-1">
          <div className="flex-1 min-w-0">
            <h2 className="text-h3 font-bold text-text-primary leading-tight">
              Share self-check-in
            </h2>
            <p className="text-body-sm text-text-secondary mt-1 leading-snug">
              Patient fills the form on their own phone and gets a live token.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="size-9 -mt-1 -mr-1 flex items-center justify-center rounded-full hover:bg-surface-sunken"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-2 bg-surface-raised border border-border-default rounded-lg px-3 py-2.5">
          <span className="text-body-sm text-text-primary truncate flex-1 min-w-0 tnum">
            {url ? url.replace(/^https?:\/\//, "") : "loading…"}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy link"
            disabled={!url}
            className={cn(
              "h-9 px-3 inline-flex items-center gap-1.5 rounded-md flex-none text-label-sm font-semibold transition-colors",
              copied
                ? "bg-sage-100 text-text-success"
                : "bg-surface-canvas border border-border-default text-text-secondary hover:bg-surface-sunken",
            )}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <button
          type="button"
          onClick={handleWhatsapp}
          disabled={!url}
          className={cn(
            "mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl",
            "bg-surface-brand text-white text-label-lg font-semibold",
            "transition-transform active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <WhatsAppIcon size={18} />
          Send on WhatsApp
        </button>
      </div>
    </div>
  );
}

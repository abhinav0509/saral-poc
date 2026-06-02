"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

interface ToastProps {
  tone?: Tone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss in ms. 0 / undefined = sticky. */
  autoHide?: number;
  onDismiss?: () => void;
  className?: string;
}

const TONE_STYLES: Record<
  Tone,
  { surface: string; accent: string; icon: React.ReactNode; text: string }
> = {
  success: {
    surface: "bg-sage-50 border-sage-200",
    accent: "bg-sage-500",
    text: "text-text-success",
    icon: <CheckCircle2 size={18} />,
  },
  error: {
    surface: "bg-sindoor-50 border-sindoor-200",
    accent: "bg-sindoor-500",
    text: "text-text-critical",
    icon: <AlertCircle size={18} />,
  },
  info: {
    surface: "bg-surface-brand-subtle border-primary-200",
    accent: "bg-surface-brand",
    text: "text-text-brand",
    icon: <Info size={18} />,
  },
};

/**
 * Floating toast that sits at the top of a viewport.
 * For now it's a single-shot element — wrap pages with a stateful host
 * to render dynamically. Sized to match our Figma toast spec exactly.
 */
export function Toast({
  tone = "info",
  title,
  description,
  action,
  autoHide,
  onDismiss,
  className,
}: ToastProps) {
  const styles = TONE_STYLES[tone];

  useEffect(() => {
    if (!autoHide || !onDismiss) return;
    const t = setTimeout(onDismiss, autoHide);
    return () => clearTimeout(t);
  }, [autoHide, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex items-start gap-3 pl-4 pr-3 py-3 rounded-xl border shadow-md overflow-hidden",
        styles.surface,
        className,
      )}
    >
      <span
        className={cn("absolute left-0 top-0 h-full w-1", styles.accent)}
        aria-hidden
      />
      <span className={cn("flex-none mt-0.5", styles.text)}>{styles.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-label-md font-semibold leading-tight", styles.text)}>
          {title}
        </p>
        {description && (
          <p
            className={cn(
              "text-caption mt-0.5 opacity-80 leading-snug",
              styles.text,
            )}
          >
            {description}
          </p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            "flex-none text-label-md font-semibold px-2.5 py-1 rounded-md",
            "transition-colors hover:bg-black/5",
            styles.text,
          )}
        >
          {action.label}
        </button>
      )}
      {onDismiss && !action && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cn(
            "flex-none p-1 rounded-md transition-colors hover:bg-black/5",
            styles.text,
          )}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

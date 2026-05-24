import { cn } from "@/lib/utils";

export type VisitSource = "online" | "qr" | "phone";

const STYLE_MAP: Record<VisitSource, { label: string; classes: string }> = {
  online: {
    label: "Online",
    classes: "bg-surface-brand-subtle text-text-brand",
  },
  qr: {
    label: "QR walk-in",
    classes: "bg-surface-accent-subtle text-text-accent",
  },
  phone: {
    label: "Phone",
    classes: "bg-surface-sunken text-text-secondary",
  },
};

interface SourceBadgeProps {
  source: VisitSource;
  className?: string;
}

/**
 * Small pill indicating where a queue entry came from.
 * Three brand-tinted variants align with our 80/15/5 color rule.
 */
export function SourceBadge({ source, className }: SourceBadgeProps) {
  const { label, classes } = STYLE_MAP[source];
  return (
    <span
      className={cn(
        "inline-flex items-center h-[18px] px-2 rounded-full text-label-sm font-medium",
        classes,
        className,
      )}
    >
      {label}
    </span>
  );
}

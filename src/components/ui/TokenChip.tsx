import { cn } from "@/lib/utils";

type Tone = "default" | "inverse" | "brand" | "accent";
type Size = "sm" | "md" | "lg";

interface TokenChipProps {
  /** The token value, e.g. "T-08". */
  children: React.ReactNode;
  tone?: Tone;
  size?: Size;
  className?: string;
}

const TONE_STYLES: Record<Tone, string> = {
  default: "bg-surface-sunken text-text-primary",
  inverse: "bg-white/10 text-text-inverse",
  brand: "bg-surface-brand text-white",
  accent: "bg-surface-accent-subtle text-text-accent",
};

const SIZE_STYLES: Record<Size, string> = {
  sm: "h-6 px-2 text-label-sm rounded-md",
  md: "h-7 px-2.5 text-label-md rounded-md",
  lg: "h-9 px-3 text-label-lg rounded-lg",
};

/**
 * Pill chip for displaying a queue token like "T-08".
 * Uses tabular numerals so the number column never jitters as it updates.
 */
export function TokenChip({
  children,
  tone = "default",
  size = "md",
  className,
}: TokenChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-semibold tnum",
        TONE_STYLES[tone],
        SIZE_STYLES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

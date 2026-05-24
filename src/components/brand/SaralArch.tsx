import { cn } from "@/lib/utils";

type Variant = "default" | "mono-ink" | "inverse" | "outline";

interface SaralArchProps {
  /** Pixel size (square box). Defaults to 24. */
  size?: number;
  /** Visual variant. */
  variant?: Variant;
  /** Whether to render the Haldi bindi inside the arch. Default true (auto off under 24px). */
  showBindi?: boolean;
  className?: string;
}

/**
 * The Saral mark — a single archway with a Haldi bindi.
 * Built on an 80×96 viewbox: pillars at x=14 & x=66, spring line at y=44,
 * apex at y=18, open base at y=88. Stroke 7. Bindi 10px at (40, 33).
 *
 * Reads as: clinic doorway / sanctuary + the patient at the heart.
 */
export function SaralArch({
  size = 24,
  variant = "default",
  showBindi,
  className,
}: SaralArchProps) {
  const ratio = 96 / 80;
  const w = size;
  const h = Math.round(size * ratio);

  // Derive colors per variant
  const strokeClass =
    variant === "inverse"
      ? "stroke-text-inverse"
      : variant === "mono-ink" || variant === "outline"
      ? "stroke-text-primary"
      : "stroke-text-brand";

  const bindiClass =
    variant === "outline"
      ? "fill-transparent"
      : variant === "mono-ink"
      ? "fill-text-primary"
      : "fill-accent-500";

  // Auto-hide bindi at very small sizes for legibility
  const renderBindi = showBindi ?? size >= 18;

  return (
    <svg
      viewBox="0 0 80 96"
      width={w}
      height={h}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block flex-none", className)}
      aria-label="Saral"
      role="img"
    >
      <path
        d="M 14 88 L 14 44 C 14 30 26 18 40 18 C 54 18 66 30 66 44 L 66 88"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClass}
      />
      {renderBindi && variant !== "outline" && (
        <circle cx={40} cy={33} r={5} className={bindiClass} />
      )}
    </svg>
  );
}

/**
 * Saral wordmark — the text alongside the arch.
 * Used in primary lockup, splash, etc.
 */
export function SaralWordmark({
  size = 24,
  variant = "default",
  className,
}: {
  size?: number;
  variant?: "default" | "inverse" | "brand";
  className?: string;
}) {
  const color =
    variant === "inverse"
      ? "text-text-inverse"
      : variant === "brand"
      ? "text-text-brand"
      : "text-text-primary";

  return (
    <span
      className={cn(
        "font-bold tracking-tight leading-none",
        color,
        className,
      )}
      style={{
        fontSize: `${size}px`,
        letterSpacing: "-0.03em",
      }}
    >
      Saral
    </span>
  );
}

/**
 * Primary lockup — arch + wordmark side by side at a balanced ratio.
 * The arch sits at ~ size * 0.85 to align optically with the wordmark cap-height.
 */
export function SaralLockup({
  size = 24,
  variant = "default",
  bilingual = false,
  className,
}: {
  size?: number;
  variant?: "default" | "inverse";
  bilingual?: boolean;
  className?: string;
}) {
  const archSize = Math.round(size * 1.5);

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <SaralArch
        size={archSize}
        variant={variant === "inverse" ? "inverse" : "default"}
      />
      <div className="flex flex-col">
        <SaralWordmark
          size={size}
          variant={variant === "inverse" ? "inverse" : "default"}
        />
        {bilingual && (
          <span
            className={cn(
              "font-hindi text-text-secondary mt-0.5",
              variant === "inverse" && "text-text-inverse opacity-60",
            )}
            style={{ fontSize: `${Math.round(size * 0.45)}px`, lineHeight: 1 }}
          >
            सरल
          </span>
        )}
      </div>
    </div>
  );
}

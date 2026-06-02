import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Surface = "canvas" | "raised" | "inverse" | "brand" | "brand-subtle" | "accent-subtle";
type Elevation = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  surface?: Surface;
  elevation?: Elevation;
  /** When true, includes a 1px hairline border. */
  bordered?: boolean;
}

const SURFACE_STYLES: Record<Surface, string> = {
  canvas: "bg-surface-canvas text-text-primary",
  raised: "bg-surface-raised text-text-primary",
  inverse: "bg-surface-inverse text-text-inverse",
  brand: "bg-surface-brand text-white",
  "brand-subtle": "bg-surface-brand-subtle text-text-brand",
  "accent-subtle": "bg-surface-accent-subtle text-text-accent",
};

const ELEVATION_STYLES: Record<Elevation, string> = {
  none: "",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ surface = "canvas", elevation = "none", bordered = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl",
          SURFACE_STYLES[surface],
          ELEVATION_STYLES[elevation],
          bordered && "border border-border-subtle",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

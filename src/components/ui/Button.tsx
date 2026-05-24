import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Icon slot on the left of the label. */
  leadingIcon?: React.ReactNode;
  /** Icon slot on the right of the label. */
  trailingIcon?: React.ReactNode;
  /** Make the button stretch to its container width. */
  block?: boolean;
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    "bg-surface-brand text-text-inverse hover:bg-primary-600 active:bg-primary-700 focus-visible:bg-primary-600 disabled:bg-surface-sunken disabled:text-text-tertiary",
  secondary:
    "bg-surface-canvas text-text-primary border border-border-default hover:bg-surface-raised active:bg-surface-sunken focus-visible:border-border-focus",
  ghost:
    "bg-transparent text-text-primary hover:bg-surface-sunken active:bg-surface-raised",
  danger:
    "bg-sindoor-500 text-text-inverse hover:bg-sindoor-600 active:bg-sindoor-700",
};

const SIZE_STYLES: Record<Size, string> = {
  sm: "h-8 px-3 text-label-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-label-md gap-2 rounded-lg",
  lg: "h-12 px-5 text-label-lg gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      leadingIcon,
      trailingIcon,
      block,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors",
          "disabled:cursor-not-allowed",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus",
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          block && "w-full",
          className,
        )}
        {...props}
      >
        {leadingIcon}
        {children}
        {trailingIcon}
      </button>
    );
  },
);
Button.displayName = "Button";

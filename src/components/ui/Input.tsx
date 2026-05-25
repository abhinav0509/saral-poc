import { InputHTMLAttributes, forwardRef, ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  errorText?: string;
  /** Icon or text rendered before the input value. */
  leading?: ReactNode;
  /** Icon or text rendered after the input value. */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      errorText,
      leading,
      trailing,
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const reactId = useId();
    const fieldId = id ?? `field-${reactId}`;
    const helperId = `${fieldId}-help`;
    const hasError = Boolean(errorText);
    const describedBy = helperText || errorText ? helperId : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={fieldId}
            className="text-label-md font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "group flex items-center gap-2.5 h-12 rounded-xl bg-surface-canvas border px-3",
            "transition-[box-shadow,border-color] duration-150 ease-out",
            // Default & focus ring colors driven by state
            hasError
              ? "border-border-critical focus-within:border-border-critical focus-within:shadow-[0_0_0_3px_var(--color-sindoor-100)]"
              : "border-border-default hover:border-border-strong focus-within:border-border-focus focus-within:shadow-[0_0_0_3px_var(--color-primary-100)]",
            className,
          )}
        >
          {leading && (
            <span
              className={cn(
                "flex-none transition-colors",
                hasError
                  ? "text-text-critical"
                  : "text-text-secondary group-focus-within:text-text-brand",
              )}
            >
              {leading}
            </span>
          )}
          <input
            ref={ref}
            id={fieldId}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            className={cn(
              "flex-1 min-w-0 bg-transparent border-none outline-none",
              "text-body-md text-text-primary placeholder:text-text-tertiary",
              // Strip the iOS native styling that lightens inputs on autofill
              "autofill:shadow-[inset_0_0_0_1000px_var(--color-surface-canvas)]",
            )}
            {...props}
          />
          {trailing && (
            <span
              className={cn(
                "flex-none",
                hasError ? "text-text-critical" : "text-text-secondary",
              )}
            >
              {trailing}
            </span>
          )}
        </div>
        {(helperText || errorText) && (
          <p
            id={helperId}
            className={cn(
              "text-caption leading-snug",
              hasError ? "text-text-critical" : "text-text-tertiary",
            )}
          >
            {errorText ?? helperText}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

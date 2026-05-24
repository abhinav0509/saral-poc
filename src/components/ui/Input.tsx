import { InputHTMLAttributes, forwardRef, ReactNode } from "react";
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
  ({ label, helperText, errorText, leading, trailing, className, id, ...props }, ref) => {
    const reactId = (props as { name?: string }).name ?? "input";
    const fieldId = id ?? `field-${reactId}`;
    const hasError = Boolean(errorText);

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
            "flex items-center gap-2.5 h-12 rounded-xl bg-surface-canvas border px-3",
            "transition-colors",
            hasError
              ? "border-border-critical focus-within:border-border-critical"
              : "border-border-default focus-within:border-border-focus",
            className,
          )}
        >
          {leading && (
            <span className="flex-none text-text-secondary">{leading}</span>
          )}
          <input
            ref={ref}
            id={fieldId}
            className={cn(
              "flex-1 bg-transparent outline-none placeholder:text-text-tertiary",
              "text-body-md text-text-primary",
            )}
            {...props}
          />
          {trailing && (
            <span className="flex-none text-text-secondary">{trailing}</span>
          )}
        </div>
        {(helperText || errorText) && (
          <p
            className={cn(
              "text-caption",
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

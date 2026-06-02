"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Pill-shaped search bar with a leading magnifier and trailing clear.
 * Matches the Figma 04 receptionist queue spec.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search by name or token",
  className,
}: SearchBarProps) {
  return (
    <div
      className={cn(
        "h-11 px-3 flex items-center gap-2.5 bg-surface-canvas border border-border-default rounded-xl",
        "focus-within:border-border-focus transition-colors",
        className,
      )}
    >
      <Search size={18} className="text-text-secondary flex-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-body-md text-text-primary placeholder:text-text-tertiary"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="size-7 -mr-1 inline-flex items-center justify-center rounded-full hover:bg-surface-sunken text-text-secondary"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

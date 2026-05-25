"use client";

import { cn } from "@/lib/utils";

export interface SegmentedTab {
  key: string;
  label: string;
  /** Optional count chip — shown only on the active tab. */
  count?: number;
}

interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * iOS-style segmented control sitting in a sunken pill background.
 * Active tab gets a raised white card with elev/sm shadow.
 */
export function SegmentedTabs({ tabs, active, onChange, className }: SegmentedTabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "h-10 p-1 bg-surface-sunken rounded-xl flex items-center",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex-1 h-full inline-flex items-center justify-center gap-1.5 rounded-lg",
              "text-label-md font-medium transition-all",
              isActive
                ? "bg-surface-canvas text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && isActive && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-surface-brand text-text-inverse text-[11px] font-semibold tnum">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

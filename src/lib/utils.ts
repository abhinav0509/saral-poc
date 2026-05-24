import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Concatenate Tailwind class names, deduplicating where last-wins
 * conflicts would otherwise stick around. Use anywhere a component
 * accepts a `className` prop to keep overrides clean.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

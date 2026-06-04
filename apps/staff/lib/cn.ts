import clsx, { type ClassValue } from "clsx";

/** Compose NativeWind class strings. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

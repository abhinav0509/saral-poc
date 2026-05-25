"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, List, Calendar, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

/**
 * 4-tab persistent bottom nav for staff app surfaces.
 *
 * Fixed-position so it ALWAYS sits at the viewport bottom regardless
 * of page scroll or content length. Page content needs `pb-20`-ish
 * bottom padding to scroll past it.
 *
 * Only "Queue" is wired up for v1; other tabs go to splash for now —
 * visual completeness signals the full surface to the receptionist.
 */
export function StaffBottomNav({
  active,
}: {
  active?: "home" | "queue" | "calendar" | "more";
}) {
  const pathname = usePathname();
  const items: (NavItem & { key: NonNullable<typeof active> })[] = [
    { key: "home",     label: "Home",     href: "/staff",          icon: <Home size={22} strokeWidth={2} /> },
    { key: "queue",    label: "Queue",    href: "/staff/queue",    icon: <List size={22} strokeWidth={2} /> },
    { key: "calendar", label: "Calendar", href: "/staff/calendar", icon: <Calendar size={22} strokeWidth={2} /> },
    { key: "more",     label: "More",     href: "/staff",          icon: <MoreHorizontal size={22} strokeWidth={2} /> },
  ];

  const activeTab =
    active ??
    (pathname === "/staff" || pathname === "/staff/"
      ? "home"
      : pathname?.startsWith("/staff/queue")
        ? "queue"
        : pathname?.startsWith("/staff/calendar")
          ? "calendar"
          : "home");

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-surface-canvas/95 backdrop-blur-md border-t border-border-subtle pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="max-w-md mx-auto grid grid-cols-4">
        {items.map((it) => {
          const isActive = activeTab === it.key;
          return (
            <Link
              key={it.key}
              href={it.href}
              className="flex flex-col items-center justify-center pt-2.5 pb-2 gap-1 relative"
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span
                  className="absolute top-0 inset-x-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-text-brand"
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "transition-colors",
                  isActive ? "text-text-brand" : "text-text-tertiary",
                )}
              >
                {it.icon}
              </span>
              <span
                className={cn(
                  "text-[11px] leading-none font-medium transition-colors",
                  isActive ? "text-text-brand" : "text-text-tertiary",
                )}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

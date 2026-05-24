"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, MapPin, RefreshCw, CheckCircle2 } from "lucide-react";
import { SaralArch } from "@/components/brand/SaralArch";
import { Card } from "@/components/ui/Card";
import { TokenChip } from "@/components/ui/TokenChip";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { getClinicByCode, getActiveQueue } from "@/lib/db/queries";
import type { Clinic, Visit } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Live Queue · receptionist's home (Week 1 deliverable).
 * Pulls real data from Supabase. Polished but not yet interactive —
 * Week 2 adds realtime subscriptions, drop/call/save actions.
 */
export default function StaffQueuePage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [queue, setQueue] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const c = await getClinicByCode("drmehta");
      if (!c) {
        setError(
          "Couldn't find Dr. Mehta's Clinic. Did you run supabase/seed.sql in the SQL editor?",
        );
        return;
      }
      const q = await getActiveQueue(c.id);
      setClinic(c);
      setQueue(q);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const nowServing = queue.find((v) => v.status === "now_serving") ?? null;
  const waiting = queue.filter((v) => v.status === "waiting");

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      {/* Top app bar */}
      <header className="flex items-center px-3 h-14 border-b border-border-subtle bg-surface-canvas sticky top-0 z-10">
        <Link
          href="/"
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken"
          aria-label="Back"
        >
          <ChevronLeft size={22} className="text-text-primary" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1">
          <SaralArch size={22} />
          <div className="flex flex-col">
            <span className="text-label-md font-semibold text-text-primary leading-tight">
              {clinic?.name ?? "Loading…"}
            </span>
            <span className="text-caption text-text-secondary leading-tight">
              {clinic?.address ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={10} />
                  {clinic.address}
                </span>
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="size-10 flex items-center justify-center rounded-full hover:bg-surface-sunken disabled:opacity-50"
          aria-label="Refresh queue"
        >
          <RefreshCw
            size={18}
            className={cn(
              "text-text-secondary",
              loading && "animate-spin",
            )}
          />
        </button>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-3">
        {/* Error state */}
        {error && (
          <Card
            surface="raised"
            className="p-4 border border-border-critical"
          >
            <p className="text-label-md font-semibold text-text-critical mb-1">
              Something went wrong
            </p>
            <p className="text-body-sm text-text-secondary">{error}</p>
          </Card>
        )}

        {/* Now Serving */}
        {nowServing && (
          <Card surface="inverse" elevation="md" className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-label-sm font-medium text-text-inverse/70 uppercase tracking-wider">
                Live · Now serving
              </span>
              <span className="size-2 rounded-full bg-accent-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-display-md font-bold text-text-inverse tnum">
                {nowServing.token}
              </span>
              <div className="flex flex-col">
                <span className="text-label-lg font-medium text-text-inverse">
                  {nowServing.patient_name}
                </span>
                <span className="text-caption text-text-inverse/60">
                  {nowServing.gender} · {nowServing.age} ·{" "}
                  {nowServing.reason}
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* Waiting list */}
        <div className="flex items-center justify-between px-1 pt-2 pb-1">
          <span className="text-label-lg font-semibold text-text-primary">
            {waiting.length} waiting
          </span>
          <span className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
            <span className="size-1.5 rounded-full bg-sage-500" />
            Auto-updates
          </span>
        </div>

        {loading && waiting.length === 0 ? (
          <Card surface="raised" className="p-6 text-center">
            <p className="text-body-sm text-text-secondary">Loading queue…</p>
          </Card>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle bg-surface-canvas">
            {waiting.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 py-3"
              >
                <TokenChip>{v.token}</TokenChip>
                <div className="flex-1 min-w-0">
                  <p className="text-label-lg font-medium text-text-primary truncate">
                    {v.patient_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <SourceBadge source={v.source} />
                    <span className="text-caption text-text-tertiary truncate">
                      {v.reason}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Week-1 stamp */}
        {!loading && !error && (
          <Card surface="brand-subtle" className="mt-auto p-3 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-text-brand flex-none" />
            <p className="text-caption text-text-brand">
              Connected to Supabase ·{" "}
              {queue.length > 0
                ? `${queue.length} live records loaded`
                : "no live records yet"}
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, X, ChevronRight, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import { searchPatients, type PatientSearchRow } from "@/lib/db/queries";

export function SearchClient({ clinicId }: { clinicId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced query — fires 250ms after typing stops to keep the DB calm
  const debounceRef = useRef<number | null>(null);
  const runSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(async () => {
        if (q.trim().length < 2) {
          setResults([]);
          setLoading(false);
          return;
        }
        try {
          setLoading(true);
          const rows = await searchPatients(clinicId, q);
          setResults(rows);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Search failed");
        } finally {
          setLoading(false);
        }
      }, 250);
    },
    [clinicId],
  );

  useEffect(() => {
    runSearch(query);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // Autofocus on mount — search tab → immediate typing
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isEmpty = query.trim().length < 2;
  const noMatches = !loading && !isEmpty && results.length === 0;

  return (
    <main className="min-h-dvh flex flex-col max-w-md mx-auto w-full bg-surface-canvas">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-h2 font-bold text-text-primary leading-tight tracking-tight">
          Search patients
        </h1>
        <p className="text-body-sm text-text-secondary mt-0.5">
          By name, mobile, or token number
        </p>
      </header>

      {/* Sticky search input */}
      <div className="sticky top-0 z-10 bg-surface-canvas px-4 pb-3">
        <div className="flex items-center gap-2.5 h-12 rounded-xl bg-surface-canvas border border-border-default px-3 focus-within:border-border-focus focus-within:shadow-[0_0_0_3px_var(--color-primary-100)] transition-[box-shadow,border-color] duration-150 ease-out">
          <Search size={18} className="text-text-tertiary flex-none" />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            placeholder="e.g. Riya, 98765, T-04"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-body-md text-text-primary placeholder:text-text-tertiary"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="size-7 -mr-1 flex items-center justify-center rounded-full hover:bg-surface-sunken text-text-tertiary"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-28">
        {error && (
          <Card surface="raised" bordered className="p-4 mt-2 border-border-critical">
            <p className="text-body-sm text-text-critical">{error}</p>
          </Card>
        )}

        {isEmpty ? (
          <Card surface="raised" className="mt-6 p-6 text-center flex flex-col items-center gap-3">
            <span className="size-12 rounded-full bg-surface-brand-subtle text-text-brand flex items-center justify-center">
              <Users size={22} />
            </span>
            <p className="text-label-lg font-semibold text-text-primary">
              Find any patient instantly
            </p>
            <p className="text-body-sm text-text-secondary leading-snug max-w-[260px]">
              Type a name, mobile number, or token to see their history,
              prescriptions, and visit timeline.
            </p>
          </Card>
        ) : loading ? (
          <p className="text-body-sm text-text-secondary text-center pt-8">
            Searching…
          </p>
        ) : noMatches ? (
          <Card surface="raised" className="mt-4 p-6 text-center">
            <p className="text-label-md font-semibold text-text-primary">
              No patients matching &ldquo;{query}&rdquo;
            </p>
            <p className="text-body-sm text-text-secondary mt-1 leading-snug">
              Try a different spelling, or the last few digits of their mobile.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-caption text-text-tertiary px-1">
              {results.length} {results.length === 1 ? "patient" : "patients"}
            </p>
            {results.map((p) => (
              <ResultRow key={p.visitId} patient={p} />
            ))}
          </div>
        )}
      </div>

      <StaffBottomNav active="search" />
    </main>
  );
}

function ResultRow({ patient }: { patient: PatientSearchRow }) {
  const lookupKey = patient.mobile
    ? patient.mobile.replace(/\D/g, "").slice(-10) || patient.visitId
    : patient.visitId;
  const last = new Date(patient.lastVisitAt);
  const dateLabel = last.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const mobileMasked = patient.mobile
    ? (() => {
        const d = patient.mobile.replace(/\D/g, "").slice(-10);
        return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
      })()
    : null;

  return (
    <Link
      href={`/staff/patient/${encodeURIComponent(lookupKey)}`}
      className="block"
    >
      <Card
        surface="raised"
        bordered
        className="flex items-center gap-3 p-3 hover:bg-surface-sunken transition-colors"
      >
        <span className="size-11 rounded-full bg-surface-canvas border border-border-subtle flex items-center justify-center text-label-lg font-semibold text-text-primary flex-none">
          {patient.patientName[0]?.toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-label-lg font-semibold text-text-primary truncate">
            {patient.patientName}
          </p>
          <p className="text-caption text-text-secondary truncate mt-0.5">
            {patient.age != null && `${patient.age}y · `}
            {mobileMasked ?? "no mobile"}
          </p>
          <p className="text-caption text-text-tertiary truncate mt-0.5">
            {patient.visitCount}{" "}
            {patient.visitCount === 1 ? "visit" : "visits"} · last on {dateLabel}
            {patient.lastReason ? ` · ${patient.lastReason}` : ""}
          </p>
        </div>
        <ChevronRight size={18} className="text-text-tertiary flex-none" />
      </Card>
    </Link>
  );
}

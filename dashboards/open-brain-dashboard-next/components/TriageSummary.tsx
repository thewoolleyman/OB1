"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { TriageSummaryResponse } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

// Home-page card per openbrain spec.md § Dashboard "TriageSummary
// on home page": untriaged counts per source AND a total, backed by
// GET /triage/summary. Rendered between the StatsWidget and the
// KanbanSummary. Unknown sources fail soft to their raw value.

export function TriageSummary() {
  const [summary, setSummary] = useState<TriageSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/triage/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.total === "number") setSummary(data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <div className="h-4 w-32 bg-bg-hover rounded animate-pulse mb-3" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-16 bg-bg-hover rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const sources = Object.entries(summary.by_source);

  return (
    <Link href="/triage" className="block group">
      <div className="bg-bg-surface border border-border rounded-lg p-4 hover:border-violet/30 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Triage</h2>
          <span className="text-xs text-text-muted group-hover:text-violet transition-colors">
            Open triage →
          </span>
        </div>
        {summary.total === 0 ? (
          <p className="text-sm text-text-muted">
            Inbox zero — nothing waiting for triage.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {sources.map(([source, count]) => (
                <span
                  key={source}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-violet/15 text-violet border-violet/20"
                >
                  {SOURCE_LABELS[source] ?? source}
                  <span className="font-bold">{count}</span>
                </span>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-2">
              {summary.total} item{summary.total !== 1 ? "s" : ""} awaiting
              triage
            </p>
          </>
        )}
      </div>
    </Link>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { KanbanStatus, Thought } from "@/lib/types";
import { KANBAN_STATUSES, KANBAN_LABELS, getGtdStatus } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  next: "bg-violet/15 text-violet border-violet/20",
  waiting: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  soon: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  someday: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  maybe: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  done: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

const FALLBACK_COLOR = "bg-slate-500/15 text-slate-400 border-slate-500/20";

export function KanbanSummary() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/kanban")
      .then((res) => res.json())
      .then((data) => {
        const grouped: Record<string, number> = {};
        for (const s of KANBAN_STATUSES) grouped[s] = 0;
        for (const t of (data.thoughts || []) as Thought[]) {
          // Untriaged (no gtd_status) and archived rows are not on
          // the board, so they don't count here either.
          const status = getGtdStatus(t);
          if (status !== null && grouped[status] !== undefined)
            grouped[status]++;
        }
        setCounts(grouped);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const totalOpen = KANBAN_STATUSES.reduce(
    (sum, s) => (s === "done" ? sum : sum + (counts[s] || 0)),
    0
  );

  if (isLoading) {
    return (
      <div className="bg-bg-surface border border-border rounded-lg p-4">
        <div className="h-4 w-32 bg-bg-hover rounded animate-pulse mb-3" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-6 w-16 bg-bg-hover rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Link href="/kanban" className="block group">
      <div className="bg-bg-surface border border-border rounded-lg p-4 hover:border-violet/30 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Workflow</h2>
          <span className="text-xs text-text-muted group-hover:text-violet transition-colors">
            Open workflow →
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {KANBAN_STATUSES.map((status) => {
            const count = counts[status] || 0;
            if (count === 0 && status === "done") return null;
            const colorClass = STATUS_COLORS[status] || FALLBACK_COLOR;
            return (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${colorClass}`}
              >
                {KANBAN_LABELS[status as KanbanStatus]}
                <span className="font-bold">{count}</span>
              </span>
            );
          })}
        </div>
        {totalOpen > 0 && (
          <p className="text-xs text-text-muted mt-2">
            {totalOpen} open task{totalOpen !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}

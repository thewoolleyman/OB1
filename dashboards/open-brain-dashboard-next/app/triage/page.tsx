import Link from "next/link";
import { fetchTriageThoughts, fetchTriageSummary } from "@/lib/api";
import { requireSessionOrRedirect } from "@/lib/auth";
import { TypeBadge } from "@/components/ThoughtCard";
import { ThoughtActions } from "@/components/ThoughtActions";
import { SourceLink } from "@/components/SourceLink";
import { FormattedDate } from "@/components/FormattedDate";
import { SOURCE_LABELS } from "@/lib/types";
import type { Thought } from "@/lib/types";

export const dynamic = "force-dynamic";

// Triage view per openbrain SPECIFICATION/spec.md § Dashboard
// "Triage view": thoughts where metadata.gtd_triaged_at IS NULL AND
// metadata.type ∈ {task, idea}, served by open-brain-rest
// GET /triage. Per-source tabs (only sources with at least one
// untriaged item, from GET /triage/summary), defaulting to a
// unified All tab. The per-source tabs ARE the GTD multiple-inbox
// surface — there is deliberately no Inbox column on the Kanban.

function contentPreview(t: Thought): string {
  return t.content.length > 280 ? t.content.slice(0, 280) + "..." : t.content;
}

export default async function TriagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { apiKey } = await requireSessionOrRedirect();
  const params = await searchParams;
  const source = params.source || "";
  const page = parseInt(params.page || "1", 10);

  let summary, list;
  try {
    [summary, list] = await Promise.all([
      fetchTriageSummary(apiKey),
      fetchTriageThoughts(apiKey, {
        source: source || undefined,
        page,
        pageSize: 25,
      }),
    ]);
  } catch (err) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Triage</h1>
        <p className="text-danger text-sm">
          Failed to load triage data.{" "}
          {err instanceof Error ? err.message : ""}
        </p>
      </div>
    );
  }

  // Only sources with at least one untriaged item get a tab.
  const sources = Object.keys(summary.by_source).sort();
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  function tabUrl(src: string) {
    return src ? `/triage?source=${encodeURIComponent(src)}` : "/triage";
  }

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    sp.set("page", String(p));
    if (source) sp.set("source", source);
    return `/triage?${sp.toString()}`;
  }

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-lg border transition-colors ${
      active
        ? "bg-violet-surface text-violet border-violet/30"
        : "bg-bg-surface text-text-secondary border-border hover:border-text-muted"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Triage</h1>
        <p className="text-text-secondary text-sm">
          {summary.total.toLocaleString()} untriaged task
          {summary.total !== 1 ? "s" : ""} and ideas across your inboxes
        </p>
      </div>

      {/* Per-source tabs (All + one per source with untriaged items) */}
      <div className="flex flex-wrap gap-2">
        <Link href={tabUrl("")} className={tabClass(source === "")}>
          All
          <span className="ml-1.5 font-bold">{summary.total}</span>
        </Link>
        {sources.map((src) => (
          <Link key={src} href={tabUrl(src)} className={tabClass(source === src)}>
            {SOURCE_LABELS[src] ?? src}
            <span className="ml-1.5 font-bold">{summary.by_source[src]}</span>
          </Link>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {list.thoughts.length === 0 && (
          <div className="bg-bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-text-muted text-sm">
              Inbox zero — nothing waiting for triage
              {source ? ` from ${SOURCE_LABELS[source] ?? source}` : ""}.
            </p>
          </div>
        )}
        {list.thoughts.map((t) => {
          const topics = Array.isArray(t.metadata?.topics)
            ? (t.metadata.topics as string[]).slice(0, 5)
            : [];
          return (
            <div
              key={t.id}
              className="bg-bg-surface border border-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <TypeBadge type={t.type} />
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-bg-elevated text-text-muted border-border">
                    {SOURCE_LABELS[t.source_type] ?? t.source_type}
                  </span>
                  <SourceLink metadata={t.metadata} />
                </div>
                <FormattedDate
                  date={t.created_at}
                  className="text-xs text-text-muted whitespace-nowrap"
                />
              </div>

              <Link
                href={`/thoughts/${t.id}`}
                className="block text-sm text-text-primary leading-relaxed hover:text-violet transition-colors"
              >
                {contentPreview(t)}
              </Link>

              {topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((topic) => (
                    <span
                      key={topic}
                      className="px-2 py-0.5 rounded bg-violet-surface text-violet text-xs"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              <ThoughtActions thought={t} surface="triage" />
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageUrl(page - 1)}
                className="px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageUrl(page + 1)}
                className="px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

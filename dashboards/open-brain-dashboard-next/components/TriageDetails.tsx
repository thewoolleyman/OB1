import type { ReactNode } from "react";
import { FormattedDate } from "@/components/FormattedDate";

// Read-only GTD/PARA triage-details section for the thought detail
// view (openbrain li-bwl7fg; spec.md § Dashboard, "Triage details on
// thought detail", v053). Renders every triage field present on the
// thought's metadata; absent fields are omitted entirely (no empty
// placeholders), and the whole section is omitted when none are
// present. Display only — mutation affordances belong to
// ThoughtActions.

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-xs text-text-muted">{label}: </span>
      {children}
    </div>
  );
}

export function TriageDetails({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const meta = metadata || {};
  const status = asString(meta.gtd_status);
  const contexts = asStringArray(meta.gtd_contexts);
  const energy = asString(meta.gtd_energy_required);
  const time = asString(meta.gtd_time_required);
  const priority = asString(meta.gtd_priority);
  const paraCategory = asString(meta.para_category);
  const paraContainer = asString(meta.para_container);
  const triagedAt = asString(meta.gtd_triaged_at);

  const hasAny =
    status !== null ||
    contexts.length > 0 ||
    energy !== null ||
    time !== null ||
    priority !== null ||
    paraCategory !== null ||
    paraContainer !== null ||
    triagedAt !== null;
  if (!hasAny) return null;

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5">
      <h3 className="text-sm font-medium text-text-primary mb-3">
        Triage Details
      </h3>
      <div className="space-y-3">
        {status && (
          <Row label="Status">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-violet/15 text-violet border-violet/20">
              {status}
            </span>
          </Row>
        )}
        {contexts.length > 0 && (
          <Row label="Contexts">
            <div className="inline-flex flex-wrap gap-1.5 ml-1">
              {contexts.map((ctx) => (
                <span
                  key={ctx}
                  className="px-2 py-0.5 rounded bg-violet-surface text-violet text-xs"
                >
                  {ctx}
                </span>
              ))}
            </div>
          </Row>
        )}
        {energy && (
          <Row label="Energy required">
            <span className="text-sm text-text-secondary">{energy}</span>
          </Row>
        )}
        {time && (
          <Row label="Time required">
            <span className="text-sm text-text-secondary">{time}</span>
          </Row>
        )}
        {priority && (
          <Row label="Priority">
            <span className="text-sm text-text-secondary">{priority}</span>
          </Row>
        )}
        {paraCategory && (
          <Row label="PARA category">
            <span className="text-sm text-text-secondary">{paraCategory}</span>
          </Row>
        )}
        {paraContainer && (
          <Row label="PARA container">
            <span className="text-sm text-text-secondary">
              {paraContainer}
            </span>
          </Row>
        )}
        {triagedAt && (
          <Row label="Triaged">
            <FormattedDate
              date={triagedAt}
              className="text-sm text-text-secondary"
            />
          </Row>
        )}
      </div>
    </div>
  );
}

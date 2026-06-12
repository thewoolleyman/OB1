"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Thought } from "@/lib/types";
import {
  KANBAN_STATUSES,
  GTD_CAPTURE_STATUSES,
  getGtdStatus,
  getGtdTriagedAt,
} from "@/lib/types";

// Per-thought action affordances per openbrain
// SPECIFICATION/spec.md § Dashboard "ThoughtActions component":
//
// - Promote to task — when type ≠ "task". Sets type = "task",
//   gtd_status (inline picker over the capture statuses, default
//   "next"), gtd_triaged_at = now().
// - Mark as not actionable — when gtd_triaged_at IS NULL and
//   type ∈ {task, idea}. For ideas: stamps gtd_triaged_at AND
//   demotes type idea → journal. For tasks: stamps only
//   gtd_triaged_at (mis-captured tasks remain tasks for posterity).
// - Change gtd_status — when type = "task". Dropdown over the 6
//   active enum values (excludes the workflow-managed "archived").
//   When the task is still untriaged, choosing a status IS the
//   triage decision, so gtd_triaged_at is stamped alongside.
// - Edit — always (links to the thought detail editor).
// - Delete — always, with confirmation.
//
// All mutations go through the session-gated /api/thoughts/[id]
// proxy → open-brain-rest PUT/DELETE /thought/:id.

export type ThoughtActionsSurface =
  | "triage"
  | "detail"
  | "card"
  | "search"
  | "kanban";

interface ThoughtActionsProps {
  thought: Thought;
  surface: ThoughtActionsSurface;
}

async function putThought(
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/thoughts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as Record<string, string>).error || "Update failed"
    );
  }
}

export function ThoughtActions({ thought, surface }: ThoughtActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const gtdStatus = getGtdStatus(thought);
  const triagedAt = getGtdTriagedAt(thought);
  const isTask = thought.type === "task";
  const showPromote = !isTask;
  const showNotActionable =
    triagedAt === null && (thought.type === "task" || thought.type === "idea");

  async function run(mutate: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await mutate();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function handlePromote(status: string) {
    run(() =>
      putThought(thought.id, {
        type: "task",
        gtd_status: status,
        gtd_triaged_at: new Date().toISOString(),
      })
    );
  }

  function handleNotActionable() {
    const body: Record<string, unknown> = {
      gtd_triaged_at: new Date().toISOString(),
    };
    // Ideas demote to journal (a record of thinking, not a
    // possibility worth pursuing); tasks keep their type.
    if (thought.type === "idea") body.type = "journal";
    run(() => putThought(thought.id, body));
  }

  function handleStatusChange(status: string) {
    const body: Record<string, unknown> = { gtd_status: status };
    if (triagedAt === null) body.gtd_triaged_at = new Date().toISOString();
    run(() => putThought(thought.id, body));
  }

  function handleDelete() {
    run(async () => {
      const res = await fetch(`/api/thoughts/${thought.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as Record<string, string>).error || "Delete failed"
        );
      }
      setConfirmingDelete(false);
      if (surface === "detail") router.push("/thoughts");
    });
  }

  const selectClass =
    "bg-bg-elevated border border-border rounded-lg px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-violet/40 disabled:opacity-50";
  const buttonClass =
    "px-2 py-1 text-xs rounded-lg border border-border bg-bg-elevated text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {showPromote && (
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) handlePromote(e.target.value);
            }}
            className={selectClass}
            aria-label="Promote to task"
            title="Sets type to task with the chosen GTD status and marks the thought triaged"
          >
            <option value="" disabled>
              Promote to task…
            </option>
            {GTD_CAPTURE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {showNotActionable && (
          <button
            type="button"
            disabled={busy}
            onClick={handleNotActionable}
            className={buttonClass}
            title={
              thought.type === "idea"
                ? "Marks triaged and demotes idea to journal"
                : "Marks triaged; the thought stays a task"
            }
          >
            Not actionable
          </button>
        )}

        {isTask && (
          <select
            value={
              gtdStatus !== null &&
              (KANBAN_STATUSES as readonly string[]).includes(gtdStatus)
                ? gtdStatus
                : ""
            }
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) handleStatusChange(e.target.value);
            }}
            className={selectClass}
            aria-label="Change GTD status"
          >
            <option value="" disabled>
              {gtdStatus ?? "Set status…"}
            </option>
            {KANBAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <Link
          href={`/thoughts/${thought.id}`}
          className={buttonClass}
          aria-label="Edit thought"
        >
          Edit
        </Link>

        {confirmingDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-danger">Delete?</span>
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className="px-2 py-1 text-xs rounded-lg bg-danger text-white hover:bg-danger/80 transition-colors disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              className={buttonClass}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="px-2 py-1 text-xs rounded-lg border border-transparent text-text-muted hover:text-danger transition-colors disabled:opacity-50"
            aria-label="Delete thought"
          >
            Delete
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

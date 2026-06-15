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
import { CreateTaskModal } from "@/components/CreateTaskModal";

// Per-thought action affordances per openbrain
// SPECIFICATION/spec.md § Dashboard "ThoughtActions component".
//
// The GTD redesign treats a source document as supporting material,
// never a task. On the "triage" surface (the universal Inbox), the
// affordances therefore are:
//
// - Create task — opens CreateTaskModal, which POSTs
//   /api/task-from-source. That atomically creates a SEPARATE
//   type=task record referencing the source and stamps the source
//   metadata.inbox_state = "promoted" (the source doc stays put). On
//   success the card shows a "✓ promoted" indicator and refetches.
// - Not actionable (dismiss) — PUT /thought/:id with
//   { inbox_state: "dismissed" }; the source leaves the Inbox without
//   becoming a task. For a Gmail source this triggers the server-side
//   label reconcile automatically (nothing for the dashboard to do).
// - Edit — links to the thought detail editor.
// - Delete — with confirmation.
//
// On every OTHER surface (detail, card, search, kanban) the legacy
// in-place affordances remain: Promote-to-task (sets type=task +
// gtd_status + gtd_triaged_at), Mark-not-actionable (stamps
// gtd_triaged_at, demoting idea→journal), and the change-gtd_status
// dropdown for existing tasks.
//
// All mutations go through the session-gated /api/thoughts/[id] or
// /api/task-from-source proxy → open-brain-rest.

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [promoted, setPromoted] = useState(false);

  const gtdStatus = getGtdStatus(thought);
  const triagedAt = getGtdTriagedAt(thought);
  const isTask = thought.type === "task";
  // The universal-GTD Inbox surface uses the source-doc model:
  // Create-task (modal → /task-from-source) and dismiss
  // (inbox_state). Every other surface keeps the legacy in-place
  // promote/triage affordances.
  const isInbox = surface === "triage";
  const showPromote = !isInbox && !isTask;
  const showNotActionable =
    !isInbox &&
    triagedAt === null &&
    (thought.type === "task" || thought.type === "idea");

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

  // Inbox dismiss: the source doc leaves the Inbox without becoming a
  // task. For a Gmail source this also triggers the server-side label
  // reconcile (nothing for the dashboard to do).
  function handleDismiss() {
    run(() => putThought(thought.id, { inbox_state: "dismissed" }));
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
        {isInbox &&
          (promoted ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="flex-shrink-0"
              >
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M5 8l2 2 4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Promoted to task
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowCreateModal(true)}
              className="px-2 py-1 text-xs rounded-lg border border-violet/30 bg-violet-surface text-violet hover:bg-violet/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Create task from this source"
              title="Creates a separate task that references this source document"
            >
              Create task
            </button>
          ))}

        {isInbox && !promoted && (
          <button
            type="button"
            disabled={busy}
            onClick={handleDismiss}
            className={buttonClass}
            title="Dismiss from the Inbox without creating a task"
          >
            Not actionable
          </button>
        )}

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

      {showCreateModal && (
        <CreateTaskModal
          thought={thought}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            setPromoted(true);
            // Refetch the Inbox list: the source doc now carries
            // inbox_state="promoted" and the new task lives in
            // Workflow. The "✓ promoted" indicator covers the moment
            // before the server-component refetch lands.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

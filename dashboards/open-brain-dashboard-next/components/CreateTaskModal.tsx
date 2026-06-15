"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Thought } from "@/lib/types";
import { GTD_CAPTURE_STATUSES, KANBAN_LABELS, type KanbanStatus } from "@/lib/types";

// CreateTaskModal — the Inbox "Create task" affordance (openbrain GTD
// redesign). A source document is supporting material, never a task;
// submitting this modal POSTs to /api/task-from-source, which
// atomically creates a SEPARATE type=task record referencing the
// source and stamps the source metadata.inbox_state = "promoted".
//
// The operator can edit the Title (prefilled from the source — the
// Gmail subject, or the first line of the source content), pick a
// gtd_status (default "next"; the capture statuses, never the
// workflow-managed done/archived), and optionally pick a GTD context.

// GTD contexts mirror AddTaskToBrain (closed enum per openbrain
// SPECIFICATION § Metadata JSON Schema). The chosen context is folded
// into the task content as a trailing @tag, since /task-from-source
// takes a single `content` string (no structured gtd_contexts field).
const GTD_CONTEXTS = [
  "@home",
  "@office",
  "@phone",
  "@computer",
  "@errands",
  "@waiting",
  "@anywhere",
] as const;

interface CreateTaskModalProps {
  thought: Thought;
  onClose: () => void;
  /** Called after a task is successfully created from this source. */
  onCreated: () => void;
}

/**
 * Derive a sensible default task title from a source thought: prefer a
 * subject-style metadata field (Gmail), else the first non-empty line
 * of the content, trimmed to a reasonable length. Fail-soft to "".
 */
function deriveTitle(thought: Thought): string {
  const meta = thought.metadata ?? {};
  for (const key of ["subject", "gmail_subject", "title"]) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
  }
  const firstLine = (thought.content || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (firstLine ?? "").slice(0, 200);
}

export function CreateTaskModal({
  thought,
  onClose,
  onCreated,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState(() => deriveTitle(thought));
  const [gtdStatus, setGtdStatus] = useState<string>("next");
  const [context, setContext] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (!submitting) onClose();
  }, [submitting, onClose]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [close]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Fold the optional context into the content as a trailing @tag.
      const trimmed = title.trim();
      const content = context ? `${trimmed} ${context}`.trim() : trimmed;
      const body: Record<string, unknown> = {
        supporting_thought_ids: [thought.id],
        gtd_status: gtdStatus,
      };
      // Only send content when the operator left a non-empty title; an
      // empty title lets the server derive its own stub.
      if (content) body.content = content;

      const res = await fetch("/api/task-from-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as Record<string, string>).error || "Failed to create task"
        );
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
      setSubmitting(false);
    }
  }

  const selectClass =
    "w-full bg-bg-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-violet/40";

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Create task from source"
      className="fixed inset-0 z-50 bg-black/60 p-5 pt-16 pb-8 lg:p-0 lg:flex lg:items-center lg:justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg-surface border border-border rounded-xl w-full max-h-full max-w-lg flex flex-col shadow-2xl overflow-hidden mx-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">
            Create task
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-text-muted hover:text-text-primary transition-colors text-lg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
            <p className="text-xs text-text-muted">
              The source document stays in your brain as supporting
              material — this creates a separate task that references it.
            </p>

            {/* Title */}
            <div>
              <label
                htmlFor="create-task-title"
                className="block text-xs font-medium text-text-secondary mb-1.5"
              >
                Title
              </label>
              <textarea
                id="create-task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={3}
                placeholder="What needs doing?"
                className="w-full bg-bg-hover border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted leading-relaxed resize-y focus:outline-none focus:border-violet/40"
                autoFocus
              />
            </div>

            {/* Status */}
            <div>
              <label
                htmlFor="create-task-status"
                className="block text-xs font-medium text-text-secondary mb-1.5"
              >
                Status
              </label>
              <select
                id="create-task-status"
                value={gtdStatus}
                onChange={(e) => setGtdStatus(e.target.value)}
                className={selectClass}
              >
                {GTD_CAPTURE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {KANBAN_LABELS[s as KanbanStatus] ?? s}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional GTD context */}
            <div>
              <span className="block text-xs font-medium text-text-secondary mb-1.5">
                Context
                <span className="text-text-muted font-normal"> (optional)</span>
              </span>
              <div
                className="flex gap-1.5 flex-wrap"
                role="radiogroup"
                aria-label="Context"
              >
                {GTD_CONTEXTS.map((ctx) => (
                  <button
                    key={ctx}
                    type="button"
                    role="radio"
                    aria-checked={context === ctx}
                    onClick={() =>
                      setContext((prev) => (prev === ctx ? null : ctx))
                    }
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      context === ctx
                        ? "bg-violet-surface text-violet border-violet/30"
                        : "bg-bg-surface text-text-secondary border-border hover:border-text-muted"
                    }`}
                  >
                    {ctx}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-sm rounded-lg bg-violet text-white hover:bg-violet/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

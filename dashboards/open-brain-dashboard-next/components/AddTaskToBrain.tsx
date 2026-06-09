"use client";

import { useState } from "react";

// Task-explicit capture form (openbrain li-tqoa2a). Hardcodes
// type=task semantics by POSTing to /api/capture-task, which proxies
// to open-brain-rest's POST /capture-task → MCP capture_task tool.
// Enum values mirror openbrain SPECIFICATION/contracts.md
// § Metadata JSON Schema (closed enums — widening requires a spec
// proposal there, not here).

const GTD_STATUSES = ["next", "waiting", "soon", "someday", "maybe"] as const;
type GtdStatus = (typeof GTD_STATUSES)[number];

const GTD_CONTEXTS = [
  "@home",
  "@office",
  "@phone",
  "@computer",
  "@errands",
  "@waiting",
  "@anywhere",
] as const;

const GTD_ENERGY = ["low", "medium", "high"] as const;
const GTD_TIME = ["<2min", "<15min", "<30min", "<1hr", ">1hr"] as const;
const GTD_PRIORITY = ["low", "medium", "high"] as const;
const PARA_CATEGORIES = ["project", "area", "resource", "archive"] as const;

interface AddTaskToBrainProps {
  /** Textarea row count (default 3) */
  rows?: number;
  /** Callback after successful add */
  onSuccess?: (result: { message: string }) => void;
}

interface CaptureTaskResponse {
  message: string;
  structuredContent?: Record<string, unknown> | null;
}

/**
 * Toggleable single-select pill row. `value === null` means unset;
 * clicking the active pill clears it (for the optional axes).
 */
function PillSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  clearable = true,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (next: T | null) => void;
  clearable?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-text-secondary mb-1.5">
        {label}
        {clearable && (
          <span className="text-text-muted font-normal"> (optional)</span>
        )}
      </span>
      <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={value === opt}
            onClick={() =>
              onChange(value === opt && clearable ? null : opt)
            }
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              value === opt
                ? "bg-violet-surface text-violet border-violet/30"
                : "bg-bg-surface text-text-secondary border-border hover:border-text-muted"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AddTaskToBrain({ rows = 3, onSuccess }: AddTaskToBrainProps) {
  const [content, setContent] = useState("");
  const [gtdStatus, setGtdStatus] = useState<GtdStatus>("next");
  const [gtdContexts, setGtdContexts] = useState<string[]>([]);
  const [gtdEnergy, setGtdEnergy] = useState<string | null>(null);
  const [gtdTime, setGtdTime] = useState<string | null>(null);
  const [gtdPriority, setGtdPriority] = useState<string | null>(null);
  const [paraCategory, setParaCategory] = useState<string | null>(null);
  const [paraContainer, setParaContainer] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CaptureTaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleContext = (ctx: string) => {
    setGtdContexts((prev) =>
      prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx]
    );
  };

  const resetForm = () => {
    setContent("");
    setGtdStatus("next");
    setGtdContexts([]);
    setGtdEnergy(null);
    setGtdTime(null);
    setGtdPriority(null);
    setParaCategory(null);
    setParaContainer("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        content: content.trim(),
        gtd_status: gtdStatus,
      };
      if (gtdContexts.length > 0) body.gtd_contexts = gtdContexts;
      if (gtdEnergy) body.gtd_energy_required = gtdEnergy;
      if (gtdTime) body.gtd_time_required = gtdTime;
      if (gtdPriority) body.gtd_priority = gtdPriority;
      if (paraCategory) body.para_category = paraCategory;
      if (paraContainer.trim()) body.para_container = paraContainer.trim();

      const res = await fetch("/api/capture-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as Record<string, string>).error || "Failed to add task"
        );
      }
      const data: CaptureTaskResponse = await res.json();
      setResult(data);
      resetForm();
      onSuccess?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={rows}
          placeholder="What needs doing?"
          aria-label="Task content"
          className="w-full bg-bg-elevated border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30 transition resize-y"
        />

        <PillSelect
          label="Status"
          options={GTD_STATUSES}
          value={gtdStatus}
          onChange={(next) => setGtdStatus(next ?? "next")}
          clearable={false}
        />

        {/* GTD/PARA triage details */}
        <div>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`transition-transform ${showDetails ? "rotate-90" : ""}`}
            >
              <path
                d="M4 2l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Triage details
          </button>

          {showDetails && (
            <div className="mt-3 space-y-4">
              <div>
                <span className="block text-xs font-medium text-text-secondary mb-1.5">
                  Contexts
                  <span className="text-text-muted font-normal"> (optional)</span>
                </span>
                <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Contexts">
                  {GTD_CONTEXTS.map((ctx) => (
                    <button
                      key={ctx}
                      type="button"
                      role="checkbox"
                      aria-checked={gtdContexts.includes(ctx)}
                      onClick={() => toggleContext(ctx)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        gtdContexts.includes(ctx)
                          ? "bg-violet-surface text-violet border-violet/30"
                          : "bg-bg-surface text-text-secondary border-border hover:border-text-muted"
                      }`}
                    >
                      {ctx}
                    </button>
                  ))}
                </div>
              </div>

              <PillSelect
                label="Energy required"
                options={GTD_ENERGY}
                value={gtdEnergy as (typeof GTD_ENERGY)[number] | null}
                onChange={setGtdEnergy}
              />

              <PillSelect
                label="Time required"
                options={GTD_TIME}
                value={gtdTime as (typeof GTD_TIME)[number] | null}
                onChange={setGtdTime}
              />

              <PillSelect
                label="Priority"
                options={GTD_PRIORITY}
                value={gtdPriority as (typeof GTD_PRIORITY)[number] | null}
                onChange={setGtdPriority}
              />

              <PillSelect
                label="PARA category"
                options={PARA_CATEGORIES}
                value={paraCategory as (typeof PARA_CATEGORIES)[number] | null}
                onChange={setParaCategory}
              />

              <div>
                <label
                  htmlFor="add-task-para-container"
                  className="block text-xs font-medium text-text-secondary mb-1.5"
                >
                  PARA container
                  <span className="text-text-muted font-normal"> (optional)</span>
                </label>
                <input
                  id="add-task-para-container"
                  type="text"
                  value={paraContainer}
                  onChange={(e) => setParaContainer(e.target.value)}
                  placeholder="e.g. Home Renovation"
                  className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30 transition"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="px-5 py-2.5 bg-violet hover:bg-violet-dim text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding..." : "Add Task"}
          </button>
        </div>
      </form>

      {/* Result feedback */}
      {result && (
        <div className="flex items-center gap-2 text-sm text-success">
          <svg
            width="16"
            height="16"
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
          {result.message}
        </div>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}

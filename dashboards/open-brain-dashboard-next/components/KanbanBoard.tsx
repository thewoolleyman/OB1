"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Thought } from "@/lib/types";
import {
  KANBAN_STATUSES,
  KANBAN_TYPES,
  KANBAN_FALLBACK_COLUMN,
  getGtdStatus,
} from "@/lib/types";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCard } from "@/components/KanbanCard";
import { KanbanCardModal } from "@/components/KanbanCardModal";

async function apiUpdateKanban(
  thoughtId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const res = await fetch("/api/kanban/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thoughtId, ...updates }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Update failed");
  }
}

export function KanbanBoard() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);
  const [activeDragThought, setActiveDragThought] = useState<Thought | null>(null);
  const previousThoughts = useRef<Thought[]>([]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 10 } })
  );

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/kanban");
      if (!res.ok) throw new Error("Failed to load kanban data");
      const data = await res.json();
      setThoughts(data.thoughts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group thoughts by gtd_status per openbrain spec.md § Dashboard
  // "Kanban view":
  // - gtd_status absent → NOT on the board (lives in the Triage view)
  // - gtd_status = "archived" → no column, never rendered here
  // - unrecognized gtd_status → generic fallback column (fail-soft)
  function groupByStatus(): Record<string, Thought[]> {
    const groups: Record<string, Thought[]> = {};
    for (const s of KANBAN_STATUSES) groups[s] = [];
    groups[KANBAN_FALLBACK_COLUMN] = [];

    for (const t of thoughts) {
      const status = getGtdStatus(t);
      if (status === null) continue; // untriaged — Triage view's job
      if (status === "archived") continue; // archived has no column

      if (groups[status]) {
        groups[status].push(t);
      } else {
        groups[KANBAN_FALLBACK_COLUMN].push(t);
      }
    }
    return groups;
  }

  function handleDragStart(event: DragStartEvent) {
    const thought = thoughts.find((t) => t.id === event.active.id);
    setActiveDragThought(thought ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragThought(null);
    const { active, over } = event;
    if (!over) return;

    const thoughtId = String(active.id);
    const newStatus = over.id as string;

    // The fallback column is render-only — never a write target.
    if (!(KANBAN_STATUSES as readonly string[]).includes(newStatus)) return;

    const thought = thoughts.find((t) => t.id === thoughtId);
    if (!thought || getGtdStatus(thought) === newStatus) return;

    // Optimistic update
    previousThoughts.current = [...thoughts];
    setThoughts((prev) =>
      prev.map((t) =>
        t.id === thoughtId ? { ...t, gtd_status: newStatus } : t
      )
    );

    // API call in background
    apiUpdateKanban(thoughtId, { gtd_status: newStatus }).catch(() => {
      // Revert on failure
      setThoughts(previousThoughts.current);
      setError("Failed to update status. Reverted.");
      setTimeout(() => setError(null), 5000);
    });
  }

  async function handlePriorityChange(thoughtId: string, newImportance: number) {
    previousThoughts.current = [...thoughts];
    setThoughts((prev) =>
      prev.map((t) =>
        t.id === thoughtId ? { ...t, importance: newImportance } : t
      )
    );

    try {
      await apiUpdateKanban(thoughtId, { importance: newImportance });
    } catch {
      setThoughts(previousThoughts.current);
      setError("Failed to update priority. Reverted.");
      setTimeout(() => setError(null), 5000);
    }
  }

  // gtd_status = "archived" is workflow-managed: the board is the
  // surface that sets it, but archived rows have no column and
  // disappear from the board (spec.md § Dashboard "Kanban view").
  async function handleArchive(thoughtId: string) {
    previousThoughts.current = [...thoughts];
    setThoughts((prev) =>
      prev.map((t) =>
        t.id === thoughtId ? { ...t, gtd_status: "archived" } : t
      )
    );

    try {
      await apiUpdateKanban(thoughtId, { gtd_status: "archived" });
    } catch {
      setThoughts(previousThoughts.current);
      setError("Failed to archive. Reverted.");
      setTimeout(() => setError(null), 5000);
    }
  }

  async function handleDelete(thoughtId: string) {
    previousThoughts.current = [...thoughts];
    setThoughts((prev) => prev.filter((t) => t.id !== thoughtId));

    try {
      const res = await fetch("/api/kanban/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thoughtId }),
      });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      setThoughts(previousThoughts.current);
      setError("Failed to delete. Reverted.");
      setTimeout(() => setError(null), 5000);
    }
  }

  async function handleModalSave(
    thoughtId: string,
    updates: Record<string, unknown>
  ) {
    previousThoughts.current = [...thoughts];

    // If type changed to non-kanban, remove from board entirely
    const isLeavingKanban =
      typeof updates.type === "string" && !KANBAN_TYPES.includes(updates.type);

    if (isLeavingKanban) {
      setThoughts((prev) => prev.filter((t) => t.id !== thoughtId));
    } else {
      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thoughtId ? ({ ...t, ...updates } as Thought) : t
        )
      );
    }

    try {
      await apiUpdateKanban(thoughtId, updates);
    } catch {
      setThoughts(previousThoughts.current);
      setError("Failed to save changes. Reverted.");
      setTimeout(() => setError(null), 5000);
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex gap-3">
        {KANBAN_STATUSES.map((s) => (
          <div
            key={s}
            className="flex-1 min-w-0 rounded-lg border border-border bg-bg-primary"
          >
            <div className="px-3 py-2.5 border-b border-border">
              <div className="h-4 w-20 bg-bg-hover rounded animate-pulse" />
            </div>
            <div className="p-2 space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-bg-hover rounded-lg animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const grouped = groupByStatus();
  // Fail-soft: the fallback column renders only when an
  // out-of-enum gtd_status actually exists.
  const columns: string[] =
    grouped[KANBAN_FALLBACK_COLUMN].length > 0
      ? [...KANBAN_STATUSES, KANBAN_FALLBACK_COLUMN]
      : [...KANBAN_STATUSES];

  return (
    <>
      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-2 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-end mb-4">
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            fetchData();
          }}
          className="text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Board */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-2 md:gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          {columns.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              thoughts={grouped[status] || []}
              onCardClick={setSelectedThought}
              onPriorityChange={handlePriorityChange}
              onArchive={handleArchive}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDragThought && (
            <div className="rotate-[2deg] opacity-95 shadow-2xl w-[200px]">
              <KanbanCard
                thought={activeDragThought}
                onCardClick={() => {}}
                onPriorityChange={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Modal */}
      {selectedThought && (
        <KanbanCardModal
          thought={selectedThought}
          onSave={handleModalSave}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onClose={() => setSelectedThought(null)}
        />
      )}
    </>
  );
}

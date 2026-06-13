"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TypeBadge } from "@/components/ThoughtCard";
import { DeleteModal } from "@/components/DeleteModal";
import type { DuplicatePair, DuplicateResolution } from "@/lib/types";

const PER_PAGE = 30;

// Per-source filter (openbrain li-vea6mj, spec v073). The checkbox set is
// derived from the data, the default is every source EXCEPT gmail (the
// default lives here in the dashboard, NOT in the GET /duplicates
// contract, whose no-`sources` default stays all-sources), and the
// operator's selection persists across visits in localStorage.
const SOURCES_STORAGE_KEY = "ob-duplicates-selected-sources";
// Discover the full source universe at the most permissive band so every
// source that has any near-duplicate gets a checkbox — including gmail,
// which is unchecked by default but MUST remain re-checkable.
const UNIVERSE_THRESHOLD = 0.8;
const UNIVERSE_LIMIT = 200;

// Tracks resolution for a pair — "keep_a" = delete B, "keep_b" = delete A,
// "keep_both" = persistently dismiss (recorded server-side; the pair is
// permanently excluded from GET /duplicates — openbrain li-xyuon6)
type Selection = "keep_a" | "keep_b" | "keep_both";

// Map a UI selection onto the REST /duplicates/resolve entry shape.
// For deletes, delete_id names the thought being deleted so the
// resolution row records the surviving partner as the keeper.
const toResolution = (
  action: Selection,
  pair: DuplicatePair
): DuplicateResolution =>
  action === "keep_both"
    ? { pair: [pair.thought_id_a, pair.thought_id_b], action: "keep_both" }
    : {
        pair: [pair.thought_id_a, pair.thought_id_b],
        action: "delete",
        delete_id:
          action === "keep_a" ? pair.thought_id_b : pair.thought_id_a,
      };

export default function DuplicatesPage() {
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.99);
  const [offset, setOffset] = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    action: "keep_a" | "keep_b";
    pair: DuplicatePair;
  } | null>(null);

  // Batch selection state: pairKey -> which side to keep
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState(false);

  const toggleSelection = (key: string, action: Selection) => {
    setSelections((prev) => {
      if (prev[key] === action) {
        // Deselect if clicking the same side
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: action };
    });
  };

  const clearSelections = () => setSelections({});

  const selectedCount = Object.keys(selections).length;

  // Per-source filter state (openbrain li-vea6mj, spec v073).
  // `sourceUniverse` is the data-derived checkbox set (with per-source
  // pair counts); `selectedSources` is null until initialized from
  // localStorage / the all-except-gmail default, then the active set sent
  // to GET /duplicates. Filtering is display-only — it changes which
  // pairs the server returns, never any thoughts row.
  const [sourceUniverse, setSourceUniverse] = useState<
    { source: string; count: number }[]
  >([]);
  const [selectedSources, setSelectedSources] = useState<string[] | null>(
    null
  );

  const toggleSource = (source: string) => {
    setOffset(0);
    clearSelections();
    setSelectedSources((prev) => {
      const base = prev ?? [];
      return base.includes(source)
        ? base.filter((s) => s !== source)
        : [...base, source];
    });
  };

  const processBatch = async () => {
    setBatchProcessing(true);
    setError(null);

    // One POST carries every selected resolution — the endpoint
    // accepts an array and is idempotent.
    const entries: { key: string; resolution: DuplicateResolution }[] = [];
    for (const [key, action] of Object.entries(selections)) {
      const pair = pairs.find((p) => pairKey(p) === key);
      if (!pair) continue;
      entries.push({ key, resolution: toResolution(action, pair) });
    }

    try {
      if (entries.length > 0) {
        const res = await fetch("/api/duplicates/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolutions: entries.map((e) => e.resolution),
          }),
        });
        if (!res.ok) throw new Error("Batch resolve failed");
      }

      // Remove resolved pairs from state
      const removedKeys = entries.map((e) => e.key);
      setPairs((prev) =>
        prev.filter((p) => !removedKeys.includes(pairKey(p)))
      );
      setSelections((prev) => {
        const next = { ...prev };
        for (const k of removedKeys) delete next[k];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch resolve failed");
    } finally {
      setBatchProcessing(false);
      setConfirmBatch(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setPairs([]);
    setError(null);
    // An empty selection means the operator unchecked every source — show
    // nothing rather than sending an empty `sources` param (which the
    // endpoint treats as "all sources").
    if (selectedSources !== null && selectedSources.length === 0) {
      setLoading(false);
      return;
    }
    try {
      const sp = new URLSearchParams({
        threshold: String(threshold),
        limit: String(PER_PAGE),
        offset: String(offset),
      });
      // While selectedSources is still null (filter not yet initialized)
      // send no `sources` param, so the first paint shows all sources
      // immediately — same latency as before; the all-except-gmail
      // default applies once universe discovery resolves.
      if (selectedSources !== null)
        sp.set("sources", selectedSources.join(","));
      const res = await fetch(`/api/duplicates?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPairs(data.pairs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [threshold, offset, selectedSources]);

  useEffect(() => {
    load();
  }, [load]);

  // Persist the selection whenever it changes (once initialized).
  useEffect(() => {
    if (selectedSources === null) return;
    try {
      localStorage.setItem(
        SOURCES_STORAGE_KEY,
        JSON.stringify(selectedSources)
      );
    } catch {
      // Best-effort; persistence failure must not break filtering.
    }
  }, [selectedSources]);

  // Discover the full source universe once, from an unfiltered fetch at
  // the broadest threshold, so the checkbox set is derived from the data
  // and a newly-ingested source appears automatically. Runs in the
  // background; the displayed list does not block on it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Restore the operator's saved selection first (runs synchronously
      // on mount, before the discovery fetch is awaited).
      try {
        const saved = localStorage.getItem(SOURCES_STORAGE_KEY);
        if (saved) {
          const arr = JSON.parse(saved);
          if (Array.isArray(arr) && !cancelled)
            setSelectedSources(arr.filter((s) => typeof s === "string"));
        }
      } catch {
        // Corrupt/blocked localStorage falls back to the discovery default.
      }
      try {
        const res = await fetch(
          `/api/duplicates?threshold=${UNIVERSE_THRESHOLD}&limit=${UNIVERSE_LIMIT}&offset=0`
        );
        if (!res.ok) return;
        const data = await res.json();
        const counts = new Map<string, number>();
        for (const p of (data.pairs ?? []) as DuplicatePair[]) {
          const inPair = new Set<string>();
          if (p.source_a) inPair.add(p.source_a);
          if (p.source_b) inPair.add(p.source_b);
          for (const s of inPair) counts.set(s, (counts.get(s) ?? 0) + 1);
        }
        if (cancelled) return;
        const universe = [...counts.entries()]
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
        setSourceUniverse(universe);
        // Default selection (all sources except gmail) only when the
        // operator has no saved preference yet.
        setSelectedSources((prev) =>
          prev ?? universe.map((u) => u.source).filter((s) => s !== "gmail")
        );
      } catch {
        // Universe discovery is best-effort; without it the checkbox row
        // is hidden and the list shows all sources (selectedSources null).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolve = async (action: Selection, pair: DuplicatePair) => {
    const key = `${pair.thought_id_a}-${pair.thought_id_b}`;
    setResolving(key);
    setError(null);
    try {
      const res = await fetch("/api/duplicates/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutions: [toResolution(action, pair)],
        }),
      });
      if (!res.ok) throw new Error("Resolve failed");
      setPairs((prev) =>
        prev.filter(
          (p) =>
            !(
              p.thought_id_a === pair.thought_id_a &&
              p.thought_id_b === pair.thought_id_b
            )
        )
      );
      // Drop any lingering batch selection for the resolved pair
      setSelections((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setResolving(null);
      setConfirmDelete(null);
    }
  };

  const pairKey = (p: DuplicatePair) =>
    `${p.thought_id_a}-${p.thought_id_b}`;

  if (loading && pairs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Duplicates</h1>
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <div className="w-4 h-4 border-2 border-violet/30 border-t-violet rounded-full animate-spin" />
          Searching for near-duplicates...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Duplicates</h1>
          <p className="text-text-secondary text-sm">
            Semantic near-duplicates (similarity &gt; {parseFloat((threshold * 100).toFixed(2))}%)
            {!loading && ` | ${pairs.length} pairs found`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-text-muted text-xs">Threshold</label>
          <select
            value={threshold}
            onChange={(e) => {
              setThreshold(parseFloat(e.target.value));
              setOffset(0);
              clearSelections();
            }}
            className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary"
          >
            <option value={0.9999}>100%</option>
            <option value={0.999}>99.9%</option>
            <option value={0.99}>99%</option>
            <option value={0.97}>97%</option>
            <option value={0.95}>95%</option>
            <option value={0.90}>90%</option>
            <option value={0.85}>85%</option>
            <option value={0.80}>80%</option>
          </select>
        </div>
      </div>

      {/* Per-source filter row (openbrain li-vea6mj, spec v073) — derived
          from the data, default all-except-gmail, persisted in
          localStorage. Display-only: it changes which pairs load, never a
          thoughts row. */}
      {sourceUniverse.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-muted text-xs mr-1">Sources</span>
          {sourceUniverse.map(({ source, count }) => {
            const checked = selectedSources?.includes(source) ?? false;
            return (
              <label
                key={source}
                className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  checked
                    ? "text-violet border-violet/30 bg-violet-surface"
                    : "text-text-muted border-border hover:bg-bg-hover"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSource(source)}
                  className="accent-violet"
                />
                {source}
                <span className="text-text-muted font-mono">{count}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Batch action toolbar */}
      {selectedCount > 0 && (() => {
        const deleteCount = Object.values(selections).filter(s => s === "keep_a" || s === "keep_b").length;
        const keepBothCount = Object.values(selections).filter(s => s === "keep_both").length;
        return (
          <div className="flex items-center gap-3 bg-violet-surface border border-violet/20 rounded-lg px-4 py-3">
            <span className="text-sm text-violet font-medium">
              {selectedCount} pair{selectedCount > 1 ? "s" : ""} selected
              {deleteCount > 0 && keepBothCount > 0 && (
                <span className="text-text-muted font-normal">
                  {" "}({deleteCount} to delete, {keepBothCount} to dismiss)
                </span>
              )}
            </span>
            <button
              disabled={batchProcessing}
              onClick={() => setConfirmBatch(true)}
              className="px-4 py-1.5 text-sm font-medium bg-violet hover:bg-violet-dim text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {batchProcessing ? "Processing..." : `Resolve ${selectedCount} pair${selectedCount > 1 ? "s" : ""}`}
            </button>
            <button
              disabled={batchProcessing}
              onClick={clearSelections}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          </div>
        );
      })()}

      {error && <p className="text-danger text-sm">{error}</p>}

      {pairs.length === 0 && !loading && (
        <div className="text-text-muted text-sm py-12 text-center">
          {selectedSources !== null && selectedSources.length === 0
            ? "No sources selected — check a source above to review its duplicates."
            : "No duplicates at this threshold — this band is clean. Lower the threshold to review weaker matches."}
        </div>
      )}

      <div className="space-y-4">
        {pairs.map((pair) => {
          const key = pairKey(pair);
          const isResolving = resolving === key;
          const sim = (Math.floor(pair.similarity * 10000) / 100).toFixed(2);

          return (
            <div
              key={key}
              className="bg-bg-surface border border-border rounded-lg p-4 space-y-3"
            >
              {/* Header with similarity badge */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {sim}% similar
                </span>
                <div className="flex items-center gap-3">
                  <label
                    className={`flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      selections[key] === "keep_both"
                        ? "text-violet border-violet/30 bg-violet-surface"
                        : "text-text-muted border-border hover:bg-bg-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`pair-${key}`}
                      checked={selections[key] === "keep_both"}
                      onChange={() => toggleSelection(key, "keep_both")}
                      className="accent-violet"
                    />
                    Keep Both
                  </label>
                  <button
                    disabled={isResolving}
                    onClick={() => resolve("keep_both", pair)}
                    title="Keep both now — the pair is recorded as resolved and never resurfaces"
                    className="px-3 py-1 text-xs font-medium text-violet border border-violet/20 rounded-lg hover:bg-violet-surface transition-colors disabled:opacity-30"
                  >
                    Keep Both Now
                  </button>
                </div>
              </div>

              {/* Side-by-side content */}
              <div className="grid grid-cols-2 gap-3">
                {/* Left: Thought A */}
                <div
                  className={`bg-bg-elevated rounded-lg p-3 space-y-2 cursor-pointer border-2 transition-colors ${
                    selections[key] === "keep_a"
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : selections[key] === "keep_b"
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-transparent"
                  }`}
                  onClick={() => toggleSelection(key, "keep_a")}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`pair-${key}`}
                        checked={selections[key] === "keep_a"}
                        onChange={() => toggleSelection(key, "keep_a")}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-emerald-500"
                        title="Keep this, delete the other"
                      />
                      <Link
                        href={`/thoughts/${pair.thought_id_a}`}
                        className="text-xs text-text-muted hover:text-violet"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{pair.thought_id_a}
                      </Link>
                      <TypeBadge type={pair.type_a} />
                    </div>
                    <span className="text-xs text-text-muted font-mono">
                      Q:{pair.quality_a ?? "—"}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed">
                    {pair.content_a.length > 200
                      ? pair.content_a.slice(0, 200) + "..."
                      : pair.content_a}
                  </p>
                  <div className="flex items-center justify-between">
                    <time className="text-xs text-text-muted">
                      {new Date(pair.created_a).toLocaleDateString()}
                    </time>
                    <div className="flex items-center gap-2">
                      {selections[key] === "keep_a" && (
                        <span className="text-xs text-emerald-400 font-medium">Keep</span>
                      )}
                      {selections[key] === "keep_b" && (
                        <span className="text-xs text-red-400 font-medium">Delete</span>
                      )}
                      <button
                        disabled={isResolving}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({ action: "keep_a", pair });
                        }}
                        className="px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                      >
                        Keep This
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Thought B */}
                <div
                  className={`bg-bg-elevated rounded-lg p-3 space-y-2 cursor-pointer border-2 transition-colors ${
                    selections[key] === "keep_b"
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : selections[key] === "keep_a"
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-transparent"
                  }`}
                  onClick={() => toggleSelection(key, "keep_b")}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`pair-${key}`}
                        checked={selections[key] === "keep_b"}
                        onChange={() => toggleSelection(key, "keep_b")}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-emerald-500"
                        title="Keep this, delete the other"
                      />
                      <Link
                        href={`/thoughts/${pair.thought_id_b}`}
                        className="text-xs text-text-muted hover:text-violet"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{pair.thought_id_b}
                      </Link>
                      <TypeBadge type={pair.type_b} />
                    </div>
                    <span className="text-xs text-text-muted font-mono">
                      Q:{pair.quality_b ?? "—"}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed">
                    {pair.content_b.length > 200
                      ? pair.content_b.slice(0, 200) + "..."
                      : pair.content_b}
                  </p>
                  <div className="flex items-center justify-between">
                    <time className="text-xs text-text-muted">
                      {new Date(pair.created_b).toLocaleDateString()}
                    </time>
                    <div className="flex items-center gap-2">
                      {selections[key] === "keep_b" && (
                        <span className="text-xs text-emerald-400 font-medium">Keep</span>
                      )}
                      {selections[key] === "keep_a" && (
                        <span className="text-xs text-red-400 font-medium">Delete</span>
                      )}
                      <button
                        disabled={isResolving}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({ action: "keep_b", pair });
                        }}
                        className="px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                      >
                        Keep This
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pairs.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {offset + 1}–{offset + pairs.length}
          </p>
          <div className="flex gap-2">
            <button
              disabled={offset <= 0}
              onClick={() => setOffset((o) => Math.max(0, o - PER_PAGE))}
              className="px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-30"
            >
              Previous
            </button>
            <button
              disabled={pairs.length < PER_PAGE}
              onClick={() => setOffset((o) => o + PER_PAGE)}
              className="px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Confirm single delete modal */}
      {confirmDelete && (
        <DeleteModal
          title="Confirm Delete"
          message={`Keep thought #${
            confirmDelete.action === "keep_a"
              ? confirmDelete.pair.thought_id_a
              : confirmDelete.pair.thought_id_b
          } and permanently delete #${
            confirmDelete.action === "keep_a"
              ? confirmDelete.pair.thought_id_b
              : confirmDelete.pair.thought_id_a
          }?`}
          onConfirm={() =>
            resolve(confirmDelete.action, confirmDelete.pair)
          }
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Confirm batch resolve modal */}
      {confirmBatch && (() => {
        const deleteCount = Object.values(selections).filter(s => s === "keep_a" || s === "keep_b").length;
        const keepBothCount = Object.values(selections).filter(s => s === "keep_both").length;
        const parts: string[] = [];
        if (deleteCount > 0) parts.push(`delete ${deleteCount} duplicate${deleteCount > 1 ? "s" : ""}`);
        if (keepBothCount > 0) parts.push(`dismiss ${keepBothCount} pair${keepBothCount > 1 ? "s" : ""}`);
        return (
          <DeleteModal
            title="Confirm Batch Resolve"
            message={`This will ${parts.join(" and ")}. Continue?`}
            onConfirm={processBatch}
            onCancel={() => setConfirmBatch(false)}
          />
        );
      })()}
    </div>
  );
}

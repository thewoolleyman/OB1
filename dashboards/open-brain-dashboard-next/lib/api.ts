import "server-only";
import type {
  Thought,
  BrowseResponse,
  StatsResponse,
  Reflection,
  IngestionJob,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function headers(apiKey: string): HeadersInit {
  return {
    "x-brain-key": apiKey,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(apiKey), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`API ${res.status}: ${text || res.statusText}`, res.status);
  }
  return res.json();
}

export async function fetchThoughts(
  apiKey: string,
  params?: {
    page?: number;
    per_page?: number;
    type?: string;
    source_type?: string;
    quality_score_max?: number;
    sort?: string;
    order?: string;
    exclude_restricted?: boolean;
  }
): Promise<BrowseResponse> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.per_page) sp.set("per_page", String(params.per_page));
  if (params?.type) sp.set("type", params.type);
  if (params?.source_type) sp.set("source_type", params.source_type);
  if (params?.quality_score_max !== undefined)
    sp.set("quality_score_max", String(params.quality_score_max));
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.order) sp.set("order", params.order);
  if (params?.exclude_restricted !== undefined)
    sp.set("exclude_restricted", String(params.exclude_restricted));
  const qs = sp.toString();
  return apiFetch<BrowseResponse>(apiKey, `/thoughts${qs ? `?${qs}` : ""}`);
}

export async function fetchThought(
  apiKey: string,
  id: string,
  excludeRestricted: boolean = true
): Promise<Thought> {
  const qs = excludeRestricted ? "" : "?exclude_restricted=false";
  return apiFetch<Thought>(apiKey, `/thought/${id}${qs}`);
}

export async function updateThought(
  apiKey: string,
  id: string,
  data: {
    content?: string;
    type?: string;
    gtd_status?: string;
    gtd_triaged_at?: string;
    /**
     * GTD Inbox lifecycle marker per openbrain SPECIFICATION
     * (Inbox dismiss): PUT /thought/:id with { inbox_state:
     * "dismissed" } moves a source doc out of the Inbox without
     * creating a task. For a Gmail source this also triggers the
     * server-side label reconcile automatically.
     */
    inbox_state?: string;
  }
): Promise<{ id: string; action: string; message: string }> {
  return apiFetch<{ id: string; action: string; message: string }>(
    apiKey,
    `/thought/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

// ---------- task-from-source (GTD: task references a source doc) ----------
//
// POST /task-from-source on open-brain-rest. Per the openbrain GTD
// redesign a source document (Gmail/Obsidian/Drive thought) is
// supporting material, never a task: creating a task makes a SEPARATE
// type=task record that references the source, and the source doc
// stays put with metadata.inbox_state = "promoted". The endpoint does
// all of that atomically. Authenticated with the session's x-brain-key
// like every other mutation here.
//
// Body: { supporting_thought_ids: string[] (UUIDs, required),
//         gtd_status?: "next"|"waiting"|"soon"|"someday"|"maybe"
//                      (default "next"),
//         content?: string (task title/text; server derives a stub
//                           from the source when omitted) }.
// Returns the created task row; a 200 means an existing thread-task was
// returned (idempotent).

export interface TaskFromSourcePayload {
  supporting_thought_ids: string[];
  gtd_status?: string;
  content?: string;
}

export async function createTaskFromSource(
  apiKey: string,
  payload: TaskFromSourcePayload
): Promise<Thought> {
  return apiFetch<Thought>(apiKey, "/task-from-source", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchKanbanThoughts(
  apiKey: string,
  params?: {
    exclude_restricted?: boolean;
  }
): Promise<Thought[]> {
  // The Workflow (Kanban) board consumes two row sets per openbrain
  // spec.md § Dashboard:
  //
  //   1. Triaged `type=task` rows — grouped into the gtd_status
  //      columns (Next … Done). gtd_status grouping (and exclusion
  //      of unrecognized statuses) is client-side in KanbanBoard.
  //   2. Untriaged `task`/`idea` rows (metadata.gtd_triaged_at IS
  //      NULL) — these feed the leftmost universal-Inbox lane
  //      ("Workflow triage lane"). They carry no gtd_status, so the
  //      existing column-grouping logic in KanbanBoard /
  //      KanbanSummary skips them; the Inbox-lane UI (li-2inwx3)
  //      selects them via getGtdTriagedAt(t) === null.
  //
  // Both are merged into one Thought[] and de-duplicated by id (an
  // untriaged native task appears in both fetches). The triaged set
  // is sorted by activity_date desc — the recency field that
  // replaced the removed legacy `importance` sort (spec.md §
  // Dashboard "Unified query controls"; the `?sort=importance`
  // option is REMOVED per contracts.md § open-brain-rest). Rows
  // without an activity_date fall through to the backend's
  // created_at-descending default ordering.
  const tasksSp = new URLSearchParams();
  tasksSp.set("per_page", "100");
  tasksSp.set("type", "task");
  tasksSp.set("sort", "activity_date");
  tasksSp.set("order", "desc");
  if (params?.exclude_restricted !== undefined)
    tasksSp.set("exclude_restricted", String(params.exclude_restricted));

  const tasks = await apiFetch<BrowseResponse>(
    apiKey,
    `/thoughts?${tasksSp.toString()}`
  );

  // Untriaged task/idea Inbox set via GET /triage (membership owned
  // by the backend: gtd_triaged_at IS NULL AND type ∈ {task, idea}),
  // sorted by the same activity_date recency the board uses.
  const inbox = await fetchTriageThoughts(apiKey, {
    sort: "activity_date",
    order: "desc",
    pageSize: 100,
  });

  const byId = new Map<string, Thought>();
  for (const t of tasks.data) byId.set(t.id, t);
  for (const t of inbox.thoughts) if (!byId.has(t.id)) byId.set(t.id, t);
  return [...byId.values()];
}

// ---------- triage (untriaged tasks + ideas) ----------
//
// GET /triage and GET /triage/summary per openbrain
// SPECIFICATION/contracts.md § open-brain-rest and spec.md
// § Dashboard "Triage view": thoughts where
// metadata.gtd_triaged_at IS NULL AND metadata.type ∈ {task, idea}.

export interface TriageListResponse {
  thoughts: Thought[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchTriageThoughts(
  apiKey: string,
  params?: {
    source?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    order?: string;
  }
): Promise<TriageListResponse> {
  const sp = new URLSearchParams();
  if (params?.source) sp.set("source", params.source);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  // Shared query-control sort/order (open-brain-rest applies it on
  // top of the untriaged membership gate). Used by the Workflow
  // Inbox lane to match the board's activity_date recency ordering.
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.order) sp.set("order", params.order);
  const qs = sp.toString();
  const data = await apiFetch<Record<string, unknown>>(
    apiKey,
    `/triage${qs ? `?${qs}` : ""}`
  );
  // Lenient envelope parse (fail-soft on shape drift): canonical key
  // is `thoughts`; tolerate the legacy `data` list key.
  const thoughts = (Array.isArray(data.thoughts)
    ? data.thoughts
    : Array.isArray(data.data)
      ? data.data
      : []) as Thought[];
  return {
    thoughts,
    total: typeof data.total === "number" ? data.total : thoughts.length,
    page: typeof data.page === "number" ? data.page : 1,
    pageSize:
      typeof data.pageSize === "number"
        ? data.pageSize
        : typeof data.per_page === "number"
          ? data.per_page
          : thoughts.length,
  };
}

export async function fetchTriageSummary(
  apiKey: string
): Promise<import("./types").TriageSummaryResponse> {
  const data = await apiFetch<Record<string, unknown>>(apiKey, "/triage/summary");
  return {
    total: typeof data.total === "number" ? data.total : 0,
    by_source:
      data.by_source && typeof data.by_source === "object"
        ? (data.by_source as Record<string, number>)
        : {},
  };
}

export async function fetchDuplicates(
  apiKey: string,
  params?: {
    threshold?: number;
    limit?: number;
    offset?: number;
    sources?: string[];
  }
): Promise<import("./types").DuplicatesResponse> {
  const sp = new URLSearchParams();
  if (params?.threshold) sp.set("threshold", String(params.threshold));
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));
  // Per-source filter (openbrain li-vea6mj, spec v073). Omitted/empty =
  // all sources, so we only send it when at least one source is named.
  if (params?.sources && params.sources.length > 0)
    sp.set("sources", params.sources.join(","));
  const qs = sp.toString();
  return apiFetch(apiKey, `/duplicates${qs ? `?${qs}` : ""}`);
}

// Persistent duplicate resolutions (openbrain li-xyuon6). Idempotent;
// keep_both entries whose member rows are missing are skipped
// (counted in `skipped`, not errored).
export async function resolveDuplicates(
  apiKey: string,
  resolutions: import("./types").DuplicateResolution[]
): Promise<import("./types").ResolveDuplicatesResponse> {
  return apiFetch(apiKey, "/duplicates/resolve", {
    method: "POST",
    body: JSON.stringify({ resolutions }),
  });
}

export async function deleteThought(
  apiKey: string,
  id: string
): Promise<void> {
  const url = `${API_URL}/thought/${id}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`API ${res.status}: ${text || res.statusText}`, res.status);
  }
}

export interface SearchResponse {
  results: (Thought & { similarity?: number; rank?: number })[];
  count: number;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export async function searchThoughts(
  apiKey: string,
  query: string,
  limit: number = 25,
  page: number = 1,
  excludeRestricted: boolean = true
): Promise<SearchResponse> {
  return apiFetch(apiKey, `/search`, {
    method: "POST",
    body: JSON.stringify({ query, limit, page, exclude_restricted: excludeRestricted }),
  });
}

export async function fetchStats(
  apiKey: string,
  days?: number,
  excludeRestricted: boolean = true
): Promise<StatsResponse> {
  const sp = new URLSearchParams();
  if (days) sp.set("days", String(days));
  if (!excludeRestricted) sp.set("exclude_restricted", "false");
  const qs = sp.toString();
  return apiFetch<StatsResponse>(apiKey, `/stats${qs ? `?${qs}` : ""}`);
}

export interface CaptureResult {
  thought_id: string;
  action: string;
  type: string;
  sensitivity_tier: string;
  content_fingerprint: string;
  message: string;
}

export async function captureThought(
  apiKey: string,
  content: string
): Promise<CaptureResult> {
  return apiFetch<CaptureResult>(apiKey, "/capture", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// ---------- capture-task (task-explicit capture) ----------
//
// Unlike every other endpoint in this module, POST /capture-task on
// open-brain-rest does NOT authenticate via x-brain-key. It enforces
// its own credential: the X-Capture-Key header checked against the
// server-side ANDROID_CAPTURE_KEY secret (see openbrain
// SPECIFICATION/contracts.md § Authentication). The key MUST stay
// server-side — this module is `server-only`, and the value is never
// shipped to the client bundle.

export interface CaptureTaskPayload {
  content: string;
  gtd_status?: string;
  gtd_contexts?: string[];
  gtd_energy_required?: string;
  gtd_time_required?: string;
  gtd_priority?: string;
  para_category?: string;
  para_container?: string;
}

/** Raw MCP-tool-shaped result relayed by open-brain-rest. */
export interface CaptureTaskResult {
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export async function captureTask(
  payload: CaptureTaskPayload
): Promise<CaptureTaskResult> {
  const captureKey = process.env.ANDROID_CAPTURE_KEY;
  if (!captureKey) {
    throw new ApiError(
      "ANDROID_CAPTURE_KEY is not configured on the dashboard server",
      500
    );
  }
  const res = await fetch(`${API_URL}/capture-task`, {
    method: "POST",
    headers: {
      "X-Capture-Key": captureKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(
      `API ${res.status}: ${text || res.statusText}`,
      res.status
    );
  }
  return res.json();
}

// ---------- para-containers (autocomplete suggestions) ----------
//
// GET /para-containers on open-brain-rest returns distinct
// metadata.para_container values with usage counts, ordered count
// desc (most-used first). Authenticated with the session's
// x-brain-key like every other read endpoint here. Consumed by the
// /api/para-containers proxy route for the AddTaskToBrain
// para_container autocomplete (openbrain li-azzzay).

export interface ParaContainerSuggestion {
  para_category: string | null;
  para_container: string;
  count: number;
}

export async function fetchParaContainers(
  apiKey: string
): Promise<ParaContainerSuggestion[]> {
  const data = await apiFetch<{ containers: ParaContainerSuggestion[] }>(
    apiKey,
    "/para-containers"
  );
  return data.containers;
}

export async function fetchReflections(
  apiKey: string,
  thoughtId: string
): Promise<Reflection[]> {
  const data = await apiFetch<{ reflections: Reflection[] }>(
    apiKey,
    `/thought/${thoughtId}/reflection`
  );
  return data.reflections;
}

export async function fetchIngestionJobs(
  apiKey: string
): Promise<IngestionJob[]> {
  const data = await apiFetch<{ jobs: IngestionJob[]; count: number }>(
    apiKey,
    "/ingestion-jobs"
  );
  return data.jobs;
}

export async function triggerIngest(
  apiKey: string,
  text: string,
  opts?: { dry_run?: boolean }
): Promise<{ job_id: number; status: string }> {
  return apiFetch(apiKey, "/ingest", {
    method: "POST",
    body: JSON.stringify({ text, ...opts }),
  });
}

export async function checkHealth(
  apiKey: string
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(apiKey, "/health");
}

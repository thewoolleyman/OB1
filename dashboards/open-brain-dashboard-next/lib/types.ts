export interface Thought {
  id: string;
  uuid?: string;
  content: string;
  type: string;
  source_type: string;
  quality_score: number;
  sensitivity_tier: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /**
   * Read-response-shape field per openbrain
   * SPECIFICATION/contracts.md § Read response shape
   * (= metadata.gtd_status ?? null). Optional so the dashboard
   * stays tolerant of rows served before the GTD bundle.
   */
  gtd_status?: string | null;
}

// --- Thought type constants ---

/**
 * THE single canonical type vocabulary, per openbrain
 * SPECIFICATION/spec.md § Dashboard "Canonical type vocabulary":
 * every filter, editor, and the Kanban modal MUST derive from this
 * constant — per-component hardcoded type lists are forbidden.
 * The six members mirror spec.md § Capture pipeline.
 */
export const THOUGHT_TYPES = [
  "task",
  "idea",
  "journal",
  "reference",
  "person_note",
  "meeting",
] as const;

/**
 * Only these types participate in the kanban workflow.
 * ["task"] per spec.md § Dashboard "Kanban view" (was
 * ["task", "idea"]; ideas live in Triage / Search instead).
 */
export const KANBAN_TYPES: string[] = ["task"];

// --- GTD workflow constants ---

/**
 * Kanban columns, left-to-right, mapping one-to-one to
 * metadata.gtd_status values per spec.md § Dashboard "Kanban
 * view". `archived` deliberately has no column. These six are
 * also the "active" enum values offered by the ThoughtActions
 * change-gtd_status dropdown.
 */
export const KANBAN_STATUSES = [
  "next",
  "waiting",
  "soon",
  "someday",
  "maybe",
  "done",
] as const;
export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

export const KANBAN_LABELS: Record<KanbanStatus, string> = {
  next: "Next",
  waiting: "Waiting For",
  soon: "Soon",
  someday: "Someday",
  maybe: "Maybe",
  done: "Done",
};

/**
 * Fail-soft fallback column id for rows whose gtd_status is
 * unrecognized (out-of-enum). Render-only — never a valid
 * gtd_status write target.
 */
export const KANBAN_FALLBACK_COLUMN = "unrecognized";

/**
 * gtd_status values offered at capture / promote time. The
 * workflow-managed values `done` and `archived` MUST NOT be
 * offered (spec.md § Dashboard).
 */
export const GTD_CAPTURE_STATUSES = [
  "next",
  "waiting",
  "soon",
  "someday",
  "maybe",
] as const;

/** gtd_status of a thought, preferring the top-level read-shape field. */
export function getGtdStatus(t: Thought): string | null {
  if (typeof t.gtd_status === "string") return t.gtd_status;
  const m = t.metadata?.gtd_status;
  return typeof m === "string" ? m : null;
}

/** metadata.gtd_triaged_at, or null when the thought is untriaged. */
export function getGtdTriagedAt(t: Thought): string | null {
  const m = t.metadata?.gtd_triaged_at;
  return typeof m === "string" ? m : null;
}

// --- Triage (untriaged tasks + ideas) ---

/** Response of GET /triage/summary per openbrain contracts.md. */
export interface TriageSummaryResponse {
  total: number;
  by_source: Record<string, number>;
}

/**
 * Display labels for the known metadata.source values (spec.md
 * § Dashboard "Triage view" tab vocabulary). Unknown sources MUST
 * fail soft: render the raw value, never crash or hide the row.
 */
export const SOURCE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  mcp: "MCP",
  obsidian: "Obsidian",
  gdrive: "Drive",
  slack: "Slack",
};

export interface Reflection {
  id: string | number;
  thought_id: string;
  trigger_context: string;
  options: unknown[];
  factors: unknown[];
  conclusion: string;
  confidence: number;
  reflection_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface IngestionJob {
  id: number;
  source_label: string;
  status: string;
  extracted_count: number;
  added_count: number;
  skipped_count: number;
  appended_count: number;
  revised_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface BrowseResponse {
  data: Thought[];
  total: number;
  page: number;
  per_page: number;
}

export interface StatsResponse {
  total_thoughts: number;
  window_days: number | "all";
  types: Record<string, number>;
  top_topics: Array<{ topic: string; count: number }>;
}

export interface DuplicatePair {
  thought_id_a: string;
  thought_id_b: string;
  similarity: number;
  content_a: string;
  content_b: string;
  type_a: string;
  type_b: string;
  quality_a: number;
  quality_b: number;
  created_a: string;
  created_b: string;
}

export interface DuplicatesResponse {
  pairs: DuplicatePair[];
  threshold: number;
  limit: number;
  offset: number;
}

// POST /duplicates/resolve — persistent duplicate resolutions
// (openbrain li-xyuon6). `delete_id` is required when action is
// "delete" and MUST be one of the two pair members (the other member
// survives and is recorded as the keeper); omitted for "keep_both".
// After a keep_both resolution the backend permanently excludes the
// pair from GET /duplicates.
export interface DuplicateResolution {
  pair: [string, string];
  action: "delete" | "keep_both";
  delete_id?: string;
}

export interface ResolveDuplicatesResponse {
  resolved: number;
  deleted: number;
  skipped: number;
}

export interface ReflectionOption {
  label: string;
}

export interface ReflectionFactor {
  label: string;
  weight: number;
}

export interface ReflectionInput {
  trigger_context: string;
  options: ReflectionOption[];
  factors: ReflectionFactor[];
  conclusion: string;
  reflection_type: string;
}

export interface IngestionItem {
  id: number | string;
  job_id: number;
  content: string;
  type: string;
  fingerprint: string;
  action: string; // add, skip, create_revision, append_evidence
  reason: string | null;
  similarity: number | null;
  status: string;
  metadata: Record<string, unknown>;
}

export interface IngestionJobDetail {
  job: IngestionJob;
  items: IngestionItem[];
}

export type AddToBrainMode = "auto" | "single" | "extract";

export interface AddToBrainResult {
  path: "single" | "extract";
  thought_id?: string;
  job_id?: number;
  type?: string;
  status?: string;
  extracted_count?: number | null;
  message: string;
}

export type AgentMemoryReviewAction =
  | "confirm"
  | "edit"
  | "evidence_only"
  | "restrict_scope"
  | "mark_stale"
  | "merge"
  | "reject"
  | "dispute"
  | "supersede";

export interface AgentMemory {
  memory_id: string;
  summary: string;
  content: string;
  source: {
    kind: string;
    uri: string | null;
    title: string | null;
    timestamp: string | null;
  };
  provenance: {
    status: string;
    confidence: number;
    created_by: string;
    model: string | null;
    runtime: string | null;
  };
  scope: {
    workspace_id: string;
    project_id: string | null;
    channel_id: string | null;
    visibility: string;
  };
  use_policy: {
    can_use_as_instruction: boolean;
    can_use_as_evidence: boolean;
    requires_user_confirmation: boolean;
  };
  freshness: {
    created_at: string;
    last_confirmed_at: string | null;
    stale_after: string | null;
  };
  related_artifacts: Array<{ kind: string; uri: string }>;
}

export interface AgentMemoryListResponse {
  memories: AgentMemory[];
  count: number;
}

export interface AgentMemorySourceRef {
  id: string;
  memory_id: string;
  source_kind: string;
  uri: string | null;
  title: string | null;
  source_timestamp: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AgentMemoryArtifact {
  id: string;
  memory_id: string;
  artifact_kind: string;
  uri: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AgentMemoryRecord {
  id: string;
  thought_id: string | null;
  workspace_id: string;
  project_id: string | null;
  channel_kind: string | null;
  channel_id: string | null;
  channel_thread_id: string | null;
  visibility: string;
  memory_type: string;
  summary: string;
  content: string;
  lifecycle_status: string;
  provenance_status: string;
  confidence: number;
  created_by: string;
  runtime_name: string | null;
  runtime_version: string | null;
  provider: string | null;
  model: string | null;
  task_id: string | null;
  flow_id: string | null;
  can_use_as_instruction: boolean;
  can_use_as_evidence: boolean;
  requires_user_confirmation: boolean;
  review_status: string;
  last_confirmed_at: string | null;
  stale_after: string | null;
  idempotency_key: string | null;
  content_hash: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  agent_memory_source_refs?: AgentMemorySourceRef[];
  agent_memory_artifacts?: AgentMemoryArtifact[];
}

export interface AgentMemoryTraceItem {
  id: string;
  trace_id: string;
  memory_id: string;
  rank: number;
  similarity: number | null;
  ranking_score: number | null;
  returned: boolean;
  used: boolean | null;
  ignored_reason: string | null;
  use_policy_snapshot: Record<string, unknown>;
  created_at: string;
  agent_memories?: AgentMemoryRecord;
}

export interface AgentMemoryTraceResponse {
  trace: {
    id: string;
    request_id: string;
    workspace_id: string;
    project_id: string | null;
    runtime_name: string | null;
    runtime_version: string | null;
    task_id: string | null;
    flow_id: string | null;
    channel_kind: string | null;
    channel_id: string | null;
    query: string;
    schema_version: string;
    request_payload: Record<string, unknown>;
    response_policy: Record<string, unknown>;
    created_at: string;
  };
  items: AgentMemoryTraceItem[];
}

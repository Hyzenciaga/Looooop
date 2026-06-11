// ─── State Tree (authoritative, lives in Runtime) ───

export interface AppState {
  sessions: Record<string, SessionState>
  todos: TodoTree
}

export interface SessionState {
  id: string
  status: 'idle' | 'running' | 'waiting_permission' | 'error'
  /** Lightweight message summaries (not full SDK messages) */
  messages: MessageSummary[]
  /** Currently active stream IDs */
  activeStreamIds: string[]
  /** Current model identifier */
  currentModel?: string
  /** Accumulated cost in USD */
  costUsd: number
  /** Session title / first prompt */
  title?: string
  /** Project path */
  projectPath: string
  /** Last activity timestamp */
  lastActivity: number
}

export interface MessageSummary {
  /** Message UUID */
  uuid: string
  /** Message type from SDK */
  type: 'user' | 'assistant' | 'result' | 'system'
  /** Text preview (truncated to 200 chars) */
  preview: string
  /** Timestamp */
  timestamp: number
  /** Tool calls in this message (names only) */
  toolCalls?: string[]
  /** Subagent type if from subagent */
  subagentType?: string
}

export interface TodoTree {
  /** Session-scoped todos (ephemeral, die with session) */
  session: TodoItem[]
  /** Project-scoped todos (persisted to disk) */
  project: TodoItem[]
}

export interface TodoItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  children?: TodoItem[]
  /** Source session ID */
  sessionId?: string
  /** Parent todo ID (for nesting) */
  parentId?: string
  createdAt: number
  updatedAt: number
}

// ─── Delta Events (Runtime → Renderer, incremental updates) ───

export type StateDelta =
  | SessionStatusDelta
  | MessageAppendedDelta
  | StreamStartedDelta
  | StreamEndedDelta
  | TodoCreatedDelta
  | TodoUpdatedDelta
  | TodoDeletedDelta
  | CostUpdatedDelta
  | ModelChangedDelta
  | SessionTitleDelta
  | FullSyncDelta

export interface SessionStatusDelta {
  type: 'SESSION_STATUS'
  sessionId: string
  status: SessionState['status']
}

export interface MessageAppendedDelta {
  type: 'MESSAGE_APPENDED'
  sessionId: string
  summary: MessageSummary
}

export interface StreamStartedDelta {
  type: 'STREAM_STARTED'
  sessionId: string
  streamId: string
}

export interface StreamEndedDelta {
  type: 'STREAM_ENDED'
  sessionId: string
  streamId: string
}

export interface TodoCreatedDelta {
  type: 'TODO_CREATED'
  scope: 'session' | 'project'
  item: TodoItem
}

export interface TodoUpdatedDelta {
  type: 'TODO_UPDATED'
  scope: 'session' | 'project'
  id: string
  patch: Partial<Pick<TodoItem, 'title' | 'status' | 'children'>>
}

export interface TodoDeletedDelta {
  type: 'TODO_DELETED'
  scope: 'session' | 'project'
  id: string
}

export interface CostUpdatedDelta {
  type: 'COST_UPDATED'
  sessionId: string
  costUsd: number
}

export interface ModelChangedDelta {
  type: 'MODEL_CHANGED'
  sessionId: string
  model: string
}

export interface SessionTitleDelta {
  type: 'SESSION_TITLE'
  sessionId: string
  title: string
}

export interface FullSyncDelta {
  type: 'FULL_SYNC'
  state: AppState
}

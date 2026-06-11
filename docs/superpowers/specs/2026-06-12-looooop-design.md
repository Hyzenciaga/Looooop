# Looooop - Claude Code macOS Client Design Spec

## Overview

Looooop is a differentiated macOS desktop client for Claude Code, built on `@anthropic-ai/claude-agent-sdk`. It provides a three-panel UI (project history, chat, todos) with custom logic via SDK hooks, isolated runtime architecture, and non-blocking state synchronization.

**Not** a CLI wrapper. A standalone AI programming assistant with its own product identity.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron + electron-vite |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| SDK | `@anthropic-ai/claude-agent-sdk` v0.3.x |
| Scaffolding | electron-vite monorepo |

## Architecture

### Process Model

```
Renderer Process (UI)
    │
    │ ipcRenderer.invoke / ipcRenderer.on
    │ (exposed via preload script)
    │
Main Process (Router)
    │
    │ utilityProcess.postMessage / utilityProcess.on('message')
    │ (Electron's built-in IPC for UtilityProcess)
    │
Utility Process (Runtime)
    │
    │ @anthropic-ai/claude-agent-sdk
    │
Claude API
```

**Renderer Process**: React UI. No direct SDK access. Communicates exclusively via typed IPC channels exposed through a preload script (`contextBridge.exposeInMainWorld`).

**Main Process**: Pure router. Receives IPC from renderer, forwards to utility process via `utilityProcess.postMessage()`. Receives messages from utility process via `utilityProcess.on('message')`, forwards to renderer via `webContents.send()`. Holds zero SDK state.

**Utility Process**: The agent runtime. Hosts the SDK `query()` lifecycle, hooks engine, state machine, decision queue, and session manager. Runs via `utilityProcess.fork()` (Electron 22+). Communicates with main process through the built-in message port (`parentPort.on('message')` / `parentPort.postMessage()`). If it crashes or OOMs, the renderer stays at 60fps.

### Directory Structure

```
Looooop/
├── electron.vite.config.ts
├── package.json
├── tsconfig.base.json
├── packages/
│   ├── main/                    # Main Process
│   │   ├── src/
│   │   │   ├── index.ts         # Electron app entry
│   │   │   ├── router.ts        # IPC ↔ MessagePort bridge
│   │   │   ├── window.ts        # BrowserWindow management
│   │   │   └── runtime.ts       # Utility Process lifecycle
│   │   └── tsconfig.json
│   │
│   ├── shared/                  # Shared types (pure types, no runtime code)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── ipc-stream.ts    # StreamFrame, StreamCommand, IPC_CHANNELS
│   │   │   ├── state-delta.ts   # StateDelta, AppState, TodoTree
│   │   │   ├── permission.ts    # PermissionRequest, PermissionResult
│   │   │   └── constants.ts     # App-level constants
│   │   └── tsconfig.json
│   │
│   ├── preload/                 # Electron preload script (bridges renderer ↔ main)
│   │   ├── src/
│   │   │   ├── index.ts         # contextBridge.exposeInMainWorld('api', {...})
│   │   │   └── api.ts           # Typed IPC wrappers exposed to renderer
│   │   └── tsconfig.json
│   │
│   ├── renderer/                # Renderer Process
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── AppShell.tsx        # Three-panel layout
│   │   │   │   │   ├── LeftPanel.tsx       # Project/session history
│   │   │   │   │   ├── CenterPanel.tsx     # Chat area
│   │   │   │   │   └── RightPanel.tsx      # Todos
│   │   │   │   ├── chat/
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageBubble.tsx
│   │   │   │   │   ├── ToolCallCard.tsx
│   │   │   │   │   ├── ChatInput.tsx
│   │   │   │   │   └── StreamingIndicator.tsx
│   │   │   │   ├── todos/
│   │   │   │   │   ├── TodoTree.tsx
│   │   │   │   │   ├── TodoItem.tsx
│   │   │   │   │   └── TodoScopeToggle.tsx  # Session ↔ Project toggle
│   │   │   │   ├── sidebar/
│   │   │   │   │   ├── ProjectList.tsx
│   │   │   │   │   ├── SessionList.tsx
│   │   │   │   │   └── SessionCard.tsx
│   │   │   │   └── permission/
│   │   │   │       ├── PermissionDialog.tsx
│   │   │   │       └── ToolApprovalCard.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAgentStream.ts       # Consume StreamFrame, send prompts
│   │   │   │   ├── useStateSync.ts         # Apply StateDelta to Zustand stores
│   │   │   │   └── usePermission.ts        # Permission request/response flow
│   │   │   ├── stores/
│   │   │   │   ├── session-store.ts        # Zustand: sessions, messages
│   │   │   │   ├── todo-store.ts           # Zustand: todos (session + project)
│   │   │   │   ├── permission-store.ts     # Zustand: pending permissions
│   │   │   │   └── stream-store.ts         # Zustand: active streams
│   │   │   └── styles/
│   │   │       └── globals.css             # Tailwind directives
│   │   ├── index.html
│   │   └── tsconfig.json
│   │
│   └── runtime/                 # Utility Process (agent runtime)
│       ├── src/
│       │   ├── entry.ts                     # Utility Process entry point
│       │   ├── agent-runtime.ts             # Top-level runtime orchestrator
│       │   ├── sdk-service.ts               # SDK query() lifecycle
│       │   ├── state-machine.ts             # Authoritative state tree
│       │   ├── decision-queue.ts            # Suspension/resolve for permissions
│       │   ├── session-manager.ts           # Session CRUD, persistence
│       │   ├── hook-engine.ts               # SDK hooks registration & dispatch
│       │   └── ipc-bridge.ts                # MessagePort communication
│       └── tsconfig.json
```

## Core Design Decisions

### 1. IPC Stream Protocol

The SDK emits `AsyncGenerator<SDKMessage>`. Electron's `ipcMain.handle` is single-shot. We solve this with a framed streaming protocol.

**StreamFrame** (Runtime → Renderer):

```typescript
interface StreamFrame<T = unknown> {
  streamId: string;           // Distinguishes concurrent streams (main + sub-agents)
  sessionId: string;          // Links to agent session
  kind: 'chunk' | 'done' | 'error' | 'cancel';
  data?: T;                   // SDKMessage for chunk
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}
```

**StreamCommand** (Renderer → Runtime):

```typescript
interface StreamCommand {
  streamId: string;
  sessionId: string;
  kind: 'start' | 'cancel' | 'pause' | 'resume' | 'permission_response';
  payload?: unknown;
}
```

**IPC Channels** (constants):

```typescript
const IPC_CHANNELS = {
  AGENT_STREAM: 'agent:stream:frame',      // Runtime → Renderer
  AGENT_COMMAND: 'agent:command',           // Renderer → Runtime
  STATE_DELTA: 'state:delta',              // Runtime → Renderer
  PERMISSION_REQUEST: 'permission:request', // Runtime → Renderer
  PERMISSION_RESPONSE: 'permission:response', // Renderer → Runtime
} as const;
```

**Flow for a query:**

```
Renderer                    Main                    Utility Process
   │                          │                          │
   │── StreamCommand ────────►│── postMessage ──────────►│
   │   (kind: 'start')        │                          │
   │                          │                     query() starts
   │                          │                          │
   │◄── StreamFrame ─────────│◄── postMessage ──────────│
   │   (kind: 'chunk')        │                          │
   │◄── StreamFrame ─────────│◄── postMessage ──────────│
   │   (kind: 'chunk')        │                          │
   │◄── StreamFrame ─────────│◄── postMessage ──────────│
   │   (kind: 'done')         │                          │
```

### 2. Utility Process Isolation

The SDK runs inside `utilityProcess.fork()` (Electron 22+). This is a sandboxed child process with its own V8 isolate.

**Why not just use the main process?**
- SDK `query()` involves token parsing, file I/O, git tree analysis — all potentially blocking
- If the SDK process OOMs or loops, the main process (and thus the renderer) stays alive
- Permission decisions are async — the generator suspends cleanly in a separate process

**Main process router** is ~30 lines: receive IPC → forward to MessagePort → receive MessagePort → forward to IPC. No logic.

**Utility process entry** sets up the AgentRuntime and wires MessagePort events to runtime methods.

### 3. Non-blocking State Sync (Delta Events)

The Utility Process holds the **authoritative state tree**. The renderer holds a **reactive mirror** updated via delta events.

**State tree shape** (in Utility Process):

```typescript
interface AppState {
  sessions: Record<string, SessionState>;
  todos: TodoTree;
  permissions: PermissionQueue;
}

interface SessionState {
  id: string;
  status: 'idle' | 'running' | 'waiting_permission' | 'error';
  messages: MessageSummary[];      // Lightweight summaries, not full content
  activeStreamIds: string[];
  currentModel?: string;
  costUsd: number;
}

interface TodoTree {
  session: TodoItem[];    // Ephemeral, dies with session
  project: TodoItem[];    // Persisted to disk
}
```

**Delta events** (Runtime → Renderer, via `STATE_DELTA` channel):

```typescript
type StateDelta =
  | { type: 'SESSION_STATUS'; sessionId: string; status: SessionState['status'] }
  | { type: 'MESSAGE_APPENDED'; sessionId: string; summary: MessageSummary }
  | { type: 'STREAM_STARTED'; sessionId: string; streamId: string }
  | { type: 'STREAM_ENDED'; sessionId: string; streamId: string }
  | { type: 'TODO_CREATED'; scope: 'session' | 'project'; item: TodoItem }
  | { type: 'TODO_UPDATED'; scope: 'session' | 'project'; id: string; patch: Partial<TodoItem> }
  | { type: 'TODO_DELETED'; scope: 'session' | 'project'; id: string }
  | { type: 'COST_UPDATED'; sessionId: string; costUsd: number }
  | { type: 'MODEL_CHANGED'; sessionId: string; model: string }
  | { type: 'PERMISSION_PUSHED'; request: PermissionRequest }
  | { type: 'PERMISSION_RESOLVED'; requestId: string; decision: 'allow' | 'deny' }
  | { type: 'FULL_SYNC'; state: AppState };  // Only for init/reconnect
```

**Renderer store** (Zustand) applies deltas reactively via a dedicated hook:

```typescript
// hooks/useStateSync.ts — called once in App.tsx
export function useStateSync() {
  useEffect(() => {
    const unsubscribe = window.api.onStateDelta((delta) => {
      switch (delta.type) {
        case 'SESSION_STATUS':
          sessionStore.getState().updateStatus(delta.sessionId, delta.status);
          break;
        case 'TODO_CREATED':
          todoStore.getState().addItem(delta.scope, delta.item);
          break;
        // ... etc
      }
    });
    return unsubscribe;
  }, []);
}
```

### 4. Decision Suspension (Permission Flow)

When the SDK hits a tool call that needs human approval, the generator pauses in-place until the frontend resolves it.

**Permission mechanism**: We use `options.canUseTool` (not `hooks.PreToolUse`) as the primary permission gate. The `canUseTool` callback is the SDK's dedicated permission API — it returns a `PermissionResult` and its Promise is awaited by the SDK before tool execution. `hooks.PreToolUse` is for side-effects/logging only and cannot block execution.

**DecisionQueue** (in Utility Process) manages the suspension:

**DecisionQueue** (in Utility Process):

```typescript
class DecisionQueue {
  private pending = new Map<string, PendingDecision>();

  suspend(sessionId: string, toolName: string, toolInput: Record<string, unknown>) {
    const id = crypto.randomUUID();
    const promise = new Promise<PermissionResult>((resolve, reject) => {
      this.pending.set(id, { id, sessionId, toolName, toolInput, resolve, reject, createdAt: Date.now() });
    });
    return { requestId: id, promise };
  }

  resolve(requestId: string, result: PermissionResult): boolean {
    const decision = this.pending.get(requestId);
    if (!decision) return false;
    decision.resolve(result);
    this.pending.delete(requestId);
    return true;
  }
}
```

**SDK integration:**

```typescript
const query = sdk.query({
  prompt,
  options: {
    canUseTool: async (toolName, toolInput) => {
      const { requestId, promise } = decisionQueue.suspend(sessionId, toolName, toolInput);
      emitPermissionRequest({ requestId, sessionId, toolName, toolInput });
      return await promise;  // Generator pauses here
    },
  },
});
```

**Frontend flow:**

```
1. Runtime emits PERMISSION_PUSHED delta → PermissionDialog renders
2. User clicks Allow/Deny → renderer sends PERMISSION_RESPONSE IPC
3. Main forwards to Utility Process → decisionQueue.resolve()
4. canUseTool Promise resolves → generator resumes
5. Runtime emits PERMISSION_RESOLVED delta → PermissionDialog closes
```

### 5. Three-Panel Layout

```
┌──────────────┬──────────────────────────┬──────────────┐
│  Left Panel  │     Center Panel         │ Right Panel  │
│  280px       │     flex-1               │  320px       │
│              │                          │              │
│  Projects    │  Message List            │  Todos       │
│  ├─ ProjectA │  ├─ User message         │              │
│  │  ├─ Sess1 │  │  └─ Text              │  [Session]   │
│  │  └─ Sess2 │  ├─ Assistant message    │  ├─ Task 1   │
│  └─ ProjectB │  │  ├─ Text              │  └─ Task 2   │
│     └─ Sess3 │  │  ├─ Tool call         │              │
│              │  │  └─ Code block        │  [Project]   │
│              │  ├─ Tool result           │  ├─ Task A   │
│              │  └─ ...                  │  └─ Task B   │
│              │                          │              │
│              │  ─────────────────────   │              │
│              │  Chat Input              │              │
│              │  [Send] [Model▾] [+]    │              │
└──────────────┴──────────────────────────┴──────────────┘
```

**Left Panel** shows projects detected from `~/.claude/projects/` and their sessions. Clicking a session loads its history.

**Center Panel** shows the active conversation. Messages render based on SDKMessage type — text, tool calls (with expand/collapse), code blocks, thinking indicators. Streaming messages show a typewriter effect.

**Right Panel** shows todos with a scope toggle (Session / Project). Session todos are ephemeral. Project todos persist to `~/.claude/projects/<project>/todos.json`. The SDK's TaskCreated/TaskCompleted hooks drive todo state.

### 6. Preload API

The preload script uses `contextBridge.exposeInMainWorld` to expose a typed API. The renderer never imports `ipcRenderer` directly.

```typescript
// preload/src/api.ts
import { ipcRenderer, contextBridge } from 'electron';

const api = {
  // Stream: send command to runtime
  sendCommand: (command: StreamCommand) => {
    ipcRenderer.send(IPC_CHANNELS.AGENT_COMMAND, command);
  },

  // Stream: subscribe to frames
  onStreamFrame: (callback: (frame: StreamFrame) => void) => {
    const handler = (_: Electron.IpcRendererEvent, frame: StreamFrame) => callback(frame);
    ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.AGENT_STREAM, handler);
  },

  // State: subscribe to deltas
  onStateDelta: (callback: (delta: StateDelta) => void) => {
    const handler = (_: Electron.IpcRendererEvent, delta: StateDelta) => callback(delta);
    ipcRenderer.on(IPC_CHANNELS.STATE_DELTA, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.STATE_DELTA, handler);
  },

  // Permission: subscribe to requests
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => {
    const handler = (_: Electron.IpcRendererEvent, request: PermissionRequest) => callback(request);
    ipcRenderer.on(IPC_CHANNELS.PERMISSION_REQUEST, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.PERMISSION_REQUEST, handler);
  },

  // Permission: send response
  sendPermissionResponse: (requestId: string, decision: 'allow' | 'deny') => {
    ipcRenderer.send(IPC_CHANNELS.PERMISSION_RESPONSE, { requestId, decision });
  },
} as const;

contextBridge.exposeInMainWorld('api', api);

export type LooooopAPI = typeof api;
```

```typescript
// renderer/src/global.d.ts
import type { LooooopAPI } from '../../preload/src/api';

declare global {
  interface Window {
    api: LooooopAPI;
  }
}
```

### 7. Renderer Hook Architecture

All IPC consumption is wrapped in React hooks. Components use `window.api` (from preload), never raw `ipcRenderer`.

```typescript
// hooks/useAgentStream.ts
export function useAgentStream(sessionId: string) {
  const [messages, setMessages] = useState<SDKMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');

  useEffect(() => {
    const unsubscribe = window.api.onStreamFrame((frame) => {
      if (frame.sessionId !== sessionId) return;
      switch (frame.kind) {
        case 'chunk':
          setMessages(prev => [...prev, frame.data!]);
          break;
        case 'done':
          setStatus('done');
          break;
        case 'error':
          setStatus('error');
          break;
      }
    });
    return unsubscribe;
  }, [sessionId]);

  const send = useCallback((prompt: string) => {
    setStatus('streaming');
    window.api.sendCommand({
      streamId: crypto.randomUUID(),
      sessionId,
      kind: 'start',
      payload: { prompt },
    });
  }, [sessionId]);

  const cancel = useCallback(() => {
    window.api.sendCommand({
      sessionId,
      kind: 'cancel',
    });
  }, [sessionId]);

  return { messages, status, send, cancel };
}
```

```typescript
// hooks/usePermission.ts
export function usePermission() {
  const [pending, setPending] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    const unsubscribe = window.api.onPermissionRequest((request) => {
      setPending(prev => [...prev, request]);
    });
    return unsubscribe;
  }, []);

  const respond = useCallback((requestId: string, decision: 'allow' | 'deny') => {
    window.api.sendPermissionResponse(requestId, decision);
    setPending(prev => prev.filter(r => r.requestId !== requestId));
  }, []);

  return { pending, respond };
}
```

### 7. Session Persistence

Sessions are stored as JSONL files (matching Claude Code's format) in `~/.claude/projects/<project>/`.

```typescript
class SessionManager {
  private sessionsDir: string;

  async list(projectPath: string): Promise<SessionSummary[]> {
    // Read JSONL files from ~/.claude/projects/<encoded-path>/
    // Parse headers for summary info
  }

  async load(sessionId: string): Promise<SDKMessage[]> {
    // Read full JSONL, return parsed messages
  }

  async append(sessionId: string, message: SDKMessage): Promise<void> {
    // Append to JSONL file
  }
}
```

### 9. SDK Hooks Integration

The hook engine registers callbacks for SDK events and translates them to state deltas. Note: permission handling uses `options.canUseTool` (see Section 4), not hooks.

| SDK Hook | Action |
|----------|--------|
| `SessionStart` | Initialize session state, emit `SESSION_STATUS` |
| `SessionEnd` | Mark session idle, emit `SESSION_STATUS` |
| `PostToolUse` | Update message list, emit `MESSAGE_APPENDED` |
| `TaskCreated` | Emit `TODO_CREATED` delta |
| `TaskCompleted` | Emit `TODO_UPDATED` delta |
| `Stop` | Emit `STREAM_ENDED` |
| `Notification` | Forward to renderer as system message |

| SDK Option | Action |
|------------|--------|
| `canUseTool` | Suspend via DecisionQueue, emit `PERMISSION_PUSHED`, await frontend response |

## Data Flow Summary

```
User types prompt in ChatInput
    │
    ▼
useAgentStream.send(prompt)
    │
    ▼
IPC: AGENT_COMMAND → Main → MessagePort → Utility Process
    │
    ▼
SDKService.runQuery(prompt)
    │
    ├─► SDK query() starts
    │       │
    │       ├─► StreamFrame(chunk) → MessagePort → Main → IPC → Renderer
    │       ├─► StreamFrame(chunk) → ...
    │       ├─► canUseTool called → DecisionQueue.suspend()
    │       │       │
    │       │       ▼
    │       │   PERMISSION_PUSHED → Renderer → PermissionDialog
    │       │       │
    │       │       ▼
    │       │   User clicks Allow → PERMISSION_RESPONSE → DecisionQueue.resolve()
    │       │       │
    │       │       ▼
    │       │   Generator resumes
    │       ├─► StreamFrame(chunk) → ...
    │       └─► StreamFrame(done)
    │
    ▼
StateDelta events throughout → Zustand stores update → React re-renders
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| SDK crash (OOM, loop) | Utility Process exits → Main detects → emits `SESSION_STATUS(error)` → Renderer shows recovery UI |
| Network error (API down) | SDK emits error in StreamFrame → Renderer shows retry prompt |
| Permission timeout | DecisionQueue has 5min TTL → auto-deny → generator continues |
| IPC disconnect | Main detects MessagePort close → restarts Utility Process → emits `FULL_SYNC` |
| Renderer crash | Main detects BrowserWindow close → gracefully shuts down Utility Process |

## Performance Budget

| Metric | Target |
|--------|--------|
| First meaningful paint | < 1s |
| Stream frame latency (SDK → Renderer) | < 50ms |
| State delta apply time | < 16ms (60fps) |
| Memory (idle) | < 200MB |
| Memory (active session) | < 500MB |
| Permission dialog appear time | < 100ms |

## Out of Scope (v1)

- Multiple concurrent agent sessions (design supports it, but v1 ships single-session)
- Plugin/skill system UI
- Custom model configuration UI
- File tree browser / code editor integration
- Git visualization
- Export/import sessions

# Looooop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS Claude Code client with three-panel UI, streaming IPC, isolated runtime, and permission suspension.

**Architecture:** Electron monorepo (electron-vite) with 4 packages: `shared/` (types), `preload/` (contextBridge), `main/` (IPC router), `runtime/` (Utility Process with SDK), `renderer/` (React UI). SDK runs in Utility Process, communicates via framed IPC stream protocol with delta-based state sync.

**Tech Stack:** Electron 36+, React 18, TypeScript 5, Tailwind CSS, shadcn/ui, Zustand, `@anthropic-ai/claude-agent-sdk`, Vitest

**Spec:** `docs/superpowers/specs/2026-06-12-looooop-design.md`

---

## File Map

### packages/shared/src/
| File | Responsibility |
|------|---------------|
| `index.ts` | Re-export all shared types |
| `ipc-stream.ts` | `StreamFrame`, `StreamCommand`, `IPC_CHANNELS` |
| `state-delta.ts` | `StateDelta`, `AppState`, `SessionState`, `TodoTree`, `TodoItem`, `MessageSummary` |
| `permission.ts` | `PermissionRequest`, `PermissionDecision` |
| `constants.ts` | App name, version, paths |

### packages/preload/src/
| File | Responsibility |
|------|---------------|
| `index.ts` | `contextBridge.exposeInMainWorld` entry |
| `api.ts` | Typed IPC wrappers (`window.api`) |

### packages/main/src/
| File | Responsibility |
|------|---------------|
| `index.ts` | Electron app lifecycle |
| `window.ts` | BrowserWindow creation, preload config |
| `router.ts` | IPC ↔ Utility Process message bridge |
| `runtime.ts` | Utility Process spawn/restart lifecycle |

### packages/runtime/src/
| File | Responsibility |
|------|---------------|
| `entry.ts` | Utility Process entry, wires MessagePort to AgentRuntime |
| `agent-runtime.ts` | Orchestrates all runtime modules |
| `sdk-service.ts` | SDK `query()` lifecycle, streaming |
| `state-machine.ts` | Authoritative `AppState`, emits deltas |
| `decision-queue.ts` | Permission suspension/resolve via Promises |
| `hook-engine.ts` | SDK hook registration, emits state deltas |
| `session-manager.ts` | Session list/load/append (JSONL) |
| `ipc-bridge.ts` | MessagePort send/receive abstraction |

### packages/renderer/src/
| File | Responsibility |
|------|---------------|
| `App.tsx` | Root component, wires `useStateSync` |
| `main.tsx` | React DOM entry |
| `stores/session-store.ts` | Zustand: sessions, active session, messages |
| `stores/todo-store.ts` | Zustand: session + project todos |
| `stores/permission-store.ts` | Zustand: pending permission requests |
| `stores/stream-store.ts` | Zustand: active streams, status |
| `hooks/useAgentStream.ts` | Send prompts, consume StreamFrames |
| `hooks/useStateSync.ts` | Subscribe to StateDelta, update stores |
| `hooks/usePermission.ts` | Permission request/response flow |
| `components/layout/AppShell.tsx` | Three-panel grid layout |
| `components/layout/LeftPanel.tsx` | Project + session list |
| `components/layout/CenterPanel.tsx` | Chat area + input |
| `components/layout/RightPanel.tsx` | Todo tree + scope toggle |
| `components/chat/ChatInput.tsx` | Prompt input + send button |
| `components/chat/MessageList.tsx` | Scrollable message container |
| `components/chat/MessageBubble.tsx` | Single message rendering |
| `components/chat/ToolCallCard.tsx` | Tool use visualization |
| `components/sidebar/ProjectList.tsx` | Project tree |
| `components/sidebar/SessionCard.tsx` | Session summary card |
| `components/todos/TodoTree.tsx` | Todo list with scope toggle |
| `components/permission/PermissionDialog.tsx` | Permission modal |
| `styles/globals.css` | Tailwind directives + custom vars |

### Tests
| File | Tests |
|------|-------|
| `packages/runtime/__tests__/decision-queue.test.ts` | suspend/resolve/timeout |
| `packages/runtime/__tests__/state-machine.test.ts` | delta emission, state transitions |
| `packages/runtime/__tests__/hook-engine.test.ts` | hook registration, delta mapping |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.base.json`
- Create: `packages/shared/src/index.ts`, `packages/shared/tsconfig.json`
- Create: `packages/preload/src/index.ts`, `packages/preload/tsconfig.json`
- Create: `packages/main/src/index.ts`, `packages/main/tsconfig.json`
- Create: `packages/runtime/src/entry.ts`, `packages/runtime/tsconfig.json`
- Create: `packages/renderer/src/main.tsx`, `packages/renderer/index.html`, `packages/renderer/tsconfig.json`
- Create: `packages/renderer/src/styles/globals.css`

- [ ] **Step 1: Initialize root package.json**

```json
{
  "name": "looooop",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.5.0",
    "autoprefixer": "^10.4.20",
    "electron": "^36.0.0",
    "electron-vite": "^3.0.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.3.173",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

- [ ] **Step 3: Create electron.vite.config.ts**

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/main/src/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/preload/src/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'packages/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/renderer/index.html')
        }
      }
    }
  }
})
```

- [ ] **Step 4: Create shared package**

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:
```typescript
// Re-exports will be added in Task 2
export {}
```

- [ ] **Step 5: Create preload package**

`packages/preload/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext"
  },
  "include": ["src"]
}
```

`packages/preload/src/index.ts`:
```typescript
// Will be implemented in Task 3
```

- [ ] **Step 6: Create main package**

`packages/main/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/main/src/index.ts`:
```typescript
// Will be implemented in Task 4
```

- [ ] **Step 7: Create runtime package**

`packages/runtime/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```

`packages/runtime/src/entry.ts`:
```typescript
// Will be implemented in Task 6
```

- [ ] **Step 8: Create renderer package**

`packages/renderer/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

`packages/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Looooop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

`packages/renderer/src/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #141414;
  --bg-tertiary: #1e1e1e;
  --text-primary: #e5e5e5;
  --text-secondary: #a3a3a3;
  --border: #2a2a2a;
  --accent: #3b82f6;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

`packages/renderer/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`packages/renderer/src/App.tsx`:
```tsx
export function App() {
  return (
    <div className="h-screen flex items-center justify-center">
      <h1 className="text-2xl font-bold">Looooop</h1>
    </div>
  )
}
```

- [ ] **Step 9: Install dependencies and verify**

```bash
npm install
npx tsc --noEmit -p packages/shared/tsconfig.json
```

Expected: TypeScript compiles without errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold electron-vite monorepo with 5 packages

- electron-vite config (main, preload, renderer)
- packages: shared, preload, main, runtime, renderer
- React 19 + Tailwind CSS + TypeScript strict
- Vitest configured for testing"
```

---

## Task 2: Shared Types — IPC Protocol

**Files:**
- Create: `packages/shared/src/ipc-stream.ts`
- Create: `packages/shared/src/permission.ts`
- Create: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create IPC channel constants**

`packages/shared/src/constants.ts`:
```typescript
export const APP_NAME = 'Looooop'
export const APP_VERSION = '0.1.0'

export const IPC_CHANNELS = {
  /** Runtime → Renderer: SDK stream frames */
  AGENT_STREAM: 'agent:stream:frame',
  /** Renderer → Runtime: control commands */
  AGENT_COMMAND: 'agent:command',
  /** Runtime → Renderer: state delta events */
  STATE_DELTA: 'state:delta',
  /** Runtime → Renderer: permission request (suspension) */
  PERMISSION_REQUEST: 'permission:request',
  /** Renderer → Runtime: permission response */
  PERMISSION_RESPONSE: 'permission:response',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
```

- [ ] **Step 2: Create StreamFrame and StreamCommand types**

`packages/shared/src/ipc-stream.ts`:
```typescript
/**
 * StreamFrame: Runtime → Renderer
 * Carries SDK messages, completion signals, and errors.
 */
export interface StreamFrame<T = unknown> {
  /** Unique stream identifier (supports concurrent main + sub-agent streams) */
  streamId: string
  /** Session this stream belongs to */
  sessionId: string
  /** Frame type */
  kind: 'chunk' | 'done' | 'error' | 'cancel'
  /** SDK message data (present for kind='chunk') */
  data?: T
  /** Error info (present for kind='error') */
  error?: StreamError
}

export interface StreamError {
  code: string
  message: string
  recoverable: boolean
}

/**
 * StreamCommand: Renderer → Runtime
 * Controls query lifecycle.
 */
export interface StreamCommand {
  /** Stream to target */
  streamId: string
  /** Session to target */
  sessionId: string
  /** Command type */
  kind: 'start' | 'cancel' | 'pause' | 'resume'
  /** Command payload (e.g., { prompt: string } for 'start') */
  payload?: StreamCommandPayload
}

export interface StreamCommandPayload {
  prompt?: string
}

/**
 * Utility type: extract the data type from a StreamFrame kind.
 */
export type StreamFrameByKind<T, K extends StreamFrame['kind']> = Extract<
  StreamFrame<T>,
  { kind: K }
>
```

- [ ] **Step 3: Create permission types**

`packages/shared/src/permission.ts`:
```typescript
/**
 * PermissionRequest: Runtime → Renderer
 * Sent when SDK's canUseTool is called. Generator suspends until response.
 */
export interface PermissionRequest {
  /** Unique request ID (matches DecisionQueue entry) */
  requestId: string
  /** Session that triggered the tool call */
  sessionId: string
  /** Tool being invoked (e.g., 'Bash', 'Write', 'Edit') */
  toolName: string
  /** Tool input parameters */
  toolInput: Record<string, unknown>
  /** Timestamp when request was created */
  createdAt: number
}

/**
 * PermissionDecision: Renderer → Runtime
 * User's response to a permission request.
 */
export interface PermissionDecision {
  /** Matches PermissionRequest.requestId */
  requestId: string
  /** User's decision */
  decision: 'allow' | 'deny'
}
```

- [ ] **Step 4: Update shared index**

`packages/shared/src/index.ts`:
```typescript
export * from './ipc-stream'
export * from './state-delta'
export * from './permission'
export * from './constants'
```

- [ ] **Step 5: Verify types compile**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): define IPC stream protocol and permission types

- StreamFrame/StreamCommand for async generator bridging
- PermissionRequest/PermissionDecision for suspension flow
- IPC_CHANNELS constants for type-safe channel names"
```

---

## Task 3: Shared Types — State Delta

**Files:**
- Create: `packages/shared/src/state-delta.ts`
- Modify: `packages/shared/src/index.ts` (already done in Task 2)

- [ ] **Step 1: Create state and delta types**

`packages/shared/src/state-delta.ts`:
```typescript
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
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add state tree and delta event types

- AppState, SessionState, TodoTree, TodoItem
- 11 delta event types for incremental state sync
- MessageSummary for lightweight message rendering"
```

---

## Task 4: Preload Script

**Files:**
- Create: `packages/preload/src/api.ts`
- Modify: `packages/preload/src/index.ts`
- Create: `packages/renderer/src/global.d.ts`

- [ ] **Step 1: Create the preload API**

`packages/preload/src/api.ts`:
```typescript
import { ipcRenderer, contextBridge } from 'electron'
import type {
  StreamFrame,
  StreamCommand,
  StateDelta,
  PermissionRequest,
  PermissionDecision,
} from '../../shared/src'
import { IPC_CHANNELS } from '../../shared/src/constants'

export interface LooooopAPI {
  // ─── Stream ───
  sendCommand: (command: StreamCommand) => void
  onStreamFrame: (callback: (frame: StreamFrame) => void) => () => void

  // ─── State ───
  onStateDelta: (callback: (delta: StateDelta) => void) => () => void

  // ─── Permission ───
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void
  sendPermissionResponse: (decision: PermissionDecision) => void
}

const api: LooooopAPI = {
  // ─── Stream ───
  sendCommand: (command) => {
    ipcRenderer.send(IPC_CHANNELS.AGENT_COMMAND, command)
  },

  onStreamFrame: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: StreamFrame) => {
      callback(frame)
    }
    ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.AGENT_STREAM, handler)
    }
  },

  // ─── State ───
  onStateDelta: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: StateDelta) => {
      callback(delta)
    }
    ipcRenderer.on(IPC_CHANNELS.STATE_DELTA, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.STATE_DELTA, handler)
    }
  },

  // ─── Permission ───
  onPermissionRequest: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, request: PermissionRequest) => {
      callback(request)
    }
    ipcRenderer.on(IPC_CHANNELS.PERMISSION_REQUEST, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.PERMISSION_REQUEST, handler)
    }
  },

  sendPermissionResponse: (decision) => {
    ipcRenderer.send(IPC_CHANNELS.PERMISSION_RESPONSE, decision)
  },
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 2: Create preload entry**

`packages/preload/src/index.ts`:
```typescript
import './api'
```

- [ ] **Step 3: Create renderer type declarations**

`packages/renderer/src/global.d.ts`:
```typescript
import type { LooooopAPI } from '../../preload/src/api'

declare global {
  interface Window {
    api: LooooopAPI
  }
}
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit -p packages/preload/tsconfig.json
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/preload/ packages/renderer/src/global.d.ts
git commit -m "feat(preload): expose typed IPC API via contextBridge

- LooooopAPI interface for type-safe renderer access
- Cleanup functions returned from all subscriptions
- Window.api type declarations for renderer"
```

---

## Task 5: Main Process — Window + Router

**Files:**
- Modify: `packages/main/src/index.ts`
- Create: `packages/main/src/window.ts`
- Create: `packages/main/src/router.ts`
- Create: `packages/main/src/runtime.ts`

- [ ] **Step 1: Create window manager**

`packages/main/src/window.ts`:
```typescript
import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Looooop',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load renderer
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
```

- [ ] **Step 2: Create router**

`packages/main/src/router.ts`:
```typescript
import { ipcMain, BrowserWindow } from 'electron'
import type { UtilityProcess } from 'electron'
import type {
  StreamFrame,
  StreamCommand,
  StateDelta,
  PermissionRequest,
  PermissionDecision,
} from '../shared/src'
import { IPC_CHANNELS } from '../shared/src/constants'

/**
 * Pure router: IPC ↔ Utility Process message bridge.
 * Holds zero state. Forwards messages in both directions.
 */
export function setupRouter(
  mainWindow: BrowserWindow,
  runtimeProcess: UtilityProcess
): void {
  // ─── Renderer → Runtime ───
  ipcMain.on(IPC_CHANNELS.AGENT_COMMAND, (_event, command: StreamCommand) => {
    if (runtimeProcess.isConnected()) {
      runtimeProcess.postMessage({ type: 'command', payload: command })
    }
  })

  ipcMain.on(
    IPC_CHANNELS.PERMISSION_RESPONSE,
    (_event, decision: PermissionDecision) => {
      if (runtimeProcess.isConnected()) {
        runtimeProcess.postMessage({
          type: 'permission-response',
          payload: decision,
        })
      }
    }
  )

  // ─── Runtime → Renderer ───
  runtimeProcess.on('message', (msg: { type: string; payload: unknown }) => {
    if (!mainWindow.isDestroyed()) {
      switch (msg.type) {
        case 'stream-frame':
          mainWindow.webContents.send(
            IPC_CHANNELS.AGENT_STREAM,
            msg.payload as StreamFrame
          )
          break
        case 'state-delta':
          mainWindow.webContents.send(
            IPC_CHANNELS.STATE_DELTA,
            msg.payload as StateDelta
          )
          break
        case 'permission-request':
          mainWindow.webContents.send(
            IPC_CHANNELS.PERMISSION_REQUEST,
            msg.payload as PermissionRequest
          )
          break
      }
    }
  })
}
```

- [ ] **Step 3: Create runtime lifecycle manager**

`packages/main/src/runtime.ts`:
```typescript
import { utilityProcess, BrowserWindow } from 'electron'
import { join } from 'path'
import type { UtilityProcess } from 'electron'

let runtimeProcess: UtilityProcess | null = null
let restartCount = 0

export function spawnRuntime(): UtilityProcess {
  const scriptPath = join(__dirname, '../runtime/entry.js')

  runtimeProcess = utilityProcess.fork(scriptPath, [], {
    serviceName: 'looooop-runtime',
    stdio: 'pipe',
  })

  runtimeProcess.stdout?.on('data', (data) => {
    console.log(`[runtime] ${data.toString().trim()}`)
  })

  runtimeProcess.stderr?.on('data', (data) => {
    console.error(`[runtime] ${data.toString().trim()}`)
  })

  runtimeProcess.on('spawn', () => {
    restartCount = 0
  })

  runtimeProcess.on('exit', (code) => {
    console.warn(`[runtime] exited with code ${code}`)

    // Notify renderer that runtime crashed
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('agent:stream:frame', {
        streamId: 'system',
        sessionId: '*',
        kind: 'error',
        error: {
          code: 'RUNTIME_EXIT',
          message: `Runtime process exited with code ${code}`,
          recoverable: true,
        },
      })
    }

    // Auto-restart after a short delay (up to 3 retries)
    if (restartCount < 3) {
      restartCount++
      console.log(`[runtime] restarting (attempt ${restartCount}/3)...`)
      setTimeout(() => spawnRuntime(), 1000)
    }
  })

  return runtimeProcess
}

export function getRuntimeProcess(): UtilityProcess | null {
  return runtimeProcess
}

export function killRuntime(): void {
  if (runtimeProcess) {
    runtimeProcess.kill()
    runtimeProcess = null
  }
}
```

- [ ] **Step 4: Create main entry**

`packages/main/src/index.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { spawnRuntime, killRuntime } from './runtime'
import { setupRouter } from './router'

app.whenReady().then(() => {
  const mainWindow = createMainWindow()
  const runtimeProcess = spawnRuntime()

  setupRouter(mainWindow, runtimeProcess)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  killRuntime()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killRuntime()
})
```

- [ ] **Step 5: Install electron-toolkit utils**

```bash
npm install @electron-toolkit/utils
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p packages/main/tsconfig.json
```

Expected: PASS (may have import resolution warnings, will be fixed by electron-vite bundling)

- [ ] **Step 7: Commit**

```bash
git add packages/main/
git commit -m "feat(main): add window manager, IPC router, and runtime lifecycle

- BrowserWindow with macOS hiddenInset titlebar
- Pure router: zero-state IPC ↔ Utility Process bridge
- Utility Process spawn/restart/kill lifecycle"
```

---

## Task 6: Runtime — DecisionQueue + StateMachine (TDD)

**Files:**
- Create: `packages/runtime/__tests__/decision-queue.test.ts`
- Create: `packages/runtime/src/decision-queue.ts`
- Create: `packages/runtime/__tests__/state-machine.test.ts`
- Create: `packages/runtime/src/state-machine.ts`
- Create: `packages/runtime/src/ipc-bridge.ts`

- [ ] **Step 1: Write DecisionQueue tests**

```bash
mkdir -p packages/runtime/__tests__
```

`packages/runtime/__tests__/decision-queue.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DecisionQueue } from '../src/decision-queue'

describe('DecisionQueue', () => {
  let queue: DecisionQueue

  beforeEach(() => {
    queue = new DecisionQueue()
  })

  it('suspend returns a requestId and a pending promise', () => {
    const result = queue.suspend('session-1', 'Bash', { command: 'ls' })
    expect(result.requestId).toBeTypeOf('string')
    expect(result.requestId.length).toBeGreaterThan(0)
    expect(result.promise).toBeInstanceOf(Promise)
  })

  it('resolve fulfills the pending promise with the decision', async () => {
    const { requestId, promise } = queue.suspend('session-1', 'Bash', {
      command: 'ls',
    })

    // Resolve in next tick
    setTimeout(() => {
      queue.resolve(requestId, 'allow')
    }, 0)

    const result = await promise
    expect(result).toEqual({ requestId, decision: 'allow' })
  })

  it('resolve returns false for unknown requestId', () => {
    const result = queue.resolve('nonexistent', 'deny')
    expect(result).toBe(false)
  })

  it('resolve returns true for valid requestId', () => {
    const { requestId } = queue.suspend('session-1', 'Write', { path: '/tmp' })
    const result = queue.resolve(requestId, 'deny')
    expect(result).toBe(true)
  })

  it('resolved request is removed from pending', () => {
    const { requestId } = queue.suspend('session-1', 'Bash', { command: 'ls' })
    queue.resolve(requestId, 'allow')

    // Second resolve should fail
    const result = queue.resolve(requestId, 'allow')
    expect(result).toBe(false)
  })

  it('list returns all pending decisions', () => {
    queue.suspend('session-1', 'Bash', { command: 'ls' })
    queue.suspend('session-1', 'Write', { path: '/tmp' })

    const list = queue.list()
    expect(list).toHaveLength(2)
    expect(list[0].toolName).toBe('Bash')
    expect(list[1].toolName).toBe('Write')
  })

  it('pending has 5 minute TTL and auto-denies', async () => {
    vi.useFakeTimers()

    const { requestId, promise } = queue.suspend('session-1', 'Bash', {
      command: 'sleep 100',
    })

    // Advance past 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    const result = await promise
    expect(result).toEqual({ requestId, decision: 'deny' })
    expect(queue.list()).toHaveLength(0)

    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run packages/runtime/__tests__/decision-queue.test.ts
```

Expected: FAIL — `decision-queue.ts` doesn't exist

- [ ] **Step 3: Implement DecisionQueue**

`packages/runtime/src/decision-queue.ts`:
```typescript
import { randomUUID } from 'crypto'
import type { PermissionDecision } from '../../shared/src/permission'

interface PendingDecision {
  id: string
  sessionId: string
  toolName: string
  toolInput: Record<string, unknown>
  resolve: (result: PermissionDecision) => void
  reject: (reason: Error) => void
  createdAt: number
  timeoutId: ReturnType<typeof setTimeout>
}

const DECISION_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export class DecisionQueue {
  private pending = new Map<string, PendingDecision>()

  suspend(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): { requestId: string; promise: Promise<PermissionDecision> } {
    const id = randomUUID()

    let resolve!: (result: PermissionDecision) => void
    let reject!: (reason: Error) => void

    const promise = new Promise<PermissionDecision>((res, rej) => {
      resolve = res
      reject = rej
    })

    const timeoutId = setTimeout(() => {
      this.pending.delete(id)
      resolve({ requestId: id, decision: 'deny' })
    }, DECISION_TIMEOUT_MS)

    this.pending.set(id, {
      id,
      sessionId,
      toolName,
      toolInput,
      resolve,
      reject,
      createdAt: Date.now(),
      timeoutId,
    })

    return { requestId: id, promise }
  }

  resolve(requestId: string, decision: 'allow' | 'deny'): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false

    clearTimeout(pending.timeoutId)
    this.pending.delete(requestId)
    pending.resolve({ requestId, decision })
    return true
  }

  list(): Array<{
    id: string
    sessionId: string
    toolName: string
    toolInput: Record<string, unknown>
    createdAt: number
  }> {
    return Array.from(this.pending.values()).map(
      ({ id, sessionId, toolName, toolInput, createdAt }) => ({
        id,
        sessionId,
        toolName,
        toolInput,
        createdAt,
      })
    )
  }

  clear(): void {
    for (const decision of this.pending.values()) {
      clearTimeout(decision.timeoutId)
      decision.resolve({ behavior: 'deny' })
    }
    this.pending.clear()
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run packages/runtime/__tests__/decision-queue.test.ts
```

Expected: All 7 tests PASS

- [ ] **Step 5: Write StateMachine tests**

`packages/runtime/__tests__/state-machine.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StateMachine } from '../src/state-machine'
import type { StateDelta } from '../../shared/src/state-delta'

describe('StateMachine', () => {
  let machine: StateMachine
  let emittedDeltas: StateDelta[]

  beforeEach(() => {
    machine = new StateMachine()
    emittedDeltas = []
    machine.onDelta = (delta) => emittedDeltas.push(delta)
  })

  describe('session management', () => {
    it('initSession creates a new session and emits SESSION_STATUS', () => {
      machine.initSession('s1', '/project')

      expect(machine.getState().sessions['s1']).toBeDefined()
      expect(machine.getState().sessions['s1'].status).toBe('idle')
      expect(emittedDeltas).toHaveLength(1)
      expect(emittedDeltas[0]).toEqual({
        type: 'SESSION_STATUS',
        sessionId: 's1',
        status: 'idle',
      })
    })

    it('updateStatus changes session status and emits delta', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.updateStatus('s1', 'running')

      expect(machine.getState().sessions['s1'].status).toBe('running')
      expect(emittedDeltas[0]).toEqual({
        type: 'SESSION_STATUS',
        sessionId: 's1',
        status: 'running',
      })
    })

    it('updateStatus on nonexistent session is a no-op', () => {
      machine.updateStatus('nonexistent', 'running')
      expect(emittedDeltas).toHaveLength(0)
    })
  })

  describe('message tracking', () => {
    it('appendMessage adds summary and emits MESSAGE_APPENDED', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.appendMessage('s1', {
        uuid: 'msg-1',
        type: 'assistant',
        preview: 'Hello world',
        timestamp: Date.now(),
      })

      expect(machine.getState().sessions['s1'].messages).toHaveLength(1)
      expect(emittedDeltas[0].type).toBe('MESSAGE_APPENDED')
    })
  })

  describe('stream tracking', () => {
    it('addStream adds to activeStreamIds and emits STREAM_STARTED', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.addStream('s1', 'stream-1')

      expect(machine.getState().sessions['s1'].activeStreamIds).toContain(
        'stream-1'
      )
      expect(emittedDeltas[0]).toEqual({
        type: 'STREAM_STARTED',
        sessionId: 's1',
        streamId: 'stream-1',
      })
    })

    it('removeStream removes from activeStreamIds and emits STREAM_ENDED', () => {
      machine.initSession('s1', '/project')
      machine.addStream('s1', 'stream-1')
      emittedDeltas.length = 0

      machine.removeStream('s1', 'stream-1')

      expect(
        machine.getState().sessions['s1'].activeStreamIds
      ).not.toContain('stream-1')
      expect(emittedDeltas[0]).toEqual({
        type: 'STREAM_ENDED',
        sessionId: 's1',
        streamId: 'stream-1',
      })
    })
  })

  describe('todo management', () => {
    it('createTodo emits TODO_CREATED with correct scope', () => {
      const item = machine.createTodo('session', {
        title: 'Fix bug',
        sessionId: 's1',
      })

      expect(item.title).toBe('Fix bug')
      expect(item.status).toBe('pending')
      expect(emittedDeltas[0]).toMatchObject({
        type: 'TODO_CREATED',
        scope: 'session',
      })
    })

    it('updateTodo emits TODO_UPDATED with patch', () => {
      const item = machine.createTodo('project', { title: 'Task' })
      emittedDeltas.length = 0

      machine.updateTodo('project', item.id, { status: 'completed' })

      expect(emittedDeltas[0]).toEqual({
        type: 'TODO_UPDATED',
        scope: 'project',
        id: item.id,
        patch: { status: 'completed' },
      })
    })

    it('deleteTodo removes item and emits TODO_DELETED', () => {
      const item = machine.createTodo('session', { title: 'Task' })
      emittedDeltas.length = 0

      machine.deleteTodo('session', item.id)

      expect(emittedDeltas[0]).toEqual({
        type: 'TODO_DELETED',
        scope: 'session',
        id: item.id,
      })
    })
  })

  describe('cost tracking', () => {
    it('updateCost emits COST_UPDATED delta', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.updateCost('s1', 0.05)

      expect(machine.getState().sessions['s1'].costUsd).toBe(0.05)
      expect(emittedDeltas[0]).toEqual({
        type: 'COST_UPDATED',
        sessionId: 's1',
        costUsd: 0.05,
      })
    })
  })

  describe('full sync', () => {
    it('getFullSync returns FULL_SYNC delta with complete state', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      const sync = machine.getFullSync()

      expect(sync.type).toBe('FULL_SYNC')
      expect(sync.state.sessions['s1']).toBeDefined()
    })
  })
})
```

- [ ] **Step 6: Run tests — expect FAIL**

```bash
npx vitest run packages/runtime/__tests__/state-machine.test.ts
```

Expected: FAIL

- [ ] **Step 7: Implement StateMachine**

`packages/runtime/src/state-machine.ts`:
```typescript
import { randomUUID } from 'crypto'
import type {
  AppState,
  SessionState,
  MessageSummary,
  TodoItem,
  TodoTree,
  StateDelta,
} from '../../shared/src/state-delta'

export class StateMachine {
  private state: AppState = {
    sessions: {},
    todos: { session: [], project: [] },
  }

  /** Callback for emitting deltas to the IPC bridge */
  onDelta: (delta: StateDelta) => void = () => {}

  getState(): AppState {
    return this.state
  }

  // ─── Session ───

  initSession(sessionId: string, projectPath: string): void {
    this.state.sessions[sessionId] = {
      id: sessionId,
      status: 'idle',
      messages: [],
      activeStreamIds: [],
      costUsd: 0,
      projectPath,
      lastActivity: Date.now(),
    }
    this.emit({ type: 'SESSION_STATUS', sessionId, status: 'idle' })
  }

  updateStatus(
    sessionId: string,
    status: SessionState['status']
  ): void {
    const session = this.state.sessions[sessionId]
    if (!session) return
    session.status = status
    session.lastActivity = Date.now()
    this.emit({ type: 'SESSION_STATUS', sessionId, status })
  }

  // ─── Messages ───

  appendMessage(sessionId: string, summary: MessageSummary): void {
    const session = this.state.sessions[sessionId]
    if (!session) return
    session.messages.push(summary)
    session.lastActivity = Date.now()
    this.emit({ type: 'MESSAGE_APPENDED', sessionId, summary })
  }

  // ─── Streams ───

  addStream(sessionId: string, streamId: string): void {
    const session = this.state.sessions[sessionId]
    if (!session) return
    session.activeStreamIds.push(streamId)
    this.emit({ type: 'STREAM_STARTED', sessionId, streamId })
  }

  removeStream(sessionId: string, streamId: string): void {
    const session = this.state.sessions[sessionId]
    if (!session) return
    session.activeStreamIds = session.activeStreamIds.filter(
      (id) => id !== streamId
    )
    this.emit({ type: 'STREAM_ENDED', sessionId, streamId })
  }

  // ─── Todos ───

  createTodo(
    scope: 'session' | 'project',
    partial: Pick<TodoItem, 'title'> & Partial<TodoItem>
  ): TodoItem {
    const item: TodoItem = {
      id: randomUUID(),
      title: partial.title,
      status: partial.status ?? 'pending',
      children: partial.children,
      sessionId: partial.sessionId,
      parentId: partial.parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.state.todos[scope].push(item)
    this.emit({ type: 'TODO_CREATED', scope, item })
    return item
  }

  updateTodo(
    scope: 'session' | 'project',
    id: string,
    patch: Partial<Pick<TodoItem, 'title' | 'status' | 'children'>>
  ): void {
    const todos = this.state.todos[scope]
    const index = todos.findIndex((t) => t.id === id)
    if (index === -1) return
    Object.assign(todos[index], patch, { updatedAt: Date.now() })
    this.emit({ type: 'TODO_UPDATED', scope, id, patch })
  }

  deleteTodo(scope: 'session' | 'project', id: string): void {
    this.state.todos[scope] = this.state.todos[scope].filter(
      (t) => t.id !== id
    )
    this.emit({ type: 'TODO_DELETED', scope, id })
  }

  // ─── Cost ───

  updateCost(sessionId: string, costUsd: number): void {
    const session = this.state.sessions[sessionId]
    if (!session) return
    session.costUsd = costUsd
    this.emit({ type: 'COST_UPDATED', sessionId, costUsd })
  }

  // ─── Model ───

  updateModel(sessionId: string, model: string): void {
    const session = this.state.sessions[sessionId]
    if (!session) return
    session.currentModel = model
    this.emit({ type: 'MODEL_CHANGED', sessionId, model })
  }

  // ─── Title ───

  updateTitle(sessionId: string, title: string): void {
    const session = this.state.sessions[sessionId]
    if (!session) return
    session.title = title
    this.emit({ type: 'SESSION_TITLE', sessionId, title })
  }

  // ─── Sync ───

  getFullSync(): StateDelta {
    return { type: 'FULL_SYNC', state: structuredClone(this.state) }
  }

  private emit(delta: StateDelta): void {
    this.onDelta(delta)
  }
}
```

- [ ] **Step 8: Run tests — expect PASS**

```bash
npx vitest run packages/runtime/__tests__/state-machine.test.ts
```

Expected: All tests PASS

- [ ] **Step 9: Implement IPC Bridge**

`packages/runtime/src/ipc-bridge.ts`:
```typescript
import type { StreamFrame, StateDelta, PermissionRequest } from '../../shared/src'

/**
 * Abstraction over the Electron Utility Process message port.
 * In a UtilityProcess, the parent port is process.parentPort (not worker_threads).
 * See: https://www.electronjs.org/docs/latest/api/utility-process
 */
export class IPCBridge {
  constructor() {
    if (!process.parentPort) {
      throw new Error('IPCBridge must run inside a Utility Process')
    }
  }

  sendStreamFrame(frame: StreamFrame): void {
    process.parentPort?.postMessage({ type: 'stream-frame', payload: frame })
  }

  sendStateDelta(delta: StateDelta): void {
    process.parentPort?.postMessage({ type: 'state-delta', payload: delta })
  }

  sendPermissionRequest(request: PermissionRequest): void {
    process.parentPort?.postMessage({
      type: 'permission-request',
      payload: request,
    })
  }

  onMessage(callback: (msg: { type: string; payload: unknown }) => void): void {
    process.parentPort?.on('message', callback)
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add packages/runtime/
git commit -m "feat(runtime): add DecisionQueue, StateMachine, and IPCBridge (TDD)

- DecisionQueue: suspend/resolve with 5min TTL auto-deny
- StateMachine: authoritative state tree with delta emission
- IPCBridge: typed wrapper over Utility Process message port
- 15 unit tests covering queue and state machine logic"
```

---

## Task 7: Runtime — HookEngine + SessionManager

**Files:**
- Create: `packages/runtime/__tests__/hook-engine.test.ts`
- Create: `packages/runtime/src/hook-engine.ts`
- Create: `packages/runtime/src/session-manager.ts`

- [ ] **Step 1: Write HookEngine tests**

`packages/runtime/__tests__/hook-engine.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { HookEngine } from '../src/hook-engine'
import type { StateMachine } from '../src/state-machine'
import type { StateDelta } from '../../shared/src/state-delta'

// Mock StateMachine
function createMockStateMachine() {
  const deltas: StateDelta[] = []
  const machine = {
    onDelta: (delta: StateDelta) => deltas.push(delta),
    appendMessage: (sessionId: string, summary: unknown) => {
      deltas.push({
        type: 'MESSAGE_APPENDED',
        sessionId,
        summary: summary as never,
      })
    },
    updateCost: (sessionId: string, costUsd: number) => {
      deltas.push({ type: 'COST_UPDATED', sessionId, costUsd })
    },
    createTodo: (scope: 'session' | 'project', partial: unknown) => {
      const item = { id: 'todo-1', ...(partial as object), status: 'pending', createdAt: Date.now(), updatedAt: Date.now() }
      deltas.push({ type: 'TODO_CREATED', scope, item: item as never })
      return item
    },
    updateTodo: (scope: 'session' | 'project', id: string, patch: unknown) => {
      deltas.push({ type: 'TODO_UPDATED', scope, id, patch: patch as never })
    },
    _deltas: deltas,
  }
  return machine as unknown as StateMachine & { _deltas: StateDelta[] }
}

describe('HookEngine', () => {
  let engine: HookEngine
  let stateMachine: ReturnType<typeof createMockStateMachine>

  beforeEach(() => {
    stateMachine = createMockStateMachine()
    engine = new HookEngine(stateMachine)
  })

  it('buildHooks returns a hooks object with registered event handlers', () => {
    const hooks = engine.buildHooks()
    expect(hooks).toBeDefined()
    expect(hooks.PostToolUse).toBeDefined()
    expect(hooks.TaskCreated).toBeDefined()
    expect(hooks.Stop).toBeDefined()
  })

  it('PostToolUse hook extracts tool name and appends message', async () => {
    const hooks = engine.buildHooks()
    const matcher = hooks.PostToolUse![0]
    const hook = matcher.hooks[0]

    const result = await hook(
      {
        session_id: 's1',
        transcript_path: '/tmp',
        cwd: '/project',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_result: 'file1.txt\nfile2.txt',
      } as never,
      'tool-1',
      { signal: new AbortController().signal }
    )

    expect(result).toEqual({ continue: true })
    expect(stateMachine._deltas).toHaveLength(1)
    expect(stateMachine._deltas[0].type).toBe('MESSAGE_APPENDED')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run packages/runtime/__tests__/hook-engine.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement HookEngine**

`packages/runtime/src/hook-engine.ts`:
```typescript
import type { StateMachine } from './state-machine'

/**
 * Registers SDK hooks that translate SDK events into StateDelta emissions.
 * The hooks object is passed directly to query({ options: { hooks } }).
 */
export class HookEngine {
  constructor(private stateMachine: StateMachine) {}

  buildHooks() {
    return {
      SessionStart: [
        {
          hooks: [
            async (
              input: { session_id: string },
              _toolUseID: string | undefined,
              _options: { signal: AbortSignal }
            ) => {
              this.stateMachine.initSession(input.session_id, process.cwd())
              return { continue: true }
            },
          ],
        },
      ],

      SessionEnd: [
        {
          hooks: [
            async (
              input: { session_id: string },
              _toolUseID: string | undefined,
              _options: { signal: AbortSignal }
            ) => {
              this.stateMachine.updateStatus(input.session_id, 'idle')
              return { continue: true }
            },
          ],
        },
      ],

      PostToolUse: [
        {
          hooks: [
            async (
              input: { tool_name: string; tool_result?: string; session_id: string },
              _toolUseID: string | undefined,
              _options: { signal: AbortSignal }
            ) => {
              const preview = input.tool_result
                ? input.tool_result.slice(0, 200)
                : ''

              this.stateMachine.appendMessage(input.session_id, {
                uuid: crypto.randomUUID(),
                type: 'assistant',
                preview: `[${input.tool_name}] ${preview}`,
                timestamp: Date.now(),
                toolCalls: [input.tool_name],
              })

              return { continue: true }
            },
          ],
        },
      ],

      TaskCreated: [
        {
          hooks: [
            async (
              input: { task_title?: string; session_id: string; task_id?: string },
              _toolUseID: string | undefined,
              _options: { signal: AbortSignal }
            ) => {
              this.stateMachine.createTodo('session', {
                title: input.task_title ?? 'Untitled task',
                sessionId: input.session_id,
              })
              return { continue: true }
            },
          ],
        },
      ],

      TaskCompleted: [
        {
          hooks: [
            async (
              input: { task_id: string; session_id: string },
              _toolUseID: string | undefined,
              _options: { signal: AbortSignal }
            ) => {
              this.stateMachine.updateTodo('session', input.task_id, {
                status: 'completed',
              })
              return { continue: true }
            },
          ],
        },
      ],

      Stop: [
        {
          hooks: [
            async (
              input: { session_id: string },
              _toolUseID: string | undefined,
              _options: { signal: AbortSignal }
            ) => {
              this.stateMachine.updateStatus(input.session_id, 'idle')
              return { continue: true }
            },
          ],
        },
      ],

      Notification: [
        {
          hooks: [
            async (
              input: { message: string; session_id: string },
              _toolUseID: string | undefined,
              _options: { signal: AbortSignal }
            ) => {
              this.stateMachine.appendMessage(input.session_id, {
                uuid: crypto.randomUUID(),
                type: 'system',
                preview: input.message,
                timestamp: Date.now(),
              })
              return { continue: true }
            },
          ],
        },
      ],
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run packages/runtime/__tests__/hook-engine.test.ts
```

Expected: PASS

- [ ] **Step 5: Implement SessionManager**

`packages/runtime/src/session-manager.ts`:
```typescript
import { readdir, readFile, appendFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

export interface SessionSummary {
  id: string
  title: string
  projectPath: string
  lastModified: number
  filePath: string
}

/**
 * Manages session persistence as JSONL files.
 * Compatible with Claude Code's session storage format.
 */
export class SessionManager {
  private claudeDir: string

  constructor() {
    this.claudeDir = join(homedir(), '.claude')
  }

  private getProjectDir(projectPath: string): string {
    // Encode project path the same way Claude Code does
    const encoded = projectPath
      .replace(/\//g, '-')
      .replace(/^-/, '')
    return join(this.claudeDir, 'projects', encoded)
  }

  async list(projectPath: string): Promise<SessionSummary[]> {
    const dir = this.getProjectDir(projectPath)

    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const jsonlFiles = entries.filter(
        (e) => e.isFile() && e.name.endsWith('.jsonl')
      )

      const summaries: SessionSummary[] = []

      for (const file of jsonlFiles) {
        const filePath = join(dir, file.name)
        const content = await readFile(filePath, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)

        if (lines.length === 0) continue

        // First line is usually metadata
        let title = basename(file.name, '.jsonl')
        let lastModified = 0

        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            if (entry.type === 'summary' && entry.title) {
              title = entry.title
            }
            if (entry.timestamp) {
              lastModified = Math.max(lastModified, entry.timestamp)
            }
          } catch {
            // Skip malformed lines
          }
        }

        summaries.push({
          id: basename(file.name, '.jsonl'),
          title,
          projectPath,
          lastModified: lastModified || Date.now(),
          filePath,
        })
      }

      // Sort by most recent first
      summaries.sort((a, b) => b.lastModified - a.lastModified)
      return summaries
    } catch {
      return []
    }
  }

  async load(sessionId: string): Promise<SDKMessage[]> {
    // Search all project directories for this session
    try {
      const projectsDir = join(this.claudeDir, 'projects')
      const projects = await readdir(projectsDir, { withFileTypes: true })

      for (const project of projects) {
        if (!project.isDirectory()) continue
        const filePath = join(projectsDir, project.name, `${sessionId}.jsonl`)

        try {
          const content = await readFile(filePath, 'utf-8')
          const lines = content.trim().split('\n').filter(Boolean)
          return lines.map((line) => JSON.parse(line) as SDKMessage)
        } catch {
          // Not in this project dir, continue searching
        }
      }
    } catch {
      // Projects dir doesn't exist
    }

    return []
  }

  async append(
    sessionId: string,
    projectPath: string,
    message: SDKMessage
  ): Promise<void> {
    const dir = this.getProjectDir(projectPath)
    await mkdir(dir, { recursive: true })

    const filePath = join(dir, `${sessionId}.jsonl`)
    const line = JSON.stringify(message) + '\n'
    await appendFile(filePath, line, 'utf-8')
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/
git commit -m "feat(runtime): add HookEngine and SessionManager

- HookEngine: translates SDK hooks → StateDelta emissions
- SessionManager: JSONL persistence compatible with Claude Code format
- HookEngine unit tests for PostToolUse, TaskCreated, Stop"
```

---

## Task 8: Runtime — SDKService + AgentRuntime + Entry

**Files:**
- Create: `packages/runtime/src/sdk-service.ts`
- Create: `packages/runtime/src/agent-runtime.ts`
- Modify: `packages/runtime/src/entry.ts`

- [ ] **Step 1: Implement SDKService**

`packages/runtime/src/sdk-service.ts`:
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage, Options } from '@anthropic-ai/claude-agent-sdk'
import type { StreamFrame } from '../../shared/src/ipc-stream'
import type { DecisionQueue } from './decision-queue'
import type { StateMachine } from './state-machine'
import type { HookEngine } from './hook-engine'

export interface SDKServiceOptions {
  decisionQueue: DecisionQueue
  stateMachine: StateMachine
  hookEngine: HookEngine
}

/**
 * Manages SDK query() lifecycle. Consumes the AsyncGenerator,
 * wraps messages in StreamFrames, and emits them via the IPC bridge.
 */
export class SDKService {
  private decisionQueue: DecisionQueue
  private stateMachine: StateMachine
  private hookEngine: HookEngine
  private activeQueries = new Map<string, AbortController>()

  constructor(opts: SDKServiceOptions) {
    this.decisionQueue = opts.decisionQueue
    this.stateMachine = opts.stateMachine
    this.hookEngine = opts.hookEngine
  }

  async runQuery(
    sessionId: string,
    prompt: string,
    options: Partial<Options>,
    onFrame: (frame: StreamFrame) => void
  ): Promise<void> {
    // Cancel any existing query for this session
    this.cancelQuery(sessionId)

    const abortController = new AbortController()
    this.activeQueries.set(sessionId, abortController)

    this.stateMachine.updateStatus(sessionId, 'running')

    const streamId = crypto.randomUUID()
    this.stateMachine.addStream(sessionId, streamId)

    try {
      const q = query({
        prompt,
        options: {
          ...options,
          abortController,
          cwd: options.cwd ?? process.cwd(),
          hooks: this.hookEngine.buildHooks(),
          canUseTool: async (toolName, toolInput) => {
            const { requestId, promise } = this.decisionQueue.suspend(
              sessionId,
              toolName,
              toolInput
            )

            // Notify frontend
            onFrame({
              streamId,
              sessionId,
              kind: 'chunk',
              data: {
                type: 'permission_request',
                requestId,
                toolName,
                toolInput,
              } as unknown as SDKMessage,
            })

            this.stateMachine.updateStatus(sessionId, 'waiting_permission')
            const result = await promise
            this.stateMachine.updateStatus(sessionId, 'running')

            return {
              behavior: result.decision,
            }
          },
        },
      })

      for await (const message of q) {
        if (abortController.signal.aborted) break

        // Extract cost from result messages
        if (
          message.type === 'result' &&
          'total_cost_usd' in message
        ) {
          this.stateMachine.updateCost(
            sessionId,
            (message as { total_cost_usd: number }).total_cost_usd
          )
        }

        onFrame({
          streamId,
          sessionId,
          kind: 'chunk',
          data: message,
        })
      }

      onFrame({ streamId, sessionId, kind: 'done' })
    } catch (error) {
      if (!abortController.signal.aborted) {
        onFrame({
          streamId,
          sessionId,
          kind: 'error',
          error: {
            code: 'QUERY_ERROR',
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
          },
        })
      }
    } finally {
      this.stateMachine.removeStream(sessionId, streamId)
      this.activeQueries.delete(sessionId)
    }
  }

  cancelQuery(sessionId: string): void {
    const controller = this.activeQueries.get(sessionId)
    if (controller) {
      controller.abort()
      this.activeQueries.delete(sessionId)
    }
  }
}
```

- [ ] **Step 2: Implement AgentRuntime**

`packages/runtime/src/agent-runtime.ts`:
```typescript
import type { StreamFrame } from '../../shared/src/ipc-stream'
import type { PermissionDecision } from '../../shared/src/permission'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { DecisionQueue } from './decision-queue'
import { StateMachine } from './state-machine'
import { HookEngine } from './hook-engine'
import { SDKService } from './sdk-service'
import { SessionManager } from './session-manager'
import { IPCBridge } from './ipc-bridge'

/**
 * Top-level orchestrator for the Utility Process.
 * Wires all modules together and handles IPC messages.
 */
export class AgentRuntime {
  private decisionQueue: DecisionQueue
  private stateMachine: StateMachine
  private hookEngine: HookEngine
  private sdkService: SDKService
  private sessionManager: SessionManager
  private ipcBridge: IPCBridge

  constructor() {
    this.decisionQueue = new DecisionQueue()
    this.stateMachine = new StateMachine()
    this.hookEngine = new HookEngine(this.stateMachine)
    this.sdkService = new SDKService({
      decisionQueue: this.decisionQueue,
      stateMachine: this.stateMachine,
      hookEngine: this.hookEngine,
    })
    this.sessionManager = new SessionManager()
    this.ipcBridge = new IPCBridge()

    // Wire state deltas to IPC
    this.stateMachine.onDelta = (delta) => {
      this.ipcBridge.sendStateDelta(delta)
    }

    // Listen for commands from main process
    this.ipcBridge.onMessage(async (msg) => {
      switch (msg.type) {
        case 'command':
          await this.handleCommand(
            msg.payload as {
              sessionId: string
              kind: string
              payload?: { prompt?: string }
            }
          )
          break
        case 'permission-response':
          this.handlePermissionResponse(
            msg.payload as PermissionDecision
          )
          break
      }
    })

    // Send initial full sync
    this.ipcBridge.sendStateDelta(this.stateMachine.getFullSync())
  }

  private async handleCommand(command: {
    sessionId: string
    kind: string
    payload?: { prompt?: string }
  }): Promise<void> {
    switch (command.kind) {
      case 'start': {
        if (!command.payload?.prompt) return

        // Initialize session if needed
        if (!this.stateMachine.getState().sessions[command.sessionId]) {
          this.stateMachine.initSession(command.sessionId, process.cwd())
        }

        const options: Partial<Options> = {
          cwd: this.stateMachine.getState().sessions[command.sessionId]
            .projectPath,
        }

        await this.sdkService.runQuery(
          command.sessionId,
          command.payload.prompt,
          options,
          (frame) => this.ipcBridge.sendStreamFrame(frame)
        )
        break
      }
      case 'cancel':
        this.sdkService.cancelQuery(command.sessionId)
        break
    }
  }

  private handlePermissionResponse(decision: PermissionDecision): void {
    this.decisionQueue.resolve(decision.requestId, decision.decision)
  }
}
```

- [ ] **Step 3: Implement entry point**

`packages/runtime/src/entry.ts`:
```typescript
import { AgentRuntime } from './agent-runtime'

// Initialize the runtime
const _runtime = new AgentRuntime()

console.log('[runtime] Looooop agent runtime started')
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p packages/runtime/tsconfig.json
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/
git commit -m "feat(runtime): add SDKService, AgentRuntime, and entry point

- SDKService: manages query() lifecycle, streams frames via callback
- AgentRuntime: orchestrates all runtime modules, handles IPC
- Entry point wires everything together for Utility Process"
```

---

## Task 9: Renderer — Zustand Stores

**Files:**
- Create: `packages/renderer/src/stores/session-store.ts`
- Create: `packages/renderer/src/stores/stream-store.ts`
- Create: `packages/renderer/src/stores/todo-store.ts`
- Create: `packages/renderer/src/stores/permission-store.ts`

- [ ] **Step 1: Install Zustand (if not already)**

```bash
npm install zustand
```

- [ ] **Step 2: Create session store**

`packages/renderer/src/stores/session-store.ts`:
```typescript
import { create } from 'zustand'
import type { SessionState, MessageSummary } from '../../../shared/src/state-delta'

interface SessionStore {
  sessions: Record<string, SessionState>
  activeSessionId: string | null

  // Actions (called by useStateSync hook)
  setSessions: (sessions: Record<string, SessionState>) => void
  updateStatus: (sessionId: string, status: SessionState['status']) => void
  appendMessage: (sessionId: string, summary: MessageSummary) => void
  setActiveSession: (sessionId: string) => void
  updateCost: (sessionId: string, costUsd: number) => void
  updateTitle: (sessionId: string, title: string) => void
  addStream: (sessionId: string, streamId: string) => void
  removeStream: (sessionId: string, streamId: string) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: {},
  activeSessionId: null,

  setSessions: (sessions) => set({ sessions }),

  updateStatus: (sessionId, status) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          status,
        },
      },
    })),

  appendMessage: (sessionId, summary) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          messages: [...(state.sessions[sessionId]?.messages ?? []), summary],
        },
      },
    })),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  updateCost: (sessionId, costUsd) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          costUsd,
        },
      },
    })),

  updateTitle: (sessionId, title) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          title,
        },
      },
    })),

  addStream: (sessionId, streamId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          activeStreamIds: [
            ...(state.sessions[sessionId]?.activeStreamIds ?? []),
            streamId,
          ],
        },
      },
    })),

  removeStream: (sessionId, streamId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          activeStreamIds: (
            state.sessions[sessionId]?.activeStreamIds ?? []
          ).filter((id) => id !== streamId),
        },
      },
    })),
}))
```

- [ ] **Step 3: Create stream store**

`packages/renderer/src/stores/stream-store.ts`:
```typescript
import { create } from 'zustand'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { StreamFrame } from '../../../shared/src/ipc-stream'

interface StreamEntry {
  streamId: string
  sessionId: string
  messages: SDKMessage[]
  status: 'streaming' | 'done' | 'error'
  error?: StreamFrame['error']
}

interface StreamStore {
  streams: Record<string, StreamEntry>

  addChunk: (frame: StreamFrame<SDKMessage>) => void
  markDone: (streamId: string) => void
  markError: (streamId: string, error: StreamFrame['error']) => void
  removeStream: (streamId: string) => void
  clear: () => void
}

export const useStreamStore = create<StreamStore>((set) => ({
  streams: {},

  addChunk: (frame) =>
    set((state) => {
      const existing = state.streams[frame.streamId]
      if (!existing) {
        return {
          streams: {
            ...state.streams,
            [frame.streamId]: {
              streamId: frame.streamId,
              sessionId: frame.sessionId,
              messages: frame.data ? [frame.data] : [],
              status: 'streaming',
            },
          },
        }
      }
      return {
        streams: {
          ...state.streams,
          [frame.streamId]: {
            ...existing,
            messages: frame.data
              ? [...existing.messages, frame.data]
              : existing.messages,
          },
        },
      }
    }),

  markDone: (streamId) =>
    set((state) => ({
      streams: {
        ...state.streams,
        [streamId]: {
          ...state.streams[streamId],
          status: 'done',
        },
      },
    })),

  markError: (streamId, error) =>
    set((state) => ({
      streams: {
        ...state.streams,
        [streamId]: {
          ...state.streams[streamId],
          status: 'error',
          error,
        },
      },
    })),

  removeStream: (streamId) =>
    set((state) => {
      const { [streamId]: _, ...rest } = state.streams
      return { streams: rest }
    }),

  clear: () => set({ streams: {} }),
}))
```

- [ ] **Step 4: Create todo store**

`packages/renderer/src/stores/todo-store.ts`:
```typescript
import { create } from 'zustand'
import type { TodoItem } from '../../../shared/src/state-delta'

interface TodoStore {
  session: TodoItem[]
  project: TodoItem[]
  activeScope: 'session' | 'project'

  setActiveScope: (scope: 'session' | 'project') => void
  addItem: (scope: 'session' | 'project', item: TodoItem) => void
  updateItem: (
    scope: 'session' | 'project',
    id: string,
    patch: Partial<Pick<TodoItem, 'title' | 'status' | 'children'>>
  ) => void
  deleteItem: (scope: 'session' | 'project', id: string) => void
  setItems: (scope: 'session' | 'project', items: TodoItem[]) => void
  clearSession: () => void
}

export const useTodoStore = create<TodoStore>((set) => ({
  session: [],
  project: [],
  activeScope: 'session',

  setActiveScope: (scope) => set({ activeScope: scope }),

  addItem: (scope, item) =>
    set((state) => ({
      [scope]: [...state[scope], item],
    })),

  updateItem: (scope, id, patch) =>
    set((state) => ({
      [scope]: state[scope].map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    })),

  deleteItem: (scope, id) =>
    set((state) => ({
      [scope]: state[scope].filter((item) => item.id !== id),
    })),

  setItems: (scope, items) => set({ [scope]: items }),

  clearSession: () => set({ session: [] }),
}))
```

- [ ] **Step 5: Create permission store**

`packages/renderer/src/stores/permission-store.ts`:
```typescript
import { create } from 'zustand'
import type { PermissionRequest } from '../../../shared/src/permission'

interface PermissionStore {
  pending: PermissionRequest[]

  addRequest: (request: PermissionRequest) => void
  removeRequest: (requestId: string) => void
  clear: () => void
}

export const usePermissionStore = create<PermissionStore>((set) => ({
  pending: [],

  addRequest: (request) =>
    set((state) => ({
      pending: [...state.pending, request],
    })),

  removeRequest: (requestId) =>
    set((state) => ({
      pending: state.pending.filter((r) => r.requestId !== requestId),
    })),

  clear: () => set({ pending: [] }),
}))
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p packages/renderer/tsconfig.json
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/renderer/src/stores/
git commit -m "feat(renderer): add Zustand stores for state management

- session-store: sessions, messages, active session
- stream-store: active stream tracking with message accumulation
- todo-store: session + project scoped todos with scope toggle
- permission-store: pending permission request queue"
```

---

## Task 10: Renderer — React Hooks

**Files:**
- Create: `packages/renderer/src/hooks/useAgentStream.ts`
- Create: `packages/renderer/src/hooks/useStateSync.ts`
- Create: `packages/renderer/src/hooks/usePermission.ts`

- [ ] **Step 1: Create useAgentStream hook**

`packages/renderer/src/hooks/useAgentStream.ts`:
```typescript
import { useCallback } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useStreamStore } from '../stores/stream-store'
import type { StreamCommand } from '../../../shared/src/ipc-stream'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { StreamFrame } from '../../../shared/src/ipc-stream'

/**
 * Hook for sending prompts and consuming stream frames.
 * Wraps the preload API into a React-friendly interface.
 */
export function useAgentStream(sessionId: string) {
  const session = useSessionStore((s) => s.sessions[sessionId])
  const streams = useStreamStore((s) => s.streams)
  const addChunk = useStreamStore((s) => s.addChunk)
  const markDone = useStreamStore((s) => s.markDone)
  const markError = useStreamStore((s) => s.markError)

  // Collect messages from all active streams for this session
  const messages = Object.values(streams)
    .filter((s) => s.sessionId === sessionId)
    .flatMap((s) => s.messages)

  const status: 'idle' | 'streaming' | 'done' | 'error' =
    session?.status === 'running'
      ? 'streaming'
      : session?.status === 'error'
        ? 'error'
        : session?.activeStreamIds?.length ?? 0 > 0
          ? 'streaming'
          : 'idle'

  const send = useCallback(
    (prompt: string) => {
      const streamId = crypto.randomUUID()

      const command: StreamCommand = {
        streamId,
        sessionId,
        kind: 'start',
        payload: { prompt },
      }

      window.api.sendCommand(command)
    },
    [sessionId]
  )

  const cancel = useCallback(() => {
    if (session?.activeStreamIds) {
      for (const streamId of session.activeStreamIds) {
        window.api.sendCommand({
          streamId,
          sessionId,
          kind: 'cancel',
        })
      }
    } else {
      window.api.sendCommand({
        streamId: '*',
        sessionId,
        kind: 'cancel',
      })
    }
  }, [sessionId, session?.activeStreamIds])

  return { messages, status, send, cancel }
}

/**
 * Hook that subscribes to stream frames and routes them to the store.
 * Call once in App.tsx (not per-component).
 */
export function useStreamSubscription() {
  const addChunk = useStreamStore((s) => s.addChunk)
  const markDone = useStreamStore((s) => s.markDone)
  const markError = useStreamStore((s) => s.markError)

  // Subscribe once
  useCallback(() => {
    window.api.onStreamFrame((frame: StreamFrame<SDKMessage>) => {
      switch (frame.kind) {
        case 'chunk':
          addChunk(frame)
          break
        case 'done':
          markDone(frame.streamId)
          break
        case 'error':
          markError(frame.streamId, frame.error)
          break
      }
    })
  }, [addChunk, markDone, markError])()
}
```

- [ ] **Step 2: Create useStateSync hook**

`packages/renderer/src/hooks/useStateSync.ts`:
```typescript
import { useEffect } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useTodoStore } from '../stores/todo-store'
import type { StateDelta, AppState } from '../../../shared/src/state-delta'

/**
 * Subscribes to StateDelta events from the runtime and applies them
 * to Zustand stores. Call once in App.tsx.
 */
export function useStateSync() {
  const sessionStore = useSessionStore.getState()
  const todoStore = useTodoStore.getState()

  useEffect(() => {
    const unsubscribe = window.api.onStateDelta((delta: StateDelta) => {
      switch (delta.type) {
        case 'SESSION_STATUS':
          sessionStore.updateStatus(delta.sessionId, delta.status)
          break

        case 'MESSAGE_APPENDED':
          sessionStore.appendMessage(delta.sessionId, delta.summary)
          break

        case 'STREAM_STARTED':
          sessionStore.addStream(delta.sessionId, delta.streamId)
          break

        case 'STREAM_ENDED':
          sessionStore.removeStream(delta.sessionId, delta.streamId)
          break

        case 'TODO_CREATED':
          todoStore.addItem(delta.scope, delta.item)
          break

        case 'TODO_UPDATED':
          todoStore.updateItem(delta.scope, delta.id, delta.patch)
          break

        case 'TODO_DELETED':
          todoStore.deleteItem(delta.scope, delta.id)
          break

        case 'COST_UPDATED':
          sessionStore.updateCost(delta.sessionId, delta.costUsd)
          break

        case 'MODEL_CHANGED':
          // Model info is tracked but no specific store action yet
          break

        case 'SESSION_TITLE':
          sessionStore.updateTitle(delta.sessionId, delta.title)
          break

        case 'FULL_SYNC':
          applyFullSync(delta.state)
          break
      }
    })

    return unsubscribe
  }, [])
}

function applyFullSync(state: AppState) {
  const sessionStore = useSessionStore.getState()
  const todoStore = useTodoStore.getState()

  sessionStore.setSessions(state.sessions)
  todoStore.setItems('session', state.todos.session)
  todoStore.setItems('project', state.todos.project)
}
```

- [ ] **Step 3: Create usePermission hook**

`packages/renderer/src/hooks/usePermission.ts`:
```typescript
import { useEffect, useCallback } from 'react'
import { usePermissionStore } from '../stores/permission-store'
import type { PermissionRequest } from '../../../shared/src/permission'

/**
 * Subscribes to permission requests and provides a respond function.
 */
export function usePermission() {
  const pending = usePermissionStore((s) => s.pending)
  const addRequest = usePermissionStore((s) => s.addRequest)
  const removeRequest = usePermissionStore((s) => s.removeRequest)

  // Subscribe to permission requests
  useEffect(() => {
    const unsubscribe = window.api.onPermissionRequest(
      (request: PermissionRequest) => {
        addRequest(request)
      }
    )
    return unsubscribe
  }, [addRequest])

  const respond = useCallback(
    (requestId: string, decision: 'allow' | 'deny') => {
      window.api.sendPermissionResponse({ requestId, decision })
      removeRequest(requestId)
    },
    [removeRequest]
  )

  return { pending, respond }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p packages/renderer/tsconfig.json
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/hooks/
git commit -m "feat(renderer): add React hooks for IPC consumption

- useAgentStream: send prompts, cancel queries
- useStateSync: apply StateDelta events to Zustand stores
- usePermission: permission request/response flow
- useStreamSubscription: route StreamFrames to stream store"
```

---

## Task 11: Renderer — Layout Shell

**Files:**
- Create: `packages/renderer/src/components/layout/AppShell.tsx`
- Create: `packages/renderer/src/components/layout/LeftPanel.tsx`
- Create: `packages/renderer/src/components/layout/CenterPanel.tsx`
- Create: `packages/renderer/src/components/layout/RightPanel.tsx`
- Modify: `packages/renderer/src/App.tsx`
- Install: tailwindcss, shadcn/ui dependencies

- [ ] **Step 1: Initialize Tailwind CSS and shadcn/ui**

```bash
cd packages/renderer
npx tailwindcss init -p
```

Update `packages/renderer/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0a',
          secondary: '#141414',
          tertiary: '#1e1e1e',
        },
        text: {
          primary: '#e5e5e5',
          secondary: '#a3a3a3',
        },
        border: '#2a2a2a',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
}
```

Install shadcn/ui dependencies:
```bash
npm install class-variance-authority clsx tailwind-merge lucide-react
```

Create `packages/renderer/src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Create AppShell**

`packages/renderer/src/components/layout/AppShell.tsx`:
```tsx
import { LeftPanel } from './LeftPanel'
import { CenterPanel } from './CenterPanel'
import { RightPanel } from './RightPanel'

export function AppShell() {
  return (
    <div className="h-screen flex bg-bg-primary">
      {/* Left Panel - Project/Session History */}
      <aside className="w-[280px] border-r border-border flex-shrink-0">
        <LeftPanel />
      </aside>

      {/* Center Panel - Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <CenterPanel />
      </main>

      {/* Right Panel - Todos */}
      <aside className="w-[320px] border-l border-border flex-shrink-0">
        <RightPanel />
      </aside>
    </div>
  )
}
```

- [ ] **Step 3: Create LeftPanel**

`packages/renderer/src/components/layout/LeftPanel.tsx`:
```tsx
import { useSessionStore } from '../../stores/session-store'

export function LeftPanel() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  const sessionList = Object.values(sessions).sort(
    (a, b) => b.lastActivity - a.lastActivity
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Sessions
        </h2>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {sessionList.length === 0 ? (
          <div className="p-4 text-text-secondary text-sm">
            No sessions yet. Start a conversation to begin.
          </div>
        ) : (
          sessionList.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              className={`w-full p-3 text-left hover:bg-bg-tertiary transition-colors ${
                activeSessionId === session.id ? 'bg-bg-tertiary' : ''
              }`}
            >
              <div className="text-sm font-medium text-text-primary truncate">
                {session.title ?? session.id}
              </div>
              <div className="text-xs text-text-secondary mt-1 flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    session.status === 'running'
                      ? 'bg-green-500'
                      : session.status === 'waiting_permission'
                        ? 'bg-yellow-500'
                        : session.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-gray-500'
                  }`}
                />
                <span className="capitalize">{session.status}</span>
                {session.costUsd > 0 && (
                  <span>${session.costUsd.toFixed(4)}</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* New Session Button */}
      <div className="p-3 border-t border-border">
        <button
          onClick={() => {
            const id = crypto.randomUUID()
            // Initialize session via IPC — runtime will create it on first message
            setActiveSession(id)
          }}
          className="w-full py-2 px-3 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          New Session
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create CenterPanel**

`packages/renderer/src/components/layout/CenterPanel.tsx`:
```tsx
import { useSessionStore } from '../../stores/session-store'
import { ChatInput } from '../chat/ChatInput'
import { MessageList } from '../chat/MessageList'
import { useAgentStream } from '../../hooks/useAgentStream'

export function CenterPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Looooop
          </h1>
          <p className="text-text-secondary">
            Start a new session to begin coding with Claude
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <MessageList sessionId={activeSessionId} />
      <ChatInput sessionId={activeSessionId} />
    </div>
  )
}
```

- [ ] **Step 5: Create RightPanel**

`packages/renderer/src/components/layout/RightPanel.tsx`:
```tsx
import { useTodoStore } from '../../stores/todo-store'

export function RightPanel() {
  const session = useTodoStore((s) => s.session)
  const project = useTodoStore((s) => s.project)
  const activeScope = useTodoStore((s) => s.activeScope)
  const setActiveScope = useTodoStore((s) => s.setActiveScope)

  const items = activeScope === 'session' ? session : project

  return (
    <div className="h-full flex flex-col">
      {/* Header with scope toggle */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveScope('session')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              activeScope === 'session'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-bg-tertiary'
            }`}
          >
            Session
          </button>
          <button
            onClick={() => setActiveScope('project')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              activeScope === 'project'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-bg-tertiary'
            }`}
          >
            Project
          </button>
        </div>
      </div>

      {/* Todo List */}
      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="text-text-secondary text-sm p-2">
            No {activeScope} tasks yet.
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-bg-tertiary"
              >
                <span
                  className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${
                    item.status === 'completed'
                      ? 'bg-green-500'
                      : item.status === 'in_progress'
                        ? 'bg-yellow-500'
                        : item.status === 'blocked'
                          ? 'bg-red-500'
                          : 'bg-gray-600'
                  }`}
                />
                <span
                  className={`text-sm ${
                    item.status === 'completed'
                      ? 'line-through text-text-secondary'
                      : 'text-text-primary'
                  }`}
                >
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create ChatInput placeholder**

`packages/renderer/src/components/chat/ChatInput.tsx`:
```tsx
import { useState, useCallback } from 'react'
import { useAgentStream } from '../../hooks/useAgentStream'

export function ChatInput({ sessionId }: { sessionId: string }) {
  const [input, setInput] = useState('')
  const { send, cancel, isActive } = useAgentStream(sessionId)

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return
    send(input.trim())
    setInput('')
  }, [input, send])

  return (
    <div className="p-4 border-t border-border">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Ask Claude anything..."
          className="flex-1 bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          rows={3}
        />
        {isActive ? (
          <button
            onClick={cancel}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors self-end"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors self-end disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create MessageList placeholder**

`packages/renderer/src/components/chat/MessageList.tsx`:
```tsx
import { useStreamStore } from '../../stores/stream-store'
import { useSessionStore } from '../../stores/session-store'

export function MessageList({ sessionId }: { sessionId: string }) {
  const session = useSessionStore((s) => s.sessions[sessionId])
  const streams = useStreamStore((s) => s.streams)

  // Get messages from active streams for this session
  const activeMessages = Object.values(streams)
    .filter((s) => s.sessionId === sessionId)
    .flatMap((s) => s.messages)

  const sessionMessages = session?.messages ?? []

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Historical messages */}
      {sessionMessages.map((msg) => (
        <div key={msg.uuid} className="message-summary">
          <div className="text-xs text-text-secondary mb-1 capitalize">
            {msg.type}
          </div>
          <div className="text-sm text-text-primary">{msg.preview}</div>
        </div>
      ))}

      {/* Streaming messages */}
      {activeMessages.map((msg, i) => (
        <div key={`stream-${i}`} className="streaming-message">
          <div className="text-xs text-text-secondary mb-1">
            {msg.type}
          </div>
          <div className="text-sm text-text-primary">
            {'content' in msg && Array.isArray(msg.content)
              ? msg.content.map((block: { type: string; text?: string }, j: number) => (
                  <span key={j}>
                    {block.type === 'text' ? block.text : `[${block.type}]`}
                  </span>
                ))
              : JSON.stringify(msg)}
          </div>
        </div>
      ))}

      {activeMessages.length === 0 && sessionMessages.length === 0 && (
        <div className="text-text-secondary text-center py-20">
          Send a message to start the conversation
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Update App.tsx**

`packages/renderer/src/App.tsx`:
```tsx
import { AppShell } from './components/layout/AppShell'
import { useStateSync } from './hooks/useStateSync'
import { useStreamSubscription } from './hooks/useAgentStream'
import { PermissionDialog } from './components/permission/PermissionDialog'

export function App() {
  // Wire up state synchronization
  useStateSync()
  useStreamSubscription()

  return (
    <>
      <AppShell />
      <PermissionDialog />
    </>
  )
}
```

- [ ] **Step 9: Create PermissionDialog placeholder**

`packages/renderer/src/components/permission/PermissionDialog.tsx`:
```tsx
import { usePermission } from '../../hooks/usePermission'

export function PermissionDialog() {
  const { pending, respond } = usePermission()

  if (pending.length === 0) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-secondary rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Permission Required
        </h3>

        {pending.map((request) => (
          <div key={request.requestId} className="mb-4">
            <div className="text-sm text-text-secondary mb-2">
              Claude wants to use <strong>{request.toolName}</strong>
            </div>
            <pre className="bg-bg-tertiary rounded-md p-3 text-xs text-text-primary overflow-x-auto">
              {JSON.stringify(request.toolInput, null, 2)}
            </pre>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => respond(request.requestId, 'allow')}
                className="flex-1 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90"
              >
                Allow
              </button>
              <button
                onClick={() => respond(request.requestId, 'deny')}
                className="flex-1 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p packages/renderer/tsconfig.json
```

Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add packages/renderer/
git commit -m "feat(renderer): add three-panel layout with chat, sidebar, and todos

- AppShell: 280px left + flex center + 320px right
- LeftPanel: session list with status indicators
- CenterPanel: message list + chat input
- RightPanel: todo tree with session/project scope toggle
- PermissionDialog: modal for tool approval
- Tailwind CSS + shadcn/ui utilities configured"
```

---

## Task 12: Integration Verification

**Files:**
- Modify: `electron.vite.config.ts` (if needed)
- Modify: `packages/main/src/router.ts` (if needed)

- [ ] **Step 1: Verify all TypeScript compiles**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
npx tsc --noEmit -p packages/preload/tsconfig.json
npx tsc --noEmit -p packages/main/tsconfig.json
npx tsc --noEmit -p packages/runtime/tsconfig.json
npx tsc --noEmit -p packages/renderer/tsconfig.json
```

Expected: All PASS

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 3: Build and launch the app**

```bash
npm run build
npm run dev
```

Expected: Electron window opens with three-panel layout

- [ ] **Step 4: Verify preload API is available**

In the renderer DevTools console:
```javascript
console.log(window.api)
// Should print: { sendCommand: fn, onStreamFrame: fn, onStateDelta: fn, ... }
```

- [ ] **Step 5: Verify IPC flow end-to-end**

1. Click "New Session" in left panel
2. Type a message in chat input
3. Click "Send"
4. Verify: message flows through IPC → runtime → SDK → back to renderer

- [ ] **Step 6: Verify error recovery**

Test runtime crash recovery:
1. Kill the Utility Process manually: `kill <pid>` (find PID in console logs)
2. Verify: renderer shows error notification, runtime auto-restarts within 1s
3. Send a new message after restart — verify it works normally

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete integration verification

- All packages compile cleanly
- All tests pass
- Electron app launches with three-panel UI
- IPC flow verified end-to-end"
```

---

## Summary

| Task | What It Builds | Test Type |
|------|---------------|-----------|
| 1 | Project scaffolding | Build verification |
| 2 | IPC stream types | Type compilation |
| 3 | State delta types | Type compilation |
| 4 | Preload bridge | Type compilation |
| 5 | Main process routing | Manual integration |
| 6 | DecisionQueue + StateMachine | Unit tests (Vitest) |
| 7 | HookEngine + SessionManager | Unit tests (Vitest) |
| 8 | SDKService + AgentRuntime | Type compilation |
| 9 | Zustand stores | Type compilation |
| 10 | React hooks | Type compilation |
| 11 | UI layout + components | Visual verification |
| 12 | Integration verification | End-to-end |

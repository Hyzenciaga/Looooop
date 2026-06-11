# Claude Agent SDK - Developer Reference

> Extracted from `@anthropic-ai/claude-agent-sdk@0.3.173` type definitions.
> Full types: `docs/sdk-reference/sdk.d.ts` (6460 lines)

## Package Exports

```typescript
// Main entry — local query execution
import { query, ... } from '@anthropic-ai/claude-agent-sdk'

// Browser entry — SSE/WebSocket based query
import { query } from '@anthropic-ai/claude-agent-sdk/browser'

// Bridge — remote session management (claude.ai integration)
import { attachBridgeSession, createCodeSession, fetchRemoteCredentials } from '@anthropic-ai/claude-agent-sdk/bridge'

// Assistant — long-running worker for claude.ai
import { runAssistantWorker } from '@anthropic-ai/claude-agent-sdk/assistant'

// SDK Tools — MCP server creation
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'

// Extract — for bun compiled binaries
import { extractFromBunfs } from '@anthropic-ai/claude-agent-sdk/extract'
```

## Core API: `query()`

```typescript
function query(params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

### Query Interface

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  // Control
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
  applyFlagSettings(settings: Partial<Settings>): Promise<void>;

  // Introspection
  initializationResult(): Promise<SDKControlInitializeResponse>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  supportedAgents(): Promise<AgentInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;

  // Context
  contextWindowUsage(): Promise<ContextWindowUsage>;
  sessionInfo(): Promise<SDKSessionInfo>;
}
```

### Usage Pattern

```typescript
const q = query({
  prompt: 'Fix the bug in auth.ts',
  options: {
    cwd: '/path/to/project',
    model: 'claude-sonnet-4-6',
  },
});

for await (const message of q) {
  // message is SDKMessage — see Message Types below
  console.log(message.type);
}
```

### Streaming Input (multi-turn)

```typescript
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    message: { role: 'user', content: 'Hello' },
    parent_tool_use_id: null,
  };
  // ... more messages
}

const q = query({
  prompt: generateMessages(),
  options: { cwd: '/path/to/project' },
});
```

## Options (key fields)

```typescript
type Options = {
  // ─── Core ───
  cwd?: string;                          // Working directory (default: process.cwd())
  model?: string;                        // Model ID or alias
  fallbackModel?: string;                // Comma-separated fallback models
  abortController?: AbortController;     // Cancel the query

  // ─── Tools ───
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
  allowedTools?: string[];               // Auto-allow without prompting
  disallowedTools?: string[];            // Block entirely
  toolAliases?: Record<string, string>;  // Redirect tool names
  toolConfig?: ToolConfig;               // Per-tool config

  // ─── Permission ───
  permissionMode?: PermissionMode;       // 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'
  canUseTool?: CanUseTool;               // Permission callback (SEE BELOW)

  // ─── Agents ───
  agent?: string;                        // Main thread agent name
  agents?: Record<string, AgentDefinition>;

  // ─── Hooks ───
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  // ─── MCP ───
  mcpServers?: Record<string, McpServerConfig>;

  // ─── Session ───
  continue?: boolean;                    // Continue most recent session
  resume?: string;                       // Resume specific session ID
  forkSession?: boolean;                 // Fork on resume

  // ─── Env ───
  env?: Record<string, string | undefined>;  // REPLACES process.env entirely
  executable?: 'bun' | 'deno' | 'node';
  executableArgs?: string[];
  extraArgs?: Record<string, string | null>;

  // ─── Features ───
  enableFileCheckpointing?: boolean;
  betas?: SdkBeta[];
  fallbackModel?: string;

  // ─── Advanced ───
  additionalDirectories?: string[];
  enableFileCheckpointing?: boolean;
};
```

## Permission System: `canUseTool`

**THIS IS THE KEY CALLBACK FOR OUR PERMISSION FLOW.**

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
  }
) => Promise<PermissionResult>;

type PermissionResult = {
  behavior: 'allow' | 'deny';
  updatedPermissions?: PermissionUpdate[];
  message?: string;
};
```

### Example: Suspend for human approval

```typescript
const decisionQueue = new DecisionQueue();

const q = query({
  prompt: 'Delete the old migration files',
  options: {
    canUseTool: async (toolName, toolInput, { signal }) => {
      // Create a pending promise — generator pauses here
      const { requestId, promise } = decisionQueue.suspend(sessionId, toolName, toolInput);

      // Notify frontend
      emitPermissionRequest({ requestId, sessionId, toolName, toolInput });

      // Wait for frontend response
      const result = await promise;

      return {
        behavior: result.decision,
        updatedPermissions: result.decision === 'allow'
          ? [{ toolName, permission: 'allow' }]
          : undefined,
      };
    },
  },
});
```

## SDK Message Types

The `Query` yields `SDKMessage` — a union of ~30+ types. Key ones for our UI:

```typescript
type SDKMessage =
  | SDKAssistantMessage      // Model response (text, tool_use blocks)
  | SDKUserMessage           // User input
  | SDKResultMessage         // Query completed (success/error + cost/usage)
  | SDKSystemMessage         // System events
  | SDKStatusMessage         // Status updates (model, effort, etc.)
  | SDKToolProgressMessage   // Tool execution progress
  | SDKTaskNotificationMessage // Task created/completed
  | SDKTaskStartedMessage    // Subagent started
  | SDKTaskUpdatedMessage    // Task status changed
  | SDKPermissionDeniedMessage // Permission was denied
  | SDKElicitationCompleteMessage // Elicitation completed
  | SDKNotificationMessage   // General notifications
  | SDKThinkingTokensMessage // Thinking token usage
  | SDKRateLimitEvent        // Rate limit hit
  // ... and more
```

### SDKAssistantMessage (most important)

```typescript
type SDKAssistantMessage = {
  type: 'assistant';
  message: BetaMessage;          // Anthropic API message format
  parent_tool_use_id: string | null;
  error?: SDKAssistantMessageError;
  uuid: UUID;
  session_id: string;
  subagent_type?: string;
  task_description?: string;
};
```

The `message.content` array contains:
- `TextBlock` — model's text response
- `ToolUseBlock` — tool call (name, id, input)
- `ThinkingBlock` — model's thinking (if enabled)
- `ToolResultBlock` — tool result (in user messages)

### SDKResultMessage

```typescript
type SDKResultSuccess = {
  type: 'result';
  subtype: 'success';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;              // Final text result
  stop_reason: string | null;
  total_cost_usd: number;
  usage: NonNullableUsage;
  modelUsage: Record<string, ModelUsage>;
  uuid: UUID;
  session_id: string;
};

type SDKResultError = {
  type: 'result';
  subtype: 'error';
  error: string;
  is_error: true;
  uuid: UUID;
  session_id: string;
};
```

## Hook Events

```typescript
type HookEvent =
  | 'PreToolUse'        // Before tool execution
  | 'PostToolUse'       // After tool execution
  | 'PostToolUseFailure' // After tool execution failure
  | 'PostToolBatch'     // After batch of tools
  | 'Notification'      // General notification
  | 'UserPromptSubmit'  // User submitted prompt
  | 'SessionStart'      // Session started
  | 'SessionEnd'        // Session ended
  | 'Stop'              // Agent stopped
  | 'SubagentStart'     // Subagent started
  | 'SubagentStop'      // Subagent stopped
  | 'TaskCreated'       // Task created (TODO)
  | 'TaskCompleted'     // Task completed
  | 'Elicitation'       // Elicitation requested
  | 'ElicitationResult' // Elicitation resolved
  | 'ConfigChange'      // Settings changed
  | 'FileChanged'       // File modified
  | 'MessageDisplay'    // About to display message
  // ... and more
```

### Hook Callback Signature

```typescript
type HookCallback = (
  input: HookInput,              // Event-specific data
  toolUseID: string | undefined, // Tool use ID (for tool events)
  options: {
    signal: AbortSignal;
  }
) => Promise<HookJSONOutput> | HookJSONOutput;

// Return value controls behavior
type HookJSONOutput =
  | { continue: true }                           // Allow
  | { continue: false; stopReason: string }      // Block + reason
  | { decision: 'allow' | 'deny' | 'ask' }      // Permission decision
  | AsyncHookJSONOutput;                          // { async: true, asyncTimeout?: number }
```

### Hook Matcher

```typescript
interface HookCallbackMatcher {
  hooks: HookCallback[];
  matcher?: string | string[];  // Tool name pattern(s) to match
}
```

### Example: PreToolUse hook

```typescript
hooks: {
  PreToolUse: [{
    matcher: ['Bash', 'Write'],  // Only fire for these tools
    hooks: [async (input) => {
      console.log(`Tool: ${input.tool_name}`);
      return { continue: true };
    }],
  }],
}
```

## Agent Definition

```typescript
type AgentDefinition = {
  description: string;
  prompt: string;
  tools?: string[];            // Allowed tools (omit = inherit all)
  disallowedTools?: string[];
  model?: string;              // Model alias or ID
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  initialPrompt?: string;      // Auto-submitted as first user turn
  maxTurns?: number;
  background?: boolean;        // Fire-and-forget
  memory?: 'user' | 'project' | 'local';
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number;
  permissionMode?: PermissionMode;
};
```

## MCP Server Config

```typescript
type McpServerConfig =
  | McpStdioServerConfig    // Local process
  | McpSSEServerConfig      // SSE endpoint
  | McpHttpServerConfig     // HTTP endpoint
  | McpSdkServerConfigWithInstance;  // In-process SDK server

// Stdio (most common for local tools)
type McpStdioServerConfig = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

// SDK Server (in-process, created via createSdkMcpServer)
type McpSdkServerConfigWithInstance = {
  type: 'sdk';
  name: string;
  instance: McpServer;
};
```

### createSdkMcpServer

```typescript
function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: ZodRawShape;
    handler: (input: any, context: any) => Promise<any>;
  }>;
}): McpSdkServerConfigWithInstance;
```

## Session Management

```typescript
// List all sessions
function listSessions(options?: {
  dir?: string;
  limit?: number;
  offset?: number;
}): Promise<SDKSessionInfo[]>;

// Get session info
function getSessionInfo(sessionId: string, options?: {
  dir?: string;
}): Promise<SDKSessionInfo | undefined>;

// Get session messages
function getSessionMessages(sessionId: string, options?: {
  dir?: string;
  includeInternals?: boolean;
}): Promise<SessionMessage[]>;

// Fork session
function forkSession(sessionId: string, options?: {
  dir?: string;
  title?: string;
}): Promise<ForkSessionResult>;

// Delete session
function deleteSession(sessionId: string, options?: {
  dir?: string;
}): Promise<void>;

// Rename session
function renameSession(sessionId: string, title: string, options?: {
  dir?: string;
}): Promise<void>;
```

## Permission Modes

```typescript
type PermissionMode =
  | 'default'           // Normal — prompt for risky ops
  | 'acceptEdits'       // Auto-accept file edits, prompt for shell
  | 'bypassPermissions' // Allow everything (dangerous)
  | 'plan'              // Plan only, no execution
  | 'dontAsk'           // Deny anything that would prompt
  | 'auto';             // Smart auto-allow based on context
```

## Account Info

```typescript
type AccountInfo = {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
  apiProvider?: 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'anthropicAws' | 'mantle' | 'gateway';
};
```

## Effort Levels

```typescript
type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
```

## InMemorySessionStore

```typescript
class InMemorySessionStore implements SessionStore {
  constructor();
  // ... implements SessionStore interface
}
```

## Tool Config

```typescript
type ToolConfig = {
  askUserQuestion?: {
    previewFormat?: 'html' | 'markdown';
  };
};
```

---

## What We'll Actually Use

| SDK Feature | Our Usage |
|------------|-----------|
| `query({ prompt, options })` | Core — run agent queries |
| `Query.interrupt()` | Cancel button in UI |
| `Query.setModel()` | Model switcher in UI |
| `Query.supportedModels()` | Model dropdown population |
| `Query.supportedCommands()` | Skills/commands list |
| `Query.mcpServerStatus()` | MCP server status indicator |
| `Query.sessionInfo()` | Session metadata display |
| `options.canUseTool` | Permission suspension flow |
| `options.hooks` | State sync (TaskCreated, etc.) |
| `options.agents` | Custom agent definitions |
| `options.cwd` | Project directory binding |
| `options.model` | Model selection |
| `options.permissionMode` | Permission mode toggle |
| `listSessions()` | Left panel session list |
| `getSessionMessages()` | Load session history |
| `deleteSession()` | Session management |
| `renameSession()` | Session naming |

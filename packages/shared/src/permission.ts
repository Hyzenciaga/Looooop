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

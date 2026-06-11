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

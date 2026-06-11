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

            if (result.decision === 'allow') {
              return { behavior: 'allow' as const }
            }
            return {
              behavior: 'deny' as const,
              message: 'Permission denied by user',
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

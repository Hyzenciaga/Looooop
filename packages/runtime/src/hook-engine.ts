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

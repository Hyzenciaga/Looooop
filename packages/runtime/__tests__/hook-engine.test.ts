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

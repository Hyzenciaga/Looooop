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

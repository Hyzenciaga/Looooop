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
      decision.resolve({ requestId: decision.id, decision: 'deny' })
    }
    this.pending.clear()
  }
}

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

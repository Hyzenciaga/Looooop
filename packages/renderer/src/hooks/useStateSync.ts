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

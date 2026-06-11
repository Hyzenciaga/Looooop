import { create } from 'zustand'
import type { SessionState, MessageSummary } from '../../../shared/src/state-delta'

interface SessionStore {
  sessions: Record<string, SessionState>
  activeSessionId: string | null

  // Actions (called by useStateSync hook)
  setSessions: (sessions: Record<string, SessionState>) => void
  initSession: (sessionId: string) => void
  updateStatus: (sessionId: string, status: SessionState['status']) => void
  appendMessage: (sessionId: string, summary: MessageSummary) => void
  setActiveSession: (sessionId: string) => void
  updateCost: (sessionId: string, costUsd: number) => void
  updateTitle: (sessionId: string, title: string) => void
  addStream: (sessionId: string, streamId: string) => void
  removeStream: (sessionId: string, streamId: string) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: {},
  activeSessionId: null,

  setSessions: (sessions) => set({ sessions }),

  initSession: (sessionId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          id: sessionId,
          status: 'idle',
          messages: [],
          activeStreamIds: [],
          costUsd: 0,
          projectPath: '',
          lastActivity: Date.now(),
        },
      },
    })),

  updateStatus: (sessionId, status) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          status,
        },
      },
    })),

  appendMessage: (sessionId, summary) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          messages: [...(state.sessions[sessionId]?.messages ?? []), summary],
        },
      },
    })),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  updateCost: (sessionId, costUsd) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          costUsd,
        },
      },
    })),

  updateTitle: (sessionId, title) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          title,
        },
      },
    })),

  addStream: (sessionId, streamId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          activeStreamIds: [
            ...(state.sessions[sessionId]?.activeStreamIds ?? []),
            streamId,
          ],
        },
      },
    })),

  removeStream: (sessionId, streamId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          activeStreamIds: (
            state.sessions[sessionId]?.activeStreamIds ?? []
          ).filter((id) => id !== streamId),
        },
      },
    })),
}))

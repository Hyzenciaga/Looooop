import { create } from 'zustand'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { StreamFrame } from '../../../shared/src/ipc-stream'

interface StreamEntry {
  streamId: string
  sessionId: string
  messages: SDKMessage[]
  status: 'streaming' | 'done' | 'error'
  error?: StreamFrame['error']
}

interface StreamStore {
  streams: Record<string, StreamEntry>

  addChunk: (frame: StreamFrame<SDKMessage>) => void
  markDone: (streamId: string) => void
  markError: (streamId: string, error: StreamFrame['error']) => void
  removeStream: (streamId: string) => void
  clear: () => void
}

export const useStreamStore = create<StreamStore>((set) => ({
  streams: {},

  addChunk: (frame) =>
    set((state) => {
      const existing = state.streams[frame.streamId]
      if (!existing) {
        return {
          streams: {
            ...state.streams,
            [frame.streamId]: {
              streamId: frame.streamId,
              sessionId: frame.sessionId,
              messages: frame.data ? [frame.data] : [],
              status: 'streaming',
            },
          },
        }
      }
      return {
        streams: {
          ...state.streams,
          [frame.streamId]: {
            ...existing,
            messages: frame.data
              ? [...existing.messages, frame.data]
              : existing.messages,
          },
        },
      }
    }),

  markDone: (streamId) =>
    set((state) => ({
      streams: {
        ...state.streams,
        [streamId]: {
          ...state.streams[streamId],
          status: 'done',
        },
      },
    })),

  markError: (streamId, error) =>
    set((state) => ({
      streams: {
        ...state.streams,
        [streamId]: {
          ...state.streams[streamId],
          status: 'error',
          error,
        },
      },
    })),

  removeStream: (streamId) =>
    set((state) => {
      const { [streamId]: _, ...rest } = state.streams
      return { streams: rest }
    }),

  clear: () => set({ streams: {} }),
}))

import { useCallback, useEffect, useMemo } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useStreamStore } from '../stores/stream-store'
import type { StreamCommand, StreamFrame } from '../../../shared/src/ipc-stream'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

/**
 * Hook for sending prompts and consuming stream frames.
 * Wraps the preload API into a React-friendly interface.
 */
export function useAgentStream(sessionId: string) {
  const session = useSessionStore((s) => s.sessions[sessionId])

  // Narrow selector: only subscribe to streams for this session
  const sessionStreams = useStreamStore(
    useCallback(
      (s) =>
        Object.values(s.streams).filter((st) => st.sessionId === sessionId),
      [sessionId]
    )
  )
  const messages = useMemo(
    () => sessionStreams.flatMap((s) => s.messages),
    [sessionStreams]
  )

  const status: 'idle' | 'streaming' | 'done' | 'error' =
    session?.status === 'running'
      ? 'streaming'
      : session?.status === 'error'
        ? 'error'
        : (session?.activeStreamIds?.length ?? 0) > 0
          ? 'streaming'
          : 'idle'

  const send = useCallback(
    (prompt: string) => {
      const streamId = crypto.randomUUID()

      const command: StreamCommand = {
        streamId,
        sessionId,
        kind: 'start',
        payload: { prompt },
      }

      window.api.sendCommand(command)
    },
    [sessionId]
  )

  // Read activeStreamIds from store at call-time to avoid unstable dependency
  const cancel = useCallback(() => {
    const ids =
      useSessionStore.getState().sessions[sessionId]?.activeStreamIds
    if (ids?.length) {
      for (const streamId of ids) {
        window.api.sendCommand({ streamId, sessionId, kind: 'cancel' })
      }
    } else {
      window.api.sendCommand({ streamId: '*', sessionId, kind: 'cancel' })
    }
  }, [sessionId])

  return { messages, status, send, cancel }
}

/**
 * Hook that subscribes to stream frames and routes them to the store.
 * Call once in App.tsx (not per-component).
 */
export function useStreamSubscription() {
  const addChunk = useStreamStore((s) => s.addChunk)
  const markDone = useStreamStore((s) => s.markDone)
  const markError = useStreamStore((s) => s.markError)

  useEffect(() => {
    const unsubscribe = window.api.onStreamFrame((frame: StreamFrame) => {
      switch (frame.kind) {
        case 'chunk':
          if (frame.data) addChunk(frame as StreamFrame<SDKMessage>)
          break
        case 'done':
          markDone(frame.streamId)
          break
        case 'error':
          markError(frame.streamId, frame.error)
          break
      }
    })
    return unsubscribe
  }, [addChunk, markDone, markError])
}

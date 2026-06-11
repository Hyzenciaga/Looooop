import { useCallback, useEffect } from 'react'
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
  const streams = useStreamStore((s) => s.streams)
  const addChunk = useStreamStore((s) => s.addChunk)
  const markDone = useStreamStore((s) => s.markDone)
  const markError = useStreamStore((s) => s.markError)

  // Collect messages from all active streams for this session
  const messages = Object.values(streams)
    .filter((s) => s.sessionId === sessionId)
    .flatMap((s) => s.messages)

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

  const cancel = useCallback(() => {
    if (session?.activeStreamIds) {
      for (const streamId of session.activeStreamIds) {
        window.api.sendCommand({
          streamId,
          sessionId,
          kind: 'cancel',
        })
      }
    } else {
      window.api.sendCommand({
        streamId: '*',
        sessionId,
        kind: 'cancel',
      })
    }
  }, [sessionId, session?.activeStreamIds])

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
          addChunk(frame as StreamFrame<SDKMessage>)
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

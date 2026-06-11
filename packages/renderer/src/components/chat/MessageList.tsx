import { useStreamStore } from '../../stores/stream-store'
import { useSessionStore } from '../../stores/session-store'

export function MessageList({ sessionId }: { sessionId: string }) {
  const session = useSessionStore((s) => s.sessions[sessionId])
  const streams = useStreamStore((s) => s.streams)

  // Get messages from active streams for this session
  const activeMessages = Object.values(streams)
    .filter((s) => s.sessionId === sessionId)
    .flatMap((s) => s.messages)

  const sessionMessages = session?.messages ?? []

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Historical messages */}
      {sessionMessages.map((msg) => (
        <div key={msg.uuid} className="message-summary">
          <div className="text-xs text-text-secondary mb-1 capitalize">
            {msg.type}
          </div>
          <div className="text-sm text-text-primary">{msg.preview}</div>
        </div>
      ))}

      {/* Streaming messages */}
      {activeMessages.map((msg, i) => (
        <div key={`stream-${i}`} className="streaming-message">
          <div className="text-xs text-text-secondary mb-1">
            {msg.type}
          </div>
          <div className="text-sm text-text-primary">
            {'content' in msg && Array.isArray(msg.content)
              ? msg.content.map((block: { type: string; text?: string }, j: number) => (
                  <span key={j}>
                    {block.type === 'text' ? block.text : `[${block.type}]`}
                  </span>
                ))
              : JSON.stringify(msg)}
          </div>
        </div>
      ))}

      {activeMessages.length === 0 && sessionMessages.length === 0 && (
        <div className="text-text-secondary text-center py-20">
          Send a message to start the conversation
        </div>
      )}
    </div>
  )
}

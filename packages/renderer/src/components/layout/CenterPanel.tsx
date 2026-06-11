import { useSessionStore } from '../../stores/session-store'
import { ChatInput } from '../chat/ChatInput'
import { MessageList } from '../chat/MessageList'

export function CenterPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Looooop
          </h1>
          <p className="text-text-secondary">
            Start a new session to begin coding with Claude
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <MessageList sessionId={activeSessionId} />
      <ChatInput sessionId={activeSessionId} />
    </div>
  )
}

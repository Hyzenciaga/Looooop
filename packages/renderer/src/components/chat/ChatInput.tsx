import { useState, useCallback } from 'react'
import { useAgentStream } from '../../hooks/useAgentStream'

export function ChatInput({ sessionId }: { sessionId: string }) {
  const [input, setInput] = useState('')
  const { send, cancel, status } = useAgentStream(sessionId)
  const isActive = status === 'streaming'

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return
    send(input.trim())
    setInput('')
  }, [input, send])

  return (
    <div className="p-4 border-t border-border">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Ask Claude anything..."
          className="flex-1 bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          rows={3}
        />
        {isActive ? (
          <button
            onClick={cancel}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors self-end"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors self-end disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

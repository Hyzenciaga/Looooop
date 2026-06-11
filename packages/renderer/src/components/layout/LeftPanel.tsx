import { useSessionStore } from '../../stores/session-store'

export function LeftPanel() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const initSession = useSessionStore((s) => s.initSession)

  const sessionList = Object.values(sessions).sort(
    (a, b) => b.lastActivity - a.lastActivity
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Sessions
        </h2>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {sessionList.length === 0 ? (
          <div className="p-4 text-text-secondary text-sm">
            No sessions yet. Start a conversation to begin.
          </div>
        ) : (
          sessionList.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              className={`w-full p-3 text-left hover:bg-bg-tertiary transition-colors ${
                activeSessionId === session.id ? 'bg-bg-tertiary' : ''
              }`}
            >
              <div className="text-sm font-medium text-text-primary truncate">
                {session.title ?? session.id}
              </div>
              <div className="text-xs text-text-secondary mt-1 flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    session.status === 'running'
                      ? 'bg-green-500'
                      : session.status === 'waiting_permission'
                        ? 'bg-yellow-500'
                        : session.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-gray-500'
                  }`}
                />
                <span className="capitalize">{session.status}</span>
                {session.costUsd > 0 && (
                  <span>${session.costUsd.toFixed(4)}</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* New Session Button */}
      <div className="p-3 border-t border-border">
        <button
          onClick={() => {
            const id = crypto.randomUUID()
            initSession(id)
            setActiveSession(id)
          }}
          className="w-full py-2 px-3 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          New Session
        </button>
      </div>
    </div>
  )
}

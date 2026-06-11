import { useTodoStore } from '../../stores/todo-store'

export function RightPanel() {
  const session = useTodoStore((s) => s.session)
  const project = useTodoStore((s) => s.project)
  const activeScope = useTodoStore((s) => s.activeScope)
  const setActiveScope = useTodoStore((s) => s.setActiveScope)

  const items = activeScope === 'session' ? session : project

  return (
    <div className="h-full flex flex-col">
      {/* Header with scope toggle */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveScope('session')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              activeScope === 'session'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-bg-tertiary'
            }`}
          >
            Session
          </button>
          <button
            onClick={() => setActiveScope('project')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              activeScope === 'project'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-bg-tertiary'
            }`}
          >
            Project
          </button>
        </div>
      </div>

      {/* Todo List */}
      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="text-text-secondary text-sm p-2">
            No {activeScope} tasks yet.
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-bg-tertiary"
              >
                <span
                  className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${
                    item.status === 'completed'
                      ? 'bg-green-500'
                      : item.status === 'in_progress'
                        ? 'bg-yellow-500'
                        : item.status === 'blocked'
                          ? 'bg-red-500'
                          : 'bg-gray-600'
                  }`}
                />
                <span
                  className={`text-sm ${
                    item.status === 'completed'
                      ? 'line-through text-text-secondary'
                      : 'text-text-primary'
                  }`}
                >
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

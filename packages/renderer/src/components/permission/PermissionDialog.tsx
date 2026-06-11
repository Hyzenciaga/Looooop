import { usePermission } from '../../hooks/usePermission'

export function PermissionDialog() {
  const { pending, respond } = usePermission()

  if (pending.length === 0) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-secondary rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Permission Required
        </h3>

        {pending.map((request) => (
          <div key={request.requestId} className="mb-4">
            <div className="text-sm text-text-secondary mb-2">
              Claude wants to use <strong>{request.toolName}</strong>
            </div>
            <pre className="bg-bg-tertiary rounded-md p-3 text-xs text-text-primary overflow-x-auto">
              {JSON.stringify(request.toolInput, null, 2)}
            </pre>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => respond(request.requestId, 'allow')}
                className="flex-1 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90"
              >
                Allow
              </button>
              <button
                onClick={() => respond(request.requestId, 'deny')}
                className="flex-1 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useCallback } from 'react'
import { usePermissionStore } from '../stores/permission-store'
import type { PermissionRequest } from '../../../shared/src/permission'

/**
 * Subscribes to permission requests and provides a respond function.
 */
export function usePermission() {
  const pending = usePermissionStore((s) => s.pending)
  const addRequest = usePermissionStore((s) => s.addRequest)
  const removeRequest = usePermissionStore((s) => s.removeRequest)

  // Subscribe to permission requests
  useEffect(() => {
    const unsubscribe = window.api.onPermissionRequest(
      (request: PermissionRequest) => {
        addRequest(request)
      }
    )
    return unsubscribe
  }, [addRequest])

  const respond = useCallback(
    (requestId: string, decision: 'allow' | 'deny') => {
      window.api.sendPermissionResponse({ requestId, decision })
      removeRequest(requestId)
    },
    [removeRequest]
  )

  return { pending, respond }
}

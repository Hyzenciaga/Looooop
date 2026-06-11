import { AppShell } from './components/layout/AppShell'
import { useStateSync } from './hooks/useStateSync'
import { useStreamSubscription } from './hooks/useAgentStream'
import { PermissionDialog } from './components/permission/PermissionDialog'

export function App() {
  // Wire up state synchronization
  useStateSync()
  useStreamSubscription()

  return (
    <>
      <AppShell />
      <PermissionDialog />
    </>
  )
}

import { LeftPanel } from './LeftPanel'
import { CenterPanel } from './CenterPanel'
import { RightPanel } from './RightPanel'

export function AppShell() {
  return (
    <div className="h-screen flex bg-bg-primary">
      {/* Left Panel - Project/Session History */}
      <aside className="w-[280px] border-r border-border flex-shrink-0">
        <LeftPanel />
      </aside>

      {/* Center Panel - Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <CenterPanel />
      </main>

      {/* Right Panel - Todos */}
      <aside className="w-[320px] border-l border-border flex-shrink-0">
        <RightPanel />
      </aside>
    </div>
  )
}

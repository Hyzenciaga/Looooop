import { ipcMain, BrowserWindow } from 'electron'
import type { UtilityProcess } from 'electron'
import type {
  StreamFrame,
  StreamCommand,
  StateDelta,
  PermissionRequest,
  PermissionDecision,
} from '../../shared/src'
import { IPC_CHANNELS } from '../../shared/src/constants'
import { onRuntimeMessage } from './runtime'

/**
 * Pure router: IPC ↔ Utility Process message bridge.
 * Holds zero state. Forwards messages in both directions.
 *
 * Uses a getter function for the runtime reference so that after a crash
 * recovery the router always talks to the live process.
 */
export function setupRouter(
  mainWindow: BrowserWindow,
  getRuntime: () => UtilityProcess | null
): void {
  // ─── Renderer → Runtime ───
  ipcMain.on(IPC_CHANNELS.AGENT_COMMAND, (_event, command: StreamCommand) => {
    const runtime = getRuntime()
    if (runtime) {
      runtime.postMessage({ type: 'command', payload: command })
    }
  })

  ipcMain.on(
    IPC_CHANNELS.PERMISSION_RESPONSE,
    (_event, decision: PermissionDecision) => {
      const runtime = getRuntime()
      if (runtime) {
        runtime.postMessage({
          type: 'permission-response',
          payload: decision,
        })
      }
    }
  )

  // ─── Runtime → Renderer ───
  // Use the runtime module's message callback so the listener survives restarts.
  onRuntimeMessage((msg: { type: string; payload: unknown }) => {
    if (!mainWindow.isDestroyed()) {
      switch (msg.type) {
        case 'stream-frame':
          mainWindow.webContents.send(
            IPC_CHANNELS.AGENT_STREAM,
            msg.payload as StreamFrame
          )
          break
        case 'state-delta':
          mainWindow.webContents.send(
            IPC_CHANNELS.STATE_DELTA,
            msg.payload as StateDelta
          )
          break
        case 'permission-request':
          mainWindow.webContents.send(
            IPC_CHANNELS.PERMISSION_REQUEST,
            msg.payload as PermissionRequest
          )
          break
      }
    }
  })
}

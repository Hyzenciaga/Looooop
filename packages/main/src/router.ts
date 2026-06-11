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

/**
 * Pure router: IPC ↔ Utility Process message bridge.
 * Holds zero state. Forwards messages in both directions.
 */
export function setupRouter(
  mainWindow: BrowserWindow,
  runtimeProcess: UtilityProcess
): void {
  // ─── Renderer → Runtime ───
  ipcMain.on(IPC_CHANNELS.AGENT_COMMAND, (_event, command: StreamCommand) => {
    runtimeProcess.postMessage({ type: 'command', payload: command })
  })

  ipcMain.on(
    IPC_CHANNELS.PERMISSION_RESPONSE,
    (_event, decision: PermissionDecision) => {
      runtimeProcess.postMessage({
        type: 'permission-response',
        payload: decision,
      })
    }
  )

  // ─── Runtime → Renderer ───
  runtimeProcess.on('message', (msg: { type: string; payload: unknown }) => {
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

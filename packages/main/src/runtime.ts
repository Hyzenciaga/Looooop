import { utilityProcess, BrowserWindow } from 'electron'
import { join } from 'path'
import type { UtilityProcess } from 'electron'
import { IPC_CHANNELS } from '../../shared/src/constants'

let runtimeProcess: UtilityProcess | null = null
let restartCount = 0
let onMessageCallback: ((msg: { type: string; payload: unknown }) => void) | null = null

/**
 * Register a callback to receive messages from the runtime process.
 * The callback is automatically wired to whatever runtime instance is active.
 */
export function onRuntimeMessage(cb: (msg: { type: string; payload: unknown }) => void): void {
  onMessageCallback = cb
}

export function spawnRuntime(): UtilityProcess {
  const scriptPath = join(__dirname, '../runtime/entry.js')

  runtimeProcess = utilityProcess.fork(scriptPath, [], {
    serviceName: 'looooop-runtime',
    stdio: 'pipe',
  })

  runtimeProcess.stdout?.on('data', (data) => {
    console.log(`[runtime] ${data.toString().trim()}`)
  })

  runtimeProcess.stderr?.on('data', (data) => {
    console.error(`[runtime] ${data.toString().trim()}`)
  })

  runtimeProcess.on('spawn', () => {
    // Reset restart count after stable uptime instead of on spawn,
    // so a rapidly crashing process still hits the retry cap.
    setTimeout(() => { restartCount = 0 }, 30_000)
  })

  // Wire up message forwarding to the registered callback
  runtimeProcess.on('message', (msg: { type: string; payload: unknown }) => {
    onMessageCallback?.(msg)
  })

  runtimeProcess.on('exit', (code) => {
    console.warn(`[runtime] exited with code ${code}`)

    // Notify renderer that runtime crashed
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.AGENT_STREAM, {
        streamId: 'system',
        sessionId: '*',
        kind: 'error',
        error: {
          code: 'RUNTIME_EXIT',
          message: `Runtime process exited with code ${code}`,
          recoverable: true,
        },
      })
    }

    // Auto-restart after a short delay (up to 3 retries)
    if (restartCount < 3) {
      restartCount++
      console.log(`[runtime] restarting (attempt ${restartCount}/3)...`)
      setTimeout(() => spawnRuntime(), 1000)
    }
  })

  return runtimeProcess
}

export function getRuntimeProcess(): UtilityProcess | null {
  return runtimeProcess
}

export function killRuntime(): void {
  if (runtimeProcess) {
    runtimeProcess.kill()
    runtimeProcess = null
  }
}

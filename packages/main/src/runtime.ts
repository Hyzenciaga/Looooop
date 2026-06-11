import { utilityProcess, BrowserWindow } from 'electron'
import { join } from 'path'
import type { UtilityProcess } from 'electron'

let runtimeProcess: UtilityProcess | null = null
let restartCount = 0

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
    restartCount = 0
  })

  runtimeProcess.on('exit', (code) => {
    console.warn(`[runtime] exited with code ${code}`)

    // Notify renderer that runtime crashed
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('agent:stream:frame', {
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

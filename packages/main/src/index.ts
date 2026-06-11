import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { spawnRuntime, killRuntime, getRuntimeProcess } from './runtime'
import { setupRouter } from './router'

app.whenReady().then(() => {
  const mainWindow = createMainWindow()
  spawnRuntime()

  setupRouter(mainWindow, getRuntimeProcess)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createMainWindow()
      // Re-spawn runtime if it was killed (e.g. after all windows closed on macOS)
      if (!getRuntimeProcess()) {
        spawnRuntime()
      }
      setupRouter(win, getRuntimeProcess)
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep runtime alive so the activate handler can reuse it
  if (process.platform !== 'darwin') {
    killRuntime()
    app.quit()
  }
})

app.on('before-quit', () => {
  killRuntime()
})

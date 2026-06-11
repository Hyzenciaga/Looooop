import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { spawnRuntime, killRuntime } from './runtime'
import { setupRouter } from './router'

app.whenReady().then(() => {
  const mainWindow = createMainWindow()
  const runtimeProcess = spawnRuntime()

  setupRouter(mainWindow, runtimeProcess)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  killRuntime()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killRuntime()
})

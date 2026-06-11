import { ipcRenderer, contextBridge } from 'electron'
import type {
  StreamFrame,
  StreamCommand,
  StateDelta,
  PermissionRequest,
  PermissionDecision,
} from '../../shared/src'
import { IPC_CHANNELS } from '../../shared/src/constants'

export interface LooooopAPI {
  // ─── Stream ───
  sendCommand: (command: StreamCommand) => void
  onStreamFrame: (callback: (frame: StreamFrame) => void) => () => void

  // ─── State ───
  onStateDelta: (callback: (delta: StateDelta) => void) => () => void

  // ─── Permission ───
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void
  sendPermissionResponse: (decision: PermissionDecision) => void
}

const api: LooooopAPI = {
  // ─── Stream ───
  sendCommand: (command) => {
    ipcRenderer.send(IPC_CHANNELS.AGENT_COMMAND, command)
  },

  onStreamFrame: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: StreamFrame) => {
      callback(frame)
    }
    ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.AGENT_STREAM, handler)
    }
  },

  // ─── State ───
  onStateDelta: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: StateDelta) => {
      callback(delta)
    }
    ipcRenderer.on(IPC_CHANNELS.STATE_DELTA, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.STATE_DELTA, handler)
    }
  },

  // ─── Permission ───
  onPermissionRequest: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, request: PermissionRequest) => {
      callback(request)
    }
    ipcRenderer.on(IPC_CHANNELS.PERMISSION_REQUEST, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.PERMISSION_REQUEST, handler)
    }
  },

  sendPermissionResponse: (decision) => {
    ipcRenderer.send(IPC_CHANNELS.PERMISSION_RESPONSE, decision)
  },
}

contextBridge.exposeInMainWorld('api', api)

import type { StreamFrame, StateDelta, PermissionRequest } from '../../shared/src'

/**
 * Abstraction over the Electron Utility Process message port.
 * In a UtilityProcess, the parent port is process.parentPort (not worker_threads).
 * See: https://www.electronjs.org/docs/latest/api/utility-process
 */
export class IPCBridge {
  constructor() {
    if (!process.parentPort) {
      throw new Error('IPCBridge must run inside a Utility Process')
    }
  }

  sendStreamFrame(frame: StreamFrame): void {
    process.parentPort?.postMessage({ type: 'stream-frame', payload: frame })
  }

  sendStateDelta(delta: StateDelta): void {
    process.parentPort?.postMessage({ type: 'state-delta', payload: delta })
  }

  sendPermissionRequest(request: PermissionRequest): void {
    process.parentPort?.postMessage({
      type: 'permission-request',
      payload: request,
    })
  }

  onMessage(callback: (msg: { type: string; payload: unknown }) => void): void {
    process.parentPort?.on('message', callback)
  }
}

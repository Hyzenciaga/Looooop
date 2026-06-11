export const APP_NAME = 'Looooop'
export const APP_VERSION = '0.1.0'

export const IPC_CHANNELS = {
  /** Runtime → Renderer: SDK stream frames */
  AGENT_STREAM: 'agent:stream:frame',
  /** Renderer → Runtime: control commands */
  AGENT_COMMAND: 'agent:command',
  /** Runtime → Renderer: state delta events */
  STATE_DELTA: 'state:delta',
  /** Runtime → Renderer: permission request (suspension) */
  PERMISSION_REQUEST: 'permission:request',
  /** Renderer → Runtime: permission response */
  PERMISSION_RESPONSE: 'permission:response',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

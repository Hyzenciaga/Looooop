import type { LooooopAPI } from '../../preload/src/api'

declare global {
  interface Window {
    api: LooooopAPI
  }
}

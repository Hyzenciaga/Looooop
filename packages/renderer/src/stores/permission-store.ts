import { create } from 'zustand'
import type { PermissionRequest } from '../../../shared/src/permission'

interface PermissionStore {
  pending: PermissionRequest[]

  addRequest: (request: PermissionRequest) => void
  removeRequest: (requestId: string) => void
  clear: () => void
}

export const usePermissionStore = create<PermissionStore>((set) => ({
  pending: [],

  addRequest: (request) =>
    set((state) => ({
      pending: [...state.pending, request],
    })),

  removeRequest: (requestId) =>
    set((state) => ({
      pending: state.pending.filter((r) => r.requestId !== requestId),
    })),

  clear: () => set({ pending: [] }),
}))

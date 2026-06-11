import { create } from 'zustand'
import type { TodoItem } from '../../../shared/src/state-delta'

interface TodoStore {
  session: TodoItem[]
  project: TodoItem[]
  activeScope: 'session' | 'project'

  setActiveScope: (scope: 'session' | 'project') => void
  addItem: (scope: 'session' | 'project', item: TodoItem) => void
  updateItem: (
    scope: 'session' | 'project',
    id: string,
    patch: Partial<Pick<TodoItem, 'title' | 'status' | 'children'>>
  ) => void
  deleteItem: (scope: 'session' | 'project', id: string) => void
  setItems: (scope: 'session' | 'project', items: TodoItem[]) => void
  clearSession: () => void
}

export const useTodoStore = create<TodoStore>((set) => ({
  session: [],
  project: [],
  activeScope: 'session',

  setActiveScope: (scope) => set({ activeScope: scope }),

  addItem: (scope, item) =>
    set((state) => ({
      [scope]: [...state[scope], item],
    })),

  updateItem: (scope, id, patch) =>
    set((state) => ({
      [scope]: state[scope].map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    })),

  deleteItem: (scope, id) =>
    set((state) => ({
      [scope]: state[scope].filter((item) => item.id !== id),
    })),

  setItems: (scope, items) => set({ [scope]: items }),

  clearSession: () => set({ session: [] }),
}))

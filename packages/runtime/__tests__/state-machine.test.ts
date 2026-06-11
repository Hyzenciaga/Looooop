import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StateMachine } from '../src/state-machine'
import type { StateDelta } from '../../shared/src/state-delta'

describe('StateMachine', () => {
  let machine: StateMachine
  let emittedDeltas: StateDelta[]

  beforeEach(() => {
    machine = new StateMachine()
    emittedDeltas = []
    machine.onDelta = (delta) => emittedDeltas.push(delta)
  })

  describe('session management', () => {
    it('initSession creates a new session and emits SESSION_STATUS', () => {
      machine.initSession('s1', '/project')

      expect(machine.getState().sessions['s1']).toBeDefined()
      expect(machine.getState().sessions['s1'].status).toBe('idle')
      expect(emittedDeltas).toHaveLength(1)
      expect(emittedDeltas[0]).toEqual({
        type: 'SESSION_STATUS',
        sessionId: 's1',
        status: 'idle',
      })
    })

    it('updateStatus changes session status and emits delta', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.updateStatus('s1', 'running')

      expect(machine.getState().sessions['s1'].status).toBe('running')
      expect(emittedDeltas[0]).toEqual({
        type: 'SESSION_STATUS',
        sessionId: 's1',
        status: 'running',
      })
    })

    it('updateStatus on nonexistent session is a no-op', () => {
      machine.updateStatus('nonexistent', 'running')
      expect(emittedDeltas).toHaveLength(0)
    })
  })

  describe('message tracking', () => {
    it('appendMessage adds summary and emits MESSAGE_APPENDED', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.appendMessage('s1', {
        uuid: 'msg-1',
        type: 'assistant',
        preview: 'Hello world',
        timestamp: Date.now(),
      })

      expect(machine.getState().sessions['s1'].messages).toHaveLength(1)
      expect(emittedDeltas[0].type).toBe('MESSAGE_APPENDED')
    })
  })

  describe('stream tracking', () => {
    it('addStream adds to activeStreamIds and emits STREAM_STARTED', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.addStream('s1', 'stream-1')

      expect(machine.getState().sessions['s1'].activeStreamIds).toContain(
        'stream-1'
      )
      expect(emittedDeltas[0]).toEqual({
        type: 'STREAM_STARTED',
        sessionId: 's1',
        streamId: 'stream-1',
      })
    })

    it('removeStream removes from activeStreamIds and emits STREAM_ENDED', () => {
      machine.initSession('s1', '/project')
      machine.addStream('s1', 'stream-1')
      emittedDeltas.length = 0

      machine.removeStream('s1', 'stream-1')

      expect(
        machine.getState().sessions['s1'].activeStreamIds
      ).not.toContain('stream-1')
      expect(emittedDeltas[0]).toEqual({
        type: 'STREAM_ENDED',
        sessionId: 's1',
        streamId: 'stream-1',
      })
    })
  })

  describe('todo management', () => {
    it('createTodo emits TODO_CREATED with correct scope', () => {
      const item = machine.createTodo('session', {
        title: 'Fix bug',
        sessionId: 's1',
      })

      expect(item.title).toBe('Fix bug')
      expect(item.status).toBe('pending')
      expect(emittedDeltas[0]).toMatchObject({
        type: 'TODO_CREATED',
        scope: 'session',
      })
    })

    it('updateTodo emits TODO_UPDATED with patch', () => {
      const item = machine.createTodo('project', { title: 'Task' })
      emittedDeltas.length = 0

      machine.updateTodo('project', item.id, { status: 'completed' })

      expect(emittedDeltas[0]).toEqual({
        type: 'TODO_UPDATED',
        scope: 'project',
        id: item.id,
        patch: { status: 'completed' },
      })
    })

    it('deleteTodo removes item and emits TODO_DELETED', () => {
      const item = machine.createTodo('session', { title: 'Task' })
      emittedDeltas.length = 0

      machine.deleteTodo('session', item.id)

      expect(emittedDeltas[0]).toEqual({
        type: 'TODO_DELETED',
        scope: 'session',
        id: item.id,
      })
    })
  })

  describe('cost tracking', () => {
    it('updateCost emits COST_UPDATED delta', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      machine.updateCost('s1', 0.05)

      expect(machine.getState().sessions['s1'].costUsd).toBe(0.05)
      expect(emittedDeltas[0]).toEqual({
        type: 'COST_UPDATED',
        sessionId: 's1',
        costUsd: 0.05,
      })
    })
  })

  describe('full sync', () => {
    it('getFullSync returns FULL_SYNC delta with complete state', () => {
      machine.initSession('s1', '/project')
      emittedDeltas.length = 0

      const sync = machine.getFullSync()

      expect(sync.type).toBe('FULL_SYNC')
      expect(sync.state.sessions['s1']).toBeDefined()
    })
  })
})

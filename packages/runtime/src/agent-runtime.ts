import type { StreamFrame } from '../../shared/src/ipc-stream'
import type { PermissionDecision } from '../../shared/src/permission'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { DecisionQueue } from './decision-queue'
import { StateMachine } from './state-machine'
import { HookEngine } from './hook-engine'
import { SDKService } from './sdk-service'
import { SessionManager } from './session-manager'
import { IPCBridge } from './ipc-bridge'

/**
 * Top-level orchestrator for the Utility Process.
 * Wires all modules together and handles IPC messages.
 */
export class AgentRuntime {
  private decisionQueue: DecisionQueue
  private stateMachine: StateMachine
  private hookEngine: HookEngine
  private sdkService: SDKService
  private sessionManager: SessionManager
  private ipcBridge: IPCBridge

  constructor() {
    this.decisionQueue = new DecisionQueue()
    this.stateMachine = new StateMachine()
    this.hookEngine = new HookEngine(this.stateMachine)
    this.sdkService = new SDKService({
      decisionQueue: this.decisionQueue,
      stateMachine: this.stateMachine,
      hookEngine: this.hookEngine,
    })
    this.sessionManager = new SessionManager()
    this.ipcBridge = new IPCBridge()

    // Wire state deltas to IPC
    this.stateMachine.onDelta = (delta) => {
      this.ipcBridge.sendStateDelta(delta)
    }

    // Listen for commands from main process
    this.ipcBridge.onMessage(async (msg) => {
      switch (msg.type) {
        case 'command':
          await this.handleCommand(
            msg.payload as {
              sessionId: string
              kind: string
              payload?: { prompt?: string }
            }
          )
          break
        case 'permission-response':
          this.handlePermissionResponse(
            msg.payload as PermissionDecision
          )
          break
      }
    })

    // Send initial full sync
    this.ipcBridge.sendStateDelta(this.stateMachine.getFullSync())
  }

  private async handleCommand(command: {
    sessionId: string
    kind: string
    payload?: { prompt?: string }
  }): Promise<void> {
    switch (command.kind) {
      case 'start': {
        if (!command.payload?.prompt) return

        // Initialize session if needed
        if (!this.stateMachine.getState().sessions[command.sessionId]) {
          this.stateMachine.initSession(command.sessionId, process.cwd())
        }

        const options: Partial<Options> = {
          cwd: this.stateMachine.getState().sessions[command.sessionId]
            .projectPath,
        }

        await this.sdkService.runQuery(
          command.sessionId,
          command.payload.prompt,
          options,
          (frame) => this.ipcBridge.sendStreamFrame(frame)
        )
        break
      }
      case 'cancel':
        this.sdkService.cancelQuery(command.sessionId)
        break
    }
  }

  private handlePermissionResponse(decision: PermissionDecision): void {
    this.decisionQueue.resolve(decision.requestId, decision.decision)
  }
}

import type { AgentEvent } from '../core/types'

export interface AgentAdapter {
  start(onEvent: (ev: AgentEvent, historical: boolean) => void): void
  dispose(): void
}

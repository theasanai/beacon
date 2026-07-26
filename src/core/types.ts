export interface Identity {
  name: string      // display, UPPERCASE
  bg: string        // project color hex
  fg: string        // contrast text hex
  emoji: string
}

export type AgentEvent =
  | { kind: 'turn-started'; prompt: string; ts: number }
  | { kind: 'assistant-text'; text: string; ts: number }
  | { kind: 'tool-use'; tool: string; file?: string; ts: number }
  | { kind: 'turn-completed'; ts: number }
  | { kind: 'attention'; message: string; ts: number } // from hooks (Task 13)

export type StatusKind = 'working' | 'waiting' | 'attention' | 'idle' | 'unavailable'
export interface StatusState { kind: StatusKind; since: number }

export interface TimelineEntry {
  ts: number
  prompt: string
  outcome: string
  filesTouched: number
  completed: boolean
}

export interface GitInfo { branch: string; dirtyCount: number; lastCommit: string }

export interface RecapData { minutes: number; entries: TimelineEntry[]; stillWorking: boolean }

export interface FleetRow {
  path: string; name: string; emoji: string; bg: string; fg: string
  status: StatusKind; lastEvent?: string; ts: number
}

export interface CardState {
  identity: Identity
  status: StatusState
  statusLabel: string
  recap?: RecapData
  timeline: TimelineEntry[]
  git?: GitInfo
  fleet: FleetRow[]
  preciseEnabled: boolean
  transcriptUnrecognized?: boolean // transcript exists but zero turns were recognized
}

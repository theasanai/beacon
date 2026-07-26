import type { AgentEvent, StatusState } from './types'

export function initialStatus(): StatusState {
  return { kind: 'unavailable', since: 0 }
}

export function reduceStatus(prev: StatusState, ev: AgentEvent): StatusState {
  switch (ev.kind) {
    case 'turn-completed':
      return { kind: 'waiting', since: ev.ts }
    case 'attention':
      return { kind: 'attention', since: ev.ts }
    case 'turn-started':
    case 'assistant-text':
    case 'tool-use':
      return { kind: 'working', since: prev.kind === 'working' ? prev.since : ev.ts }
  }
}

// Honest history replay (ancestor sessions at startup): only reacts to turn-completed,
// never overrides a live working/attention and never rolls waiting back in time.
export function reduceHistorical(prev: StatusState, ev: AgentEvent): StatusState {
  if (ev.kind !== 'turn-completed') return prev
  if (prev.kind === 'unavailable' || ((prev.kind === 'waiting' || prev.kind === 'idle') && ev.ts > prev.since)) {
    return { kind: 'waiting', since: ev.ts }
  }
  return prev
}

export function tickStatus(prev: StatusState, now: number, idleAfterMs: number): StatusState {
  // attention (Notification hook signal) fades out the same way as waiting
  if ((prev.kind === 'waiting' || prev.kind === 'attention') && now - prev.since > idleAfterMs) {
    return { kind: 'idle', since: prev.since }
  }
  return prev
}

export function statusLabel(s: StatusState, now: number): string {
  const mins = Math.max(0, Math.round((now - s.since) / 60_000))
  switch (s.kind) {
    case 'working': return 'working…'
    case 'waiting': return `waiting for you · ${mins}m`
    case 'attention': return 'needs your attention'
    case 'idle': return mins >= 60 ? `quiet · ${Math.round(mins / 60)}h` : `quiet · ${mins}m`
    case 'unavailable': return 'no agent yet'
  }
}

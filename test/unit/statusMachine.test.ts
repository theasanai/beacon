import { describe, it, expect } from 'vitest'
import { initialStatus, reduceStatus, tickStatus, statusLabel, reduceHistorical } from '../../src/core/statusMachine'

const T = 1_000_000
describe('statusMachine', () => {
  it('activity → working; end_turn → waiting; long silence → idle', () => {
    let s = initialStatus()
    expect(s.kind).toBe('unavailable')
    s = reduceStatus(s, { kind: 'turn-started', prompt: 'x', ts: T })
    expect(s).toEqual({ kind: 'working', since: T })
    s = reduceStatus(s, { kind: 'tool-use', tool: 'Edit', ts: T + 1000 })
    expect(s.kind).toBe('working')
    s = reduceStatus(s, { kind: 'turn-completed', ts: T + 2000 })
    expect(s).toEqual({ kind: 'waiting', since: T + 2000 })
    s = tickStatus(s, T + 2000 + 29 * 60_000, 30 * 60_000)
    expect(s.kind).toBe('waiting')
    s = tickStatus(s, T + 2000 + 31 * 60_000, 30 * 60_000)
    expect(s.kind).toBe('idle')
  })
  it('attention overrides working and is cleared by new activity', () => {
    let s = reduceStatus(initialStatus(), { kind: 'turn-started', prompt: 'x', ts: T })
    s = reduceStatus(s, { kind: 'attention', message: 'permission', ts: T + 500 })
    expect(s.kind).toBe('attention')
    s = reduceStatus(s, { kind: 'tool-use', tool: 'Bash', ts: T + 900 })
    expect(s.kind).toBe('working')
  })
  it('attention fades to idle after idleAfterMs', () => {
    const s0 = { kind: 'attention' as const, since: T }
    expect(tickStatus(s0, T + 29 * 60_000, 30 * 60_000).kind).toBe('attention')
    expect(tickStatus(s0, T + 31 * 60_000, 30 * 60_000)).toEqual({ kind: 'idle', since: T })
  })
  it('reduceHistorical: unavailable → waiting on turn-completed', () => {
    const s = reduceHistorical({ kind: 'unavailable', since: 0 }, { kind: 'turn-completed', ts: T })
    expect(s).toEqual({ kind: 'waiting', since: T })
  })
  it('reduceHistorical: waiting with old since is updated by fresh turn-completed', () => {
    const s = reduceHistorical({ kind: 'waiting', since: T }, { kind: 'turn-completed', ts: T + 1000 })
    expect(s).toEqual({ kind: 'waiting', since: T + 1000 })
  })
  it('reduceHistorical: waiting with fresh since is not rolled back by old turn-completed', () => {
    const s = reduceHistorical({ kind: 'waiting', since: T + 1000 }, { kind: 'turn-completed', ts: T })
    expect(s).toEqual({ kind: 'waiting', since: T + 1000 })
  })
  it('reduceHistorical: live working is not overridden by historical turn-completed', () => {
    const prev = { kind: 'working' as const, since: T }
    const s = reduceHistorical(prev, { kind: 'turn-completed', ts: T + 1000 })
    expect(s).toBe(prev)
  })
  it('reduceHistorical: idle is updated by fresh turn-completed', () => {
    const s = reduceHistorical({ kind: 'idle', since: 100 }, { kind: 'turn-completed', ts: 500 })
    expect(s).toEqual({ kind: 'waiting', since: 500 })
  })
  it('reduceHistorical: idle with fresh since is not rolled back by old turn-completed', () => {
    const s = reduceHistorical({ kind: 'idle', since: 500 }, { kind: 'turn-completed', ts: 100 })
    expect(s).toEqual({ kind: 'idle', since: 500 })
  })
  it('labels', () => {
    expect(statusLabel({ kind: 'working', since: T }, T + 1000)).toBe('working…')
    expect(statusLabel({ kind: 'waiting', since: T }, T + 4 * 60_000)).toBe('waiting for you · 4m')
    expect(statusLabel({ kind: 'attention', since: T }, T)).toBe('needs your attention')
    expect(statusLabel({ kind: 'idle', since: T }, T + 2 * 3_600_000)).toBe('quiet · 2h')
    expect(statusLabel({ kind: 'unavailable', since: 0 }, T)).toBe('no agent yet')
  })
})

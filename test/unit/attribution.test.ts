import { describe, it, expect } from 'vitest'
import { AttributionFilter } from '../../src/core/attribution'
import type { AgentEvent } from '../../src/core/types'

const WS = '/Users/v/projects/beacon'
const started = (ts = 1): AgentEvent => ({ kind: 'turn-started', prompt: 'do X', ts })
const tool = (file: string, ts = 2): AgentEvent => ({ kind: 'tool-use', tool: 'Edit', file, ts })
const text = (ts = 3): AgentEvent => ({ kind: 'assistant-text', text: 'ok', ts })
const completed = (ts = 4): AgentEvent => ({ kind: 'turn-completed', ts })

describe('AttributionFilter', () => {
  it('turn with workspace file touch: buffer is released in order, then passthrough', () => {
    const f = new AttributionFilter(WS)
    expect(f.feed(started(), false)).toEqual([])
    expect(f.feed(text(2), false)).toEqual([])
    const released = f.feed(tool(`${WS}/src/a.ts`, 3), false)
    expect(released.map((s) => s.ev.kind)).toEqual(['turn-started', 'assistant-text', 'tool-use'])
    expect(f.feed(completed(4), false).map((s) => s.ev.kind)).toEqual(['turn-completed'])
  })

  it('turn without workspace touches dies silently as a whole', () => {
    const f = new AttributionFilter(WS)
    f.feed(started(), false)
    expect(f.feed(tool('/Users/v/projects/gigant/x.ts', 2), false)).toEqual([])
    expect(f.feed(completed(3), false)).toEqual([])
  })

  it('path boundary: beacon-old does not match workspace beacon', () => {
    const f = new AttributionFilter(WS)
    f.feed(started(), false)
    expect(f.feed(tool(`${WS}-old/src/a.ts`, 2), false)).toEqual([])
  })

  it('sidechain-touch attributes the turn but is not emitted itself', () => {
    const f = new AttributionFilter(WS)
    f.feed(started(), false)
    const released = f.feed({ kind: 'sidechain-touch', file: `${WS}/src/b.ts`, ts: 2 }, false)
    expect(released.map((s) => s.ev.kind)).toEqual(['turn-started'])
  })

  it('sidechain-touch with ts older than turn-started does not attribute the turn (replay of old agent file)', () => {
    const f = new AttributionFilter(WS)
    f.feed(started(10), false)
    expect(f.feed({ kind: 'sidechain-touch', file: `${WS}/src/b.ts`, ts: 5 }, false)).toEqual([])
  })

  it('sidechain-touch with ts >= turn-started attributes the turn', () => {
    const f = new AttributionFilter(WS)
    f.feed(started(10), false)
    const released = f.feed({ kind: 'sidechain-touch', file: `${WS}/src/b.ts`, ts: 10 }, false)
    expect(released.map((s) => s.ev.kind)).toEqual(['turn-started'])
  })

  it('sidechain-touch outside a turn and on a foreign path — nothing', () => {
    const f = new AttributionFilter(WS)
    expect(f.feed({ kind: 'sidechain-touch', file: `${WS}/x.ts`, ts: 1 }, false)).toEqual([])
    f.feed(started(2), false)
    expect(f.feed({ kind: 'sidechain-touch', file: '/etc/passwd', ts: 3 }, false)).toEqual([])
  })

  it('events outside a turn are not passed through', () => {
    const f = new AttributionFilter(WS)
    expect(f.feed(text(1), false)).toEqual([])
    expect(f.feed(completed(2), false)).toEqual([])
  })

  it('historical flags are preserved through the buffer', () => {
    const f = new AttributionFilter(WS)
    f.feed(started(1), true)
    const released = f.feed(tool(`${WS}/a.ts`, 2), false)
    expect(released.map((s) => s.historical)).toEqual([true, false])
  })

  it('new turn-started resets the unattributed previous buffer', () => {
    const f = new AttributionFilter(WS)
    f.feed(started(1), false)
    f.feed(text(2), false)
    f.feed(started(3), false) // new turn
    const released = f.feed(tool(`${WS}/a.ts`, 4), false)
    expect(released.map((s) => s.ev.ts)).toEqual([3, 4]) // nothing from the old turn
  })
})

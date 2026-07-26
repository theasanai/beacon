import { describe, it, expect } from 'vitest'
import { computeRecap } from '../../src/core/recap'
import type { TimelineEntry } from '../../src/core/types'

const T = 10_000_000
const e = (ts: number): TimelineEntry => ({ ts, prompt: 'p', outcome: 'o', filesTouched: 0, completed: true })

describe('computeRecap', () => {
  it('short absence → undefined', () => {
    expect(computeRecap([e(T + 1000)], T, T + 2 * 60_000, 5 * 60_000, 'waiting')).toBeUndefined()
  })
  it('long absence → turns from the absence window, minutes, stillWorking', () => {
    const entries = [e(T + 6 * 60_000), e(T - 1000)] // second one — before departure
    const r = computeRecap(entries, T, T + 10 * 60_000, 5 * 60_000, 'working')!
    expect(r.minutes).toBe(10)
    expect(r.entries).toHaveLength(1)
    expect(r.stillWorking).toBe(true)
  })
  it('nothing happened during absence → undefined', () => {
    expect(computeRecap([e(T - 1000)], T, T + 10 * 60_000, 5 * 60_000, 'waiting')).toBeUndefined()
  })
})

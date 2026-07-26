import { describe, it, expect } from 'vitest'
import { TimelineStore } from '../../src/core/timeline'

const T = 1_000_000
describe('TimelineStore', () => {
  it('assembles a turn: prompt → tools → final text', () => {
    const s = new TimelineStore()
    s.feed({ kind: 'turn-started', prompt: 'fix the form\nsecond line', ts: T })
    s.feed({ kind: 'tool-use', tool: 'Edit', file: '/x/a.ts', ts: T + 1 })
    s.feed({ kind: 'tool-use', tool: 'Edit', file: '/x/a.ts', ts: T + 2 }) // same file
    s.feed({ kind: 'tool-use', tool: 'Write', file: '/x/b.ts', ts: T + 3 })
    s.feed({ kind: 'assistant-text', text: 'Done: form is fixed.\nDetails…', ts: T + 4 })
    s.feed({ kind: 'turn-completed', ts: T + 5 })
    const [e] = s.entries()
    expect(e).toEqual({
      ts: T + 5, prompt: 'fix the form', outcome: 'Done: form is fixed.',
      filesTouched: 2, completed: true,
    })
  })
  it('incomplete turn is visible with completed:false; new turn closes the previous one', () => {
    const s = new TimelineStore()
    s.feed({ kind: 'turn-started', prompt: 'a', ts: T })
    expect(s.entries()[0]).toMatchObject({ prompt: 'a', completed: false })
    s.feed({ kind: 'turn-started', prompt: 'b', ts: T + 10 })
    const es = s.entries()
    expect(es.map((e) => e.prompt)).toEqual(['b', 'a'])
    expect(es[1].completed).toBe(true) // forcibly closed by new turn
  })
  it('stores at most N entries', () => {
    const s = new TimelineStore(3)
    for (let i = 0; i < 6; i++) {
      s.feed({ kind: 'turn-started', prompt: `p${i}`, ts: T + i * 10 })
      s.feed({ kind: 'turn-completed', ts: T + i * 10 + 5 })
    }
    expect(s.entries()).toHaveLength(3)
    expect(s.entries()[0].prompt).toBe('p5')
  })
  it('interleaved feed (historical old turn after fresh one) — entries strictly by ts desc', () => {
    const s = new TimelineStore()
    s.feed({ kind: 'turn-started', prompt: 'fresh', ts: T + 100 })
    s.feed({ kind: 'turn-completed', ts: T + 105 })
    // historical (older) turn is fed AFTER the fresh one — like replaying an ancestor session at startup
    s.feed({ kind: 'turn-started', prompt: 'old', ts: T })
    s.feed({ kind: 'turn-completed', ts: T + 5 })
    const es = s.entries()
    expect(es.map((e) => e.ts)).toEqual([T + 105, T + 5])
    expect(es.map((e) => e.prompt)).toEqual(['fresh', 'old'])
  })
  it('long strings are truncated', () => {
    const s = new TimelineStore()
    s.feed({ kind: 'turn-started', prompt: 'x'.repeat(200), ts: T })
    s.feed({ kind: 'assistant-text', text: 'y'.repeat(300), ts: T + 1 })
    s.feed({ kind: 'turn-completed', ts: T + 2 })
    const [e] = s.entries()
    expect(e.prompt.length).toBeLessThanOrEqual(81)
    expect(e.outcome.length).toBeLessThanOrEqual(121)
  })
})

import { describe, it, expect } from 'vitest'
import { renderState } from '../../src/vscode/cardHtml'
import { statusLabel } from '../../src/core/statusMachine'
import type { CardState } from '../../src/core/types'

const base: CardState = {
  identity: { name: 'GIGANT', bg: '#0e639c', fg: '#ffffff', emoji: '⛰️' },
  status: { kind: 'waiting', since: 0 },
  statusLabel: 'waiting for you · 4m',
  timeline: [
    { ts: 0, prompt: 'fix the <b>form</b>', outcome: 'Done', filesTouched: 3, completed: true },
  ],
  git: { branch: 'task/wave3', dirtyCount: 4, lastCommit: 'fix' },
  fleet: [],
  preciseEnabled: false,
}

describe('renderState', () => {
  it('name, status, timeline, git all present; html is escaped', () => {
    const html = renderState(base)
    expect(html).toContain('GIGANT')
    expect(html).toContain('waiting for you · 4m')
    expect(html).toContain('fix the &lt;b&gt;form&lt;/b&gt;')
    expect(html).toContain('task/wave3')
    expect(html).not.toContain('<b>form</b>')
  })
  it('empty timeline → selling empty-state instead of a dry line', () => {
    const html = renderState({ ...base, timeline: [] })
    expect(html).toContain("Beacon will show your Claude Code agent")
    expect(html).not.toContain('agent data unavailable')
  })
  it('non-empty timeline does NOT show empty-state', () => {
    const html = renderState(base)
    expect(html).not.toContain("Beacon will show your Claude Code agent")
  })
  it('empty timeline: header and git still present', () => {
    const html = renderState({ ...base, timeline: [] })
    expect(html).toContain('GIGANT')
    expect(html).toContain('task/wave3')
  })
  it('transcriptUnrecognized: distinct-state instead of regular onboarding', () => {
    const html = renderState({ ...base, timeline: [], transcriptUnrecognized: true })
    expect(html).toContain("Session detected, but its transcript format wasn't recognized")
    expect(html).not.toContain("Beacon will show your Claude Code agent")
  })
  it('empty timeline without flag → regular onboarding, not distinct-state', () => {
    const html = renderState({ ...base, timeline: [] })
    expect(html).not.toContain("Session detected")
    expect(html).toContain("Beacon will show your Claude Code agent")
  })
  it('fleet with invalid hex → safe fallback in inline-style, no raw injection', () => {
    const html = renderState({
      ...base,
      fleet: [{ path: '/w', name: 'X', emoji: '🔵', bg: 'red;content:x', fg: '#zzzzzz', status: 'idle', ts: 0 }],
    })
    expect(html).not.toContain('red;content:x')
    expect(html).toContain('background:transparent')
    expect(html).toContain('color:inherit')
  })
  it('fleet with valid hex passes through as-is', () => {
    const html = renderState({
      ...base,
      fleet: [{ path: '/w', name: 'X', emoji: '🔵', bg: '#0e639c', fg: '#ffffff', status: 'idle', ts: 0 }],
    })
    expect(html).toContain('background:#0e639c')
    expect(html).toContain('color:#ffffff')
  })
  it('recap renders when present', () => {
    const html = renderState({ ...base, recap: { minutes: 12, stillWorking: false, entries: base.timeline } })
    expect(html).toContain('While you were away')
    expect(html).toContain('12m')
  })
  it('no-history (unavailable + empty timeline): onboard present, "agent data unavailable" nowhere', () => {
    const s = { kind: 'unavailable' as const, since: 0 }
    const html = renderState({ ...base, status: s, statusLabel: statusLabel(s, 0), timeline: [] })
    expect(html).toContain("Beacon will show your Claude Code agent")
    expect(html).not.toContain('agent data unavailable')
  })
})

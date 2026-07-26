import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ClaudeCodeAdapter } from '../../src/adapters/claudeCode/adapter'
import { encodeWorkspacePath } from '../../src/adapters/claudeCode/paths'
import type { AgentEvent } from '../../src/core/types'

const U = (t: string, p: string) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: t, message: { role: 'user', content: [{ type: 'text', text: p }] } }) + '\n'
const DONE = (t: string) =>
  JSON.stringify({ type: 'assistant', isSidechain: false, timestamp: t, message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } }) + '\n'

function setup() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-home-'))
  const ws = '/fake/ws'
  const dir = path.join(home, '.claude', 'projects', '-fake-ws')
  fs.mkdirSync(dir, { recursive: true })
  return { home, ws, dir }
}

async function drain(ms: number) { await new Promise((r) => setTimeout(r, ms)) }

describe('ClaudeCodeAdapter', () => {
  it('historical pass first, then live events; new session is picked up', async () => {
    const { home, ws, dir } = setup()
    const f1 = path.join(dir, 'aaa.jsonl')
    fs.writeFileSync(f1, U('2026-07-17T10:00:00Z', 'old prompt'))
    const got: Array<{ ev: AgentEvent; h: boolean }> = []
    const a = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 30 })
    a.start((ev, h) => got.push({ ev, h }))
    await drain(120)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ h: true, ev: { kind: 'turn-started', prompt: 'old prompt' } })

    fs.appendFileSync(f1, DONE('2026-07-17T10:01:00Z'))
    await drain(120)
    expect(got.filter((g) => !g.h).map((g) => g.ev.kind)).toEqual(['assistant-text', 'turn-completed'])

    const f2 = path.join(dir, 'bbb.jsonl')
    fs.writeFileSync(f2, U('2026-07-17T11:00:00Z', 'new session'))
    const future = new Date(Date.now() + 60_000)
    fs.utimesSync(f2, future, future)
    await drain(400)
    expect(got.some((g) => g.ev.kind === 'turn-started' && (g.ev as any).prompt === 'new session')).toBe(true)
    a.dispose()
  })

  it('no transcript folder — silence and zero exceptions', async () => {
    const a = new ClaudeCodeAdapter({ workspacePath: '/no/such', home: '/no/home', pollMs: 30 })
    const got: unknown[] = []
    a.start((ev) => got.push(ev))
    await drain(100)
    expect(got).toHaveLength(0)
    a.dispose()
  })

  it('empty file at start: subsequent events are live, not historical', async () => {
    const { home, ws, dir } = setup()
    const f1 = path.join(dir, 'aaa.jsonl')
    fs.writeFileSync(f1, '')
    const got: Array<{ ev: AgentEvent; h: boolean }> = []
    const a = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 30 })
    a.start((ev, h) => got.push({ ev, h }))
    await drain(100)
    fs.appendFileSync(f1, U('2026-07-17T12:00:00Z', 'live prompt'))
    await drain(120)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ h: false, ev: { kind: 'turn-started', prompt: 'live prompt' } })
    a.dispose()
  })

  it('ping-pong between two sessions: returning to old file does not re-read it', async () => {
    const { home, ws, dir } = setup()
    const f1 = path.join(dir, 'aaa.jsonl')
    fs.writeFileSync(f1, U('2026-07-17T10:00:00Z', 'first session'))
    const got: Array<{ ev: AgentEvent; h: boolean }> = []
    const a = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 30 })
    a.start((ev, h) => got.push({ ev, h }))
    await drain(150)
    expect(got).toHaveLength(1) // historical batch from f1

    const f2 = path.join(dir, 'bbb.jsonl')
    fs.writeFileSync(f2, U('2026-07-17T11:00:00Z', 'second session'))
    let t = new Date(Date.now() + 60_000)
    fs.utimesSync(f2, t, t)
    await drain(400)
    expect(got).toHaveLength(2) // live turn-started from f2, WITHOUT replaying f1

    t = new Date(Date.now() + 120_000)
    fs.utimesSync(f1, t, t) // f1 is newest again, but content hasn't changed
    await drain(400)
    expect(got).toHaveLength(2) // returning to f1 produced NOT A SINGLE new event

    fs.appendFileSync(f1, DONE('2026-07-17T12:00:00Z'))
    await drain(400)
    expect(got.slice(2).map((g) => ({ k: g.ev.kind, h: g.h }))).toEqual([
      { k: 'assistant-text', h: false },
      { k: 'turn-completed', h: false },
    ])
    a.dispose()
  })

  it('gate=false freezes polling; enabling gate unfreezes', async () => {
    const { home, ws, dir } = setup()
    const f1 = path.join(dir, 'aaa.jsonl')
    fs.writeFileSync(f1, U('2026-07-17T10:00:00Z', 'while in focus'))
    const got: AgentEvent[] = []
    let active = false
    const a = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 30, gate: () => active })
    a.start((ev) => got.push(ev))
    await drain(120)
    expect(got).toHaveLength(0) // gate is closed — not a single poll
    active = true
    await drain(120)
    expect(got).toHaveLength(1)
    a.dispose()
  })

  it('transcriptPresent: false without file, true with non-empty own transcript (even unrecognized)', async () => {
    const { home, ws, dir } = setup()
    const a = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 30 })
    a.start(() => {})
    await drain(100)
    expect(a.transcriptPresent()).toBe(false)
    // unrecognized line: origin missing + userType internal → zero events, but content exists
    const f1 = path.join(dir, 'aaa.jsonl')
    fs.writeFileSync(f1, JSON.stringify({ type: 'user', userType: 'internal', timestamp: '2026-07-17T10:00:00Z', message: { content: [{ type: 'text', text: 'x' }] } }) + '\n')
    const got: AgentEvent[] = []
    a.dispose()
    const b = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 30 })
    b.start((ev) => got.push(ev))
    await drain(150)
    expect(got).toHaveLength(0)
    expect(b.transcriptPresent()).toBe(true)
    b.dispose()
  })

  it('after dispose events are not emitted; repeated start does not duplicate', async () => {
    const { home, ws, dir } = setup()
    const f1 = path.join(dir, 'aaa.jsonl')
    fs.writeFileSync(f1, U('2026-07-17T10:00:00Z', 'start'))
    const got: unknown[] = []
    const a = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 30 })
    a.start((ev) => got.push(ev))
    a.start((ev) => got.push(ev)) // second start — no-op
    await drain(120)
    expect(got).toHaveLength(1)
    a.dispose()
    fs.appendFileSync(f1, DONE('2026-07-17T10:01:00Z'))
    await drain(120)
    expect(got).toHaveLength(1)
  })
})

const userLine = (text: string, ts: string) =>
  JSON.stringify({ type: 'user', origin: { kind: 'human' }, timestamp: ts, message: { content: [{ type: 'text', text }] } }) + '\n'
const toolLine = (file: string, ts: string) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: file } }] } }) + '\n'

describe('ClaudeCodeAdapter ancestors', () => {
  it('sees attributed turn from ancestor folder session', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-home-'))
    const ws = path.join(home, 'projects', 'beacon')
    fs.mkdirSync(ws, { recursive: true })
    const ancestorDir = path.join(home, '.claude', 'projects', encodeWorkspacePath(path.join(home, 'projects')))
    fs.mkdirSync(ancestorDir, { recursive: true })
    fs.writeFileSync(path.join(ancestorDir, 's1.jsonl'),
      userLine('ours', '2026-07-19T10:00:00Z') + toolLine(path.join(ws, 'a.ts'), '2026-07-19T10:00:01Z'))
    const adapter = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 50 })
    const got: string[] = []
    adapter.start((ev) => got.push(ev.kind))
    await new Promise((r) => setTimeout(r, 300))
    adapter.dispose()
    fs.rmSync(home, { recursive: true, force: true })
    expect(got).toEqual(['turn-started', 'tool-use'])
  })

  it('watchAncestors:false — ancestors are not scanned', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-home-'))
    const ws = path.join(home, 'projects', 'beacon')
    fs.mkdirSync(ws, { recursive: true })
    const ancestorDir = path.join(home, '.claude', 'projects', encodeWorkspacePath(path.join(home, 'projects')))
    fs.mkdirSync(ancestorDir, { recursive: true })
    fs.writeFileSync(path.join(ancestorDir, 's1.jsonl'),
      userLine('ours', '2026-07-19T10:00:00Z') + toolLine(path.join(ws, 'a.ts'), '2026-07-19T10:00:01Z'))
    const adapter = new ClaudeCodeAdapter({ workspacePath: ws, home, pollMs: 50, watchAncestors: false })
    const got: string[] = []
    adapter.start((ev) => got.push(ev.kind))
    await new Promise((r) => setTimeout(r, 300))
    adapter.dispose()
    fs.rmSync(home, { recursive: true, force: true })
    expect(got).toEqual([])
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { DirSource } from '../../src/adapters/claudeCode/dirSource'
import type { AgentEvent } from '../../src/core/types'

let dir: string
let ws: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-dirsource-'))
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-ws-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(ws, { recursive: true, force: true })
})

const line = (o: object) => JSON.stringify(o) + '\n'
const userLine = (text: string, ts: string) =>
  line({ type: 'user', origin: { kind: 'human' }, timestamp: ts, message: { content: [{ type: 'text', text }] } })
const toolLine = (file: string, ts: string) =>
  line({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: file } }] } })
const doneLine = (ts: string) =>
  line({ type: 'assistant', timestamp: ts, message: { content: [], stop_reason: 'end_turn' } })

async function collect(src: DirSource, rescan = true): Promise<AgentEvent[]> {
  const got: AgentEvent[] = []
  await src.poll(rescan, (ev) => got.push(ev))
  return got
}

describe('DirSource self', () => {
  it('main file events pass through without filtering', async () => {
    fs.writeFileSync(path.join(dir, 's1.jsonl'),
      userLine('hello', '2026-07-19T10:00:00Z') + toolLine('/anywhere/x.ts', '2026-07-19T10:00:01Z'))
    const src = new DirSource({ dir, role: 'self', workspacePath: ws, startTs: Date.now() })
    const got = await collect(src)
    expect(got.map((e) => e.kind)).toEqual(['turn-started', 'tool-use'])
  })
})

describe('DirSource ancestor', () => {
  it('turn with workspace touch passes through, foreign turn does not', async () => {
    fs.writeFileSync(path.join(dir, 's1.jsonl'),
      userLine('foreign', '2026-07-19T10:00:00Z') + toolLine('/other/x.ts', '2026-07-19T10:00:01Z') + doneLine('2026-07-19T10:00:02Z')
      + userLine('ours', '2026-07-19T10:00:03Z') + toolLine(path.join(ws, 'a.ts'), '2026-07-19T10:00:04Z') + doneLine('2026-07-19T10:00:05Z'))
    const src = new DirSource({ dir, role: 'ancestor', workspacePath: ws, startTs: Date.now() })
    const got = await collect(src)
    expect(got.map((e) => e.kind)).toEqual(['turn-started', 'tool-use', 'turn-completed'])
    expect((got[0] as { prompt: string }).prompt).toBe('ours')
  })

  it('fresh sidechain attributes the turn without touches in the main file', async () => {
    fs.writeFileSync(path.join(dir, 's1.jsonl'), userLine('delegate', '2026-07-19T10:00:00Z'))
    fs.writeFileSync(path.join(dir, 'agent-abc.jsonl'),
      line({ type: 'assistant', isSidechain: true, timestamp: '2026-07-19T10:00:01Z',
        message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(ws, 'b.ts') } }] } }))
    const src = new DirSource({ dir, role: 'ancestor', workspacePath: ws, startTs: Date.now() })
    const got = await collect(src)
    expect(got.map((e) => e.kind)).toEqual(['turn-started'])
  })

  it('fresh sidechain attributes the turn — real layout <uuid>/subagents/', async () => {
    fs.writeFileSync(path.join(dir, 's1.jsonl'), userLine('delegate', '2026-07-19T10:00:00Z'))
    const subagentsDir = path.join(dir, 's1', 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    fs.writeFileSync(path.join(subagentsDir, 'agent-abc.jsonl'),
      line({ type: 'assistant', isSidechain: true, timestamp: '2026-07-19T10:00:01Z',
        message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(ws, 'b.ts') } }] } }))
    const src = new DirSource({ dir, role: 'ancestor', workspacePath: ws, startTs: Date.now() })
    const got = await collect(src)
    expect(got.map((e) => e.kind)).toEqual(['turn-started'])
  })

  it('stale sidechain (mtime older than 10 min) is ignored', async () => {
    fs.writeFileSync(path.join(dir, 's1.jsonl'), userLine('delegate', '2026-07-19T10:00:00Z'))
    const stale = path.join(dir, 'agent-old.jsonl')
    fs.writeFileSync(stale,
      line({ type: 'assistant', isSidechain: true, timestamp: '2026-07-19T10:00:01Z',
        message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(ws, 'c.ts') } }] } }))
    const old = (Date.now() - 11 * 60_000) / 1000
    fs.utimesSync(stale, old, old)
    const src = new DirSource({ dir, role: 'ancestor', workspacePath: ws, startTs: Date.now() })
    const got = await collect(src)
    expect(got).toEqual([]) // turn not attributed
  })

  it('non-existent folder does not crash poll', async () => {
    const src = new DirSource({ dir: path.join(dir, 'no-such-dir'), role: 'ancestor', workspacePath: ws, startTs: Date.now() })
    await expect(collect(src)).resolves.toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseTranscriptLine, parseSidechainTouches } from '../../src/adapters/claudeCode/parser'

const lines = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'session.jsonl'), 'utf8')
  .split('\n').filter(Boolean)

describe('parseTranscriptLine', () => {
  it('human prompt → turn-started', () => {
    expect(parseTranscriptLine(lines[0])).toEqual([
      { kind: 'turn-started', prompt: 'fix the contact form', ts: Date.parse('2026-07-17T10:00:00.000Z') },
    ])
  })
  it('thinking → empty; tool_use → tool-use with file', () => {
    expect(parseTranscriptLine(lines[1])).toEqual([])
    expect(parseTranscriptLine(lines[2])).toEqual([
      { kind: 'tool-use', tool: 'Edit', file: '/x/src/form.ts', ts: Date.parse('2026-07-17T10:00:10.000Z') },
    ])
  })
  it('tool_result user → empty (not a prompt)', () => {
    expect(parseTranscriptLine(lines[3])).toEqual([])
  })
  it('final text + end_turn → assistant-text and turn-completed', () => {
    expect(parseTranscriptLine(lines[4])).toEqual([
      { kind: 'assistant-text', text: 'Done: form fixed with validation.\nDetails below.', ts: Date.parse('2026-07-17T10:00:20.000Z') },
      { kind: 'turn-completed', ts: Date.parse('2026-07-17T10:00:20.000Z') },
    ])
  })
  it('service types, sidechain, garbage → empty', () => {
    expect(parseTranscriptLine(lines[5])).toEqual([])
    expect(parseTranscriptLine('{"type":"user","isSidechain":true,"origin":{"kind":"human"},"timestamp":"2026-07-17T10:00:00Z","message":{"role":"user","content":[{"type":"text","text":"x"}]}}')).toEqual([])
    expect(parseTranscriptLine('not json at all')).toEqual([])
    expect(parseTranscriptLine('{"type":"user","isSidechain":false,"origin":{"kind":"human"},"timestamp":"2026-07-17T10:00:00Z","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>…"}]}}')).toEqual([])
  })
  it('origin missing + userType external + text → turn-started (loud degradation)', () => {
    const line = JSON.stringify({ type: 'user', userType: 'external', timestamp: '2026-07-17T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } })
    expect(parseTranscriptLine(line)).toEqual([
      { kind: 'turn-started', prompt: 'hello', ts: Date.parse('2026-07-17T10:00:00Z') },
    ])
  })
  it('origin missing + userType external + tool_result → NOT a prompt', () => {
    const line = JSON.stringify({ type: 'user', userType: 'external', timestamp: '2026-07-17T10:00:00Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })
    expect(parseTranscriptLine(line)).toEqual([])
  })
  it('origin missing + userType internal → NOT a prompt', () => {
    const line = JSON.stringify({ type: 'user', userType: 'internal', timestamp: '2026-07-17T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'x' }] } })
    expect(parseTranscriptLine(line)).toEqual([])
  })
  it('isMeta line (environment context, not typed by human) → NOT a prompt', () => {
    const line = JSON.stringify({ type: 'user', userType: 'external', isMeta: true, timestamp: '2026-07-17T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: '[Image: original 2578x392]' }] } })
    expect(parseTranscriptLine(line)).toEqual([])
  })
  it('<ide_opened_file> and [Request interrupted] markers (origin=undef/external) → NOT a prompt', () => {
    const meta = (text: string) => JSON.stringify({ type: 'user', userType: 'external', timestamp: '2026-07-17T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text }] } })
    expect(parseTranscriptLine(meta('<ide_opened_file>The user opened the file … in the IDE</ide_opened_file>'))).toEqual([])
    expect(parseTranscriptLine(meta('[Request interrupted by user]'))).toEqual([])
    expect(parseTranscriptLine(meta('[Request interrupted by user for tool use]'))).toEqual([])
  })
  it("prompt starting with '<' is preserved, but real injection sentinels are discarded", () => {
    const human = (text: string) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: '2026-07-17T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text }] } })
    expect(parseTranscriptLine(human("<div> won't center"))).toEqual([
      { kind: 'turn-started', prompt: "<div> won't center", ts: Date.parse('2026-07-17T10:00:00Z') },
    ])
    expect(parseTranscriptLine(human('<system-reminder>x</system-reminder>'))).toEqual([])
    expect(parseTranscriptLine(human('<command-name>/foo</command-name>'))).toEqual([])
  })
  it('null block in content does not crash the parser', () => {
    expect(parseTranscriptLine('{"type":"user","isSidechain":false,"origin":{"kind":"human"},"timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"user","content":[null]}}')).toEqual([])
    expect(parseTranscriptLine('{"type":"assistant","isSidechain":false,"timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"assistant","content":[null],"stop_reason":"tool_use"}}')).toEqual([])
  })
})

describe('parseSidechainTouches', () => {
  it('extracts touches from sidechain assistant line with tool_use.file_path', () => {
    const line = JSON.stringify({
      type: 'assistant', isSidechain: true, timestamp: '2026-07-19T10:00:00Z',
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/ws/a.ts' } }] },
    })
    expect(parseSidechainTouches(line)).toEqual([{ file: '/ws/a.ts', ts: Date.parse('2026-07-19T10:00:00Z') }])
  })
  it('non-assistant, tool_use without file_path, broken JSON, no timestamp → empty', () => {
    expect(parseSidechainTouches(JSON.stringify({ type: 'user', timestamp: '2026-07-19T10:00:00Z', message: { content: [] } }))).toEqual([])
    expect(parseSidechainTouches(JSON.stringify({
      type: 'assistant', timestamp: '2026-07-19T10:00:00Z',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
    }))).toEqual([])
    expect(parseSidechainTouches('{truncated')).toEqual([])
    expect(parseSidechainTouches(JSON.stringify({ type: 'assistant', message: { content: [] } }))).toEqual([])
  })
})

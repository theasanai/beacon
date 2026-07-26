import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TailReader } from '../../src/adapters/claudeCode/tailReader'

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-tail-'))
  return path.join(dir, 's.jsonl')
}

describe('TailReader', () => {
  it('reads incrementally and buffers partial lines', async () => {
    const f = tmpFile()
    fs.writeFileSync(f, 'a1\na2\n')
    const r = new TailReader(f)
    expect(await r.readNew()).toEqual(['a1', 'a2'])
    fs.appendFileSync(f, 'b1\npart')
    expect(await r.readNew()).toEqual(['b1'])
    fs.appendFileSync(f, 'ial\n')
    expect(await r.readNew()).toEqual(['partial'])
    expect(await r.readNew()).toEqual([])
  })
  it('file truncation resets the offset', async () => {
    const f = tmpFile()
    fs.writeFileSync(f, 'x1\nx2\nx3\n')
    const r = new TailReader(f)
    await r.readNew()
    fs.writeFileSync(f, 'y1\n') // file became shorter
    expect(await r.readNew()).toEqual(['y1'])
  })
  it('large file: first read is limited to tail, aligned to line boundary', async () => {
    const f = tmpFile()
    const lines = Array.from({ length: 2000 }, (_, i) => `L${i}-${'x'.repeat(200)}`) // ~400 KB
    fs.writeFileSync(f, lines.join('\n') + '\n')
    const r = new TailReader(f)
    const got = await r.readNew()
    expect(got.length).toBeGreaterThan(0)
    expect(got.length).toBeLessThan(lines.length) // tail, not the whole file
    expect(got[got.length - 1]).toBe(lines[lines.length - 1]) // last line is present
    expect(got[0]).not.toBe(lines[0]) // earliest lines are dropped
    expect(got[0].startsWith('L')).toBe(true) // first line is whole, not a fragment
    // incremental reading after limited start works
    fs.appendFileSync(f, 'NEW\n')
    expect(await r.readNew()).toEqual(['NEW'])
  })
  it('non-existent file → empty, no exceptions', async () => {
    const r = new TailReader('/nope/nowhere.jsonl')
    expect(await r.readNew()).toEqual([])
  })
})

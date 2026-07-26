import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FleetStore } from '../../src/fleet/fleetStore'
import type { FleetRow } from '../../src/core/types'

const row = (p: string, ts: number): FleetRow => ({
  path: p, name: p.toUpperCase(), emoji: '🔵', bg: '#000', fg: '#fff', status: 'working', ts,
})

describe('FleetStore', () => {
  it('writes own heartbeat, reads others; does not return own or expired', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-fleet-'))
    const now = Date.now()
    const a = new FleetStore(dir, '/proj/a')
    const b = new FleetStore(dir, '/proj/b')
    const c = new FleetStore(dir, '/proj/c')
    await a.writeHeartbeat(row('/proj/a', now))
    await b.writeHeartbeat(row('/proj/b', now))
    await c.writeHeartbeat(row('/proj/c', now - 60_000)) // expired
    const seen = await a.readOthers(now)
    expect(seen.map((r) => r.path)).toEqual(['/proj/b'])
  })
  it('broken/hostile entries are discarded, valid ones survive', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-fleet3-'))
    const a = new FleetStore(dir, '/proj/a')
    fs.writeFileSync(path.join(dir, 'evil.json'), JSON.stringify({ path: '/p', name: 123, ts: Date.now() }))
    fs.writeFileSync(path.join(dir, 'huge.json'), JSON.stringify({ path: '/p2', name: 'x'.repeat(10_000), emoji: '🔵', bg: '#000', fg: '#fff', status: 'working', ts: Date.now() }))
    const b = new FleetStore(dir, '/proj/b')
    await b.writeHeartbeat({ path: '/proj/b', name: 'B', emoji: '🔵', bg: '#000', fg: '#fff', status: 'working', ts: Date.now() })
    expect((await a.readOthers(Date.now())).map((r) => r.name)).toEqual(['B'])
  })
  it('removeSelf removes own file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-fleet2-'))
    const a = new FleetStore(dir, '/proj/a')
    await a.writeHeartbeat(row('/proj/a', Date.now()))
    await a.removeSelf()
    const b = new FleetStore(dir, '/proj/b')
    expect(await b.readOthers(Date.now())).toEqual([])
  })
})

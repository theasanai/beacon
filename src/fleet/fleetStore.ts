import * as fs from 'node:fs'
import * as path from 'node:path'
import type { FleetRow } from '../core/types'
import { encodeWorkspacePath } from '../core/encodePath'

// fleet files are written by other processes — don't trust them blindly
const STR = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
function isValidRow(r: any): r is FleetRow {
  return !!r && STR(r.path, 1024) && STR(r.name, 200) && STR(r.emoji, 32) &&
    STR(r.bg, 32) && STR(r.fg, 32) && STR(r.status, 32) &&
    (r.lastEvent === undefined || STR(r.lastEvent, 300)) && typeof r.ts === 'number'
}

export class FleetStore {
  private readonly selfFile: string

  constructor(private readonly dir: string, selfPath: string) {
    this.selfFile = path.join(dir, encodeWorkspacePath(selfPath) + '.json')
  }

  async writeHeartbeat(row: FleetRow): Promise<void> {
    await fs.promises.mkdir(this.dir, { recursive: true })
    const tmp = this.selfFile + '.tmp'
    await fs.promises.writeFile(tmp, JSON.stringify(row))
    await fs.promises.rename(tmp, this.selfFile)
  }

  async readOthers(now: number, staleMs = 15_000): Promise<FleetRow[]> {
    let names: string[]
    try {
      names = await fs.promises.readdir(this.dir)
    } catch {
      return []
    }
    const rows: FleetRow[] = []
    for (const n of names) {
      if (!n.endsWith('.json') || path.join(this.dir, n) === this.selfFile) continue
      try {
        const r = JSON.parse(await fs.promises.readFile(path.join(this.dir, n), 'utf8'))
        if (isValidRow(r) && now - r.ts <= staleMs) rows.push(r)
      } catch { /* corrupt/missing file — skip */ }
    }
    return rows.sort((x, y) => x.name.localeCompare(y.name))
  }

  async removeSelf(): Promise<void> {
    try {
      await fs.promises.unlink(this.selfFile)
    } catch { /* already gone */ }
  }
}

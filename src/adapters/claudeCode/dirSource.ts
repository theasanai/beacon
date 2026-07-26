import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AgentEvent } from '../../core/types'
import { AttributionFilter } from '../../core/attribution'
import { latestTranscript } from './paths'
import { TailReader } from './tailReader'
import { parseTranscriptLine, parseSidechainTouches } from './parser'

export const SIDECHAIN_FRESH_MS = 600_000 // 10 minutes (per spec)
export type Emit = (ev: AgentEvent, historical: boolean) => void

// A single transcript directory source. role 'self' — same as the old adapter; role 'ancestor' —
// events go through the attribution filter + active sidechains as touch signals.
export class DirSource {
  // true once the own (role 'self') transcript with non-empty content has been read —
  // a "session exists" signal, even if no line was recognized (loud degradation).
  sawContent = false
  private tracked = new Map<string, { reader: TailReader; caughtUp: boolean; historical: boolean }>()
  private activeFile?: string
  private sidechains = new Map<string, TailReader>()
  private readonly filter?: AttributionFilter

  constructor(private readonly opts: { dir: string; role: 'self' | 'ancestor'; workspacePath: string; startTs: number }) {
    if (opts.role === 'ancestor') this.filter = new AttributionFilter(opts.workspacePath)
  }

  private out(ev: AgentEvent, historical: boolean, emit: Emit): void {
    if (!this.filter) { emit(ev, historical); return }
    for (const s of this.filter.feed(ev, historical)) emit(s.ev, s.historical)
  }

  private emitLines(lines: string[], historical: boolean, emit: Emit): void {
    for (const l of lines) for (const ev of parseTranscriptLine(l)) this.out(ev, historical, emit)
  }

  async poll(rescan: boolean, emit: Emit): Promise<void> {
    if (rescan || !this.activeFile) {
      const latest = await latestTranscript(this.opts.dir)
      if (latest && latest !== this.activeFile) {
        // drain the tail of the departing session — its events are live
        const prev = this.activeFile ? this.tracked.get(this.activeFile) : undefined
        if (prev) this.emitLines(await prev.reader.readNew(), false, emit)
        if (!this.tracked.has(latest)) {
          // file created after adapter start — fresh session: events are live
          // (compare in whole ms: birthtimeMs carries a fractional part, Date.now() doesn't)
          let historical = true
          try {
            historical = Math.floor((await fs.promises.stat(latest)).birthtimeMs) <= this.opts.startTs
          } catch { /* stat failed — treat as history */ }
          this.tracked.set(latest, { reader: new TailReader(latest), caughtUp: false, historical })
        }
        this.activeFile = latest // known file resumes from its offset — no replay
      }
      if (this.filter) await this.rescanSidechains()
    }
    if (this.activeFile) {
      const t = this.tracked.get(this.activeFile)
      if (t) {
        const lines = await t.reader.readNew()
        const hist = !t.caughtUp && t.historical
        t.caughtUp = true // first pass closes "history", even if the file was empty
        if (lines.length && this.opts.role === 'self') this.sawContent = true
        this.emitLines(lines, hist, emit)
      }
    }
    if (this.filter) {
      for (const reader of this.sidechains.values()) {
        for (const l of await reader.readNew()) {
          for (const touch of parseSidechainTouches(l)) {
            for (const s of this.filter.feed({ kind: 'sidechain-touch', file: touch.file, ts: touch.ts }, false)) {
              emit(s.ev, s.historical)
            }
          }
        }
      }
    }
  }

  // Actual Claude Code layout: sidechains live in <transcriptDir>/<sessionUuid>/subagents/agent-*.jsonl,
  // where sessionUuid is the active file name without .jsonl. Older CC versions placed agent-*.jsonl flat
  // in the root — we scan the legacy path too, for backward compatibility.
  private async rescanSidechains(): Promise<void> {
    const now = Date.now()
    const fresh = new Set<string>()
    await this.collectFreshSidechains(this.opts.dir, now, fresh) // legacy: flat in root
    if (this.activeFile) {
      const subagentsDir = path.join(this.opts.dir, path.basename(this.activeFile, '.jsonl'), 'subagents')
      await this.collectFreshSidechains(subagentsDir, now, fresh)
    }
    for (const f of fresh) if (!this.sidechains.has(f)) this.sidechains.set(f, new TailReader(f))
    for (const f of [...this.sidechains.keys()]) if (!fresh.has(f)) this.sidechains.delete(f) // deliberately forgetting the offset
  }

  private async collectFreshSidechains(dir: string, now: number, fresh: Set<string>): Promise<void> {
    let names: string[]
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      return
    }
    for (const n of names) {
      if (!n.startsWith('agent-') || !n.endsWith('.jsonl')) continue
      const full = path.join(dir, n)
      try {
        if (now - (await fs.promises.stat(full)).mtimeMs <= SIDECHAIN_FRESH_MS) fresh.add(full)
      } catch { /* file disappeared between readdir and stat */ }
    }
  }
}

import * as path from 'node:path'
import type { AgentEvent } from './types'

export interface SidechainTouch { kind: 'sidechain-touch'; file: string; ts: number }
export interface Stamped { ev: AgentEvent; historical: boolean }

// Ancestor session attribution filter: a turn is only released if it touched
// a file inside the window's workspace (spec 2026-07-19, strict status).
export class AttributionFilter {
  private buffer: Stamped[] = []
  private inTurn = false
  private attributed = false
  private turnStartTs = 0 // ts of the current turn-started — sidechain touches older than this don't count
  private readonly prefix: string // workspacePath + sep, normalized

  constructor(workspacePath: string) {
    this.prefix = path.resolve(workspacePath) + path.sep
  }

  private matches(file: string): boolean {
    const f = path.resolve(file)
    return f + path.sep === this.prefix || f.startsWith(this.prefix)
  }

  feed(ev: AgentEvent | SidechainTouch, historical: boolean): Stamped[] {
    if (ev.kind === 'sidechain-touch') {
      // A touch older than the current turn-started — replay of an old agent file from offset 0,
      // not about this turn; tool-use from the main file doesn't need this check — it's always in stream order.
      if (this.inTurn && !this.attributed && ev.ts >= this.turnStartTs && this.matches(ev.file)) return this.release()
      return []
    }
    if (ev.kind === 'turn-started') {
      this.buffer = [] // unattributed tail of the previous turn dies
      this.inTurn = true
      this.attributed = false
      this.turnStartTs = ev.ts
      this.buffer.push({ ev, historical })
      return []
    }
    if (!this.inTurn) return []
    if (this.attributed) {
      if (ev.kind === 'turn-completed') this.inTurn = false
      return [{ ev, historical }]
    }
    if (ev.kind === 'tool-use' && ev.file && this.matches(ev.file)) {
      this.buffer.push({ ev, historical })
      return this.release()
    }
    if (ev.kind === 'turn-completed') {
      this.buffer = []
      this.inTurn = false
      return []
    }
    this.buffer.push({ ev, historical })
    return []
  }

  private release(): Stamped[] {
    this.attributed = true
    const out = this.buffer
    this.buffer = []
    return out
  }
}

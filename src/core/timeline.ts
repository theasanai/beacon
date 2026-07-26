import type { AgentEvent, TimelineEntry } from './types'

interface CurrentTurn {
  prompt: string
  startedAt: number
  lastTs: number
  lastText?: string
  files: Set<string>
  completed: boolean
}

function firstLine(s: string, max: number): string {
  const line = s.split('\n')[0].trim()
  return line.length > max ? line.slice(0, max) + '…' : line
}

export class TimelineStore {
  private history: TimelineEntry[] = []
  private current?: CurrentTurn

  constructor(private readonly max = 10) {}

  feed(ev: AgentEvent): void {
    switch (ev.kind) {
      case 'turn-started':
        this.finalize(true)
        this.current = { prompt: ev.prompt, startedAt: ev.ts, lastTs: ev.ts, files: new Set(), completed: false }
        break
      case 'tool-use':
        if (this.current) {
          if (ev.file) this.current.files.add(ev.file)
          this.current.lastTs = ev.ts
        }
        break
      case 'assistant-text':
        if (this.current) {
          this.current.lastText = ev.text
          this.current.lastTs = ev.ts
        }
        break
      case 'turn-completed':
        if (this.current) {
          this.current.completed = true
          this.current.lastTs = ev.ts
        }
        break
      case 'attention':
        break
    }
  }

  entries(): TimelineEntry[] {
    const cur = this.current ? [this.toEntry(this.current)] : []
    // Honest replay: historical turns (ancestor sessions at startup) may arrive in feed()
    // later than fresh ones — we sort strictly by ts, not by arrival order
    return [...cur, ...this.history].sort((a, b) => b.ts - a.ts).slice(0, this.max)
  }

  private toEntry(t: CurrentTurn): TimelineEntry {
    return {
      ts: t.lastTs,
      prompt: firstLine(t.prompt, 80),
      outcome: t.lastText ? firstLine(t.lastText, 120) : '',
      filesTouched: t.files.size,
      completed: t.completed,
    }
  }

  private finalize(force: boolean): void {
    if (!this.current) return
    if (force) this.current.completed = true
    this.history.unshift(this.toEntry(this.current))
    this.history = this.history.slice(0, this.max)
    this.current = undefined
  }
}

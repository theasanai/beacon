import type { AgentAdapter } from '../agentAdapter'
import type { AgentEvent } from '../../core/types'
import { ancestorTranscriptDirs, transcriptDirFor } from './paths'
import { DirSource, type Emit } from './dirSource'

const RESCAN_EVERY_TICKS = 4 // rescan for newest files every N polls

export class ClaudeCodeAdapter implements AgentAdapter {
  private readonly sources: DirSource[]
  private readonly pollMs: number
  private timer?: ReturnType<typeof setInterval>
  private tick = 0
  private polling = false
  private disposed = false
  private readonly gate?: () => boolean

  constructor(opts: { workspacePath: string; home: string; pollMs?: number; watchAncestors?: boolean; gate?: () => boolean }) {
    const startTs = Date.now()
    const dirs = opts.watchAncestors === false
      ? [transcriptDirFor(opts.workspacePath, opts.home)]
      : ancestorTranscriptDirs(opts.workspacePath, opts.home)
    this.sources = dirs.map((dir, i) => new DirSource({
      dir, role: i === 0 ? 'self' : 'ancestor', workspacePath: opts.workspacePath, startTs,
    }))
    this.pollMs = opts.pollMs ?? 1500
    this.gate = opts.gate
  }

  // Own transcript with content has been found (even if the format is unrecognized).
  transcriptPresent(): boolean {
    return this.sources.some((s) => s.sawContent)
  }

  start(onEvent: (ev: AgentEvent, historical: boolean) => void): void {
    if (this.timer) return // repeated start() doesn't spawn duplicate intervals
    const emit: Emit = (ev, historical) => { if (!this.disposed) onEvent(ev, historical) }
    const poll = async () => {
      if (this.polling || this.disposed) return // poll doesn't overlap with itself
      if (this.gate && !this.gate()) return // window not focused and card hidden — skip the poll
      this.polling = true
      try {
        const rescan = this.tick % RESCAN_EVERY_TICKS === 0
        this.tick++
        for (const s of this.sources) {
          try {
            await s.poll(rescan, emit)
          } catch {
            /* one source failing doesn't silence polling the rest */
          }
        }
      } finally {
        this.polling = false
      }
    }
    void poll()
    this.timer = setInterval(poll, this.pollMs)
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearInterval(this.timer)
  }
}

import type { AgentEvent } from '../../core/types'

interface Block { type: string; text?: string; name?: string; input?: Record<string, unknown> }

// System-injected texts, not human-typed prompts. Match on real sentinels
// (not any '<', otherwise a legitimate "<div> won't center" is lost) and on bracketed
// interruption markers. The list is derived from real transcripts: <system-reminder>, slash commands,
// <ide_opened_file>, local commands, task notifications, [Request interrupted…].
function isInjection(text: string): boolean {
  return text.startsWith('<system-reminder')
    || text.startsWith('<command-')
    || text.startsWith('<ide')
    || text.startsWith('<local-command-')
    || text.startsWith('<task-notification')
    || text.startsWith('[Request interrupted')
}

// tool_result entries aren't prompts; a text block signals a human turn.
function looksHuman(o: any, blocks: Block[]): boolean {
  if (o.origin?.kind === 'human') return true
  // Loud degradation: in the current format, nearly all real prompts have origin === undefined.
  // We recognize a human turn by type:'user' + userType:'external' + a text block + no
  // tool_result. CRITICAL: isMeta entries ([Image…], "Base directory for skill…", environment
  // context) also have origin=undef/external with text — we do NOT count those as human prompts.
  return o.origin === undefined && o.userType === 'external' && o.isMeta !== true &&
    blocks.some((b) => b.type === 'text' && typeof b.text === 'string') &&
    !blocks.some((b) => b.type === 'tool_result' || b.type === 'tool-result')
}

export function parseTranscriptLine(line: string): AgentEvent[] {
  let o: any
  try {
    o = JSON.parse(line)
  } catch {
    return []
  }
  if (!o || typeof o !== 'object' || o.isSidechain === true) return []
  const ts = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN
  if (Number.isNaN(ts)) return []
  const blocks: Block[] = Array.isArray(o.message?.content)
    ? o.message.content.filter((b: unknown): b is Block => !!b && typeof b === 'object')
    : []

  if (o.type === 'user') {
    if (!looksHuman(o, blocks)) return []
    const text = blocks.find((b) => b.type === 'text' && typeof b.text === 'string')?.text?.trim()
    if (!text || isInjection(text)) return []
    return [{ kind: 'turn-started', prompt: text, ts }]
  }

  if (o.type === 'assistant') {
    const events: AgentEvent[] = []
    for (const b of blocks) {
      if (b.type === 'tool-use' || b.type === 'tool_use') {
        const file = typeof b.input?.file_path === 'string' ? (b.input.file_path as string) : undefined
        events.push({ kind: 'tool-use', tool: b.name ?? 'tool', file, ts })
      } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        events.push({ kind: 'assistant-text', text: b.text, ts })
      }
    }
    if (o.message?.stop_reason === 'end_turn') events.push({ kind: 'turn-completed', ts })
    return events
  }

  return []
}

// Sidechains (agent-*.jsonl): only file touches matter — as an attribution signal.
// We don't filter out isSidechain here: the entire file is a sidechain.
export function parseSidechainTouches(line: string): Array<{ file: string; ts: number }> {
  let o: any
  try {
    o = JSON.parse(line)
  } catch {
    return []
  }
  if (!o || typeof o !== 'object' || o.type !== 'assistant') return []
  const ts = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN
  if (Number.isNaN(ts)) return []
  const blocks: Block[] = Array.isArray(o.message?.content)
    ? o.message.content.filter((b: unknown): b is Block => !!b && typeof b === 'object')
    : []
  const out: Array<{ file: string; ts: number }> = []
  for (const b of blocks) {
    if ((b.type === 'tool-use' || b.type === 'tool_use') && typeof b.input?.file_path === 'string') {
      out.push({ file: b.input.file_path as string, ts })
    }
  }
  return out
}

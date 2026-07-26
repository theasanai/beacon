import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { identityFor } from '../core/identity'
import { encodeWorkspacePath } from '../core/encodePath'
import { hexToAnsi, RESET, DIM } from './render'

const IDLE_THRESHOLD_MS = 5 * 60 * 1000
const STALE_THRESHOLD_MS = 30 * 60 * 1000

export interface AgentStatus {
  agent: string
  emoji: string
  dot: string
  color: string
  bg: string
  fg: string
  project: string
  status: string
  prompt?: string
  files?: number
  ago?: string
}

function cleanPrompt(text: string): string {
  // Strip @file references (clipboard, images, etc.)
  let t = text.replace(/@\S+/g, '').trim()
  // Strip system markers
  if (t.startsWith('<system-reminder>') || t.startsWith('<command-name>')) return ''
  return t.slice(0, 40)
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

const TAIL_BYTES = 262_144 // 256 KB — matches the extension's TailReader

function readTailLines(file: string, maxLines: number): string[] {
  try {
    const fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    if (size === 0) { fs.closeSync(fd); return [] }
    const readSize = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(readSize)
    fs.readSync(fd, buf, 0, readSize, size - readSize)
    fs.closeSync(fd)
    let text = buf.toString('utf8')
    // If we didn't read from the start, drop the partial first line
    if (readSize < size) {
      const nl = text.indexOf('\n')
      if (nl >= 0) text = text.slice(nl + 1)
    }
    const lines = text.split('\n').filter(Boolean)
    return lines.length <= maxLines ? lines : lines.slice(-maxLines)
  } catch { return [] }
}

function readFirstLine(file: string): string | null {
  try {
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(4096)
    const n = fs.readSync(fd, buf, 0, 4096, 0)
    fs.closeSync(fd)
    const text = buf.toString('utf8', 0, n)
    const nl = text.indexOf('\n')
    return nl >= 0 ? text.slice(0, nl) : text
  } catch { return null }
}

function fileAge(file: string): number {
  try { return Date.now() - fs.statSync(file).mtimeMs } catch { return Infinity }
}

function latestByMtime(dir: string, files: string[]): string | null {
  if (files.length === 0) return null
  let best: string | null = null, bestMtime = -1
  for (const f of files) {
    try {
      const m = fs.statSync(path.join(dir, f)).mtimeMs
      if (m > bestMtime) { bestMtime = m; best = f }
    } catch {}
  }
  return best ? path.join(dir, best) : null
}

// Extract file paths from a parsed JSONL line (all agent formats)
function extractFilePaths(d: any): string[] {
  const paths: string[] = []
  // Claude: message.content[].input.file_path
  const content = d.message?.content
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c.input?.file_path) paths.push(c.input.file_path)
      if (c.input?.path) paths.push(c.input.path)
      if (c.input?.notebook_path) paths.push(c.input.notebook_path)
    }
  }
  // Qwen: message.parts[].functionCall.args.file_path
  const parts = d.message?.parts
  if (Array.isArray(parts)) {
    for (const p of parts) {
      const args = p.functionCall?.args || p.toolCall?.args
      if (args?.file_path) paths.push(args.file_path)
      if (args?.path) paths.push(args.path)
      if (args?.notebook_path) paths.push(args.notebook_path)
    }
  }
  // Codex: payload.content with file references
  if (d.payload?.file_path) paths.push(d.payload.file_path)
  if (d.payload?.path) paths.push(d.payload.path)
  return paths
}

// Detect which sub-project under cwd is being actively worked on
function detectActiveProject(cwd: string, lines: string[]): string {
  const root = cwd.endsWith(path.sep) ? cwd : cwd + path.sep
  // Scan from most recent lines backwards
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
    try {
      const d = JSON.parse(lines[i])
      for (const fp of extractFilePaths(d)) {
        if (fp.startsWith(root)) {
          const rest = fp.slice(root.length)
          const sep = rest.indexOf(path.sep)
          if (sep > 0) return path.join(cwd, rest.slice(0, sep))
        }
      }
    } catch {}
  }
  return cwd
}

// --- Claude Code ---
function checkClaude(cwd: string): AgentStatus | null {
  const dir = path.join(os.homedir(), '.claude/projects', encodeWorkspacePath(cwd))
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
  if (files.length === 0) return null
  const latest = latestByMtime(dir, files)
  if (!latest) return null
  const age = fileAge(latest)
  if (age > STALE_THRESHOLD_MS) return null

  const lines = readTailLines(latest, 500)
  let status = 'idle', prompt: string | undefined, files_touched = 0
  // Status from last 5 lines
  for (const l of lines.slice(-5).reverse()) {
    try {
      const d = JSON.parse(l)
      if (d.type === 'assistant') {
        const sr = d.message?.stop_reason
        if (sr === 'tool_use') { status = 'working'; files_touched++ }
        else if (sr === 'end_turn') status = 'waiting'
      }
    } catch {}
  }
  // Prompt from full window (scan backwards)
  for (const l of [...lines].reverse()) {
    try {
      const d = JSON.parse(l)
      if (d.type === 'user' && d.origin?.kind === 'human' && !prompt) {
        const content = d.message?.content
        if (Array.isArray(content)) {
          const t = content.find((c: any) => c.type === 'text')?.text
          if (t) prompt = cleanPrompt(t) || undefined
        } else if (typeof content === 'string') {
          prompt = cleanPrompt(content) || undefined
        }
      }
    } catch {}
  }
  if (age > IDLE_THRESHOLD_MS) status = 'idle'
  const projectPath = detectActiveProject(cwd, lines)
  const id = identityFor(projectPath)
  return {
    agent: 'Claude', emoji: '🤖', project: id.name, bg: id.bg, fg: id.fg,
    dot: status === 'working' ? '🟢' : status === 'waiting' ? '🟡' : '⚪',
    color: status === 'working' ? '\x1b[32m' : status === 'waiting' ? '\x1b[33m' : '\x1b[90m',
    status, prompt, files: files_touched || undefined,
    ago: age > 60000 ? formatAge(age) : undefined,
  }
}

// --- Qwen Code ---
function checkQwen(cwd: string): AgentStatus | null {
  const dir = path.join(os.homedir(), '.qwen/projects', encodeWorkspacePath(cwd), 'chats')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
  if (files.length === 0) return null
  const latest = latestByMtime(dir, files)
  if (!latest) return null
  const age = fileAge(latest)
  if (age > STALE_THRESHOLD_MS) return null

  const lines = readTailLines(latest, 500)
  let status = 'idle', prompt: string | undefined, files_touched = 0
  // Status from last 5 lines
  for (const l of lines.slice(-5).reverse()) {
    try {
      const d = JSON.parse(l)
      if (d.type === 'assistant') {
        const parts = d.message?.parts
        if (Array.isArray(parts)) {
          const hasTool = parts.some((p: any) => p.toolCall || p.functionCall)
          status = hasTool ? 'working' : 'waiting'
          if (hasTool) files_touched++
        } else { status = 'waiting' }
      }
      if (d.type === 'tool_result') { status = 'working'; files_touched++ }
    } catch {}
  }
  // Prompt from full window (scan backwards)
  for (const l of [...lines].reverse()) {
    try {
      const d = JSON.parse(l)
      if (d.type === 'user' && !prompt) {
        const parts = d.message?.parts
        if (Array.isArray(parts)) {
          const tp = parts.find((p: any) => p.text && !p.functionResponse)
          if (tp) prompt = cleanPrompt(tp.text as string) || undefined
        }
      }
    } catch {}
  }
  if (age > IDLE_THRESHOLD_MS) status = 'idle'
  const projectPath = detectActiveProject(cwd, lines)
  const id = identityFor(projectPath)
  return {
    agent: 'Qwen', emoji: '🔮', project: id.name, bg: id.bg, fg: id.fg,
    dot: status === 'working' ? '🟢' : status === 'waiting' ? '🟡' : '⚪',
    color: status === 'working' ? '\x1b[32m' : status === 'waiting' ? '\x1b[33m' : '\x1b[90m',
    status, prompt, files: files_touched || undefined,
    ago: age > 60000 ? formatAge(age) : undefined,
  }
}

// --- Kimi Code ---
function checkKimi(cwd: string): AgentStatus | null {
  const sessionsDir = path.join(os.homedir(), '.kimi-code/sessions')
  if (!fs.existsSync(sessionsDir)) return null
  // Find session with matching workDir
  const workspaces = fs.readdirSync(sessionsDir).filter(d => d.startsWith('wd_'))
  for (const ws of workspaces) {
    const wsPath = path.join(sessionsDir, ws)
    const sessionDirs = fs.readdirSync(wsPath).filter(d => d.startsWith('session_'))
    for (const sd of sessionDirs) {
      const stateFile = path.join(wsPath, sd, 'state.json')
      if (!fs.existsSync(stateFile)) continue
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
        if (state.workDir !== cwd) continue
        const age = Date.now() - new Date(state.updatedAt).getTime()
        if (age > STALE_THRESHOLD_MS) continue

        const wireFile = path.join(wsPath, sd, 'agents/main/wire.jsonl')
        let status = 'idle'
        let wireLines: string[] = []
        if (fs.existsSync(wireFile)) {
          wireLines = readTailLines(wireFile, 50)
          for (const l of wireLines.slice(-3).reverse()) {
            try {
              const d = JSON.parse(l)
              if (d.type === 'assistant.message' || d.type === 'tool.call') status = 'working'
              else if (d.type === 'assistant.message.end') status = 'waiting'
            } catch {}
          }
        }
        if (age > IDLE_THRESHOLD_MS) status = 'idle'
        const projectPath = detectActiveProject(cwd, wireLines)
        const id = identityFor(projectPath)
        const prompt = cleanPrompt(state.lastPrompt || '') || undefined
        return {
          agent: 'Kimi', emoji: '🌙', project: id.name, bg: id.bg, fg: id.fg,
          dot: status === 'working' ? '🟢' : status === 'waiting' ? '🟡' : '⚪',
          color: status === 'working' ? '\x1b[32m' : status === 'waiting' ? '\x1b[33m' : '\x1b[90m',
          status, prompt,
          ago: age > 60000 ? formatAge(age) : undefined,
        }
      } catch {}
    }
  }
  return null
}

// --- Codex ---
function checkCodex(cwd: string): AgentStatus | null {
  const sessionsDir = path.join(os.homedir(), '.codex/sessions')
  if (!fs.existsSync(sessionsDir)) return null
  // Check recent rollout files (last 2 days)
  const now = new Date()
  for (let d = 0; d < 2; d++) {
    const date = new Date(now.getTime() - d * 86400000)
    const dateDir = path.join(sessionsDir,
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'))
    if (!fs.existsSync(dateDir)) continue
    const files = fs.readdirSync(dateDir).filter(f => f.startsWith('rollout-') && f.endsWith('.jsonl'))
    const sorted = files.map(f => ({ f, m: fileAge(path.join(dateDir, f)) }))
      .sort((a, b) => a.m - b.m)
      .slice(0, 3)
    for (const { f } of sorted) {
      const fp = path.join(dateDir, f)
      const age = fileAge(fp)
      if (age > STALE_THRESHOLD_MS) continue
      // Read first line for session_meta with cwd
      try {
        const firstLine = readFirstLine(fp)
        if (!firstLine) continue
        const meta = JSON.parse(firstLine)
        if (meta.type !== 'session_meta') continue
        const metaCwd = meta.payload?.cwd || meta.payload?.workdir
        if (metaCwd !== cwd) continue

        // Read tail for status + project detection
        const lines = readTailLines(fp, 50)
        let status = 'idle', prompt: string | undefined
        for (const l of lines.slice(-5).reverse()) {
          try {
            const d = JSON.parse(l)
            if (d.type === 'event_msg' && d.payload?.role === 'user' && !prompt) {
              prompt = cleanPrompt(d.payload?.content || d.payload?.text || '') || undefined
            }
            if (d.type === 'response_item') status = 'working'
            if (d.type === 'event_msg' && d.payload?.role === 'assistant') status = 'waiting'
          } catch {}
        }
        if (age > IDLE_THRESHOLD_MS) status = 'idle'
        const projectPath = detectActiveProject(cwd, lines)
        const id = identityFor(projectPath)
        return {
          agent: 'Codex', emoji: '🧬', project: id.name, bg: id.bg, fg: id.fg,
          dot: status === 'working' ? '🟢' : status === 'waiting' ? '🟡' : '⚪',
          color: status === 'working' ? '\x1b[32m' : status === 'waiting' ? '\x1b[33m' : '\x1b[90m',
          status, prompt,
          ago: age > 60000 ? formatAge(age) : undefined,
        }
      } catch {}
    }
  }
  return null
}

// --- Shared: check all agents for a workspace ---
export function checkAllAgents(cwd: string): AgentStatus[] {
  return [checkClaude(cwd), checkQwen(cwd), checkKimi(cwd), checkCodex(cwd)]
    .filter((a): a is AgentStatus => a !== null)
}

// --- Main statusline ---
export async function runStatusline(): Promise<void> {
  // Read stdin JSON (Qwen Code or Claude Code format)
  let ctx: any = {}
  if (!process.stdin.isTTY) {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
      ctx = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {}
  }

  // Extract cwd from either format
  const cwd = ctx.workspace?.current_dir  // Qwen Code
    || ctx.workspace_dir                   // Claude Code
    || ctx.cwd                             // generic
    || process.cwd()

  // Check all agents
  const agents = [checkClaude(cwd), checkQwen(cwd), checkKimi(cwd), checkCodex(cwd)]
    .filter((a): a is AgentStatus => a !== null)

  // Line 1: agent statuses
  if (agents.length > 0) {
    const parts = agents.map(a => {
      const nameColor = hexToAnsi(a.bg)
      const promptStr = a.prompt ? ` ${DIM}"${a.prompt}"${RESET}` : ''
      const filesStr = a.files ? ` ${DIM}· ${a.files} files${RESET}` : ''
      const agoStr = a.ago ? ` ${DIM}· ${a.ago}${RESET}` : ''
      return `${a.dot} ${nameColor}${a.emoji} ${a.project}${RESET} ${DIM}(${a.agent})${RESET}${a.color} · ${a.status}${RESET}${promptStr}${filesStr}${agoStr}`
    })
    console.log(parts.join(`  ${DIM}│${RESET}  `))
  }

  // Line 2: context info (model, branch, ctx%)
  const model = ctx.model?.display_name   // Qwen Code
    || ctx.model                           // Claude Code (string)
    || ''
  const pct = ctx.context_window?.used_percentage
  const branch = ctx.git?.branch || ''
  const ctxParts: string[] = []
  if (branch) ctxParts.push(`⎇ ${branch}`)
  if (model) ctxParts.push(typeof model === 'string' ? model : String(model))
  if (pct != null) ctxParts.push(`${pct}% ctx`)
  if (ctxParts.length > 0) {
    console.log(`${DIM}${ctxParts.join(' · ')}${RESET}`)
  }
}

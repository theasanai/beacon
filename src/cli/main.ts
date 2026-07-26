import * as os from 'node:os'
import * as path from 'node:path'
import { identityFor } from '../core/identity'
import { initialStatus, reduceStatus, reduceHistorical, tickStatus, statusLabel } from '../core/statusMachine'
import { TimelineStore } from '../core/timeline'
import { FleetStore } from '../fleet/fleetStore'
import { ClaudeCodeAdapter } from '../adapters/claudeCode/adapter'
import { beaconStateDir } from '../hooks/hooksManager'
import type { AgentEvent, StatusState, FleetRow, Identity } from '../core/types'
import { statusDot, statusColor, badge, colored, truncate, timeAgo, BOLD, DIM, RESET } from './render'
import { runStatusline, checkAllAgents, type AgentStatus } from './statusline'

const IDLE_MS = 30 * 60 * 1000

interface Snapshot {
  identity: Identity
  status: StatusState
  label: string
  timeline: ReturnType<TimelineStore['entries']>
  fleet: FleetRow[]
  cwd: string
}

async function gather(cwd: string): Promise<Snapshot> {
  const home = os.homedir()
  const identity = identityFor(cwd)
  let status = initialStatus()
  const timeline = new TimelineStore(10)

  const adapter = new ClaudeCodeAdapter({
    workspacePath: cwd,
    home,
    pollMs: 500,
    watchAncestors: true,
    gate: () => true,
  })

  await new Promise<void>((resolve) => {
    adapter.start((ev: AgentEvent, historical: boolean) => {
      if (historical) status = reduceHistorical(status, ev)
      else status = reduceStatus(status, ev)
      timeline.feed(ev)
    })
    setTimeout(() => { adapter.dispose(); resolve() }, 3000)
  })

  const now = Date.now()
  status = tickStatus(status, now, IDLE_MS)

  const fleetDir = path.join(beaconStateDir(home), 'fleet')
  const fleet = new FleetStore(fleetDir, cwd)
  const rows = await fleet.readOthers(now)

  return { identity, status, label: statusLabel(status, now), timeline: timeline.entries(), fleet: rows, cwd }
}

function printStatus(s: Snapshot): void {
  const { identity: id, status, label, timeline, fleet, cwd } = s
  const now = Date.now()

  console.log()
  console.log(`  ${badge(id.emoji + ' ' + id.name, id.bg, id.fg)}  ${statusColor(status.kind)}${statusDot(status.kind)} ${label}${RESET}`)
  console.log()

  if (timeline.length > 0) {
    console.log(`  ${BOLD}Recent turns${RESET}`)
    for (const e of timeline.slice(0, 5)) {
      const ago = timeAgo(e.ts, now)
      const prompt = truncate(e.prompt, 50)
      const outcome = e.outcome ? truncate(e.outcome, 40) : DIM + '…' + RESET
      const files = e.filesTouched > 0 ? DIM + ` (${e.filesTouched} files)` + RESET : ''
      console.log(`  ${DIM}${ago.padStart(4)}${RESET}  ${prompt}`)
      console.log(`        ${outcome}${files}`)
    }
    console.log()
  }

  if (fleet.length > 0) {
    console.log(`  ${BOLD}Fleet${RESET} ${DIM}(${fleet.length} other window${fleet.length > 1 ? 's' : ''})${RESET}`)
    for (const r of fleet) {
      const dot = statusDot(r.status)
      const name = colored(r.emoji + ' ' + r.name, r.bg)
      const event = r.lastEvent ? DIM + ' — ' + truncate(r.lastEvent, 40) + RESET : ''
      console.log(`  ${dot} ${name}${event}`)
    }
    console.log()
  }

  printMultiAgent(cwd)
}

function printMultiAgent(cwd: string): void {
  const agents = checkAllAgents(cwd)
  if (agents.length === 0) return
  console.log(`  ${BOLD}Agents${RESET} ${DIM}(${agents.length} active)${RESET}`)
  for (const a of agents) {
    const promptStr = a.prompt ? DIM + ' "' + a.prompt + '"' + RESET : ''
    const filesStr = a.files ? DIM + ` · ${a.files} files` + RESET : ''
    const agoStr = a.ago ? DIM + ` · ${a.ago}` + RESET : ''
    console.log(`  ${a.dot} ${a.color}${a.emoji} ${a.project}${RESET} ${DIM}(${a.agent})${RESET}${a.color} · ${a.status}${RESET}${promptStr}${filesStr}${agoStr}`)
  }
  console.log()
}

function printTmux(s: Snapshot): void {
  const { identity: id, status } = s
  const dot = statusDot(status.kind)
  // tmux status line: emoji NAME dot
  process.stdout.write(`${id.emoji} ${id.name} ${dot}`)
}

function printPrompt(s: Snapshot): void {
  const { identity: id, status } = s
  // Minimal: just dot + emoji for shell prompt
  process.stdout.write(`${statusDot(status.kind)} ${id.emoji}`)
}

async function watch(cwd: string): Promise<void> {
  const home = os.homedir()
  const identity = identityFor(cwd)
  let status = initialStatus()
  const timeline = new TimelineStore(10)

  const adapter = new ClaudeCodeAdapter({
    workspacePath: cwd,
    home,
    pollMs: 1500,
    watchAncestors: true,
    gate: () => true,
  })

  adapter.start((ev: AgentEvent, historical: boolean) => {
    status = historical ? reduceHistorical(status, ev) : reduceStatus(status, ev)
    timeline.feed(ev)
  })

  const fleetDir = path.join(beaconStateDir(home), 'fleet')
  const fleet = new FleetStore(fleetDir, cwd)

  // Write own heartbeat
  const writeHb = async () => {
    const now = Date.now()
    status = tickStatus(status, now, IDLE_MS)
    await fleet.writeHeartbeat({
      path: cwd, name: identity.name, emoji: identity.emoji,
      bg: identity.bg, fg: identity.fg,
      status: status.kind, ts: now,
    })
  }
  await writeHb()
  const hbTimer = setInterval(writeHb, 5000)

  const render = async () => {
    const now = Date.now()
    status = tickStatus(status, now, IDLE_MS)
    const rows = await fleet.readOthers(now)
    const snap: Snapshot = { identity, status, label: statusLabel(status, now), timeline: timeline.entries(), fleet: rows, cwd }

    // Clear screen and render
    process.stdout.write('\x1b[2J\x1b[H')
    console.log(`${BOLD}  Beacon — watch mode${RESET}  ${DIM}(Ctrl+C to quit)${RESET}`)
    printStatus(snap)
  }

  await render()
  const renderTimer = setInterval(render, 2000)

  const cleanup = async () => {
    clearInterval(renderTimer)
    clearInterval(hbTimer)
    adapter.dispose()
    await fleet.removeSelf()
    process.stdout.write('\x1b[2J\x1b[H')
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

// --- main ---
const args = process.argv.slice(2)
const cmd = args[0] ?? 'status'
const cwd = process.cwd()

async function main(): Promise<void> {
  switch (cmd) {
    case 'status': {
      const s = await gather(cwd)
      printStatus(s)
      break
    }
    case 'tmux': {
      const s = await gather(cwd)
      printTmux(s)
      break
    }
    case 'prompt': {
      const s = await gather(cwd)
      printPrompt(s)
      break
    }
    case 'watch': {
      await watch(cwd)
      break
    }
    case 'statusline': {
      await runStatusline()
      break
    }
    default:
      console.error(`Usage: beacon [status|watch|tmux|prompt|statusline]`)
      process.exit(1)
  }
}

main().catch(err => { console.error('beacon:', err.message); process.exit(1) })

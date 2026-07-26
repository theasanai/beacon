import type { StatusKind } from '../core/types'

export function hexToAnsi(hex: string, fg = true): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return fg ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[48;2;${r};${g};${b}m`
}

export const RESET = '\x1b[0m'
export const BOLD = '\x1b[1m'
export const DIM = '\x1b[2m'

const STATUS_DOT: Record<StatusKind, string> = {
  working: '🟢',
  waiting: '🟡',
  attention: '🟡',
  idle: '⚪',
  unavailable: '⚪',
}

export function statusDot(kind: StatusKind): string {
  return STATUS_DOT[kind] ?? '⚪'
}

export function statusColor(kind: StatusKind): string {
  switch (kind) {
    case 'working': return '\x1b[32m'
    case 'waiting': case 'attention': return '\x1b[33m'
    default: return '\x1b[90m'
  }
}

export function colored(text: string, hex: string, bg = false): string {
  return hexToAnsi(hex, !bg) + text + RESET
}

export function badge(text: string, bgHex: string, fgHex: string): string {
  return hexToAnsi(bgHex, false) + hexToAnsi(fgHex, true) + ` ${text} ` + RESET
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export function timeAgo(ts: number, now: number): string {
  const s = Math.floor((now - ts) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h`
}

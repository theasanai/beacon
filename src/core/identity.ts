import * as path from 'node:path'
import type { Identity } from './types'

export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// 12 peripherally distinguishable project colors, with names for the color picker palette.
export const NAMED_PALETTE: Array<{ name: string; hex: string }> = [
  { name: 'Ocean', hex: '#0e639c' }, { name: 'Grape', hex: '#68217a' },
  { name: 'Ember', hex: '#b5200d' }, { name: 'Pine', hex: '#00754b' },
  { name: 'Amber', hex: '#c27803' }, { name: 'Violet', hex: '#5b2e91' },
  { name: 'Teal', hex: '#006c6c' }, { name: 'Ruby', hex: '#a21d57' },
  { name: 'Moss', hex: '#3a5f0b' }, { name: 'Bronze', hex: '#7a3e00' },
  { name: 'Indigo', hex: '#274fad' }, { name: 'Plum', hex: '#8a1c7c' },
]

const EMOJI = ['🔵','🟣','🔴','🟢','🟡','🧭','⛰️','🌊','🔥','🌲','⭐','🛰️','🎯','🧱','🚀','🪐']

const GENERIC = new Set(['app', 'src', 'web', 'frontend', 'backend', 'client', 'server', 'site'])

export function isValidHex(s: string): boolean {
  return /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(s.trim())
}

// Status bar text: 'emoji NAME' and, if present, '· label'. Pure build — testable without vscode.
export function statusBarText(id: Identity, label?: string): string {
  const head = `${id.emoji} ${id.name}`
  return label ? `${head} · ${label}` : head
}

function normHex(s: string): string {
  const t = s.trim().toLowerCase()
  return t.length === 4 ? '#' + [...t.slice(1)].map((c) => c + c).join('') : t
}

function relLum(hex: string): number {
  const h = normHex(hex)
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}

const DARK_REF_LUM = relLum('#1e1e1e') // cache: the reference doesn't change, no need to recompute per call

// Contrast text: black (#1e1e1e) or white — whichever gives greater contrast (WCAG)
export function contrastFg(bgHex: string): string {
  const L = relLum(bgHex)
  const cWhite = 1.05 / (L + 0.05)
  const cDark = (L + 0.05) / (DARK_REF_LUM + 0.05)
  return cWhite >= cDark ? '#ffffff' : '#1e1e1e'
}

export function identityFor(
  workspacePath: string,
  opts: { emoji?: string; color?: string } = {},
): Identity {
  const parts = workspacePath.split(path.sep).filter(Boolean)
  let base = parts[parts.length - 1] ?? 'project'
  if (GENERIC.has(base.toLowerCase()) && parts.length >= 2) base = parts[parts.length - 2]
  const h = fnv1a(workspacePath)
  const bg = opts.color && isValidHex(opts.color)
    ? normHex(opts.color)
    : NAMED_PALETTE[h % NAMED_PALETTE.length].hex
  const fg = contrastFg(bg)
  const emoji = opts.emoji?.trim() ? opts.emoji.trim() : EMOJI[h % EMOJI.length]
  return { name: base.toUpperCase(), bg, fg, emoji }
}

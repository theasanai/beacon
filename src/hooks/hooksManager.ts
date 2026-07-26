import * as fs from 'node:fs'
import * as path from 'node:path'

const EVENTS = ['Stop', 'Notification'] as const

function isBeaconEntry(entry: any): boolean {
  return Array.isArray(entry?.hooks) && entry.hooks.some(
    (h: any) => typeof h?.command === 'string' && h.command.includes('beacon') && h.command.includes('hook.js'),
  )
}

export function hasBeaconHooks(settings: any): boolean {
  return EVENTS.some((ev) => (settings?.hooks?.[ev] ?? []).some(isBeaconEntry))
}

export function withBeaconHooks(settings: any, hookCmd: string): any {
  const out = structuredClone(settings ?? {})
  out.hooks = out.hooks ?? {}
  for (const ev of EVENTS) {
    const list: any[] = out.hooks[ev] ?? []
    if (!list.some(isBeaconEntry)) list.push({ hooks: [{ type: 'command', command: hookCmd }] })
    out.hooks[ev] = list
  }
  return out
}

export function withoutBeaconHooks(settings: any): any {
  const out = structuredClone(settings ?? {})
  for (const ev of EVENTS) {
    if (Array.isArray(out?.hooks?.[ev])) out.hooks[ev] = out.hooks[ev].filter((e: any) => !isBeaconEntry(e))
  }
  return out
}

// whether all beacon entries point to the current hook.js (path changes on extension update)
export function hookCmdCurrent(settings: any, hookCmd: string): boolean {
  const lists = [settings?.hooks?.Stop, settings?.hooks?.Notification]
  return lists.every((l) => !Array.isArray(l) || l.filter(isBeaconEntry).every(
    (e: any) => e.hooks.some((h: any) => h.command === hookCmd)))
}

export async function refreshHooks(settingsPath: string, hookCmd: string): Promise<void> {
  await rewrite(settingsPath, (s) => withBeaconHooks(withoutBeaconHooks(s), hookCmd))
}

export function beaconStateDir(home: string): string {
  return path.join(home, '.local', 'state', 'beacon', 'events')
}

async function rewrite(settingsPath: string, transform: (s: any) => any): Promise<void> {
  let current: any = {}
  if (fs.existsSync(settingsPath)) {
    // don't overwrite corrupt JSON with an empty object — fail with a clear error
    try {
      current = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'))
    } catch {
      throw new Error('~/.claude/settings.json is not valid JSON — fix it manually first')
    }
    await fs.promises.copyFile(settingsPath, settingsPath + '.beacon-bak')
  }
  const next = transform(current)
  const tmp = settingsPath + '.tmp'
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true })
  await fs.promises.writeFile(tmp, JSON.stringify(next, null, 2) + '\n')
  await fs.promises.rename(tmp, settingsPath)
}

export async function installHooks(settingsPath: string, hookCmd: string): Promise<void> {
  await rewrite(settingsPath, (s) => withBeaconHooks(s, hookCmd))
}

export async function removeHooks(settingsPath: string): Promise<void> {
  await rewrite(settingsPath, withoutBeaconHooks)
}

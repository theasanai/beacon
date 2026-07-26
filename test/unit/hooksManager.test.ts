import { describe, it, expect } from 'vitest'
import { withBeaconHooks, withoutBeaconHooks, hasBeaconHooks, hookCmdCurrent } from '../../src/hooks/hooksManager'

const CMD = 'node /ext/beacon/dist/hook.js'

describe('hooksManager', () => {
  it('adds Stop and Notification while preserving foreign hooks', () => {
    const before = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-own' }] }] }, model: 'x' }
    const after = withBeaconHooks(before, CMD)
    expect(after.model).toBe('x')
    expect(after.hooks.Stop).toHaveLength(2)
    expect(after.hooks.Notification).toHaveLength(1)
    expect(JSON.stringify(after)).toContain(CMD)
    expect(hasBeaconHooks(after)).toBe(true)
    expect(hasBeaconHooks(before)).toBe(false)
  })
  it('idempotent: repeated addition does not duplicate', () => {
    const once = withBeaconHooks({}, CMD)
    const twice = withBeaconHooks(once, CMD)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })
  it('removes only its own hooks', () => {
    const s = withBeaconHooks({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-own' }] }] } }, CMD)
    const cleaned = withoutBeaconHooks(s)
    expect(JSON.stringify(cleaned)).not.toContain('hook.js')
    expect(JSON.stringify(cleaned)).toContain('my-own')
    expect(cleaned.hooks.Notification ?? []).toHaveLength(0)
  })
  it('refresh: outdated hook.js path is replaced with new one, foreign hook intact', () => {
    const OLD = 'node /old/beacon-0.0.9/dist/hook.js'
    const NEW_CMD = 'node /new/beacon-0.1.0/dist/hook.js'
    const isBeacon = (e: any) => e.hooks.some(
      (h: any) => h.command.includes('beacon') && h.command.includes('hook.js'))
    const s = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'my-own' }] }, { hooks: [{ type: 'command', command: OLD }] }],
        Notification: [{ hooks: [{ type: 'command', command: OLD }] }],
      },
    }
    expect(hookCmdCurrent(s, NEW_CMD)).toBe(false)
    const refreshed = withBeaconHooks(withoutBeaconHooks(s), NEW_CMD)
    expect(hookCmdCurrent(refreshed, NEW_CMD)).toBe(true)
    for (const ev of ['Stop', 'Notification'] as const) {
      const ours = refreshed.hooks[ev].filter(isBeacon)
      expect(ours).toHaveLength(1) // exactly one beacon entry per event
      expect(ours[0].hooks[0].command).toBe(NEW_CMD)
    }
    expect(JSON.stringify(refreshed.hooks.Stop)).toContain('my-own') // foreign hook intact
    expect(JSON.stringify(refreshed)).not.toContain(OLD)
  })
  it('foreign hook with hook.js in path — not ours: addition is not skipped, removal does not touch it', () => {
    const foreign = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node /tools/prehook.js' }] }] } }
    const withOurs = withBeaconHooks(foreign, CMD)
    expect(withOurs.hooks.Stop).toHaveLength(2) // foreign + ours
    const cleaned = withoutBeaconHooks(withOurs)
    expect(JSON.stringify(cleaned)).toContain('/tools/prehook.js')
    expect(JSON.stringify(cleaned)).not.toContain(CMD)
  })
})

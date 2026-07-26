import { describe, it, expect } from 'vitest'
import { BEACON_COLOR_KEYS, snapshotPrior, restoreColors } from '../../src/core/identityColors'
import { statusBarText } from '../../src/core/identity'
import type { Identity } from '../../src/core/types'

describe('identityColors: snapshot/restore', () => {
  it('snapshotPrior captures pre-Beacon values; missing keys → null', () => {
    const existing = { 'titleBar.activeBackground': '#111111', 'editor.background': '#000000' }
    const prior = snapshotPrior(existing)
    expect(prior['titleBar.activeBackground']).toBe('#111111')
    expect(prior['statusBar.background']).toBe(null) // key was not present
    // keys outside the Beacon set are not included in the snapshot
    expect(Object.keys(prior)).toEqual([...BEACON_COLOR_KEYS])
  })

  it('restoreColors returns pre-Beacon values and removes keys that did not exist', () => {
    const existing = { 'titleBar.activeBackground': '#111111', 'editor.background': '#000000' }
    const prior = snapshotPrior(existing)
    // Beacon repainted the window
    const beaconified = {
      ...existing,
      'titleBar.activeBackground': '#0e639c',
      'titleBar.activeForeground': '#ffffff',
      'statusBar.background': '#0e639c',
      'statusBar.foreground': '#ffffff',
    }
    const restored = restoreColors(beaconified, prior)
    expect(restored['titleBar.activeBackground']).toBe('#111111') // original value restored
    expect('statusBar.background' in restored).toBe(false)        // was not present — removed
    expect('titleBar.activeForeground' in restored).toBe(false)   // was not present — removed
    expect(restored['editor.background']).toBe('#000000')         // foreign key untouched
  })

  it('round-trip: snapshot → beaconify → restore returns original for Beacon keys', () => {
    const existing = { 'statusBar.background': '#222222', 'statusBar.foreground': '#eeeeee' }
    const prior = snapshotPrior(existing)
    const beaconified = { 'statusBar.background': '#b5200d', 'statusBar.foreground': '#ffffff', 'titleBar.activeBackground': '#b5200d' }
    const restored = restoreColors(beaconified, prior)
    expect(restored['statusBar.background']).toBe('#222222')
    expect(restored['statusBar.foreground']).toBe('#eeeeee')
    expect('titleBar.activeBackground' in restored).toBe(false)
  })
})

describe('statusBarText — identity change is reflected in text', () => {
  const a: Identity = { name: 'GIGANT', bg: '#0e639c', fg: '#ffffff', emoji: '⛰️' }
  const b: Identity = { name: 'ONEIRA', bg: '#68217a', fg: '#ffffff', emoji: '🌊' }
  it('without label — only emoji and name', () => {
    expect(statusBarText(a)).toBe('⛰️ GIGANT')
  })
  it('with label — status is appended', () => {
    expect(statusBarText(a, 'working…')).toBe('⛰️ GIGANT · working…')
  })
  it('new identity produces new text (live update without reload)', () => {
    expect(statusBarText(b, 'working…')).toBe('🌊 ONEIRA · working…')
    expect(statusBarText(a, 'working…')).not.toBe(statusBarText(b, 'working…'))
  })
})

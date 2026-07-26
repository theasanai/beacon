import { describe, it, expect } from 'vitest'
import { identityFor, fnv1a, isValidHex, contrastFg, NAMED_PALETTE } from '../../src/core/identity'

describe('identityFor', () => {
  it('takes name from folder, generic folders promote the parent', () => {
    expect(identityFor('/Users/v/projects/gigant/app').name).toBe('GIGANT')
    expect(identityFor('/Users/v/projects/sonburg').name).toBe('SONBURG')
  })
  it('color is stable for a path and differs between paths', () => {
    const a1 = identityFor('/Users/v/projects/gigant/app')
    const a2 = identityFor('/Users/v/projects/gigant/app')
    const b = identityFor('/Users/v/projects/sonburg')
    expect(a1.bg).toBe(a2.bg)
    expect(a1.bg).toMatch(/^#[0-9a-f]{6}$/i)
    expect(a1.bg).not.toBe(b.bg)
  })
  it('emoji is stable, override via opts wins', () => {
    const a = identityFor('/Users/v/projects/gigant/app')
    expect(identityFor('/Users/v/projects/gigant/app').emoji).toBe(a.emoji)
    expect(identityFor('/Users/v/projects/gigant/app', { emoji: '⛰️' }).emoji).toBe('⛰️')
  })
  it('valid color-override becomes bg, invalid falls back to palette hash', () => {
    const auto = identityFor('/Users/v/projects/gigant/app').bg
    expect(identityFor('/Users/v/projects/gigant/app', { color: '#123456' }).bg).toBe('#123456')
    expect(identityFor('/Users/v/projects/gigant/app', { color: 'nonsense' }).bg).toBe(auto)
    expect(identityFor('/Users/v/projects/gigant/app', { color: '' }).bg).toBe(auto)
  })
  it('fnv1a is deterministic', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'))
  })
})

describe('isValidHex', () => {
  it('accepts #rgb and #rrggbb, rejects garbage', () => {
    expect(isValidHex('#0e639c')).toBe(true)
    expect(isValidHex('#abc')).toBe(true)
    expect(isValidHex('0e639c')).toBe(false)
    expect(isValidHex('#12')).toBe(false)
    expect(isValidHex('red')).toBe(false)
  })
})

describe('contrastFg', () => {
  it('dark background → white text, light background → dark text', () => {
    expect(contrastFg('#0e639c')).toBe('#ffffff')
    expect(contrastFg('#ffffff')).toBe('#1e1e1e')
    expect(contrastFg('#c27803')).toBe('#1e1e1e') // Amber — light amber
  })
  it('all 12 palette colors match the previous manual selection', () => {
    const manual: Record<string, string> = {
      '#0e639c': '#ffffff', '#68217a': '#ffffff', '#b5200d': '#ffffff', '#00754b': '#ffffff',
      '#c27803': '#1e1e1e', '#5b2e91': '#ffffff', '#006c6c': '#ffffff', '#a21d57': '#ffffff',
      '#3a5f0b': '#ffffff', '#7a3e00': '#ffffff', '#274fad': '#ffffff', '#8a1c7c': '#ffffff',
    }
    for (const { hex } of NAMED_PALETTE) expect(contrastFg(hex)).toBe(manual[hex])
  })
})

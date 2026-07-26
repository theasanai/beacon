// workbench.colorCustomizations keys that Beacon uses to color the window. Kept here (without vscode)
// so both applyIdentity and the save/restore logic rely on a single list.
export const BEACON_COLOR_KEYS = [
  'titleBar.activeBackground',
  'titleBar.activeForeground',
  'titleBar.inactiveBackground',
  'titleBar.inactiveForeground',
  'statusBar.background',
  'statusBar.foreground',
] as const

export type ColorMap = Record<string, string>
// null = the key didn't exist before Beacon (on restore it should be deleted, not set)
export type PriorColors = Record<string, string | null>

// Snapshot of values that existed before Beacon first overwrote them.
export function snapshotPrior(existing: ColorMap): PriorColors {
  const prior: PriorColors = {}
  for (const k of BEACON_COLOR_KEYS) {
    prior[k] = Object.prototype.hasOwnProperty.call(existing, k) ? existing[k] : null
  }
  return prior
}

// Restores colorCustomizations: returns Beacon keys to their pre-Beacon values
// (or deletes them if the key didn't exist before Beacon), leaves other keys untouched.
export function restoreColors(current: ColorMap, prior: PriorColors): ColorMap {
  const out: ColorMap = { ...current }
  for (const k of BEACON_COLOR_KEYS) {
    const p = prior[k]
    if (p === null || p === undefined) delete out[k]
    else out[k] = p
  }
  return out
}

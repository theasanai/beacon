import * as vscode from 'vscode'
import type { Identity } from '../core/types'

const COLOR_KEYS = (id: Identity): Record<string, string> => ({
  'titleBar.activeBackground': id.bg,
  'titleBar.activeForeground': id.fg,
  'titleBar.inactiveBackground': id.bg,
  'titleBar.inactiveForeground': id.fg,
  'statusBar.background': id.bg,
  'statusBar.foreground': id.fg,
})

export function windowTitleFor(id: Identity): string {
  return `${id.emoji} ${id.name} — \${activeEditorShort}`
}

export async function applyIdentity(id: Identity): Promise<void> {
  const cfg = vscode.workspace.getConfiguration()
  if (cfg.get<boolean>('beacon.applyColors', true)) {
    const existing = cfg.get<Record<string, string>>('workbench.colorCustomizations') ?? {}
    const wanted = { ...existing, ...COLOR_KEYS(id) }
    if (JSON.stringify(existing) !== JSON.stringify(wanted)) {
      await cfg.update('workbench.colorCustomizations', wanted, vscode.ConfigurationTarget.Workspace)
    }
  }
  const title = windowTitleFor(id)
  if (cfg.get<string>('window.title') !== title) {
    await cfg.update('window.title', title, vscode.ConfigurationTarget.Workspace)
  }
}

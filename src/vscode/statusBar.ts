import * as vscode from 'vscode'
import type { Identity } from '../core/types'
import { statusBarText } from '../core/identity'

export function createStatusBar(id: Identity): { setIdentity(id: Identity): void; update(text: string): void; dispose(): void } {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 500)
  item.command = 'beacon.card.focus' // built-in command to focus the view
  let identity = id
  let lastLabel: string | undefined
  item.text = statusBarText(identity)
  item.show()
  return {
    setIdentity(next: Identity) {
      identity = next
      item.text = statusBarText(identity, lastLabel)
    },
    update(text: string) {
      lastLabel = text
      item.text = statusBarText(identity, text)
    },
    dispose() { item.dispose() },
  }
}

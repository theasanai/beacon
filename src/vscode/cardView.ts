import * as vscode from 'vscode'
import * as crypto from 'node:crypto'
import type { CardState } from '../core/types'
import { cardShellHtml, renderState } from './cardHtml'

export class CardView implements vscode.WebviewViewProvider {
  static readonly viewId = 'beacon.card'
  private view?: vscode.WebviewView
  private lastState?: CardState
  private cb?: (cmd: string, arg?: string) => void
  private visibilityCb?: (visible: boolean) => void

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = { enableScripts: true }
    view.webview.html = cardShellHtml(view.webview.cspSource, crypto.randomBytes(16).toString('hex'))
    view.webview.onDidReceiveMessage((m) => {
      if (m?.type === 'cmd' && this.cb) this.cb(m.cmd, m.arg)
    })
    view.onDidChangeVisibility(() => this.visibilityCb?.(view.visible))
    if (this.lastState) this.setState(this.lastState)
  }

  get visible(): boolean {
    return this.view?.visible ?? false
  }

  onVisibilityChange(cb: (visible: boolean) => void): void {
    this.visibilityCb = cb
  }

  setState(s: CardState): void {
    this.lastState = s
    void this.view?.webview.postMessage({ type: 'state', html: renderState(s) })
  }

  onCommand(cb: (cmd: string, arg?: string) => void): void {
    this.cb = cb
  }
}

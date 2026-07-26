import * as vscode from 'vscode'

export class FocusTracker {
  private blurredAt?: number
  private _focused = true
  private readonly sub: vscode.Disposable

  constructor(onReturn: (blurredAt: number, now: number) => void, onFocusChange?: (focused: boolean) => void) {
    this.sub = vscode.window.onDidChangeWindowState((st) => {
      const now = Date.now()
      this._focused = st.focused
      if (!st.focused) {
        this.blurredAt = now
      } else if (this.blurredAt !== undefined) {
        onReturn(this.blurredAt, now)
        this.blurredAt = undefined
      }
      onFocusChange?.(st.focused)
    })
  }

  get focused(): boolean { return this._focused }

  dispose(): void { this.sub.dispose() }
}

import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { identityFor, NAMED_PALETTE, isValidHex } from './core/identity'
import { snapshotPrior, restoreColors, BEACON_COLOR_KEYS, type PriorColors } from './core/identityColors'
import { initialStatus, reduceStatus, tickStatus, statusLabel, reduceHistorical } from './core/statusMachine'
import { TimelineStore } from './core/timeline'
import type { CardState, FleetRow, RecapData, StatusState } from './core/types'
import { ClaudeCodeAdapter } from './adapters/claudeCode/adapter'
import { applyIdentity } from './vscode/applyIdentity'
import { createStatusBar } from './vscode/statusBar'
import { readGitInfo } from './vscode/gitInfo'
import { CardView } from './vscode/cardView'
import { FocusTracker } from './vscode/focusTracker'
import { computeRecap } from './core/recap'
import { installHooks, removeHooks, hasBeaconHooks, hookCmdCurrent, refreshHooks, beaconStateDir } from './hooks/hooksManager'
import { encodeWorkspacePath } from './adapters/claudeCode/paths'
import { FleetStore } from './fleet/fleetStore'

export async function activate(context: vscode.ExtensionContext) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) return

  const cfg = () => vscode.workspace.getConfiguration()
  let identity = identityFor(root, { emoji: cfg().get<string>('beacon.emoji', ''), color: cfg().get<string>('beacon.color', '') })

  // Snapshot of pre-Beacon color/title values — taken once before the first overwrite; used by the Reset command.
  const PRIOR_KEY = 'beacon.priorSettings.v1'
  if (!context.workspaceState.get(PRIOR_KEY)) {
    // WORKSPACE-scope only: get() would return merged User+Workspace and bake the user's global
    // colors into the repo's .vscode/settings.json on Reset.
    const existingColors = cfg().inspect<Record<string, string>>('workbench.colorCustomizations')?.workspaceValue ?? {}
    const priorTitle = cfg().inspect<string>('window.title')?.workspaceValue
    await context.workspaceState.update(PRIOR_KEY, { colors: snapshotPrior(existingColors), title: priorTitle ?? null })
  }

  await applyIdentity(identity)
  const statusBar = createStatusBar(identity)
  context.subscriptions.push(statusBar)

  const card = new CardView()
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(CardView.viewId, card))

  const timeline = new TimelineStore(10)
  let status: StatusState = initialStatus()
  let recap: RecapData | undefined
  let git = await readGitInfo(root)
  let fleetRows: FleetRow[] = []

  // Poll gate: only spend resources when the window is focused or the card is visible.
  let windowFocused = true
  const gate = () => windowFocused || card.visible

  const claudeSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  const hookCmd = `node "${context.asAbsolutePath('dist/hook.js')}"`
  let preciseEnabled = false
  try {
    const settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'))
    preciseEnabled = hasBeaconHooks(settings)
    // hook.js path is versioned — re-register hooks after an extension update
    if (preciseEnabled && !hookCmdCurrent(settings, hookCmd)) {
      await refreshHooks(claudeSettingsPath, hookCmd)
    }
  } catch { /* no settings / broken JSON / write failed — activation must not crash */ }

  const pushState = () => {
    const now = Date.now()
    const idleMs = cfg().get<number>('beacon.idleAfterMinutes', 30) * 60_000
    status = tickStatus(status, now, idleMs)
    const label = statusLabel(status, now)
    statusBar.update(label)
    const entries = timeline.entries()
    const state: CardState = {
      identity, status, statusLabel: label,
      recap,
      timeline: entries,
      git, fleet: fleetRows,
      preciseEnabled,
      transcriptUnrecognized: entries.length === 0 && adapter.transcriptPresent(),
    }
    try { card.setState(state) } catch { /* the card must not crash the pipeline */ }
  }

  const adapter = new ClaudeCodeAdapter({
    workspacePath: root,
    home: os.homedir(),
    watchAncestors: cfg().get<boolean>('beacon.watchAncestorSessions', true),
    gate,
  })
  adapter.start((ev, historical) => {
    timeline.feed(ev)
    if (!historical) status = reduceStatus(status, ev)
    else status = reduceHistorical(status, ev)
    if (!historical && ev.kind === 'turn-started') recap = undefined
    pushState()
  })
  context.subscriptions.push({ dispose: () => adapter.dispose() })

  const ticker = setInterval(async () => {
    if (!gate()) return // window not focused and card hidden — skip git polling
    git = await readGitInfo(root)
    pushState()
  }, 15_000)
  context.subscriptions.push({ dispose: () => clearInterval(ticker) })

  // --- fleet: heartbeat files from other windows (alongside the ticker) ---
  const fleet = new FleetStore(path.join(os.homedir(), '.local', 'state', 'beacon', 'fleet'), root)
  const fleetTimer = setInterval(async () => {
    const now = Date.now()
    await fleet.writeHeartbeat({
      path: root, name: identity.name, emoji: identity.emoji, bg: identity.bg, fg: identity.fg,
      status: status.kind, lastEvent: timeline.entries()[0]?.prompt, ts: now,
    }).catch(() => {})
    fleetRows = await fleet.readOthers(now)
    pushState()
  }, 5000)
  context.subscriptions.push({ dispose: () => { clearInterval(fleetTimer); void fleet.removeSelf() } })

  // --- window click in the card ---
  const editorCli = vscode.env.uriScheme === 'cursor' ? 'cursor' : 'code'
  card.onCommand((cmd, arg) => {
    // arg comes from the webview and traces back to fleet files — only a known absolute path, not a flag
    if (cmd === 'jump' && arg && path.isAbsolute(arg) && !arg.startsWith('-') && fleetRows.some((r) => r.path === arg)) {
      spawn(editorCli, [arg], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' })
        .on('error', () => {
          vscode.window.setStatusBarMessage(`Beacon: "${editorCli}" CLI not found — install the shell command for your editor`, 5000)
        })
        .unref()
    }
  })

  // --- precise events: polling the hook state file (alongside the ticker) ---
  const eventsFile = path.join(beaconStateDir(os.homedir()), encodeWorkspacePath(root) + '.json')
  let lastHookTs = Date.now() // ignore events from before the window started
  const hookPoll = setInterval(() => {
    if (!preciseEnabled || !gate()) return // hooks disabled or window inactive — skip reading the file
    try {
      const raw = JSON.parse(fs.readFileSync(eventsFile, 'utf8'))
      if (raw.ts > lastHookTs) {
        lastHookTs = raw.ts
        const ev = raw.event === 'Notification'
          ? { kind: 'attention' as const, message: String(raw.message ?? ''), ts: raw.ts }
          : { kind: 'turn-completed' as const, ts: raw.ts }
        // hook events drive ONLY the status; the timeline's sole source is the transcript
        status = reduceStatus(status, ev)
        pushState()
      }
    } catch { /* file missing — hooks not enabled */ }
  }, 1500)
  context.subscriptions.push({ dispose: () => clearInterval(hookPoll) })

  const focus = new FocusTracker((blurredAt, now) => {
    const minGap = cfg().get<number>('beacon.recapAfterMinutes', 5) * 60_000
    const r = computeRecap(timeline.entries(), blurredAt, now, minGap, status.kind)
    if (r) recap = r // returning before the threshold doesn't clear an already-shown recap
    pushState()
  }, (focused) => {
    windowFocused = focused // focus returned → poll gate is open again; refresh immediately
    pushState()
  })
  context.subscriptions.push(focus)

  // card became visible → gate opened, refresh state
  card.onVisibilityChange(() => pushState())

  pushState()

  context.subscriptions.push(
    vscode.commands.registerCommand('beacon.pickEmoji', async () => {
      const v = await vscode.window.showInputBox({ prompt: 'Emoji for this project', value: identity.emoji })
      if (v !== undefined) {
        await cfg().update('beacon.emoji', v.trim(), vscode.ConfigurationTarget.Workspace)
        identity = identityFor(root, { emoji: v, color: cfg().get<string>('beacon.color', '') })
        await applyIdentity(identity)
        statusBar.setIdentity(identity) // live update of the status bar + card, no reload needed
        pushState()
      }
    }),
    vscode.commands.registerCommand('beacon.pickColor', async () => {
      type ColorAction = { kind: 'palette'; hex: string } | { kind: 'custom' } | { kind: 'auto' }
      interface ColorItem extends vscode.QuickPickItem { action: ColorAction }
      const items: ColorItem[] = [
        ...NAMED_PALETTE.map((c) => ({ label: c.name, description: c.hex, action: { kind: 'palette', hex: c.hex } as ColorAction })),
        { label: '🎨 Custom hex…', description: 'enter #rrggbb', action: { kind: 'custom' } },
        { label: '↺ Auto (by path)', description: 'reset to hashed color', action: { kind: 'auto' } },
      ]
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Project color' })
      if (!pick) return
      let color: string
      if (pick.action.kind === 'custom') {
        const v = await vscode.window.showInputBox({ prompt: 'Color hex, e.g. #0e639c', value: '#' })
        if (v === undefined) return
        const trimmed = v.trim()
        if (trimmed === '' || trimmed === '#') return // empty = cancel, per spec
        if (!isValidHex(trimmed)) { vscode.window.setStatusBarMessage('Beacon: not a valid #hex color', 3000); return }
        color = trimmed
      } else if (pick.action.kind === 'auto') {
        color = ''
      } else {
        color = pick.action.hex
      }
      await cfg().update('beacon.color', color, vscode.ConfigurationTarget.Workspace)
      identity = identityFor(root, { emoji: cfg().get<string>('beacon.emoji', ''), color })
      await applyIdentity(identity)
      statusBar.setIdentity(identity) // live update of the status bar + card, no reload needed
      pushState()
    }),
    vscode.commands.registerCommand('beacon.resetColors', async () => {
      const prior = context.workspaceState.get<{ colors: PriorColors; title: string | null }>(PRIOR_KEY)
      const cur = cfg().inspect<Record<string, string>>('workbench.colorCustomizations')?.workspaceValue ?? {}
      let restored: Record<string, string>
      if (prior) {
        restored = restoreColors(cur, prior.colors)
      } else {
        restored = { ...cur }
        for (const k of BEACON_COLOR_KEYS) delete restored[k]
      }
      await cfg().update('workbench.colorCustomizations',
        Object.keys(restored).length ? restored : undefined, vscode.ConfigurationTarget.Workspace)
      const priorTitle = prior?.title
      await cfg().update('window.title', priorTitle == null ? undefined : priorTitle, vscode.ConfigurationTarget.Workspace)
      vscode.window.setStatusBarMessage('Beacon: window colors/title reset to their pre-Beacon values', 3000)
    }),
    vscode.commands.registerCommand('beacon.hideFromGit', async () => {
      const exclude = path.join(root, '.git', 'info', 'exclude')
      try {
        if (!fs.existsSync(path.join(root, '.git'))) {
          vscode.window.setStatusBarMessage('Beacon: not a git repo', 3000)
          return
        }
        const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : ''
        if (!cur.includes('.vscode/settings.json')) {
          fs.mkdirSync(path.dirname(exclude), { recursive: true })
          fs.appendFileSync(exclude, `${cur.endsWith('\n') || cur === '' ? '' : '\n'}.vscode/settings.json\n`)
        }
        vscode.window.setStatusBarMessage('Beacon: .vscode/settings.json hidden from git', 3000)
      } catch {
        vscode.window.setStatusBarMessage('Beacon: not a git repo or no access', 3000)
      }
    }),
    vscode.commands.registerCommand('beacon.enablePreciseStatus', async () => {
      const ok = await vscode.window.showWarningMessage(
        'Beacon will add 2 hooks (Stop, Notification) to ~/.claude/settings.json so Claude Code reports status precisely. A .beacon-bak backup is created. Proceed?',
        { modal: true }, 'Add hooks',
      )
      if (ok !== 'Add hooks') return
      try {
        await installHooks(claudeSettingsPath, hookCmd)
        preciseEnabled = true
        vscode.window.setStatusBarMessage('Beacon: precise status enabled', 3000)
        pushState()
      } catch (e) {
        void vscode.window.showErrorMessage(`Beacon: ${String(e)}`)
      }
    }),
    vscode.commands.registerCommand('beacon.disablePreciseStatus', async () => {
      try {
        await removeHooks(claudeSettingsPath)
        preciseEnabled = false
        vscode.window.setStatusBarMessage('Beacon: precise status disabled', 3000)
        pushState()
      } catch (e) {
        void vscode.window.showErrorMessage(`Beacon: ${String(e)}`)
      }
    }),
  )
}

export function deactivate() {}

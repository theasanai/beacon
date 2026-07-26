# Changelog

All notable changes to Beacon are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.1] - 2026-07-27

### Added
- **`beacon statusline`** — multi-agent status line for terminal CLI agents. Reads stdin JSON from Qwen Code / Claude Code, scans all 4 agent log directories (Claude, Qwen, Kimi, Codex), outputs a 2-line ANSI status with project-colored names, status dots, last prompt, file count, and recency.
- **Sub-project detection** — when the workspace is a parent directory (e.g. `~/projects`), the status line detects the active sub-project by scanning file paths in recent tool calls, showing e.g. `BEACON` instead of `PROJECTS`.
- `publish:npm` script — performs the npm name swap (`theasanai-beacon` ↔ `@theasanai/beacon`) by packing under the scoped name and publishing the tarball; lifecycle hooks can't do it because npm caches the package name at startup.

### Fixed
- Session files sorted by mtime instead of alphabetically by UUID — previously showed stale sessions.
- `Array.reverse()` mutation bug in prompt scanning loop — caused project detection to scan oldest lines.
- Bounded tail reads (256 KB) instead of reading entire transcript files into memory — prevents OOM on large Codex sessions (200+ MB).
- TTY guard on stdin — `beacon statusline` no longer hangs when run interactively without a pipe.
- Shebang (`#!/usr/bin/env node`) applied only to `dist/cli.js`, not to `extension.js` or `hook.js`.
- `cleanPrompt` strips `@file` references and system markers from displayed prompts.

## [0.5.0] - 2026-07-26

### Added
- **CLI (`beacon`)** — terminal companion with 4 subcommands: `beacon status` (fleet + agent status in ANSI), `beacon watch` (live TUI), `beacon tmux` (tmux status-line snippet), `beacon prompt` (shell prompt snippet for Starship/PS1). Reuses the same core engine as the extension — zero network calls, reads local Claude Code transcripts and fleet heartbeats.
- `bin` field in package.json — `npm i -g @theasanai/beacon` will put `beacon` on PATH (once published to npm).

### Changed
- Fleet jump now detects the host editor via `vscode.env.uriScheme` and spawns `cursor` instead of `code` when running inside Cursor. Error message adapts to the detected binary name.

## [0.4.0] - 2026-07-24

### Added
- Command **Beacon: Reset window colors/title** — restores `workbench.colorCustomizations` and `window.title` to their pre-Beacon values (snapshotted in workspace state before the first overwrite).
- Loud degradation for unrecognized transcripts: when a Claude Code transcript exists for the folder but no turns can be parsed, the card says so ("session detected, but its transcript format wasn't recognized") instead of the generic onboarding.

### Changed
- Emoji/color changes now apply live — the status bar text and card header update without a window reload.
- Polling (git ticker, transcript adapter, hook state-file) pauses while the window is unfocused **and** the card is hidden; the hook poll is skipped entirely when precise status is off.
- The first historical read of a large transcript now reads a bounded tail (~256 KB) aligned to a line boundary instead of the whole file.
- The `attention` status now decays to idle after the idle timeout, like `waiting`; its label softened to "needs your attention".
- Human prompts starting with `<` are kept — only real `<system-reminder`/`<command-` injections are dropped.
- Build parity: added a `vscode:prepublish` script and made `npm run package` build first, so `vsce package` can't ship a stale `dist/`.

### Fixed
- Fleet chip colors are validated as `#hex` before being inlined into `style`.
- Transcript lines with a missing `origin` (seen in real sessions) are recognized as human turns (`type:user` + `userType:external` + text, no `tool_result`) instead of being silently dropped.

## [0.3.0] - 2026-07-19

### Added
- Ancestor sessions: Claude Code sessions launched from an ancestor folder (e.g. the workspace's parent or a monorepo root) are discovered automatically; their turns are attributed to this window by touched file paths. Status stays strict — the dot goes green only when a turn touches this project's files.
- Subagent sidechain transcripts (`<session>/subagents/agent-*.jsonl`, plus the legacy flat layout) count as file-touch signals for attribution.
- Setting `beacon.watchAncestorSessions` (default `true`; takes effect after a window reload).

### Changed
- Fleet heartbeat now reports the current project color, so a color override propagates to other windows' fleet lists without a reload.
- Internal cleanup: removed the vestigial `agentDataAvailable` state; color picker refactored onto action objects; contrast luminance for the fleet dot is cached.

### Fixed
- A degraded transcript source no longer stops polling of the remaining sources.
- Attribution guards against adopting a foreign turn by touch timestamp; replaying older ancestor history no longer rolls the status or timeline backwards.
- Historical turn events now update the status out of the idle state as well, not only out of waiting.

## [0.2.0] - 2026-07-18

### Added
- Command **Beacon: Change Project Color** — pick from Beacon's palette or enter a custom hex, or reset to the automatic color; stored per workspace in the `beacon.color` setting.
- Automatic contrast foreground for overridden colors.

### Changed
- The empty card (no agent history yet) now explains what Beacon shows instead of the bare "agent data unavailable" message.

### Fixed
- Removed the leftover "agent data unavailable" text from the card header and the status bar when there is no history.

## [0.1.0] - 2026-07-17

Initial release.

### Added
- Window identity: a stable per-project color (hashed from the path) and a large project name in the title bar and status bar; **Beacon: Change Project Emoji** command.
- Context card: a sidebar webview with a timeline of finished Claude Code turns (what you asked, how the turn ended, how many files it touched) plus git info (branch, dirty count, last commit).
- Agent status dot 🟢/🟡/⚪ (working / waiting for you / quiet), heuristic based on transcript activity.
- "While you were away" recap when returning to a window after a break (`beacon.recapAfterMinutes`).
- Fleet view: all open Beacon windows with name, color, status and last event; click to jump via the `code` CLI.
- Optional precise agent status: opt-in Stop/Notification hooks for Claude Code, added only after an explicit confirmation dialog and a settings backup; a Disable command removes only Beacon's entries.
- Command **Beacon: Hide .vscode/settings.json from Git** (`.git/info/exclude`).
- Settings: `beacon.applyColors`, `beacon.emoji`, `beacon.recapAfterMinutes`, `beacon.idleAfterMinutes`.
- Fully local: Beacon reads Claude Code transcripts from disk, makes zero network calls and has zero telemetry.

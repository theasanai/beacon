# Beacon — project identity & AI agent context

[![npm version](https://img.shields.io/npm/v/@theasanai/beacon)](https://www.npmjs.com/package/@theasanai/beacon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Instantly know which VS Code window you're in — and what your AI agent did in it while you were away. Two forms, one engine: a VS Code extension for the editor, a CLI for the terminal.

[GitHub](https://github.com/theasanai/beacon) · [theasanai.com/beacon](https://theasanai.com/beacon)

## Install

**VS Code extension** — `theasanai.theasanai-beacon` on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=theasanai.theasanai-beacon), or `theasanai/theasanai-beacon` on [Open VSX](https://open-vsx.org/extension/theasanai/theasanai-beacon) (Cursor, VSCodium). Or just search "Beacon" in the Extensions view.

**CLI** —

```bash
npm i -g @theasanai/beacon
```

## What the extension does

- **Identity** — every project window gets a stable color (hashed from its path) and a large name in the title bar and status bar, so you can tell windows apart at a glance, no reading file paths required.
- **Custom color** — don't like the auto-picked color? Pick any of Beacon's palette or your own hex with one command; per-project, reset to auto anytime.
- **Context card & timeline** — a sidebar view that shows what your Claude Code agent has been doing: each finished turn becomes one line (what you asked, how the agent wrapped up, how many files it touched).
- **Agent status** 🟢/🟡/⚪ — a live status dot in the status bar and on the card: 🟢 working, 🟡 waiting for your reply, ⚪ quiet for a while. No need to switch into a window to know if it needs you.
- **"While you were away" recap** — when you return to a window after a break, the card surfaces a short summary of what happened while you were gone, instead of making you scroll back through the chat.
- **Fleet view** — a section on the card listing all your open Beacon windows (name, color, status, last event), with a click to jump straight to any of them.

## What the CLI does

The same engine, no editor required — reads the same local agent transcripts and fleet heartbeats, makes zero network calls:

| Command | What it does |
|---|---|
| `beacon status` | One-shot snapshot of the current folder: project badge and status dot, up to 5 recent turns, your fleet of other Beacon windows, and an **Agents** section listing every supported CLI agent that has logs for this folder — Claude Code, Qwen Code, Kimi Code and Codex. It's the default command: a bare `beacon` does the same. |
| `beacon watch` | Live full-screen view of the same data, refreshed every 2 seconds; also writes a fleet heartbeat, so this folder shows up in your other Beacon windows. Ctrl+C to quit. |
| `beacon tmux` | Prints a compact `emoji NAME dot` snippet for your tmux status line. |
| `beacon prompt` | Prints a minimal `dot emoji` snippet for a shell prompt (Starship, PS1). |
| `beacon statusline` | A multi-agent status line for terminal agents with custom status-line support. Reads the JSON the agent passes on stdin, scans the log directories of all four agents and prints one row per active agent — project, status, last prompt, files touched, recency — plus a second line with branch · model · context %. |

To light up `beacon statusline`, point your agent's status-line setting at the command: `ui.statusLine` in Qwen Code's `~/.qwen/settings.json`, or `statusLine` in Claude Code's `~/.claude/settings.json`. Kimi Code and Codex don't support custom status lines — their activity shows up in `beacon status` and `beacon watch` instead.

## Privacy

Everything stays on your machine — Beacon reads local agent transcripts, makes zero network calls, has zero telemetry.

Beacon never sends anything anywhere. It only reads `.jsonl` transcript files your agents already write to your disk (`~/.claude/projects/`, `~/.qwen/projects/`, `~/.kimi-code/sessions/`, `~/.codex/sessions/`), and (optionally, opt-in) writes a small status file locally when you enable precise status hooks. There is no server, no analytics SDK, and no phone-home of any kind — this is a deliberate positioning choice for a tool that reads your AI chat history, not just a detail.

## Requirements

- VS Code **1.90+** for the extension; **Node.js 18+** for the CLI.
- **Claude Code is optional.** Identity (window color, name, status bar) works with zero setup even if Claude Code isn't installed. The context card, timeline, agent status, and recap only populate once Claude Code has written a transcript for the current workspace. The CLI shows agent sections for whichever of the four supported agents you actually use.

## Extension settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `beacon.applyColors` | boolean | `true` | Color the title bar and status bar with the project color. |
| `beacon.emoji` | string | `""` | Override the auto-picked project emoji. |
| `beacon.color` | string | `""` | Override the auto-picked project color (hex, e.g. `#0e639c`). Empty = auto by path hash. |
| `beacon.recapAfterMinutes` | number | `5` | Show the "While you were away" recap after this many minutes out of focus. |
| `beacon.idleAfterMinutes` | number | `30` | Agent status turns quiet (⚪) after this many minutes of silence. |
| `beacon.watchAncestorSessions` | boolean | `true` | Watch sessions launched from ancestor folders and show turns that touch this project's files. Takes effect after a window reload. |

## Extension commands

| Command | What it does |
|---|---|
| `Beacon: Change Project Emoji` | Prompts for an emoji and overrides the auto-picked one for this workspace. |
| `Beacon: Change Project Color` | Pick a palette color or a custom hex for this workspace (or reset to the auto color). Applies live, no reload. |
| `Beacon: Reset window colors/title` | Restores `workbench.colorCustomizations` and `window.title` to the values they had before Beacon first touched this workspace. |
| `Beacon: Hide .vscode/settings.json from Git` | Adds `.vscode/settings.json` to `.git/info/exclude` so Beacon's per-window color/title settings don't show up as a diff in your repo. |
| `Beacon: Enable Precise Agent Status (installs 2 Claude Code hooks)` | See "Precise agent status" below. |
| `Beacon: Disable Precise Agent Status (removes Beacon hooks)` | See "Precise agent status" below. |

## Precise agent status

By default, Beacon's status dot (🟢/🟡/⚪) is a heuristic based on watching the transcript file: it can't tell "the agent is waiting for your reply" apart from "the agent is waiting for a permission prompt" — both just look like silence.

Running **"Beacon: Enable Precise Agent Status"** closes that gap using Claude Code's own hooks:

- It shows a confirmation dialog explaining exactly what will change, and only proceeds if you click "Add hooks".
- It adds **2 entries** to `~/.claude/settings.json`: a `Stop` hook and a `Notification` hook, both pointing at a small local script bundled with the extension (`dist/hook.js`). These hooks let Claude Code tell Beacon the moment a turn ends or it needs your attention — instead of Beacon guessing from silence.
- Before making any change, it copies your existing `~/.claude/settings.json` to `~/.claude/settings.json.beacon-bak` as a backup.
- It never touches or replaces the rest of your Claude Code settings — only the `hooks.Stop` and `hooks.Notification` arrays get a new entry appended.

Running **"Beacon: Disable Precise Agent Status"** removes only the entries Beacon added (matched by the fact that their command contains `beacon` and `hook.js`) — anything else you have configured in those hook arrays is left untouched.

This is entirely opt-in and off by default; the transcript-based heuristic keeps working with or without it.

## Known limitations

- Sessions launched from an **ancestor** folder (e.g. the workspace's parent or a monorepo root) are picked up automatically and attributed by file paths: a turn shows up once it touches a file inside this workspace, so purely conversational turns are only visible in a window opened on the session's own folder. Sessions launched from unrelated sibling folders are not discovered. Turn this off with `beacon.watchAncestorSessions`.
- If two sessions run at the same time (one launched in this folder, one in an ancestor), their turns share one card and status — entries may interleave. One live session per window is the supported mode for now.
- In multi-root workspaces, only the first folder is used for identity and transcripts.
- Fleet rows are plain local files under `~/.local/state/beacon` — any local process can write there; Beacon validates rows before showing them, but the list is only as trustworthy as your machine.
- Before uninstalling the extension, run **"Beacon: Disable Precise Agent Status"** to remove its hooks from `~/.claude/settings.json` — otherwise Claude Code keeps pointing at a hook script that no longer exists.

## About

Beacon is the first tool by [AS AN AI](https://theasanai.com) — [theasanai.com/beacon](https://theasanai.com/beacon). Code and issues: [github.com/theasanai/beacon](https://github.com/theasanai/beacon).

---

# Beacon by AS AN AI

Мгновенно видно, какое окно VS Code перед тобой — и что твой ИИ-агент делал в нём, пока тебя не было. Две формы, один движок: расширение VS Code для редактора, CLI для терминала.

## Установка

- **Расширение** — `theasanai.theasanai-beacon` в VS Code Marketplace или `theasanai/theasanai-beacon` в Open VSX (Cursor, VSCodium); ссылки — в английской секции выше. Или просто поиск «Beacon» во вкладке расширений.
- **CLI** — `npm i -g @theasanai/beacon` (нужен Node.js 18+).

## Возможности расширения

- **Идентичность окна** — у каждого проекта стабильный цвет (по хешу пути) и крупное имя в тайтл-баре и статус-баре — окна различаются боковым зрением, без чтения путей.
- **Свой цвет** — не нравится авто-цвет? Одной командой выбери из палитры Beacon или задай свой hex; на проект, сброс к авто в любой момент.
- **Карточка контекста + таймлайн** — боковая панель с историей того, что делал агент: каждый завершённый ход — одна строка (что попросил, чем агент закончил, сколько файлов тронул).
- **Статус агента** 🟢/🟡/⚪ — живой индикатор: 🟢 работает, 🟡 ждёт твоего ответа, ⚪ тихо. Видно без переключения в окно.
- **«Пока тебя не было»** — при возврате в окно после паузы карточка сразу показывает, что произошло, без скролла по чату.
- **Fleet view** — на карточке список всех твоих открытых окон Beacon (имя, цвет, статус, последнее событие), клик — прыжок в нужное.

## CLI

Тот же движок, редактор не нужен — читает те же локальные логи агентов, ноль сетевых вызовов:

- `beacon status` — снимок по текущей папке: значок проекта и статус-точка, до 5 последних ходов, fleet твоих окон Beacon и секция **Agents** — все поддержанные CLI-агенты с логами в этой папке: Claude Code, Qwen Code, Kimi Code и Codex. Команда по умолчанию: голый `beacon` — то же самое.
- `beacon watch` — живой полноэкранный вид тех же данных, обновление каждые 2 секунды; плюс пишет fleet-heartbeat, так что папка видна в твоих других окнах Beacon. Выход — Ctrl+C.
- `beacon tmux` — компактный сниппет `эмодзи ИМЯ точка` для статус-строки tmux.
- `beacon prompt` — минимальный сниппет `точка эмодзи` для shell-промпта (Starship, PS1).
- `beacon statusline` — мульти-агентная статус-строка: читает JSON, который агент передаёт в stdin, сканирует логи всех четырёх агентов, печатает по строке на активного агента (проект, статус, последний промпт, файлы, давность) плюс вторую строку: ветка · модель · % контекста. Подключается через `ui.statusLine` в `~/.qwen/settings.json` (Qwen Code) или `statusLine` в `~/.claude/settings.json` (Claude Code). Kimi и Codex кастомные статус-строки не поддерживают — их активность видна в `beacon status` и `beacon watch`.

## Приватность

Всё остаётся на твоей машине: Beacon читает локальные транскрипты агентов (`~/.claude/projects/`, `~/.qwen/projects/`, `~/.kimi-code/sessions/`, `~/.codex/sessions/`), не делает ни одного сетевого запроса, без телеметрии. Никакого сервера, никакой аналитики, ничего не уходит наружу — принципиальная позиция для инструмента, который читает историю переписки с ИИ.

## Требования

VS Code 1.90+ для расширения, Node.js 18+ для CLI. Claude Code — опционально: идентичность (цвет, имя, статус-бар) работает и без него; карточка/таймлайн/статус агента/рекап появляются после того, как Claude Code начнёт писать транскрипт по текущему workspace. CLI показывает секции по тем из четырёх поддержанных агентов, которыми реально пользуешься.

## Настройки и команды расширения

Те же 6 настроек (`beacon.applyColors`, `beacon.color`, `beacon.emoji`, `beacon.recapAfterMinutes`, `beacon.idleAfterMinutes`, `beacon.watchAncestorSessions`) и 6 команд (смена эмодзи, смена цвета, сброс цветов/тайтла окна к до-Beacon значениям, скрыть настройки из git, включить/выключить точный статус) — см. таблицы в английской секции выше.

## Точный статус агента

По умолчанию статус — эвристика по факту дозаписи транскрипта: не отличить «ждёт ответа» от «завис на запросе разрешения». Команда **«Beacon: Enable Precise Agent Status»** после явного подтверждения добавляет 2 хука (`Stop`, `Notification`) в `~/.claude/settings.json`, указывающие на локальный скрипт `dist/hook.js` из расширения; перед изменением делает бэкап `~/.claude/settings.json.beacon-bak`. Команда «Disable» удаляет только записи Beacon (по признаку `beacon` + `hook.js` в команде), остальные твои хуки не трогает. Всё — по согласию, по умолчанию выключено.

## О проекте

Beacon — первый инструмент [AS AN AI](https://theasanai.com) — [theasanai.com/beacon](https://theasanai.com/beacon). Код и ишью: [github.com/theasanai/beacon](https://github.com/theasanai/beacon).

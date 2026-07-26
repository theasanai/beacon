import type { CardState, TimelineEntry } from '../core/types'
import { isValidHex } from '../core/identity'

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const DOT: Record<string, string> = {
  working: 'dot-green', waiting: 'dot-yellow', attention: 'dot-yellow',
  idle: 'dot-gray', unavailable: 'dot-gray',
}

function timelineRow(e: TimelineEntry): string {
  const time = new Date(e.ts).toTimeString().slice(0, 5)
  const files = e.filesTouched > 0 ? ` <span class="files">${e.filesTouched}f</span>` : ''
  const mark = e.completed ? '' : ' <span class="live">…</span>'
  return `<li><span class="t">${time}</span> <span class="p">${esc(e.prompt)}</span>${mark}
    ${e.outcome ? `<div class="o">${esc(e.outcome)}${files}</div>` : ''}</li>`
}

export function renderState(s: CardState): string {
  const recap = s.recap
    ? `<section class="recap"><h2>While you were away · ${s.recap.minutes}m</h2>
        <ul>${s.recap.entries.map(timelineRow).join('')}</ul>
        ${s.recap.stillWorking ? '<div class="o">agent is still working…</div>' : ''}</section>`
    : ''
  const emptyState = s.transcriptUnrecognized
    ? `<div class="onboard"><strong>Session detected, but its transcript format wasn't recognized</strong>
        — Beacon found a Claude Code transcript for this folder but couldn't read any turns from it.
        <div class="hint">This can happen with a newer Claude Code format; identity and git info still work.</div></div>`
    : `<div class="onboard"><strong>Beacon will show your Claude Code agent's activity here</strong>
        — a timeline of turns, live status, and a "while you were away" recap.
        <div class="hint">Run Claude Code in this folder to see it populate.</div></div>`
  const timeline = s.timeline.length
    ? `<ul class="timeline">${s.timeline.map(timelineRow).join('')}</ul>`
    : emptyState
  const git = s.git
    ? `<footer>⎇ ${esc(s.git.branch)}${s.git.dirtyCount ? ` · ${s.git.dirtyCount} dirty` : ''} · ${esc(s.git.lastCommit)}</footer>`
    : ''
  const fleet = s.fleet.length
    ? `<section class="fleet"><h2>All windows</h2><ul>${s.fleet
        .map((f) => {
          // fleet rows are written by other processes — validate colors before inlining into style
          const bg = isValidHex(f.bg) ? f.bg : 'transparent'
          const fg = isValidHex(f.fg) ? f.fg : 'inherit'
          return `<li><button data-cmd="jump" data-arg="${esc(f.path)}">
            <span class="chip" style="background:${bg};color:${fg}">${esc(f.emoji)} ${esc(f.name)}</span>
            <span class="dot ${DOT[f.status]}"></span> ${esc(f.status)}${f.lastEvent ? ` · ${esc(f.lastEvent)}` : ''}
          </button></li>`
        }).join('')}</ul></section>`
    : ''
  return `
    <header style="background:${esc(s.identity.bg)};color:${esc(s.identity.fg)}">
      <div class="name">${esc(s.identity.emoji)} ${esc(s.identity.name)}</div>
      <div class="status"><span class="dot ${DOT[s.status.kind]}"></span> ${esc(s.statusLabel)}</div>
    </header>
    ${recap}
    ${timeline}
    ${git}
    ${fleet}`
}

export function cardShellHtml(cspSource: string, nonce: string): string {
  return `<!DOCTYPE html><html><head>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body { padding: 0; margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
    header { padding: 14px 12px; }
    header .name { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
    header .status { margin-top: 4px; opacity: 0.95; font-size: 12px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
    .dot-green { background: #3fb950; } .dot-yellow { background: #d29922; } .dot-gray { background: #8b949e; }
    section.recap { margin: 10px 12px 0; padding: 8px 10px; border: 1px solid var(--vscode-widget-border, #444);
      border-radius: 6px; background: var(--vscode-editorWidget-background); }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.7; margin: 0 0 6px; }
    ul { list-style: none; margin: 0; padding: 0; }
    ul.timeline { padding: 10px 12px; }
    li { margin-bottom: 8px; font-size: 12px; }
    li .t { opacity: 0.55; font-variant-numeric: tabular-nums; margin-right: 4px; }
    li .o { opacity: 0.75; margin-left: 42px; }
    li .files { opacity: 0.6; } li .live { color: #3fb950; }
    .onboard { padding: 12px; margin: 10px 12px; font-size: 12px; line-height: 1.5;
      border: 1px solid var(--vscode-widget-border, #444); border-radius: 6px;
      background: var(--vscode-editorWidget-background); opacity: 0.9; }
    .onboard .hint { margin-top: 6px; opacity: 0.7; }
    footer { padding: 8px 12px; border-top: 1px solid var(--vscode-widget-border, #333);
      font-size: 11px; opacity: 0.75; }
    section.fleet { padding: 8px 12px; border-top: 1px solid var(--vscode-widget-border, #333); }
    section.fleet button { display: flex; align-items: center; gap: 6px; width: 100%; background: none;
      border: none; color: inherit; cursor: pointer; padding: 4px 0; font-size: 12px; text-align: left; }
    .chip { padding: 1px 8px; border-radius: 10px; font-weight: 600; font-size: 11px; }
  </style></head>
  <body><div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    window.addEventListener('message', (e) => {
      if (e.data.type === 'state') document.getElementById('root').innerHTML = e.data.html
    })
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cmd]')
      if (b) vscode.postMessage({ type: 'cmd', cmd: b.dataset.cmd, arg: b.dataset.arg })
    })
  </script></body></html>`
}

import * as fs from 'node:fs'
import * as path from 'node:path'
import { encodeWorkspacePath } from '../../core/encodePath'

export { encodeWorkspacePath }

export function transcriptDirFor(workspacePath: string, home: string): string {
  return path.join(home, '.claude', 'projects', encodeWorkspacePath(workspacePath))
}

export async function latestTranscript(dir: string): Promise<string | undefined> {
  let names: string[]
  try {
    names = await fs.promises.readdir(dir)
  } catch {
    return undefined
  }
  let best: string | undefined
  let bestM = -1
  for (const n of names) {
    if (!n.endsWith('.jsonl') || n.startsWith('agent-')) continue
    try {
      const m = (await fs.promises.stat(path.join(dir, n))).mtimeMs
      if (m > bestM) { bestM = m; best = path.join(dir, n) }
    } catch { /* file disappeared between readdir and stat */ }
  }
  return best
}

export function ancestorChain(workspacePath: string, home: string): string[] {
  const stop = path.resolve(home)
  let cur = path.resolve(workspacePath)
  const underHome = cur === stop || cur.startsWith(stop + path.sep)
  const out: string[] = []
  for (;;) {
    out.push(cur)
    if (underHome ? cur === stop : path.dirname(cur) === cur) break
    cur = path.dirname(cur)
  }
  return out
}

export function ancestorTranscriptDirs(workspacePath: string, home: string): string[] {
  return ancestorChain(workspacePath, home).map((p) => transcriptDirFor(p, home))
}

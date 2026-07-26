import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { encodeWorkspacePath } from '../core/encodePath'

async function main() {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const cwd: string = input.cwd ?? process.cwd()
  const dir = path.join(os.homedir(), '.local', 'state', 'beacon', 'events')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, encodeWorkspacePath(cwd) + '.json')
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({
    event: input.hook_event_name ?? 'unknown', ts: Date.now(), message: input.message ?? null,
  }))
  fs.renameSync(tmp, file)
}

main().catch(() => {}).finally(() => process.exit(0))

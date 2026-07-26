import { runTests } from '@vscode/test-electron'
import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'
import * as os from 'node:os'

const root = path.dirname(url.fileURLToPath(import.meta.url))
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-smoke-'))

// ELECTRON_RUN_AS_NODE (set by some host environments, incl. this one) makes the
// downloaded VS Code's Electron binary run as plain Node instead of launching the
// app, which fails with "Cannot find module '<workspace path>'". Must be unset
// before spawning the test run.
delete process.env.ELECTRON_RUN_AS_NODE

await runTests({
  extensionDevelopmentPath: path.join(root, '..'),
  extensionTestsPath: path.join(root, 'smoke.test.cjs'),
  launchArgs: [ws, '--disable-extensions'],
})

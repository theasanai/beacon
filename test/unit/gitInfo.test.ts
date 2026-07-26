import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readGitInfo } from '../../src/vscode/gitInfo'

describe('readGitInfo', () => {
  it('branch, dirty, last commit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-git-'))
    const g = (...args: string[]) => execFileSync('git', ['-C', dir, ...args])
    g('init', '-q', '-b', 'main')
    g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
    fs.writeFileSync(path.join(dir, 'a.txt'), '1')
    g('add', '-A'); g('commit', '-q', '-m', 'first commit')
    fs.writeFileSync(path.join(dir, 'b.txt'), '2')
    const info = await readGitInfo(dir)
    expect(info).toEqual({ branch: 'main', dirtyCount: 1, lastCommit: 'first commit' })
  })
  it('not a git repo → undefined', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-nogit-'))
    expect(await readGitInfo(dir)).toBeUndefined()
  })
})

import { execFile } from 'node:child_process'
import type { GitInfo } from '../core/types'

function git(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', root, ...args], { timeout: 3000 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout.trim()),
    )
  })
}

export async function readGitInfo(root: string): Promise<GitInfo | undefined> {
  try {
    const [branch, status, lastCommit] = await Promise.all([
      git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(root, ['status', '--porcelain']),
      git(root, ['log', '-1', '--format=%s']),
    ])
    return { branch, dirtyCount: status ? status.split('\n').length : 0, lastCommit }
  } catch {
    return undefined
  }
}

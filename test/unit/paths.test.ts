import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { encodeWorkspacePath, transcriptDirFor, latestTranscript, ancestorChain, ancestorTranscriptDirs } from '../../src/adapters/claudeCode/paths'

describe('paths', () => {
  it('encodes path like Claude Code (non-alphanumeric → dash)', () => {
    expect(encodeWorkspacePath('/home/user/projects')).toBe('-home-user-projects')
    expect(encodeWorkspacePath('/home/user/projects/myapp/app')).toBe('-home-user-projects-myapp-app')
    expect(encodeWorkspacePath('/a/b.c_d')).toBe('-a-b-c-d')
  })
  it('transcriptDirFor assembles path under home', () => {
    expect(transcriptDirFor('/x/y', '/home/u')).toBe(path.join('/home/u', '.claude', 'projects', '-x-y'))
  })
  it('latestTranscript picks the newest *.jsonl, ignoring agent-*', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-'))
    fs.writeFileSync(path.join(dir, 'old.jsonl'), '{}\n')
    fs.writeFileSync(path.join(dir, 'agent-x.jsonl'), '{}\n')
    const newer = path.join(dir, 'new.jsonl')
    fs.writeFileSync(newer, '{}\n')
    const future = new Date(Date.now() + 5000)
    fs.utimesSync(newer, future, future)
    expect(await latestTranscript(dir)).toBe(newer)
    expect(await latestTranscript(dir + '-missing')).toBeUndefined()

    // filters actually work: excluded files with the newest mtime do not win
    const agentFile = path.join(dir, 'agent-x.jsonl')
    const notJsonl = path.join(dir, 'newest.txt')
    fs.writeFileSync(notJsonl, 'x')
    const evenLater = new Date(Date.now() + 60_000)
    fs.utimesSync(agentFile, evenLater, evenLater)
    fs.utimesSync(notJsonl, evenLater, evenLater)
    expect(await latestTranscript(dir)).toBe(newer)
  })
})

describe('ancestorChain', () => {
  it('walks from workspace up to home inclusive', () => {
    expect(ancestorChain('/Users/v/projects/beacon/app', '/Users/v')).toEqual([
      '/Users/v/projects/beacon/app',
      '/Users/v/projects/beacon',
      '/Users/v/projects',
      '/Users/v',
    ])
  })
  it('workspace == home → only itself', () => {
    expect(ancestorChain('/Users/v', '/Users/v')).toEqual(['/Users/v'])
  })
  it('workspace outside home → walks up to filesystem root', () => {
    expect(ancestorChain('/tmp/x', '/Users/v')).toEqual(['/tmp/x', '/tmp', '/'])
  })
  it('does not match prefix-"twin" of home (/Users/vv is not under /Users/v)', () => {
    expect(ancestorChain('/Users/vv/x', '/Users/v')).toEqual(['/Users/vv/x', '/Users/vv', '/Users', '/'])
  })
})

describe('ancestorTranscriptDirs', () => {
  it('runs the chain through transcriptDirFor, first entry is the workspace itself', () => {
    const dirs = ancestorTranscriptDirs('/Users/v/projects/beacon', '/Users/v')
    expect(dirs[0]).toBe(transcriptDirFor('/Users/v/projects/beacon', '/Users/v'))
    expect(dirs).toHaveLength(3)
  })
})

import esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'

const SHEBANG = '#!/usr/bin/env node\n'

const opts = {
  entryPoints: { extension: 'src/extension.ts', hook: 'src/hooks/hook.ts', cli: 'src/cli/main.ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  external: ['vscode'],
  outdir: 'dist',
}

function addShebang() {
  const cliPath = 'dist/cli.js'
  const content = readFileSync(cliPath, 'utf8')
  if (!content.startsWith('#!')) writeFileSync(cliPath, SHEBANG + content)
}

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context({ ...opts, plugins: [{ name: 'shebang', setup(b) { b.onEnd(addShebang) } }] })
  await ctx.watch()
  console.log('watching…')
} else {
  await esbuild.build(opts)
  addShebang()
  console.log('built')
}

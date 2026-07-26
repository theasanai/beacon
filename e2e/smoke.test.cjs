const assert = require('node:assert')
const vscode = require('vscode')

exports.run = async function run() {
  const ext = vscode.extensions.getExtension('theasanai.beacon')
  assert.ok(ext, 'extension not found')
  await ext.activate()
  const commands = await vscode.commands.getCommands(true)
  assert.ok(commands.includes('beacon.pickEmoji'), 'command missing')
  await vscode.commands.executeCommand('beacon.card.focus')
}

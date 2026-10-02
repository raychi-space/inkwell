import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const output = mkdtempSync(join(tmpdir(), 'inkwell-password-test-'))
writeFileSync(join(output, 'package.json'), '{"type":"module"}')
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), 'src/features/auth/passwordValidation.ts', '--ignoreConfig', '--target', 'ES2022', '--module', 'ES2022', '--skipLibCheck', '--outDir', output])
const { passwordValidation: validate } = await import(pathToFileURL(join(output, 'passwordValidation.js')).href)
after(() => rmSync(output, { recursive: true, force: true }))
test('password confirmation and current password are required', () => {
  assert.ok(validate('', 'new-password-123', 'new-password-123'))
  assert.match(validate('old-password', 'new-password-123', 'another-password'), /不一致/)
  assert.match(validate('same-password', 'same-password', 'same-password'), /相同/)
})
test('Unicode character minimum and UTF-8 byte maximum are independent', () => {
  for (const next of ['a'.repeat(12), '密'.repeat(24), '🔑'.repeat(18)]) assert.equal(validate('old', next, next), null)
  for (const next of ['a'.repeat(11), '🔑'.repeat(11), 'a'.repeat(73), '密'.repeat(25), '🔑'.repeat(19), ' '.repeat(12)]) assert.ok(validate('old', next, next))
})
test('valid passwords retain intentional surrounding spaces', () => {
  const next = '  new-password-123  '
  assert.equal(validate('old', next, next), null)
  assert.match(validate('old', next, next.trim()), /不一致/)
})

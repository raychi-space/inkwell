import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}
const source = resolve('src')
const errors = []
for (const path of walk(source)) {
  const local = relative(source, path).replaceAll('\\', '/')
  const feature = local.match(/^features\/([^/]+)/)?.[1]
  for (const match of readFileSync(path, 'utf8').matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
    const target = relative(source, specifier.startsWith('@/') ? resolve(source, specifier.slice(2)) : resolve(dirname(path), specifier)).replaceAll('\\', '/')
    if (target.startsWith('..')) errors.push(`${local}: import leaves src: ${specifier}`)
    const other = target.match(/^features\/([^/]+)/)?.[1]
    if (feature && other && feature !== other) errors.push(`${local}: feature ${feature} imports ${other}; compose in app or use shared protocol`)
    if (local.startsWith('shared/') && other) errors.push(`${local}: shared imports feature ${other}`)
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('Source boundaries passed')

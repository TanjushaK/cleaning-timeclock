import fs from 'node:fs'

const path = 'app/admin/page.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`)
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`)
  }
  source = source.slice(0, first) + after + source.slice(first + before.length)
}

replaceOnce(

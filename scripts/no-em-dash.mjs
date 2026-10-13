#!/usr/bin/env node
// Keeps em dashes out of the product. `node scripts/no-em-dash.mjs` fails if any
// are found; `--fix` rewrites them with context-appropriate punctuation.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const DIRS = ["app", "components", "lib", "hooks", "README.md"]
const EXT = /\.(tsx?|mjs|css|md)$/
const fix = process.argv.includes("--fix")
const preview = process.argv.includes("--preview")

function walk(path, out = []) {
  const st = statSync(path, { throwIfNoEntry: false })
  if (!st) return out
  if (st.isFile()) {
    if (EXT.test(path)) out.push(path)
    return out
  }
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    walk(join(path, name), out)
  }
  return out
}

/** Short label before the dash ("Locked — invoice is paid") reads best as a colon. */
function leadIn(before) {
  let i = before.length - 1
  while (i >= 0 && !`"'\`>`.includes(before[i])) i--
  const segment = before.slice(i + 1).replace(/^\s*(\/\/|\/\*|\*)\s*/, "").trim()
  if (!segment || /[,.:;?!]/.test(segment)) return false
  return segment.split(/\s+/).length <= 3
}

function rewrite(line) {
  const prose = line.replace(/(["'`>])—(["'`<])/g, "$1–$2").replace(/(\d)\s*—\s*(\d)/g, "$1–$2")
  const paired = (prose.match(/\s—\s/g) ?? []).length >= 2
  return prose
    .replace(/\s+—\s+/g, (m, offset, str) => (!paired && leadIn(str.slice(0, offset)) ? ": " : ", "))
    .replace(/—/g, ", ")
}

let total = 0
const hits = []
for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8")
    if (!src.includes("—")) continue
    const lines = src.split("\n")
    let changed = false
    lines.forEach((line, i) => {
      if (!line.includes("—")) return
      total += line.split("—").length - 1
      hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 110)}`)
      if (preview) hits.push(`    → ${rewrite(line).trim().slice(0, 110)}`)
      if (fix) {
        lines[i] = rewrite(line)
        changed = true
      }
    })
    if (changed) writeFileSync(file, lines.join("\n"))
  }
}

if (fix) {
  console.log(`Replaced ${total} em dash${total === 1 ? "" : "es"}.`)
} else if (total) {
  console.error(hits.join("\n"))
  console.error(`\n${total} em dash${total === 1 ? "" : "es"} found. Run \`npm run copy:fix\`.`)
  process.exit(1)
} else {
  console.log("No em dashes. Copy is clean.")
}

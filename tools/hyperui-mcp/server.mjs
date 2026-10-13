#!/usr/bin/env node
// Minimal MCP server exposing HyperUI (https://github.com/markmead/hyperui, MIT) components.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const REPO = "markmead/hyperui"
const RAW = `https://raw.githubusercontent.com/${REPO}/main`
let treeCache = null

async function tree() {
  if (treeCache) return treeCache
  const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, {
    headers: { "User-Agent": "hyperui-mcp" },
  })
  if (!res.ok) throw new Error(`GitHub tree request failed: ${res.status}`)
  const json = await res.json()
  const items = json.tree
    .filter((x) => x.type === "blob" && x.path.startsWith("public/examples/") && x.path.endsWith(".html"))
    .map((x) => {
      const [, , collection, category, file] = x.path.split("/")
      return { collection, category, file, id: file.replace(/\.html$/, ""), path: x.path }
    })
  treeCache = items
  return items
}

const text = (t) => ({ content: [{ type: "text", text: t }] })

const server = new McpServer({ name: "hyperui", version: "1.0.0" })

server.tool(
  "list_categories",
  "List HyperUI component categories with counts. Collections: application, marketing, neobrutalism.",
  { collection: z.string().optional() },
  async ({ collection }) => {
    const items = await tree()
    const counts = new Map()
    for (const i of items) {
      if (collection && i.collection !== collection) continue
      if (i.id.endsWith("-dark")) continue
      const key = `${i.collection}/${i.category}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return text([...counts.entries()].sort().map(([k, v]) => `${k} (${v})`).join("\n"))
  }
)

server.tool(
  "list_components",
  "List component ids in a HyperUI category (e.g. collection=application, category=stats).",
  { collection: z.string(), category: z.string() },
  async ({ collection, category }) => {
    const items = (await tree()).filter((i) => i.collection === collection && i.category === category)
    if (!items.length) return text(`No components found for ${collection}/${category}`)
    return text(items.map((i) => i.id).join("\n"))
  }
)

server.tool(
  "get_component",
  "Get the Tailwind HTML for a HyperUI component. Use list_components to find ids; append -dark for dark variants.",
  { collection: z.string(), category: z.string(), id: z.string() },
  async ({ collection, category, id }) => {
    const res = await fetch(`${RAW}/public/examples/${collection}/${category}/${id}.html`)
    if (!res.ok) return text(`Not found: ${collection}/${category}/${id} (${res.status})`)
    return text(await res.text())
  }
)

server.tool(
  "search_components",
  "Search HyperUI categories by keyword (e.g. 'timeline', 'stats', 'steps', 'table').",
  { query: z.string() },
  async ({ query }) => {
    const q = query.toLowerCase()
    const items = await tree()
    const hits = [...new Set(items.filter((i) => `${i.collection} ${i.category}`.includes(q)).map((i) => `${i.collection}/${i.category}`))]
    return text(hits.length ? hits.join("\n") : `No categories match "${query}"`)
  }
)

await server.connect(new StdioServerTransport())

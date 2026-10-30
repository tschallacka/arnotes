// Posts BRIEF.md as the customer's first message on the ScrapHeap board.
import { readFileSync } from 'node:fs'

const here = new URL('.', import.meta.url).pathname
const creds = JSON.parse(readFileSync(`${here}creds.json`, 'utf8'))
const res = await fetch(`${creds.base}/api/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${creds.people.scrap.apiKey}` },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'create_task', arguments: { board: creds.scrapProject.id, column: 'Backlog', title: 'ScrapHeap request: project Settings and Rules', description: readFileSync(`${here}BRIEF.md`, 'utf8'), visibility: 'customer' } }
  })
})
console.log(res.status, (await res.text()).slice(0, 300))

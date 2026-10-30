#!/usr/bin/env node
// A crew member's ears. Waits up to WAIT seconds (default 60) for something new and prints
// only what is new, then exits:
//   CHAT  a message in #scrapheapwork (the PM steers the workers there), and for the PM also
//         in #scrapheap (the customer)
//   BOARD a task newly assigned to you on the ScrapHeap board, or a new Inbox item
//         (a comment on your task, a move, an assignment, a question for you)
// Prints "quiet" when nothing arrived. Run it in a loop; see "Listening" in CREW.md.
//   node listen.mjs <pm|w1|w2|w3|w4> [seconds]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const here = new URL('.', import.meta.url).pathname
const creds = JSON.parse(readFileSync(`${here}creds.json`, 'utf8'))
const [who, secs] = process.argv.slice(2)
const me = creds.people[who]
const NICKS = { pm: 'pia', w1: 'wren', w2: 'wick', w3: 'wynn', w4: 'wade' }
const nick = NICKS[who]
if (!me || !nick) { console.error('usage: node listen.mjs <pm|w1|w2|w3|w4> [seconds]'); process.exit(64) }

const WAIT = Number(secs ?? process.env.WAIT ?? 60) * 1000
const CHAT = process.env.CHAT_CLIENT || '/home/tschallacka/git/ai-skills/chat/bin/x86_64-unknown-linux-musl/chat-client-rs'
const CHANNELS = who === 'pm' ? ['#scrapheapwork', '#scrapheap'] : ['#scrapheapwork']
const project = creds.scrapProject.id

mkdirSync(`${here}.listen`, { recursive: true })
const statePath = `${here}.listen/${who}.json`
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { joined: false, notes: [], tasks: null }

function chat(args) {
  try {
    return execFileSync(CHAT, args, { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    return String(e.stdout ?? '')
  }
}

async function mcp(name, args) {
  const res = await fetch(`${creds.base}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${me.apiKey}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  })
  const body = await res.json()
  try { return JSON.parse(body.result?.content?.[0]?.text ?? 'null') } catch { return null }
}

function readChat() {
  const out = []
  for (const channel of CHANNELS) {
    if (!state.joined) {
      chat(['join', '--chan', channel, '--nick', nick])
      for (const line of chat(['read', '--chan', channel, '--nick', nick, '--since', '0']).split('\n')) {
        if (line.startsWith('MSG')) out.push(line)
      }
      continue
    }
    for (const line of chat(['read', '--chan', channel, '--nick', nick]).split('\n')) {
      if (line.startsWith('MSG')) out.push(line)
    }
  }
  state.joined = true
  // MSG #chan id ts nick :text  ->  "#chan nick: text", without my own lines
  return out
    .map(line => {
      const m = /^MSG (#\S+) \d+ \d+ (\S+) :(.*)$/.exec(line)
      return m ? { channel: m[1], from: m[2], text: m[3] } : null
    })
    .filter(m => m && !new RegExp(`^${nick}(-\\d+)?$`).test(m.from))
    .map(m => `CHAT ${m.channel} ${m.from}: ${m.text}`)
}

async function readBoard() {
  const out = []
  const inbox = await mcp('list_notifications', {})
  for (const n of inbox?.notifications ?? []) {
    if (n.read || state.notes.includes(n.id)) continue
    state.notes.push(n.id)
    if (n.board !== 'ScrapHeap Development Center') continue
    out.push(`BOARD ${n.type} on task ${n.taskId ?? '?'}: ${n.title} - ${String(n.body ?? '').slice(0, 160)}`)
  }
  state.notes = state.notes.slice(-300)

  const mine = await mcp('my_tasks', {})
  const now = {}
  for (const t of mine?.tasks ?? []) if (t.board?.id === project) now[t.id] = t.title
  if (state.tasks !== null) {
    for (const [id, title] of Object.entries(now)) if (!(id in state.tasks)) out.push(`BOARD newly assigned to you: ${id} ${title}`)
  }
  state.tasks = now
  return out
}

const deadline = Date.now() + WAIT
let found = []
for (let round = 0; ; round++) {
  found = [...readChat(), ...(round % 2 === 0 ? await readBoard() : [])]
  if (found.length || Date.now() >= deadline) break
  await new Promise(r => setTimeout(r, 5000))
}
writeFileSync(statePath, JSON.stringify(state))
console.log(found.length ? found.join('\n') : 'quiet')

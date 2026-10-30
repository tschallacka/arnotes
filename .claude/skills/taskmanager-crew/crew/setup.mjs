// One-off: creates the crew's accounts, the team, the project and the Bugs column
// on the dev instance, and writes creds.json (mode 600). Safe to run again: it
// does nothing once creds.json exists. It never deletes anything.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { existsSync, writeFileSync, chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const BASE = process.env.BASE || 'http://localhost:3000'
const CREDS = new URL('./creds.json', import.meta.url).pathname
if (existsSync(CREDS)) { console.log('creds.json exists; nothing to do'); process.exit(0) }

const PSQL = process.env.PSQL
const sql = q => execSync(`${PSQL} postgresql://arnotes:arnotes@localhost:5432/arnotes -At -c "${q}"`).toString().trim()
const h = { origin: BASE }

const people = [
  { key: 'boss', name: 'Boss', role: 'owner: reads the reports, owns the bugs column' },
  { key: 'pm', name: 'Pia Planner', role: 'project manager' },
  { key: 'w1', name: 'Wren Worker', role: 'worker 1' },
  { key: 'w2', name: 'Wick Worker', role: 'worker 2' },
  { key: 'w3', name: 'Wynn Worker', role: 'worker 3' },
  { key: 'w4', name: 'Wade Worker', role: 'worker 4' }
]

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
const stamp = Date.now().toString(36)
const creds = { base: BASE, people: {} }
const contexts = {}

for (const person of people) {
  const ctx = await browser.newContext()
  contexts[person.key] = ctx
  const email = `crew-${person.key}-${stamp}@example.com`
  const password = randomBytes(18).toString('base64url')
  const res = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { data: { email, password, name: person.name }, headers: h })
  if (res.status() !== 200) throw new Error(`sign-up ${person.key}: ${res.status()} ${await res.text()}`)
  const id = (await res.json()).user.id
  creds.people[person.key] = { ...person, email, password, id }
}

const api = async (key, method, path, data) => {
  const r = await contexts[key].request.fetch(`${BASE}${path}`, { method, data, headers: h })
  const text = await r.text()
  if (r.status() >= 400) throw new Error(`${method} ${path} ${r.status()} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

// The boss owns a team; everyone else joins it with its code.
sql(`update \\"user\\" set can_create_organizations = true where id = '${creds.people.boss.id}'`)
const org = await api('boss', 'POST', '/api/auth/organization/create', { name: 'Haiku Crew', slug: `haiku-crew-${stamp}` })
const code = (await api('boss', 'POST', `/api/teams/${org.id}/rotate-code`)).joinCode
await api('boss', 'POST', '/api/auth/organization/set-active', { organizationId: org.id })
for (const key of ['pm', 'w1', 'w2', 'w3', 'w4']) {
  await api(key, 'POST', '/api/teams/join', { code })
  await api(key, 'POST', '/api/auth/organization/set-active', { organizationId: org.id })
}
creds.team = { id: org.id, name: 'Haiku Crew' }

// The project: the default columns plus In progress and Bugs. Bugs is the boss's
// queue, so it is last but does not read as an ending (Done does).
const project = await api('boss', 'POST', '/api/projects', { name: 'GitHub integration' })
const board = await api('boss', 'GET', `/api/projects/${project.id}/board`)
const toDo = board.columns.find(c => c.name === 'To do')
await api('boss', 'POST', `/api/projects/${project.id}/columns`, { name: 'In progress', afterId: toDo.id })
await api('boss', 'POST', `/api/projects/${project.id}/columns`, { name: 'Bugs' })
creds.project = { id: project.id, name: project.name }

// An API key each, for the agent tools.
for (const key of Object.keys(creds.people)) {
  const made = await api(key, 'POST', '/api/settings/api-keys', { name: `crew ${key}`, scopes: ['boards:read', 'boards:write'] })
  creds.people[key].apiKey = made.token
}

writeFileSync(CREDS, JSON.stringify(creds, null, 2))
chmodSync(CREDS, 0o600)
await browser.close()
const finalBoard = await (await fetch(`${BASE}/api/health`)).text()
console.log('done:', Object.keys(creds.people).join(','), 'project', project.id, finalBoard.slice(0, 40))

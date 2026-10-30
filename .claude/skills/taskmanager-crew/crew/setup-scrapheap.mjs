// Adds the "ScrapHeap Development Center" to the crew: a customer (ScrapHeap), the
// project the work is planned on (shared with that customer, with an In progress
// and a Bugs column), and a login for the customer's contact (key `scrap`, the
// person who asks for things). Does nothing if `scrap` exists. Never deletes anything.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const path = new URL('./creds.json', import.meta.url).pathname
const creds = JSON.parse(readFileSync(path, 'utf8'))
if (creds.people.scrap) { console.log('scrap exists'); process.exit(0) }
const BASE = creds.base
const h = { origin: BASE }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })

const boss = await browser.newContext()
await boss.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: creds.people.boss.email, password: creds.people.boss.password }, headers: h })
await boss.request.post(`${BASE}/api/auth/organization/set-active`, { data: { organizationId: creds.team.id }, headers: h })
const B = async (method, p, data) => {
  const r = await boss.request.fetch(`${BASE}${p}`, { method, data, headers: h })
  const t = await r.text()
  if (r.status() >= 400) throw new Error(`${method} ${p} ${r.status()} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}

const customer = await B('POST', '/api/customers', { name: 'ScrapHeap' })
const project = await B('POST', '/api/projects', { name: 'ScrapHeap Development Center', customerId: customer.id })
const board = await B('GET', `/api/projects/${project.id}/board`)
const toDo = board.columns.find(c => c.name === 'To do')
await B('POST', `/api/projects/${project.id}/columns`, { name: 'In progress', afterId: toDo.id })
await B('POST', `/api/projects/${project.id}/columns`, { name: 'Bugs' })
const invite = await B('POST', `/api/customers/${customer.id}/invitations`, { label: 'ScrapHeap contact' })
const token = invite.url.split('/invite/')[1]

const contact = await browser.newContext()
const email = `scrapheap-${Date.now().toString(36)}@example.com`
const password = randomBytes(18).toString('base64url')
const su = await contact.request.post(`${BASE}/api/auth/sign-up/email`, { data: { email, password, name: 'Scrappy Customer' }, headers: h })
if (su.status() !== 200) throw new Error(`sign-up ${su.status()}`)
const id = (await su.json()).user.id
const acc = await contact.request.post(`${BASE}/api/invitations/${token}/accept`, { headers: h })
if (acc.status() !== 200) throw new Error(`accept ${acc.status()}`)
const key = await (await contact.request.post(`${BASE}/api/settings/api-keys`, { data: { name: 'scrapheap customer', scopes: ['boards:read', 'boards:write'] }, headers: h })).json()

creds.people.scrap = { key: 'scrap', name: 'Scrappy Customer', role: 'the customer (ScrapHeap): asks for things, answers the PM, never sees internal tasks', email, password, id, apiKey: key.token }
creds.scrapProject = { id: project.id, name: project.name, customerId: customer.id }
writeFileSync(path, JSON.stringify(creds, null, 2))
await browser.close()
console.log('scrapheap project', project.id)

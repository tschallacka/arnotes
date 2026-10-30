// Adds a standing customer contact to the crew: a customer in the Haiku Crew team, a
// project filed under it with a shared and an internal task, and a login for the
// contact (key `contact` in creds.json) so a worker can check the read-only view.
// Does nothing if the contact exists already. Never deletes anything.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const path = new URL('./creds.json', import.meta.url).pathname
const creds = JSON.parse(readFileSync(path, 'utf8'))
if (creds.people.contact) { console.log('contact exists'); process.exit(0) }
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

const customer = await B('POST', '/api/customers', { name: 'Crew Customer' })
const project = await B('POST', '/api/projects', { name: 'Customer view', customerId: customer.id })
const board = await B('GET', `/api/projects/${project.id}/board`)
const col = board.columns[0].id
const shared = await B('POST', `/api/projects/${project.id}/tasks`, { columnId: col, title: 'Shared with the customer', visibility: 'customer' })
await B('POST', `/api/projects/${project.id}/tasks`, { columnId: col, title: 'Team only', visibility: 'internal' })
const invite = await B('POST', `/api/customers/${customer.id}/invitations`, { label: 'Crew contact' })
const token = invite.url.split('/invite/')[1]

const contact = await browser.newContext()
const email = `crew-contact-${Date.now().toString(36)}@example.com`
const password = randomBytes(18).toString('base64url')
const su = await contact.request.post(`${BASE}/api/auth/sign-up/email`, { data: { email, password, name: 'Casey Customer' }, headers: h })
if (su.status() !== 200) throw new Error(`sign-up ${su.status()}`)
const id = (await su.json()).user.id
const acc = await contact.request.post(`${BASE}/api/invitations/${token}/accept`, { headers: h })
if (acc.status() !== 200) throw new Error(`accept ${acc.status()}`)
const key = await (await contact.request.post(`${BASE}/api/settings/api-keys`, { data: { name: 'crew contact', scopes: ['boards:read', 'boards:write'] }, headers: h })).json()

creds.people.contact = { key: 'contact', name: 'Casey Customer', role: 'customer contact: sees only what is shared with the customer; use it to check read-only views', email, password, id, apiKey: key.token }
creds.customerProject = { id: project.id, name: 'Customer view', sharedTaskId: shared.id }
writeFileSync(path, JSON.stringify(creds, null, 2))
await browser.close()
console.log('contact added; project', project.id, 'shared task', shared.id)

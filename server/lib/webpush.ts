import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Web Push, written against the two RFCs it needs rather than pulled in as a
// dependency: RFC 8291 (the payload is encrypted to the browser's key, aes128gcm)
// and RFC 8292 (VAPID, the server proves who it is with an ES256 token). Push is
// optional: without keys nothing that needs it is switched on.
//
// Keys are the unpadded base64url of the uncompressed P-256 public point and of
// the 32-byte private scalar. Generate a pair with `node -e` as .env.example shows.
const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? ''
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? ''
const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@localhost'

export const pushEnabled = Boolean(publicKey && privateKey)
export const vapidPublicKey = publicKey

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushMessage {
  title: string
  body: string
  /** Where a click leads, as a path in this app. */
  url: string
  /** A newer message with the same tag replaces the older on the device. */
  tag: string
}

/** What a push service answered: gone means the subscription is dead and can be deleted. */
export interface PushResult {
  ok: boolean
  gone: boolean
  status: number
}

const b64u = {
  encode: (buffer: Buffer) => buffer.toString('base64url'),
  decode: (text: string) => Buffer.from(text, 'base64url')
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

// HKDF with a single 32-byte block is enough for every key this needs (length <= 32).
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length)
}

/** Encrypts a payload for one subscription (RFC 8291, a single aes128gcm record). */
export function encryptPayload(target: Pick<PushTarget, 'p256dh' | 'auth'>, payload: Buffer): Buffer {
  const receiver = b64u.decode(target.p256dh)
  const authSecret = b64u.decode(target.auth)
  if (receiver.length !== 65 || receiver[0] !== 4) throw new Error('The subscription key is not a P-256 point')

  const ephemeral = createECDH('prime256v1')
  ephemeral.generateKeys()
  const sender = ephemeral.getPublicKey()
  const shared = ephemeral.computeSecret(receiver)

  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), receiver, sender]), 32)
  const salt = randomBytes(16)
  const contentKey = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)

  // 0x02 marks the last record; the record is padded to nothing, as one is enough.
  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])

  const header = Buffer.alloc(21 + sender.length)
  salt.copy(header, 0)
  header.writeUInt32BE(4096, 16)
  header[20] = sender.length
  sender.copy(header, 21)
  return Buffer.concat([header, encrypted])
}

/** The VAPID `Authorization` header for a push service, good for twelve hours. */
export function vapidHeader(endpoint: string, keys = { publicKey, privateKey }): string {
  const audience = new URL(endpoint).origin
  const encode = (value: unknown) => b64u.encode(Buffer.from(JSON.stringify(value)))
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`

  const point = b64u.decode(keys.publicKey)
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u.encode(point.subarray(1, 33)), y: b64u.encode(point.subarray(33, 65)) },
    format: 'jwk'
  })
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${unsigned}.${b64u.encode(signature)}, k=${keys.publicKey}`
}

const PRIVATE_RANGES = [
  /^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:/i
]

/**
 * The endpoint is an address the person chose, and this server will post to it, so
 * it must be a public https address of a push service. Development may use plain
 * loopback, so the tests can stand in for a push service.
 */
export async function checkPushEndpoint(endpoint: string): Promise<string | null> {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return 'The push endpoint is not a URL'
  }
  if (endpoint.length > 1000) return 'The push endpoint is too long'
  if (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return null
  if (url.protocol !== 'https:') return 'The push endpoint must be https'
  if (url.username || url.password) return 'The push endpoint cannot carry credentials'
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'The push endpoint must be a push service, not an address'
  try {
    const addresses = await lookup(host, { all: true })
    if (addresses.some(address => PRIVATE_RANGES.some(range => range.test(address.address)))) return 'The push endpoint points at a private network'
  } catch {
    return 'The push endpoint does not resolve'
  }
  return null
}

/** Sends one message. A push service that is down or slow is reported, not thrown. */
export async function sendPush(target: PushTarget, message: PushMessage): Promise<PushResult> {
  try {
    const body = encryptPayload(target, Buffer.from(JSON.stringify(message)))
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'authorization': vapidHeader(target.endpoint),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        'ttl': '86400',
        'urgency': 'normal'
      },
      body: new Uint8Array(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    })
    return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status }
  } catch {
    return { ok: false, gone: false, status: 0 }
  }
}

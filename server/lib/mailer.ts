import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

// Mail is optional: without a host and a sender address nothing that needs it is
// switched on, so an instance with no SMTP server keeps working as before.
export const mailEnabled = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)

let transport: Transporter | null = null

function getTransport(): Transporter {
  if (transport) return transport

  // SMTP_SECURE means TLS from the first byte (port 465). Left off, the
  // connection starts plain and upgrades with STARTTLS when the server offers it.
  const secure = process.env.SMTP_SECURE === 'true'
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || (secure ? 465 : 587),
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined
  })
  return transport
}

export async function sendMail(message: { to: string, subject: string, text: string, html: string }) {
  await getTransport().sendMail({ from: process.env.SMTP_FROM, ...message })
}

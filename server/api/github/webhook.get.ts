import { createError, defineEventHandler, setHeader } from 'h3'

// GitHub only ever POSTs here. Without this, a GET fell through to the app's own page
// and answered 200 with HTML, which looks like a working endpoint to a browser or a probe.
export default defineEventHandler((event) => {
  setHeader(event, 'allow', 'POST')
  throw createError({ statusCode: 405, message: 'This endpoint takes POST requests from GitHub' })
})

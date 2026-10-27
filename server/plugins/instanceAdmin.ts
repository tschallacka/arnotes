import { backfillInstanceAdmin } from '../utils/ownerOrganization'

// An instance that had accounts before owner organisations existed has no
// instance admin; its oldest account becomes one, with an organisation of its
// own. Idempotent, so it costs one query on every later start.
export default defineNitroPlugin(() => {
  backfillInstanceAdmin().catch((error) => {
    console.error('[instance-admin] backfill failed; is the schema pushed?', error)
  })
})

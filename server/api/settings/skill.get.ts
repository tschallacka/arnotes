import { buildAgentSkill } from '../../utils/agentSkill'

// The agent skill as a download: a SKILL.md for an AI agent, generated from the
// tools this server really offers.
export default defineEventHandler((event) => {
  const origin = process.env.BETTER_AUTH_URL || getRequestURL(event).origin
  setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'attachment; filename="SKILL.md"')
  return buildAgentSkill(origin)
})

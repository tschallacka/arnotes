// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // The crew's scripts are standalone tooling templates, copied out and run with plain node.
    ignores: ['.claude/skills/taskmanager-crew/crew/**']
  },
  {
    rules: {
      // Vue 3 supports fragments, which these pages use for fixed overlays.
      'vue/no-multiple-template-root': 'off'
    }
  }
)

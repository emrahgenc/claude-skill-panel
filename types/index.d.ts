/** One slash command as the panel lists it (a skill, a plugin command or a built-in). */
export type SkillRow = {
  name: string
  description: string
  source: 'builtin' | 'plugin' | 'user' | 'mcp'
  plugin?: string
}

/** The user's groups: their order, and which group each skill (by name) sits in. */
export type Groups = { names: string[]; of: Record<string, string> }

/** What the panel shows right now. */
export type View = {
  /** '*' every group, '-' the ungrouped, else a group name. */
  group: string
  /** '*' everything but Claude Code's own commands, else one source key. */
  source: string
  query: string
  isEditing: boolean
  newName: string
  renameTo: string
}

declare module 'claude-code' {
  interface PluginState {
    'skill-panel': {
      skills: Shaped<SkillRow[]>
      groups: Shaped<Groups>
      view: Shaped<View>
      /** Whether the panel is up, for the button's look; `$.ui.panes()` decides a press. */
      isOpen: boolean
      /** What the last click on a skill came to, drawn at the top of the panel; '' for none. */
      notice: string
    }
  }
}

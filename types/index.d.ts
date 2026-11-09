/** One slash command as the panel lists it (a skill, a plugin command or a built-in). */
export type SkillRow = {
  name: string
  description: string
  source: 'builtin' | 'plugin' | 'user' | 'mcp'
  plugin?: string
}

/**
 * What a skill's own SKILL.md says, where the panel can find the file (skills
 * folders on this machine): the arguments it takes, whether Claude may start
 * it on its own (`disable-model-invocation: true` → only by hand), and where it is.
 */
export type SkillMeta = { argumentHint?: string; isManualOnly?: boolean; path?: string }

/** The user's groups: their order, and which group each skill (by name) sits in. */
export type Groups = { names: string[]; of: Record<string, string> }

/** The panel's screens, one per step of the journey. */
export type Screen = 'find' | 'detail' | 'compare' | 'run' | 'groups' | 'welcome'

/** Where the source chips narrow the list to. */
export type Scope = 'all' | 'here' | 'my' | 'plugin' | 'project' | 'builtin' | 'mcp'

/** What the panel shows right now. */
export type View = {
  screen: Screen
  query: string
  scope: Scope
  /** The skill a detail or run screen is about; the compare screen's first column. */
  focus: string
  /** The compare screen's second column. */
  other: string
  /** The screen a detail screen goes back to. */
  from: Screen
  runArgs: string
  runMode: 'run' | 'copy'
  showOptions: boolean
  /** Find screen: groups the person opened (true) or closed (false); others follow the default. */
  expanded: Record<string, boolean>
  /** Groups screen: the group shown open, and its rename field. */
  groupOpen: string
  isRenaming: boolean
  renameTo: string
  newName: string
  showAllUngrouped: boolean
  showHidden: boolean
  /** Find screen: search the hidden skills too. */
  includeHidden: boolean
  /** Welcome screen: suggested groups the person unticked. */
  suggestOff: string[]
}

/** The line at the foot of the panel: what the last action came to. */
export type Status = {
  text: string
  tone: 'ok' | 'warn' | 'error' | 'info'
  /** A command to show as text (when it could not be copied). */
  code?: string
}

/** The panel's interface language. */
export type Lang = 'tr' | 'en'

/**
 * How the person used each skill: counts overall and per place (the
 * repository the session runs in, else its folder), the last use, and the
 * recent uses (for the weekly bars).
 */
export type Usage = {
  counts: Record<string, number>
  byPlace: Record<string, Record<string, number>>
  last: Record<string, number>
  times: Record<string, number[]>
}

/** Small per-user settings. */
export type Prefs = {
  /** The person turned down the suggested groups. */
  isSuggestionDismissed: boolean
  lang: Lang
  /** Skills kept out of the panel (still in the / menu). */
  hidden: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'skill-panel': {
      skills: Shaped<SkillRow[]>
      meta: Shaped<Record<string, SkillMeta>>
      groups: Shaped<Groups>
      view: Shaped<View>
      usage: Shaped<Usage>
      prefs: Shaped<Prefs>
      status: Shaped<Status>
      /** The last arguments given to each skill, newest first. */
      args: Shaped<Record<string, string[]>>
      /** The place this session works in (repository root, else folder); '' until known. */
      place: string
      /** Each group's slash command (`sk-…`) and the group it opens. */
      groupCommands: Record<string, string>
      /** Whether the panel is up, for the button's look; `$.ui.panes()` decides a press. */
      isOpen: boolean
    }
  }
}

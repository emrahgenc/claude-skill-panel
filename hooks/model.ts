import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderSurface } from 'claude-code'

import type { Groups, Lang, Prefs, Scope, Screen, SkillMeta, SkillRow, Status, Usage, View } from '../types'
import { STRINGS } from './strings'
import type { Strings } from './strings'

export const PANE = 'skills'
export const COMMAND = 'sk'
const GROUP_COMMAND_PREFIX = 'sk-'
const STORE = {
  groups: 'groups',
  usage: 'usage',
  prefs: 'prefs',
  args: 'args',
  skills: 'skillsCache',
} as const
export const UNGROUPED = '-'
const NAME_MAX = 40
const CHIPS = 3
const RECENT_ARGS = 3
const KEEP_TIMES = 40
const WEEK = 7 * 24 * 60 * 60 * 1000

export const EMPTY_GROUPS: Groups = { names: [], of: {} }
const EMPTY_USAGE: Usage = { counts: {}, byPlace: {}, last: {}, times: {} }
const START_PREFS: Prefs = { isSuggestionDismissed: false, lang: 'en', hidden: [] }
export const START_VIEW: View = {
  screen: 'find',
  query: '',
  scope: 'all',
  focus: '',
  other: '',
  from: 'find',
  runArgs: '',
  runMode: 'run',
  showOptions: false,
  expanded: {},
  groupOpen: '',
  isRenaming: false,
  renameTo: '',
  newName: '',
  showAllUngrouped: false,
  showHidden: false,
  includeHidden: false,
  suggestOff: [],
}

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
export const skills = atom({ plugin: 'skill-panel', key: 'skills' } as const, [] as SkillRow[], { shape: 'skills-1' })
export const meta = atom({ plugin: 'skill-panel', key: 'meta' } as const, {} as Record<string, SkillMeta>, { shape: 'meta-2' })
export const groups = atom({ plugin: 'skill-panel', key: 'groups' } as const, EMPTY_GROUPS, { shape: 'groups-1' })
export const view = atom({ plugin: 'skill-panel', key: 'view' } as const, START_VIEW, { shape: 'view-4' })
export const usage = atom({ plugin: 'skill-panel', key: 'usage' } as const, EMPTY_USAGE, { shape: 'usage-2' })
export const prefs = atom({ plugin: 'skill-panel', key: 'prefs' } as const, START_PREFS, { shape: 'prefs-3' })
export const status = atom({ plugin: 'skill-panel', key: 'status' } as const, { text: '', tone: 'ok' } as Status, { shape: 'status-2' })
export const args = atom({ plugin: 'skill-panel', key: 'args' } as const, {} as Record<string, string[]>, { shape: 'args-1' })
export const place = atom({ plugin: 'skill-panel', key: 'place' } as const, '')
export const groupCommands = atom({ plugin: 'skill-panel', key: 'groupCommands' } as const, {} as Record<string, string>)
export const isOpen = atom({ plugin: 'skill-panel', key: 'isOpen' } as const, false)

// ── Pure helpers ─────────────────────────────────────────────────────────

export type SourceKey = 'my' | 'project' | 'plugin' | 'builtin' | 'mcp'

/** Which source bucket a command falls in. */
export function sourceKey(s: SkillRow): SourceKey {
  if (s.source === 'plugin') return s.plugin === 'my' ? 'my' : 'plugin'
  if (s.source === 'user') return 'project'
  return s.source
}

export function sourceLabel(s: SkillRow, t: Strings): string {
  const key = sourceKey(s)
  return key === 'plugin' && s.plugin ? `${t.sourceLabel.plugin} · ${s.plugin}` : t.sourceLabel[key]
}

function clean(description: string): string {
  return description.replace(/\s+/g, ' ').replace(/^["'\s]+|["'\s]+$/g, '')
}

/** The first sentence of a description, cut to one readable line. */
export function summary(description: string): string {
  const text = clean(description)
  if (!text) return '—'
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence
}

/** Text cut to `max` characters at a word, with an ellipsis. */
export function brief(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  // Keep a word that ends right at the cut; otherwise step back to the last whole word.
  const endsAtWord = /\s/.test(text.charAt(max - 1))
  const at = cut.lastIndexOf(' ')
  const kept = endsAtWord ? cut : at > max * 0.6 ? cut.slice(0, at) : cut
  return `${kept.replace(/[\s,;:.-]+$/, '')}…`
}

/** A hint's arguments without the notes after them: `[mr-link]  (or !31)` → `[mr-link]`. */
export function firstArg(hint: string): string {
  return hint.split(/\s{2,}|\s+\(/)[0]?.trim() || hint.trim()
}

/** The notes after a hint's arguments, brackets taken off: `(RTL-1 or !31)` → `RTL-1 or !31`. */
export function hintNote(hint: string): string {
  return hint
    .slice(firstArg(hint).length)
    .trim()
    .replace(/^\(|\)$/g, '')
    .trim()
}

/** A description in full, up to a paragraph. */
export function fullText(description: string): string {
  const text = clean(description)
  return text.length > 420 ? `${text.slice(0, 417).trimEnd()}…` : text
}

export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
}

/** The argument hint and the "only by hand" flag from a SKILL.md's frontmatter. */
export function parseMeta(text: string): SkillMeta {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
  if (!fm) return {}
  const hint = fm
    .match(/^argument-hint:[ \t]*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, '')
  const isManualOnly = /^disable-model-invocation:[ \t]*true[ \t]*$/m.test(fm)
  return { ...(hint ? { argumentHint: hint } : {}), ...(isManualOnly ? { isManualOnly: true } : {}) }
}

/** An argument hint cut to fit beside a name. */
export function shortHint(hint: string): string {
  const one = hint.replace(/\s+/g, ' ').trim()
  return one.length > 40 ? `${one.slice(0, 39).trimEnd()}…` : one
}

/** A hint whose first argument is in angle brackets names a required one. */
export function isRequiredHint(hint: string | undefined): boolean {
  return !!hint && /^\s*</.test(hint)
}

const baseName = (name: string) => name.split(':').pop() ?? name

/** The other skills that carry the same name after the prefix (`design:x`, `design-skills:x`). */
export function sameNamed(all: SkillRow[], name: string): SkillRow[] {
  const base = baseName(name)
  return all.filter(s => s.name !== name && baseName(s.name) === base)
}

/** The name split around the first match of the query, for the highlight. */
export function matchParts(name: string, query: string): { pre: string; hit: string; post: string } {
  const q = query.trim().toLocaleLowerCase('tr')
  const at = q ? name.toLocaleLowerCase('tr').indexOf(q) : -1
  if (at < 0) return { pre: name, hit: '', post: '' }
  return { pre: name.slice(0, at), hit: name.slice(at, at + q.length), post: name.slice(at + q.length) }
}

/** The most used names first (ties by name), at most `limit`. */
export function topUsed(counts: Record<string, number>, limit: number): string[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
    .slice(0, limit)
    .map(([name]) => name)
}

export function groupOf(g: Groups, name: string): string {
  const group = g.of[name]
  return group && g.names.includes(group) ? group : UNGROUPED
}

export function inScope(s: SkillRow, scope: Scope, hereCounts: Record<string, number>): boolean {
  if (scope === 'all') return true
  if (scope === 'here') return (hereCounts[s.name] ?? 0) > 0
  return sourceKey(s) === scope
}

/**
 * The find screen's list: with a query, name matches before description
 * matches, then the most used; without one, this repo's most used, then the
 * overall most used. Hidden skills stay out unless asked for; Claude Code's
 * own commands stay out of the unfiltered browse.
 */
export function search(all: SkillRow[], u: Usage, here: string, v: View, hidden: string[]): SkillRow[] {
  const q = v.query.trim().toLocaleLowerCase('tr')
  const hereCounts = (here && u.byPlace[here]) || {}
  const scored = all
    .filter(s => v.includeHidden || !hidden.includes(s.name))
    .filter(s => inScope(s, v.scope, hereCounts))
    .filter(s => q !== '' || v.scope !== 'all' || sourceKey(s) !== 'builtin')
    .map(s => {
      const name = s.name.toLocaleLowerCase('tr')
      const score = !q ? 1 : name.includes(q) ? 3 : s.description.toLocaleLowerCase('tr').includes(q) ? 2 : 0
      return { s, score }
    })
    .filter(x => x.score > 0)
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (hereCounts[b.s.name] ?? 0) - (hereCounts[a.s.name] ?? 0) ||
      (u.counts[b.s.name] ?? 0) - (u.counts[a.s.name] ?? 0) ||
      a.s.name.localeCompare(b.s.name, 'tr'),
  )
  return scored.map(x => x.s)
}

/** How many skills each source chip would show. */
export function scopeCounts(all: SkillRow[], u: Usage, here: string, hidden: string[]): Record<Scope, number> {
  const hereCounts = (here && u.byPlace[here]) || {}
  const out: Record<Scope, number> = { all: 0, here: 0, my: 0, plugin: 0, project: 0, builtin: 0, mcp: 0 }
  for (const s of all) {
    if (hidden.includes(s.name)) continue
    out.all += 1
    out[sourceKey(s)] += 1
    if ((hereCounts[s.name] ?? 0) > 0) out.here += 1
  }
  return out
}

/** Uses per week, oldest first, over the last `weeks` weeks. */
export function weekly(times: number[], now: number, weeks = 8): number[] {
  const out = new Array<number>(weeks).fill(0)
  for (const at of times) {
    const back = Math.floor((now - at) / WEEK)
    if (back >= 0 && back < weeks) out[weeks - 1 - back] = (out[weeks - 1 - back] ?? 0) + 1
  }
  return out
}

/**
 * Groups to offer on a first open: one per prefix (`my:` → Personal, each
 * plugin by its name), project skills together, Claude Code's own and MCP's
 * left out; only groups of two or more.
 */
export function suggestGroups(all: SkillRow[], t: Strings): Groups {
  const members = new Map<string, string[]>()
  for (const s of all) {
    const key = sourceKey(s)
    if (key === 'builtin' || key === 'mcp') continue
    const group =
      key === 'my'
        ? t.personalGroup
        : key === 'project'
          ? t.projectGroup
          : (s.plugin ?? s.name.split(':')[0] ?? t.sourceLabel.plugin)
    members.set(group, [...(members.get(group) ?? []), s.name])
  }
  const order = (name: string) => (name === t.personalGroup ? 0 : name === t.projectGroup ? 1 : 2)
  const names = [...members.keys()]
    .filter(name => (members.get(name)?.length ?? 0) >= 2)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'tr'))
  const of: Record<string, string> = {}
  for (const name of names) for (const skill of members.get(name) ?? []) of[skill] = name
  return { names, of }
}

/** For a suggested group, how many of its skills share a name with another group's, and which group. */
export function overlapOf(g: Groups, group: string): { n: number; other: string } {
  const mine = Object.entries(g.of).filter(([, gr]) => gr === group).map(([s]) => baseName(s))
  let best = { n: 0, other: '' }
  for (const other of g.names) {
    if (other === group) continue
    const theirs = new Set(Object.entries(g.of).filter(([, gr]) => gr === other).map(([s]) => baseName(s)))
    const n = mine.filter(b => theirs.has(b)).length
    if (n > best.n) best = { n, other }
  }
  return best
}

const TURKISH_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }

/** Each group's slash command, `sk-<group in plain letters>`, unique; command → group. */
export function commandsFor(g: Groups): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of g.names) {
    const slug =
      name
        .toLocaleLowerCase('tr')
        .replace(/[çğıöşü]/g, c => TURKISH_FOLD[c] ?? c)
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'grup'
    let command = `${GROUP_COMMAND_PREFIX}${slug}`
    for (let i = 2; command in out; i++) command = `${GROUP_COMMAND_PREFIX}${slug}-${i}`
    out[command] = name
  }
  return out
}

/**
 * What goes into the draft at `cursor` so that `command` stands apart from the
 * words around it: a space in front when it would touch the word before, one
 * behind unless a space already follows. A cursor out of range counts as the end.
 */
export function insertPiece(draft: string, cursor: number, command: string): string {
  const at = Number.isInteger(cursor) && cursor >= 0 && cursor <= draft.length ? cursor : draft.length
  const before = draft.slice(0, at)
  const after = draft.slice(at)
  const lead = before !== '' && !/\s$/.test(before) ? ' ' : ''
  const trail = /^\s/.test(after) ? '' : ' '
  return `${lead}${command}${trail}`
}

// ── Stored values ────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isGroups(value: unknown): value is Groups {
  if (!isRecord(value)) return false
  const v = value as Groups
  return Array.isArray(v.names) && v.names.every(n => typeof n === 'string') && isRecord(v.of)
}

export function isLang(value: unknown): value is Lang {
  return value === 'tr' || value === 'en'
}

/** What an earlier version stored, brought up to today's shape. */
function readUsage(value: unknown): Usage {
  if (!isRecord(value) || !isRecord(value.counts) || !isRecord(value.byPlace)) return EMPTY_USAGE
  return {
    counts: value.counts as Usage['counts'],
    byPlace: value.byPlace as Usage['byPlace'],
    last: isRecord(value.last) ? (value.last as Usage['last']) : {},
    times: isRecord(value.times) ? (value.times as Usage['times']) : {},
  }
}

/**
 * The language to start in: the person's own pick; else Turkish for someone
 * who already kept groups (the panel was Turkish only before); else the
 * system's locale; else English.
 */
export function startLang(savedPrefs: unknown, hasSavedGroups: boolean, locale: string): Lang {
  if (isRecord(savedPrefs) && isLang(savedPrefs.lang)) return savedPrefs.lang
  if (hasSavedGroups) return 'tr'
  return /^tr/i.test(locale) ? 'tr' : 'en'
}

function isSkillRows(value: unknown): value is SkillRow[] {
  return Array.isArray(value) && value.every(r => isRecord(r) && typeof r.name === 'string')
}

/** Loads everything the panel keeps across sessions. */
export async function loadStored($: EngineInterface): Promise<void> {
  const [savedGroups, savedUsage, savedPrefs, savedArgs, savedSkills] = await Promise.all([
    $.store.get(STORE.groups),
    $.store.get(STORE.usage),
    $.store.get(STORE.prefs),
    $.store.get(STORE.args),
    $.store.get(STORE.skills),
  ])
  if (isGroups(savedGroups)) await update($, groups, () => savedGroups)
  await update($, usage, () => readUsage(savedUsage))
  if (isRecord(savedArgs)) await update($, args, () => savedArgs as Record<string, string[]>)
  // The last list read, shown at once; the panel reads a fresh one when it opens.
  if (isSkillRows(savedSkills)) await update($, skills, () => savedSkills)
  const locale =
    (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG')) || ''
  await update($, prefs, () => ({
    isSuggestionDismissed: isRecord(savedPrefs) && savedPrefs.isSuggestionDismissed === true,
    lang: startLang(savedPrefs, isGroups(savedGroups), locale),
    hidden:
      isRecord(savedPrefs) && Array.isArray(savedPrefs.hidden)
        ? savedPrefs.hidden.filter((h): h is string => typeof h === 'string')
        : [],
  }))
}

export async function strings($: EngineInterface): Promise<Strings> {
  return STRINGS[(await read($, prefs)).lang]
}

/** Everything a drawing reads, in one go (read while drawing, so it redraws on change). */
export async function snapshot($: EngineInterface) {
  const [all, g, v, u, p, md, st, here, recentArgs, open, commands] = await Promise.all([
    read($, skills),
    read($, groups),
    read($, view),
    read($, usage),
    read($, prefs),
    read($, meta),
    read($, status),
    read($, place),
    read($, args),
    read($, isOpen),
    read($, groupCommands),
  ])
  return { all, g, v, u, p, md, st, here, recentArgs, open, commands, t: STRINGS[p.lang] }
}

export async function setPlace($: EngineInterface, here: string): Promise<void> {
  await update($, place, () => here)
}

export async function setOpen($: EngineInterface, value: boolean): Promise<void> {
  await update($, isOpen, () => value)
}

// ── Actions ──────────────────────────────────────────────────────────────

export function setView($: EngineInterface, patch: Partial<View>): Promise<unknown> {
  return update($, view, v => ({ ...v, ...patch }))
}

export function say($: EngineInterface, s: Status): Promise<unknown> {
  return update($, status, () => s)
}

/** Moves to a screen; the status of the last screen goes with it. */
export async function go($: EngineInterface, screen: Screen, patch: Partial<View> = {}): Promise<void> {
  await setView($, { screen, showOptions: false, ...patch })
}

/** Applies a change to the groups, keeps it past the session and refreshes their commands. */
export async function saveGroups($: EngineInterface, change: (g: Groups) => Groups): Promise<void> {
  let latest: Groups | undefined
  await update($, groups, g => (latest = change(g)))
  if (latest) await $.store.set(STORE.groups, latest)
  await registerGroupCommands($).catch(() => undefined)
}

export async function savePrefs($: EngineInterface, change: (p: Prefs) => Prefs): Promise<void> {
  let latest: Prefs | undefined
  await update($, prefs, p => (latest = change(p)))
  if (latest) await $.store.set(STORE.prefs, latest).catch(() => undefined)
}

/**
 * Puts each group in the `/` menu as its own command. A name registered again
 * is replaced; a command of a group since renamed or deleted stays until the
 * next session, and running it opens the whole panel.
 */
export async function registerGroupCommands($: EngineInterface): Promise<void> {
  const g = await read($, groups)
  const t = await strings($)
  const commands = commandsFor(g)
  for (const [command, group] of Object.entries(commands)) {
    const members = Object.entries(g.of)
      .filter(([, gr]) => gr === group)
      .map(([skill]) => `/${skill}`)
    const list = members.length > 6 ? `${members.slice(0, 6).join(', ')} …` : members.join(', ')
    await $.command.register({ name: command, description: t.groupCommand(group, list || '—') })
  }
  await update($, groupCommands, known => ({ ...known, ...commands }))
}

export async function loadSkills($: EngineInterface): Promise<void> {
  const listed = await $.command.list()
  const known = await read($, groupCommands)
  const rows: SkillRow[] = listed
    .filter(c => c.plugin !== 'skill-panel' && !(c.name in known))
    .map(c => ({
      name: c.name,
      description: c.description ?? '',
      source: c.source,
      ...(c.plugin ? { plugin: c.plugin } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  await update($, skills, () => rows)
  await $.store.set(STORE.skills, rows).catch(() => undefined)
  await loadMeta($, rows).catch(() => undefined)
}

/**
 * Reads the frontmatter of the skills whose SKILL.md sits in a skills folder
 * on this machine: a skills-folder plugin's (`~/.claude/skills/<plugin>/skills/<skill>`),
 * the person's own (`~/.claude/skills/<skill>`) and this repository's
 * (`<repo>/.claude/skills/<skill>`). Others keep no meta.
 */
async function loadMeta($: EngineInterface, rows: SkillRow[]): Promise<void> {
  const home = (await $.env.get('HOME')) ?? ''
  const here = await read($, place)
  const pluginFolders = new Map<string, boolean>()
  const out: Record<string, SkillMeta> = {}
  for (const s of rows) {
    const candidates: string[] = []
    const [prefix, base] = s.name.includes(':') ? s.name.split(':', 2) : ['', s.name]
    if (s.source === 'plugin' && prefix && base && home) {
      const folder = `${home}/.claude/skills/${prefix}`
      if (!pluginFolders.has(prefix)) pluginFolders.set(prefix, await $.fs.exists(folder).catch(() => false))
      if (pluginFolders.get(prefix)) candidates.push(`${folder}/skills/${base}/SKILL.md`)
    }
    if (s.source === 'user') {
      if (here) candidates.push(`${here}/.claude/skills/${s.name}/SKILL.md`)
      if (home) candidates.push(`${home}/.claude/skills/${s.name}/SKILL.md`)
    }
    for (const path of candidates) {
      try {
        const text = await $.fs.read(path)
        if (typeof text === 'string') {
          const folder = path.replace(/\/SKILL\.md$/, '')
          out[s.name] = { ...parseMeta(text), path: home ? folder.replace(home, '~') : folder }
        }
        break
      } catch {
        // Not at this path: try the next.
      }
    }
  }
  await update($, meta, () => out)
}

/** The screen a fresh open starts on: the welcome until there are groups or the person said no. */
async function firstScreen($: EngineInterface): Promise<Screen> {
  const [g, p, all] = await Promise.all([read($, groups), read($, prefs), read($, skills)])
  return g.names.length === 0 && !p.isSuggestionDismissed && all.length > 0 ? 'welcome' : 'find'
}

/** Reads the skill list afresh and opens the panel; resolves whether a surface draws it. */
export async function openPanel($: EngineInterface, patch: Partial<View> = {}): Promise<boolean> {
  await loadSkills($)
  const t = await strings($)
  await go($, await firstScreen($), { query: '', expanded: {}, ...patch })
  const { isPlaced } = await $.ui.open({ id: PANE, title: t.title, focus: true, closeOnEscape: true })
  await update($, isOpen, () => true)
  return isPlaced
}

/**
 * The button's press: closes the panel when it is the one on screen, else
 * opens it (or brings it to the front when it sits behind another tab).
 */
export async function togglePanel($: EngineInterface): Promise<void> {
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane?.isShown) {
    await closePanel($)
    return
  }
  await openPanel($)
}

export async function closePanel($: EngineInterface): Promise<void> {
  await $.ui.close({ id: PANE })
  await update($, isOpen, () => false)
}

/** Counts a use of `name`: overall, in this session's place, its time; keeps it past the session. */
export async function recordUse($: EngineInterface, name: string): Promise<void> {
  const here = await read($, place)
  const now = await $.clock.now()
  let latest: Usage | undefined
  await update($, usage, u => {
    const counts = { ...u.counts, [name]: (u.counts[name] ?? 0) + 1 }
    const byPlace = { ...u.byPlace }
    if (here) byPlace[here] = { ...(byPlace[here] ?? {}), [name]: ((byPlace[here] ?? {})[name] ?? 0) + 1 }
    const last = { ...u.last, [name]: now }
    const times = { ...u.times, [name]: [...(u.times[name] ?? []), now].slice(-KEEP_TIMES) }
    return (latest = { counts, byPlace, last, times })
  })
  if (latest) await $.store.set(STORE.usage, latest).catch(() => undefined)
}

/** Keeps the arguments a skill was given, newest first, a few per skill. */
async function rememberArgs($: EngineInterface, name: string, given: string): Promise<void> {
  const text = given.trim()
  if (!text) return
  let latest: Record<string, string[]> | undefined
  await update($, args, a => {
    const list = [text, ...(a[name] ?? []).filter(x => x !== text)].slice(0, RECENT_ARGS)
    return (latest = { ...a, [name]: list })
  })
  if (latest) await $.store.set(STORE.args, latest).catch(() => undefined)
}

const why = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Puts a command where the person can send it:
 * - into the message box where the cursor stands, the draft kept on either side
 *   (`$.prompt.fill` with `insert`; at the end when the box tracks no cursor).
 *   The desktop app takes it through `ui_prompt_fill`, named back to the press
 *   that asked; the terminal's prompt takes it directly;
 * - in the desktop app, if the box refused it, as the box's dim suggestion
 *   (`$.prompt.suggest`; Tab takes it), shown only while the box is empty and
 *   no turn runs;
 * - else the Mac's clipboard; where nothing works, the command to type.
 * Each step's outcome is kept in the store (`lastUse`) for troubleshooting:
 * lengths and offsets only, never the draft's words.
 */
export async function copyCommand(
  $: EngineInterface,
  name: string,
  given: string,
  surface: RenderSurface,
): Promise<void> {
  const command = `/${name}${given.trim() ? ` ${given.trim()}` : ''}`
  const trace: Record<string, unknown> = { name, surface }
  // The box first, while the press is fresh; the bookkeeping after.
  const tryFill = async (): Promise<boolean> => {
    let box = { text: '', cursor: 0 }
    try {
      box = await $.prompt.read()
      trace.read = { textLength: box.text.length, cursor: box.cursor }
    } catch (error) {
      trace.read = { error: why(error) }
    }
    try {
      const filled = await $.prompt.fill({ text: insertPiece(box.text, box.cursor, command), mode: 'insert' })
      trace.fill = {
        isFilled: filled.isFilled,
        refusal: filled.refusal ?? null,
        textLength: filled.text.length,
        cursor: filled.cursor,
        holdsCommand: filled.text.includes(command),
      }
      return filled.isFilled
    } catch (error) {
      trace.fill = { error: why(error) }
      return false
    }
  }
  const isFilled = await tryFill()
  await recordUse($, name)
  await rememberArgs($, name, given)
  const t = await strings($)
  const done = async (s: Status) => {
    await say($, s)
    await $.store.set('lastUse', trace).catch(() => undefined)
  }
  if (isFilled) return done({ text: t.filled(command), tone: 'ok' })

  let isBoxBusy = false
  if (surface !== 'terminal') {
    try {
      const suggested = await $.prompt.suggest({ text: `${command} ` })
      trace.suggest = { isShown: suggested.isShown }
      if (suggested.isShown) return done({ text: t.inBox(command), tone: 'ok' })
      isBoxBusy = true
    } catch (error) {
      trace.suggest = { error: why(error) }
    }
  }

  try {
    const copied = await $.process.run(['pbcopy'], { stdin: `${command} `, timeoutMs: 5000 })
    trace.pbcopy = { exitCode: copied.exitCode, stderr: copied.stderr.slice(0, 200) }
    if (copied.exitCode === 0) {
      return done({ text: isBoxBusy ? t.boxBusy(command) : t.pbcopied(command), tone: isBoxBusy ? 'info' : 'ok' })
    }
  } catch (error) {
    trace.pbcopy = { error: why(error) }
  }

  try {
    const copied = await $.ui.copy({ text: command, surface })
    trace.copy = copied
    if (copied.isCopied) return done({ text: t.copied(command), tone: 'ok' })
  } catch (error) {
    trace.copy = { error: why(error) }
  }

  await done({ text: t.typeIt, tone: 'warn', code: command })
}

/**
 * Runs a skill as if the person typed `/name args` and pressed Enter: no copy
 * and paste. Reached only through the run form, so a click never starts one.
 */
export async function runSkill($: EngineInterface, name: string, given: string): Promise<void> {
  await recordUse($, name)
  await rememberArgs($, name, given)
  const t = await strings($)
  const command = `/${name}${given.trim() ? ` ${given.trim()}` : ''}`
  try {
    await $.command.run({ command: name, args: given.trim() })
    await go($, 'find', { query: '', runArgs: '' })
    await say($, { text: `${t.started(command)} ${t.startedHelp}`, tone: 'ok' })
  } catch (error) {
    await say($, { text: t.runFailed(command, why(error)), tone: 'error', code: command })
  }
}

export async function addGroup($: EngineInterface, raw: string): Promise<void> {
  const name = cleanName(raw)
  if (!name || name === UNGROUPED) return
  await saveGroups($, g => (g.names.includes(name) ? g : { ...g, names: [...g.names, name] }))
  await setView($, { newName: '', groupOpen: name })
}

export async function renameGroup($: EngineInterface, from: string, raw: string): Promise<void> {
  const to = cleanName(raw)
  if (!to || to === from || to === UNGROUPED) {
    await setView($, { isRenaming: false, renameTo: '' })
    return
  }
  await saveGroups($, g => {
    if (g.names.includes(to)) return g
    const of: Record<string, string> = {}
    for (const [skill, group] of Object.entries(g.of)) of[skill] = group === from ? to : group
    return { names: g.names.map(n => (n === from ? to : n)), of }
  })
  await setView($, { groupOpen: to, isRenaming: false, renameTo: '' })
}

export async function deleteGroup($: EngineInterface, name: string): Promise<void> {
  await saveGroups($, g => {
    const of: Record<string, string> = {}
    for (const [skill, group] of Object.entries(g.of)) if (group !== name) of[skill] = group
    return { names: g.names.filter(n => n !== name), of }
  })
  await setView($, { groupOpen: '', isRenaming: false })
}

export async function moveGroup($: EngineInterface, name: string, by: -1 | 1): Promise<void> {
  await saveGroups($, g => {
    const at = g.names.indexOf(name)
    const to = at + by
    if (at < 0 || to < 0 || to >= g.names.length) return g
    const names = [...g.names]
    names[at] = names[to] as string
    names[to] = name
    return { ...g, names }
  })
}

export async function assign($: EngineInterface, skill: string, group: string): Promise<void> {
  await saveGroups($, g => {
    const of = { ...g.of }
    if (group === UNGROUPED) delete of[skill]
    else of[skill] = group
    return { ...g, of }
  })
}

export async function setHidden($: EngineInterface, name: string, isHidden: boolean): Promise<void> {
  await savePrefs($, p => ({
    ...p,
    hidden: isHidden ? [...p.hidden.filter(h => h !== name), name] : p.hidden.filter(h => h !== name),
  }))
}


import type { Groups, Lang, Prefs, Scope, Screen, SkillMeta, SkillRow, Status, Usage, View } from '../types'
import { STRINGS } from './strings'
import type { Strings } from './strings'

export const PANE = 'skills'
export const COMMAND = 'sk'
const GROUP_COMMAND_PREFIX = 'sk-'
export const STORE = {
  groups: 'groups',
  usage: 'usage',
  prefs: 'prefs',
  args: 'args',
  skills: 'skillsCache',
} as const
export const UNGROUPED = '-'
const NAME_MAX = 40
const CHIPS = 3
export const RECENT_ARGS = 3
export const KEEP_TIMES = 40
const WEEK = 7 * 24 * 60 * 60 * 1000

export const EMPTY_GROUPS: Groups = { names: [], of: {} }
export const EMPTY_USAGE: Usage = { counts: {}, byPlace: {}, last: {}, times: {} }
export const START_PREFS: Prefs = { isSuggestionDismissed: false, lang: 'en', hidden: [] }
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isGroups(value: unknown): value is Groups {
  if (!isRecord(value)) return false
  const v = value as Groups
  return Array.isArray(v.names) && v.names.every(n => typeof n === 'string') && isRecord(v.of)
}

export function isLang(value: unknown): value is Lang {
  return value === 'tr' || value === 'en'
}

/** What an earlier version stored, brought up to today's shape. */
export function readUsage(value: unknown): Usage {
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

export function isSkillRows(value: unknown): value is SkillRow[] {
  return Array.isArray(value) && value.every(r => isRecord(r) && typeof r.name === 'string')
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderSurface } from 'claude-code'

import type { Groups, Prefs, Scope, Screen, SkillMeta, SkillRow, Status, Usage, View } from '../types'
import {
  COMMAND,
  EMPTY_GROUPS,
  EMPTY_USAGE,
  KEEP_TIMES,
  PANE,
  RECENT_ARGS,
  START_PREFS,
  START_VIEW,
  STORE,
  UNGROUPED,
  brief,
  cleanName,
  commandsFor,
  firstArg,
  fullText,
  groupOf,
  hintNote,
  insertPiece,
  isGroups,
  isLang,
  isRecord,
  isRequiredHint,
  isSkillRows,
  matchParts,
  overlapOf,
  parseMeta,
  readUsage,
  sameNamed,
  scopeCounts,
  search,
  sourceKey,
  sourceLabel,
  startLang,
  suggestGroups,
  summary,
  topUsed,
  weekly,
} from './model'
import { LANG_OPTIONS, STRINGS } from './strings'
import type { Strings } from './strings'

const CHIPS = 3
const REST = 8
const UNGROUPED_PREVIEW = 8
const SCOPES: Scope[] = ['all', 'here', 'my', 'plugin', 'project', 'builtin']
const TONE = { ok: 'success', warn: 'warning', error: 'error', info: 'suggestion' } as const
const SOURCE_COLOR = { plugin: 'suggestion', my: 'success', project: 'remember', builtin: 'inactive', mcp: 'warning' } as const
// The picked source chip's fill: the design's light blue tint, readable in both themes.
const PICKED_FILL = 'rgba(96, 140, 255, 0.18)'
// The lead row's fill: grey at a tenth, a shade lighter on the dark theme and a
// shade darker on the light one (the design's #262624 on #1f1f1d).
const ROW_LEAD_FILL = 'rgba(128, 128, 128, 0.10)'
// A row's padding above and below, and the room between rows, in the pane's
// row unit (10px): the design's rows sit 2px apart.
const ROW_PAD_Y = 0.5
const ROW_GAP = 0.2
// A chip's padding above and below, in the pane's row unit (half a 20px line): 2.5px.
const CHIP_PAD_Y = 0.25
// The search bar's magnifier (a 16px outline in the design's blue).
const SEARCH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" ' +
  'stroke="#7FA2FF" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.75"/>' +
  '<path d="M10.5 10.5 14 14"/></svg>'

// ── State and actions: every use of $ lives in this file ───────────────

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const skills = atom({ plugin: 'skill-panel', key: 'skills' } as const, [] as SkillRow[], { shape: 'skills-1' })
const meta = atom({ plugin: 'skill-panel', key: 'meta' } as const, {} as Record<string, SkillMeta>, { shape: 'meta-2' })
const groups = atom({ plugin: 'skill-panel', key: 'groups' } as const, EMPTY_GROUPS, { shape: 'groups-1' })
const view = atom({ plugin: 'skill-panel', key: 'view' } as const, START_VIEW, { shape: 'view-4' })
const usage = atom({ plugin: 'skill-panel', key: 'usage' } as const, EMPTY_USAGE, { shape: 'usage-2' })
const prefs = atom({ plugin: 'skill-panel', key: 'prefs' } as const, START_PREFS, { shape: 'prefs-3' })
const status = atom({ plugin: 'skill-panel', key: 'status' } as const, { text: '', tone: 'ok' } as Status, { shape: 'status-2' })
const args = atom({ plugin: 'skill-panel', key: 'args' } as const, {} as Record<string, string[]>, { shape: 'args-1' })
const place = atom({ plugin: 'skill-panel', key: 'place' } as const, '')
const groupCommands = atom({ plugin: 'skill-panel', key: 'groupCommands' } as const, {} as Record<string, string>)
const isOpen = atom({ plugin: 'skill-panel', key: 'isOpen' } as const, false)

/** Loads everything the panel keeps across sessions. */
async function loadStored($: EngineInterface): Promise<void> {
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

async function strings($: EngineInterface): Promise<Strings> {
  return STRINGS[(await read($, prefs)).lang]
}

/** Everything a drawing reads, in one go (read while drawing, so it redraws on change). */
async function snapshot($: EngineInterface) {
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

async function setPlace($: EngineInterface, here: string): Promise<void> {
  await update($, place, () => here)
}

async function setOpen($: EngineInterface, value: boolean): Promise<void> {
  await update($, isOpen, () => value)
}

// ── Actions ──────────────────────────────────────────────────────────────

function setView($: EngineInterface, patch: Partial<View>): Promise<unknown> {
  return update($, view, v => ({ ...v, ...patch }))
}

function say($: EngineInterface, s: Status): Promise<unknown> {
  return update($, status, () => s)
}

/** Moves to a screen; the status of the last screen goes with it. */
async function go($: EngineInterface, screen: Screen, patch: Partial<View> = {}): Promise<void> {
  await setView($, { screen, showOptions: false, ...patch })
}

/** Applies a change to the groups, keeps it past the session and refreshes their commands. */
async function saveGroups($: EngineInterface, change: (g: Groups) => Groups): Promise<void> {
  let latest: Groups | undefined
  await update($, groups, g => (latest = change(g)))
  if (latest) await $.store.set(STORE.groups, latest)
  await registerGroupCommands($).catch(() => undefined)
}

async function savePrefs($: EngineInterface, change: (p: Prefs) => Prefs): Promise<void> {
  let latest: Prefs | undefined
  await update($, prefs, p => (latest = change(p)))
  if (latest) await $.store.set(STORE.prefs, latest).catch(() => undefined)
}

/**
 * Puts each group in the `/` menu as its own command. A name registered again
 * is replaced; a command of a group since renamed or deleted stays until the
 * next session, and running it opens the whole panel.
 */
async function registerGroupCommands($: EngineInterface): Promise<void> {
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

async function loadSkills($: EngineInterface): Promise<void> {
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
async function openPanel($: EngineInterface, patch: Partial<View> = {}): Promise<boolean> {
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
async function togglePanel($: EngineInterface): Promise<void> {
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane?.isShown) {
    await closePanel($)
    return
  }
  await openPanel($)
}

async function closePanel($: EngineInterface): Promise<void> {
  await $.ui.close({ id: PANE })
  await update($, isOpen, () => false)
}

/** Counts a use of `name`: overall, in this session's place, its time; keeps it past the session. */
async function recordUse($: EngineInterface, name: string): Promise<void> {
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
async function copyCommand(
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
async function runSkill($: EngineInterface, name: string, given: string): Promise<void> {
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

async function addGroup($: EngineInterface, raw: string): Promise<void> {
  const name = cleanName(raw)
  if (!name || name === UNGROUPED) return
  await saveGroups($, g => (g.names.includes(name) ? g : { ...g, names: [...g.names, name] }))
  await setView($, { newName: '', groupOpen: name })
}

async function renameGroup($: EngineInterface, from: string, raw: string): Promise<void> {
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

async function deleteGroup($: EngineInterface, name: string): Promise<void> {
  await saveGroups($, g => {
    const of: Record<string, string> = {}
    for (const [skill, group] of Object.entries(g.of)) if (group !== name) of[skill] = group
    return { names: g.names.filter(n => n !== name), of }
  })
  await setView($, { groupOpen: '', isRenaming: false })
}

async function moveGroup($: EngineInterface, name: string, by: -1 | 1): Promise<void> {
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

async function assign($: EngineInterface, skill: string, group: string): Promise<void> {
  await saveGroups($, g => {
    const of = { ...g.of }
    if (group === UNGROUPED) delete of[skill]
    else of[skill] = group
    return { ...g, of }
  })
}

async function setHidden($: EngineInterface, name: string, isHidden: boolean): Promise<void> {
  await savePrefs($, p => ({
    ...p,
    hidden: isHidden ? [...p.hidden.filter(h => h !== name), name] : p.hidden.filter(h => h !== name),
  }))
}

// ── Drawing helpers ──────────────────────────────────────────────────────

/** The band's chips: this place's most used, else the overall most used, still listed. */
export function chipNames(all: SkillRow[], u: Usage, here: string): { names: string[]; isLocal: boolean } {
  const known = (name: string) => all.length === 0 || all.some(s => s.name === name)
  const local = here ? topUsed(u.byPlace[here] ?? {}, CHIPS).filter(known) : []
  if (local.length > 0) return { names: local, isLocal: true }
  return { names: topUsed(u.counts, CHIPS).filter(known), isLocal: false }
}

/** The most recently used skill and when. */
export function lastUse(u: Usage): { name: string; at: number } | undefined {
  let best: { name: string; at: number } | undefined
  for (const [name, at] of Object.entries(u.last)) if (!best || at > best.at) best = { name, at }
  return best
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadStored($)
    const t = await strings($)
    await $.command.register({ name: COMMAND, description: t.commandDescription })
    await registerGroupCommands($).catch(() => undefined)

    // The place this session works in: its repository's root, else its folder.
    try {
      const repo = await $.session.repo()
      const here = repo?.root ?? (await $.session.cwd())
      await setPlace($, here)
    } catch {
      // No place: the band offers the overall most used instead.
    }

    return next(e)
  })

  // However the panel goes (its button, Escape, its close mark, an unload),
  // the button stops showing it as open.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await setOpen($, false)
    return closed
  }).catch(($, e, next) => next(e))

  // Notice: the band above the message box offers this repo's most used
  // skills, says which one you used last, and opens or closes the panel.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const { t, u, open: isUp, all, here } = await snapshot($)
    const chips = chipNames(all, u, here)
    const last = lastUse(u)
    const now = await $.clock.now()

    return (
      <Box flexDirection="row" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button
            key="open-skills"
            label={t.bandButton}
            {...(isUp ? { variant: 'primary' as const } : {})}
            onPress={() => void togglePanel($)}
          />
          {chips.names.length > 0 ? (
            <Text dimColor>{chips.isLocal ? t.chipsHere : t.chipsAll}</Text>
          ) : (
            <Text dimColor>{t.bandHint}</Text>
          )}
          {chips.names.map(name => (
            <Button key={`chip:${name}`} onPress={press => void copyCommand($, name, '', press.surface)}>
              <Text mono>/{name}</Text>
            </Button>
          ))}
        </Box>
        {last ? (
          <Text dimColor>
            {t.lastUsed} <Text mono>/{last.name}</Text> · {t.ago(Math.max(0, now - last.at))}
          </Text>
        ) : (
          ''
        )}
      </Box>
    )
  })

  on('command.run', { command: COMMAND }, async $ => {
    const isPlaced = await openPanel($)
    const t = await strings($)

    return { text: isPlaced ? t.opened : t.openedHidden }
  }).catch(async ($, e, next) => (next.called ? next(e) : { text: (await strings($)).openFailed }))

  // A group's own command (`/sk-review`) opens the panel on that group.
  on('command.run', async ($, e, next) => {
    const { commands, g, t } = await snapshot($)
    const group = commands[e.command]
    if (group === undefined) return next(e)
    const isThere = g.names.includes(group)
    const isPlaced = await openPanel($, { screen: 'find', scope: 'all', expanded: isThere ? { [group]: true } : {} })
    await say($, isThere ? { text: '', tone: 'ok' } : { text: t.groupGone(group), tone: 'info' })

    return { text: isPlaced ? t.opened : t.openedHidden }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { all, g, v, u, p, t, md, st, here, recentArgs, commands: groupCommandMap } = await snapshot($)

    if (e.surface === 'mobile') {
      // The mobile app draws no fields: a read-only list, group by group.
      const { Box, Text } = $.ui.resolve(e)
      const shown = all.filter(s => !p.hidden.includes(s.name) && sourceKey(s) !== 'builtin')
      const names = [...g.names, UNGROUPED]

      return (
        <Box flexDirection="column" gap={1}>
          {names.map(name => {
            const rows = shown.filter(s => groupOf(g, s.name) === name)
            return rows.length === 0 ? (
              ''
            ) : (
              <Box key={`m:${name}`} flexDirection="column">
                <Text bold>{name === UNGROUPED ? t.ungrouped : name}</Text>
                {rows.map(s => (
                  <Text>
                    /{s.name} — {summary(s.description)}
                  </Text>
                ))}
              </Box>
            )
          })}
        </Box>
      )
    }

    const elements = $.ui.resolve(e)
    const { Box, Button, Input, Select, Text } = elements
    // Only graphical surfaces draw an SVG; the terminal goes without the icon.
    const Svg = 'Svg' in elements ? elements.Svg : undefined
    const isGraphical = e.surface !== 'terminal'
    // The search field may hold a line break (Shift+Enter); a query is one line.
    const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ')
    const now = await $.clock.now()
    const byName = (name: string) => all.find(s => s.name === name)
    const hereCounts = (here && u.byPlace[here]) || {}
    const groupChoices = [
      { value: UNGROUPED, label: t.ungroupedChoice },
      ...g.names.map(n => ({ value: n, label: n })),
    ]

    // ── Shared pieces ────────────────────────────────────────────────
    // The pane's body height, so a short screen can push its footer to the bottom.
    const bodyRows = e.props.scroll.bodyRows
    const eyebrow = (text: string) => (
      <Text dimColor size="caption">
        {text}
      </Text>
    )
    // A small label in colour. On a graphical surface a coloured one sits in the
    // design's thin outline: the app's plain radius (`single`, a key cap's) in
    // its colour dimmed, the padding named so the app adds none of its own.
    const pill = (key: string, text: string, color?: 'warning' | 'suggestion') =>
      isGraphical && color ? (
        <Box key={key} borderStyle="single" borderColor={color} borderDimColor paddingX="xs" paddingY={0} flexShrink={0}>
          <Text size="caption" weight="semibold" color={color}>
            {text}
          </Text>
        </Box>
      ) : (
        <Text key={key} size="caption" weight="medium" {...(color ? { color } : { dimColor: true })}>
          {text}
        </Text>
      )
    const section = (key: string, title: string, ...body: RenderChildren[]) => (
      <Box key={key} flexDirection="column" gap="sm">
        {eyebrow(title)}
        {body}
      </Box>
    )

    // A graphical surface frames the pane with its own title and close mark, so
    // the panel draws neither again there; the terminal keeps its own ✕.
    const closeButton = isGraphical ? (
      ''
    ) : (
      <Button key="close" plain dimColor role="dismiss" label={t.close} onPress={() => void closePanel($)} />
    )

    const statusLine =
      st.text === '' ? (
        ''
      ) : (
        <Box key="status" flexDirection="column" gap="xs" borderStyle="round" borderColor={TONE[st.tone]} paddingX={1}>
          <Text size="footnote" color={TONE[st.tone]}>
            {st.text}
          </Text>
          {st.code ? <Text mono>{st.code}</Text> : ''}
        </Box>
      )

    // The name with the query's match marked.
    const nameText = (s: SkillRow, isBold: boolean) => {
      const part = matchParts(s.name, v.query)
      return (
        <Text mono {...(isBold ? { weight: 'semibold' as const } : {})}>
          /{part.pre}
          {part.hit ? (
            <Text backgroundColor="suggestion" color="inverseText">
              {part.hit}
            </Text>
          ) : (
            ''
          )}
          {part.post}
        </Text>
      )
    }

    const tags = (s: SkillRow, scope: string) => {
      const others = sameNamed(all, s.name)
      return (
        <Box flexDirection="row" alignItems="center" gap="xs">
          {md[s.name]?.isManualOnly ? pill(`man:${scope}:${s.name}`, t.manualOnly, 'warning') : ''}
          {others.length > 0 ? (
            <Button
              key={`sim:${scope}:${s.name}`}
              plain
              onPress={() => void go($, 'compare', { focus: s.name, other: others[0]?.name ?? '' })}
            >
              <Text size="caption" weight="medium" color="suggestion">
                {t.similar(others.length)}
              </Text>
            </Button>
          ) : (
            ''
          )}
        </Box>
      )
    }

    const openDetail = (name: string) => go($, 'detail', { focus: name, from: v.screen })
    const openRun = (name: string) => go($, 'run', { focus: name, runArgs: '', runMode: 'run' })

    // A compact row: the name opens the details, "copy" copies.
    // Line one: the name and its tags, "copy" at the far end. Line two: where it
    // comes from and what it does, cut to one line. The list's lead row stands
    // on the design's slightly lighter fill.
    const row = (s: SkillRow, scope: string, isLead = false) => (
      <Box
        key={`${scope}row:${s.name}`}
        flexDirection="column"
        gap="xs"
        paddingX={1}
        {...(isGraphical
          ? {
              // Every row in the same unseen rounded outline, so the lead row's
              // fill has the design's round corners and no edge of its own, and
              // the rows stay aligned.
              borderStyle: 'round',
              borderColor: 'rgba(0, 0, 0, 0)',
              paddingY: ROW_PAD_Y,
              ...(isLead ? { backgroundColor: ROW_LEAD_FILL } : {}),
            }
          : {})}
      >
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
          <Box flexDirection="row" alignItems="center" gap="sm" flexShrink={1}>
            <Button key={`${scope}:${s.name}`} plain onPress={() => void openDetail(s.name)}>
              {nameText(s, false)}
            </Button>
            {tags(s, scope)}
          </Box>
          <Button
            key={`${scope}copy:${s.name}`}
            plain
            dimColor
            label={t.copySmall}
            onPress={press => void copyCommand($, s.name, '', press.surface)}
          />
        </Box>
        <Text dimColor size="footnote" wrap="truncate-end">
          {sourceLabel(s, t)} · {summary(s.description)}
        </Text>
      </Box>
    )

    const header = (left: RenderChildren, extra: RenderChildren = '') => (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
        {left}
        <Box flexDirection="row" alignItems="center" gap="sm">
          {extra}
          {closeButton}
        </Box>
      </Box>
    )

    const backTo = (label: string, onPress: () => void) => (
      <Button key="back" plain label={t.back(label)} onPress={onPress} />
    )

    const missing = (
      <Box flexDirection="column" gap={1}>
        {header(backTo(t.title, () => void go($, 'find')))}
        <Text dimColor>{t.loading}</Text>
      </Box>
    )

    // ── Welcome: the first open ──────────────────────────────────────
    if (v.screen === 'welcome') {
      const suggestion = suggestGroups(all, t)
      const picked = suggestion.names.filter(n => !v.suggestOff.includes(n))
      const bySource = { plugin: 0, my: 0, project: 0, builtin: 0, mcp: 0 }
      for (const s of all) bySource[sourceKey(s)] += 1
      const sources = Object.values(bySource).filter(n => n > 0).length
      const total = Math.max(1, all.length)
      const segments = (Object.keys(bySource) as (keyof typeof bySource)[]).filter(k => bySource[k] > 0)

      return (
        <Box flexDirection="column" gap="md" minHeight={bodyRows}>
          {header(eyebrow(t.welcomeEyebrow))}
          <Text bold>{t.found(all.length, sources)}</Text>
          <Text dimColor>{t.welcomeLead}</Text>
          <Box flexDirection="row" height={1}>
            {segments.map(k => (
              <Box key={`seg:${k}`} width={`${Math.round((bySource[k] / total) * 100)}%`} backgroundColor={SOURCE_COLOR[k]} />
            ))}
          </Box>
          <Box flexDirection="row" gap={2} flexWrap="wrap">
            {segments.map(k => (
              <Text key={`leg:${k}`}>
                <Text color={SOURCE_COLOR[k]}>■</Text> {t.sourceLabel[k]} {bySource[k]}
                {k === 'builtin' ? ` · ${t.hiddenByDefault}` : ''}
              </Text>
            ))}
          </Box>
          {eyebrow(t.suggested(picked.length))}
          {suggestion.names.map(name => {
            const isOn = !v.suggestOff.includes(name)
            const members = Object.entries(suggestion.of).filter(([, gr]) => gr === name).map(([s]) => s)
            const clash = overlapOf(suggestion, name)
            return (
              <Box key={`sg:${name}`} flexDirection="column" paddingX={1}>
                <Button
                  key={`suggest:${name}`}
                  plain
                  onPress={() =>
                    void setView($, {
                      suggestOff: isOn ? [...v.suggestOff, name] : v.suggestOff.filter(n => n !== name),
                    })
                  }
                >
                  <Text>{isOn ? '☑' : '☐'} </Text>
                  <Text bold>{name}</Text>
                  <Text dimColor> {t.skillsCount(members.length)}</Text>
                  {clash.n > 0 ? <Text color="warning"> · {t.overlap(clash.n, clash.other)}</Text> : ''}
                </Button>
                <Text dimColor mono>
                  {members.slice(0, 3).map(m => `/${m}`).join(' · ')}
                </Text>
              </Box>
            )
          })}
          <Box flexDirection="row" gap={1}>
            <Button
              key="apply-suggested"
              variant="primary"
              label={picked.length > 0 ? t.setUp(picked.length) : t.continueWithout}
              onPress={() =>
                void (async () => {
                  if (picked.length > 0) {
                    const of: Record<string, string> = {}
                    for (const [skill, gr] of Object.entries(suggestion.of)) if (picked.includes(gr)) of[skill] = gr
                    await saveGroups($, () => ({ names: picked, of }))
                  } else {
                    await savePrefs($, pr => ({ ...pr, isSuggestionDismissed: true }))
                  }
                  await go($, 'find')
                })()
              }
            />
            <Button
              key="own-groups"
              label={t.ownGroups}
              onPress={() =>
                void savePrefs($, pr => ({ ...pr, isSuggestionDismissed: true })).then(() => go($, 'groups'))
              }
            />
          </Box>
          <Text dimColor>{t.groupCommandsNote}</Text>
        </Box>
      )
    }

    // ── Detail: what a skill does, how to call it, how you use it ─────
    if (v.screen === 'detail') {
      const s = byName(v.focus)
      if (!s) return missing
      const m = md[s.name] ?? {}
      const group = groupOf(g, s.name)
      const times = u.times[s.name] ?? []
      const bars = weekly(times, now)
      const peak = Math.max(1, ...bars)
      const others = sameNamed(all, s.name)
      const count = u.counts[s.name] ?? 0
      const lastAt = u.last[s.name]
      const arg = m.argumentHint ? firstArg(m.argumentHint) : ''
      const note = m.argumentHint ? hintNote(m.argumentHint) : ''

      return (
        <Box flexDirection="column" gap="md" minHeight={bodyRows}>
          {header(backTo(v.from === 'groups' ? t.groupsTitle : t.backResults(v.query), () => void go($, v.from)))}

          <Box flexDirection="column" gap="sm">
            <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
              <Text mono weight="semibold" size="heading">
                /{s.name}
              </Text>
              {m.isManualOnly ? pill('d-manual', t.manualOnly, 'warning') : ''}
            </Box>
            <Text size="footnote">{brief(fullText(s.description) || '—', 240)}</Text>
            <Text dimColor size="caption">
              {sourceLabel(s, t)}
              {group !== UNGROUPED ? `  ·  ${t.groupChip(group)}` : ''}
            </Text>
          </Box>

          <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
            <Box flexGrow={1}>
              <Button key="detail-run" variant="primary" label={t.runEllipsis} onPress={() => void openRun(s.name)} />
            </Box>
            <Button key="detail-copy" label={t.copy} onPress={press => void copyCommand($, s.name, '', press.surface)} />
            <Select
              key="detail-group"
              label={t.group}
              value={group}
              options={groupChoices}
              onSelect={value => void assign($, s.name, value)}
            />
          </Box>

          {section(
            'd-how',
            t.howToCall,
            <Box borderStyle="round" paddingX={1}>
              <Text mono size="footnote">
                /{s.name}
                {arg ? <Text color="suggestion"> {arg}</Text> : ''}
              </Text>
            </Box>,
            <Text dimColor size="footnote">
              {note || (arg ? t.hintHelp : '')}
            </Text>,
          )}

          {m.isManualOnly
            ? section(
                'd-know',
                t.knowThis,
                <Box borderStyle="round" borderColor="warning" paddingX={1}>
                  <Text size="footnote" color="warning">
                    {t.manualExplain}
                  </Text>
                </Box>,
              )
            : ''}

          {section(
            'd-use',
            t.yourUse,
            <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end" gap="md">
              <Box flexDirection="row" gap="lg">
                <Box flexDirection="column">
                  <Text weight="semibold" size="heading" tabular>
                    {count}
                  </Text>
                  <Text dimColor size="caption">
                    {t.total}
                  </Text>
                </Box>
                <Box flexDirection="column">
                  <Text weight="semibold" size="heading" tabular>
                    {hereCounts[s.name] ?? 0}
                  </Text>
                  <Text dimColor size="caption">
                    {t.here}
                  </Text>
                </Box>
                <Box flexDirection="column">
                  <Text weight="semibold" size="heading">
                    {lastAt ? t.ago(Math.max(0, now - lastAt)) : count > 0 ? '—' : t.never}
                  </Text>
                  <Text dimColor size="caption">
                    {t.last}
                  </Text>
                </Box>
              </Box>
              {/* The weekly strip shows only once there are dated uses to draw. */}
              {times.length > 0 ? (
                <Box flexDirection="row" alignItems="flex-end" gap="xs">
                  {bars.map((n, i) => (
                    <Box
                      key={`wk:${i}`}
                      width={1}
                      height={Math.max(1, Math.round((n / peak) * 3))}
                      backgroundColor={i === bars.length - 1 ? 'suggestion' : n === 0 ? 'subtle' : 'inactive'}
                    />
                  ))}
                </Box>
              ) : (
                ''
              )}
            </Box>,
          )}

          {others.length > 0
            ? section(
                'd-same',
                t.sameName,
                ...others.map(o => (
                  <Box
                    key={`same:${o.name}`}
                    flexDirection="row"
                    justifyContent="space-between"
                    alignItems="center"
                    gap="sm"
                    borderStyle="round"
                    paddingX={1}
                  >
                    <Box flexDirection="column" flexShrink={1}>
                      <Text mono size="footnote">
                        /{o.name}
                      </Text>
                      <Text dimColor size="caption" wrap="truncate-end">
                        {summary(o.description)} · {sourceLabel(o, t)}
                      </Text>
                    </Box>
                    <Button
                      key={`compare:${o.name}`}
                      plain
                      label={t.compareLink}
                      onPress={() => void go($, 'compare', { focus: s.name, other: o.name })}
                    />
                  </Box>
                )),
              )
            : ''}

          <Box flexGrow={1} />
          {m.path ? (
            <Text dimColor mono size="caption">
              {m.path}
            </Text>
          ) : (
            ''
          )}
          {statusLine}
        </Box>
      )
    }

    // ── Compare: two skills of the same name, row by row ─────────────
    if (v.screen === 'compare') {
      const a = byName(v.focus)
      const b = byName(v.other)
      if (!a || !b) return missing
      const auto = (s: SkillRow) =>
        md[s.name]?.isManualOnly ? t.autoNo : md[s.name] ? t.autoYes : t.unknown
      const uses = (s: SkillRow) => t.uses(u.counts[s.name] ?? 0, hereCounts[s.name] ?? 0)
      const less = (u.counts[a.name] ?? 0) < (u.counts[b.name] ?? 0) ? a : b
      const line = (key: string, label: string, left: string, right: string) => (
        <Box key={key} flexDirection="row" gap={1}>
          <Box width="28%">
            <Text dimColor>{label}</Text>
          </Box>
          <Box width="36%">
            <Text>{left}</Text>
          </Box>
          <Box width="36%">
            <Text>{right}</Text>
          </Box>
        </Box>
      )

      return (
        <Box flexDirection="column" gap="md" minHeight={bodyRows}>
          {header(backTo(`/${a.name}`, () => void go($, 'detail', { focus: a.name })))}
          <Text bold>{t.compareTitle}</Text>
          <Box flexDirection="column" gap={1} borderStyle="round" paddingX={1}>
            <Box flexDirection="row" gap={1}>
              <Box width="28%">
                <Text> </Text>
              </Box>
              <Box width="36%" flexDirection="column">
                <Text mono bold>/{a.name}</Text>
                <Text dimColor>{sourceLabel(a, t)}</Text>
              </Box>
              <Box width="36%" flexDirection="column">
                <Text mono bold>/{b.name}</Text>
                <Text dimColor>{sourceLabel(b, t)}</Text>
              </Box>
            </Box>
            {line('c-what', t.rowWhat, summary(a.description), summary(b.description))}
            {line('c-arg', t.rowArg, md[a.name]?.argumentHint ?? '—', md[b.name]?.argumentHint ?? '—')}
            {line('c-auto', t.rowAuto, auto(a), auto(b))}
            {line('c-use', t.rowUse, uses(a), uses(b))}
            <Box flexDirection="row" gap={1}>
              <Box width="28%">
                <Text> </Text>
              </Box>
              <Box width="36%">
                <Button key={`use:${a.name}`} variant="primary" label={t.useThis} onPress={() => void openRun(a.name)} />
              </Box>
              <Box width="36%">
                <Button key={`use:${b.name}`} label={t.useThis} onPress={() => void openRun(b.name)} />
              </Box>
            </Box>
          </Box>
          <Box flexDirection="column" gap={1} borderStyle="round" paddingX={1}>
            <Text bold>{t.simplify}</Text>
            <Text dimColor>{t.simplifyHelp}</Text>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button
                key={`hide:${less.name}`}
                label={t.hideIt(less.name)}
                onPress={() =>
                  void setHidden($, less.name, true).then(async () => {
                    await say($, { text: t.hiddenDone(less.name), tone: 'ok' })
                    await go($, 'find')
                  })
                }
              />
              <Button key="keep-both" label={t.keepBoth} onPress={() => void go($, 'detail', { focus: a.name })} />
            </Box>
          </Box>
        </Box>
      )
    }

    // ── Run: arguments, the command it sends, run or copy ─────────────
    if (v.screen === 'run') {
      const s = byName(v.focus)
      if (!s) return missing
      const hint = md[s.name]?.argumentHint
      const given = v.runArgs.trim()
      const command = `/${s.name}${given ? ` ${given}` : hint ? ` ${hint}` : ''}`
      const recent = recentArgs[s.name] ?? []
      const submit = (text: string, surface: Parameters<typeof copyCommand>[3]) =>
        v.runMode === 'run'
          ? runSkill($, s.name, text)
          : copyCommand($, s.name, text, surface).then(() => go($, 'find', { query: '', runArgs: '' }))
      const mode = (id: 'run' | 'copy', label: string, help: string) => (
        <Box key={`m-${id}`} flexDirection="column" paddingX={1}>
          <Button
            key={`mode-${id}`}
            {...(v.runMode === id ? { variant: 'primary' as const } : {})}
            label={`${v.runMode === id ? '◉' : '○'} ${label}`}
            onPress={() => void setView($, { runMode: id })}
          />
          <Text dimColor>{help}</Text>
        </Box>
      )

      return (
        <Box flexDirection="column" gap="md" minHeight={bodyRows}>
          {header(backTo(`/${s.name}`, () => void go($, 'detail', { focus: s.name })))}
          {eyebrow(t.runEyebrow)}
          <Text mono bold>
            /{s.name}
          </Text>
          <Input
            key="run-arg"
            autoFocus
            label={hint ? firstArg(hint) : t.args}
            placeholder={hint ? firstArg(hint) : t.argsPlaceholder}
            // The desktop draws a field's submit label as a button of its own,
            // beside the form's own Run below; Enter submits there without it.
            {...(isGraphical ? {} : { submitLabel: v.runMode === 'run' ? t.run : t.copy })}
            value={v.runArgs}
            onInput={value => void setView($, { runArgs: value })}
            onSubmit={(value, input) => void submit(value, input.surface)}
          />
          {isRequiredHint(hint) && given === '' ? (
            <Text size="footnote" color="warning">
              {t.argRequired(firstArg(hint ?? ''))}
            </Text>
          ) : hint && hintNote(hint) ? (
            <Text dimColor size="footnote">
              {hintNote(hint)}
            </Text>
          ) : (
            ''
          )}
          {recent.length > 0 ? (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Text dimColor>{t.recent}</Text>
              {recent.map((r, i) => (
                <Button key={`recent:${i}`} onPress={() => void setView($, { runArgs: r })}>
                  <Text mono>{r}</Text>
                </Button>
              ))}
            </Box>
          ) : (
            ''
          )}
          {eyebrow(t.preview)}
          <Box borderStyle="round" paddingX={1}>
            <Text mono>{command}</Text>
          </Box>
          {eyebrow(t.how)}
          {mode('run', t.modeRun, t.modeRunHelp)}
          {mode('copy', t.modeCopy, t.modeCopyHelp)}
          <Box flexDirection="row" gap={1}>
            <Button
              key="run-go"
              variant="primary"
              label={v.runMode === 'run' ? t.run : t.copyCommand}
              onPress={press => void submit(v.runArgs, press.surface)}
            />
            <Button key="run-cancel" label={t.runCancel} onPress={() => void go($, 'detail', { focus: s.name })} />
          </Box>
          {statusLine}
        </Box>
      )
    }

    // ── Groups: create, order, rename, fill, and the hidden ──────────
    if (v.screen === 'groups') {
      const members = (name: string) => all.filter(s => g.of[s.name] === name).map(s => s.name)
      const ungrouped = all.filter(
        s => groupOf(g, s.name) === UNGROUPED && !p.hidden.includes(s.name) && sourceKey(s) !== 'builtin',
      )
      const preview = v.showAllUngrouped ? ungrouped : ungrouped.slice(0, UNGROUPED_PREVIEW)
      const commands = Object.entries(groupCommandMap)
      const commandOf = (name: string) => commands.find(([, gr]) => gr === name)?.[0] ?? ''

      return (
        <Box flexDirection="column" gap="md" minHeight={bodyRows}>
          {header(backTo(t.title, () => void go($, 'find')))}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Text bold>{t.groupsTitle}</Text>
            <Text dimColor>{t.groupsHint}</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Input
              key="new-group"
              placeholder={t.newGroupPlaceholder}
              // As in the run form: on the desktop the Create button beside it
              // is the one button; Enter still submits the field.
              {...(isGraphical ? {} : { submitLabel: t.create })}
              value={v.newName}
              onInput={value => void setView($, { newName: value })}
              onSubmit={value => void addGroup($, value)}
            />
            <Button key="create-group" label={t.create} onPress={() => void addGroup($, v.newName)} />
          </Box>

          {g.names.map((name, i) => {
            const isOpenGroup = v.groupOpen === name
            const list = members(name)
            return (
              <Box
                key={`group:${name}`}
                flexDirection="column"
                gap={isOpenGroup ? 1 : 0}
                borderStyle="round"
                {...(isOpenGroup ? { borderColor: 'suggestion' } : {})}
                paddingX={1}
              >
                {/* The group's /command moves under its name when the pane is too
                    narrow for both, rather than being cut at the edge. */}
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
                  <Box flexDirection="row" gap={1}>
                    <Button key={`up:${name}`} plain dimColor={i === 0} label="▲" onPress={() => void moveGroup($, name, -1)} />
                    <Button
                      key={`down:${name}`}
                      plain
                      dimColor={i === g.names.length - 1}
                      label="▼"
                      onPress={() => void moveGroup($, name, 1)}
                    />
                    <Button
                      key={`pick:${name}`}
                      plain
                      onPress={() => void setView($, { groupOpen: isOpenGroup ? '' : name, isRenaming: false })}
                    >
                      <Text bold>{name}</Text>
                      <Text dimColor> {t.skillsCount(list.length)}</Text>
                    </Button>
                  </Box>
                  <Text dimColor mono>
                    /{commandOf(name)}
                  </Text>
                </Box>
                {isOpenGroup
                  ? list.map(skill => (
                      <Box key={`member:${skill}`} flexDirection="row" justifyContent="space-between" paddingX={2}>
                        <Text mono>/{skill}</Text>
                        <Button
                          key={`remove:${skill}`}
                          plain
                          dimColor
                          label={t.remove}
                          onPress={() => void assign($, skill, UNGROUPED)}
                        />
                      </Box>
                    ))
                  : ''}
                {isOpenGroup ? (
                  <Box flexDirection="row" gap={1} flexWrap="wrap" paddingX={2}>
                    {v.isRenaming ? (
                      <Input
                        key="rename-group"
                        autoFocus
                        placeholder={name}
                        submitLabel={t.renameSave}
                        value={v.renameTo}
                        onInput={value => void setView($, { renameTo: value })}
                        onSubmit={value => void renameGroup($, name, value)}
                      />
                    ) : (
                      <Button
                        key="rename-start"
                        label={t.rename}
                        onPress={() => void setView($, { isRenaming: true, renameTo: name })}
                      />
                    )}
                    <Button key="delete-group" label={t.deleteGroup} onPress={() => void deleteGroup($, name)} />
                  </Box>
                ) : (
                  ''
                )}
              </Box>
            )
          })}

          {eyebrow(`${t.ungrouped} · ${ungrouped.length}`)}
          {preview.map(s => (
            // The group picker moves under a long name instead of running past
            // the pane's edge.
            <Box
              key={`ug:${s.name}`}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              gap={1}
              flexWrap="wrap"
              paddingX={1}
            >
              <Text mono>/{s.name}</Text>
              <Select
                key={`assign:${s.name}`}
                label={t.addToGroup}
                value={UNGROUPED}
                options={groupChoices}
                onSelect={value => void assign($, s.name, value)}
              />
            </Box>
          ))}
          {ungrouped.length > preview.length ? (
            <Button
              key="more-ungrouped"
              plain
              dimColor
              label={t.more(ungrouped.length - preview.length)}
              onPress={() => void setView($, { showAllUngrouped: true })}
            />
          ) : (
            ''
          )}

          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button
              key="toggle-hidden"
              plain
              label={`${v.showHidden ? '▾' : '▸'} ${t.hiddenHeading(p.hidden.length)}`}
              onPress={() => void setView($, { showHidden: !v.showHidden })}
            />
            <Text dimColor>{t.hiddenHelp}</Text>
          </Box>
          {v.showHidden
            ? p.hidden.map(name => (
                <Box key={`hid:${name}`} flexDirection="row" justifyContent="space-between" paddingX={2}>
                  <Text mono>/{name}</Text>
                  <Button key={`unhide:${name}`} label={t.unhide} onPress={() => void setHidden($, name, false)} />
                </Box>
              ))
            : ''}
          {statusLine}
        </Box>
      )
    }

    // ── Find: search first, the best match, the rest, the groups ──────
    const results = search(all, u, here, v, p.hidden)
    const counts = scopeCounts(all, u, here, p.hidden)
    const q = v.query.trim()
    const hasHere = Object.keys(hereCounts).length > 0
    const used = results.filter(s => (u.counts[s.name] ?? 0) > 0)
    const best = q ? results[0] : used[0]
    const rest = q ? results.slice(1, 1 + REST) : used.slice(1, 1 + REST - 2)
    const bestArg = best && md[best.name]?.argumentHint ? firstArg(md[best.name]?.argumentHint ?? '') : ''
    const sections = q
      ? []
      : [...g.names, UNGROUPED]
          .map(name => ({ name, rows: results.filter(s => groupOf(g, s.name) === name) }))
          .filter(sec => sec.rows.length > 0)
    const isExpanded = (name: string) => v.expanded[name] ?? sections.length === 1

    return (
      <Box flexDirection="column" gap="md" minHeight={bodyRows}>
        {header(
          // On a graphical surface the pane's own title bar is the heading and
          // the "All" chip carries the count; the terminal draws both here.
          isGraphical ? (
            <Box key="title-room" flexGrow={1} />
          ) : (
            <Box flexDirection="row" alignItems="center" gap="sm">
              <Text weight="semibold">{t.title}</Text>
              <Text dimColor size="footnote" tabular>
                {counts.all}
              </Text>
            </Box>
          ),
          <Box flexDirection="row" alignItems="center" gap="sm">
            <Button key="groups-view" plain dimColor label={t.groupsLink} onPress={() => void go($, 'groups')} />
            <Button
              key="options"
              plain
              dimColor
              label={v.showOptions ? t.optionsHide : t.options}
              onPress={() => void setView($, { showOptions: !v.showOptions })}
            />
          </Box>,
        )}

        {v.showOptions ? (
          <Box flexDirection="column" gap="sm" borderStyle="round" paddingX={1}>
            <Select
              key="lang"
              label={t.language}
              value={p.lang}
              options={LANG_OPTIONS}
              onSelect={value => {
                if (!isLang(value)) return
                void savePrefs($, pr => ({ ...pr, lang: value })).then(async () => {
                  await $.ui.open({ id: PANE, title: STRINGS[value].title })
                  await $.command.register({ name: COMMAND, description: STRINGS[value].commandDescription })
                  await registerGroupCommands($)
                })
              }}
            />
            <Box flexDirection="row" gap="sm" flexWrap="wrap">
              <Button key="refresh" label={t.refresh} onPress={() => void loadSkills($)} />
              {g.names.length === 0 ? (
                <Button
                  key="reshow-suggestion"
                  label={t.reshowSuggestion}
                  onPress={() =>
                    void savePrefs($, pr => ({ ...pr, isSuggestionDismissed: false })).then(() => go($, 'welcome'))
                  }
                />
              ) : (
                ''
              )}
            </Box>
          </Box>
        ) : (
          ''
        )}

        {/* The search bar, drawn with the app's own field as it is: the magnifier,
            the one-line field (the desktop gives it its own fill, ring and blue
            focus ring, and the browser's ~20-character width; no prop widens it),
            and Enter's hint as a small key cap. With no `submitLabel` the desktop
            draws no button: Enter submits the field's form by itself. */}
        <Box key="search-bar" flexDirection="row" alignItems="center" gap="sm">
          {Svg ? <Svg source={SEARCH_ICON} alt={t.searchIcon} width={16} height={16} /> : ''}
          <Input
            key="query"
            autoFocus
            {...(isGraphical ? {} : { submitLabel: t.searchSubmit })}
            placeholder={t.search}
            value={v.query}
            onInput={value => void setView($, { query: oneLine(value) })}
            onSubmit={(value, input) => {
              const query = oneLine(value)
              const first = search(all, u, here, { ...v, query }, p.hidden)[0]
              void setView($, { query })
              if (first) void copyCommand($, first.name, '', input.surface)
            }}
          />
          {isGraphical ? (
            // `single` is the app's plain radius, a key cap's; a bordered Box
            // otherwise pads itself pad.md/pad.lg, so the padding is named.
            <Box key="search-hint" borderStyle="single" paddingX="xs" paddingY={0} flexShrink={0}>
              <Text mono size="caption" dimColor>
                {t.searchSubmit}
              </Text>
            </Box>
          ) : (
            ''
          )}
        </Box>

        {/* Source chips: a rounded outline round each plain button, in the app's
            own border grey (a bordered Box with no colour named), blue with a
            light blue fill on the picked one. A bordered Box pads itself
            pad.md/pad.lg unless told otherwise, so the padding is named: `sm`
            beside the label; above and below, a quarter of the pane's half-line
            row unit (2.5px), so the chip is the design's 27px: the 20px button,
            2 × 2.5px and the 1px line twice. The desktop draws a button's text
            in its own style, so the count stands beside the button, dimmed. */}
        <Box flexDirection="row" gap="xs" flexWrap="wrap">
          {SCOPES.filter(sc => sc === 'all' || counts[sc] > 0).map(sc => {
            const isPicked = v.scope === sc
            return (
              <Box
                key={`chip:${sc}`}
                flexDirection="row"
                alignItems="center"
                gap={isGraphical ? 0 : 'xs'}
                borderStyle="round"
                {...(isPicked ? { borderColor: 'suggestion', backgroundColor: PICKED_FILL } : {})}
                paddingX="sm"
                paddingY={isGraphical ? CHIP_PAD_Y : 0}
              >
                <Button key={`scope:${sc}`} plain onPress={() => void setView($, { scope: sc, expanded: {} })}>
                  <Text {...(isPicked ? { weight: 'semibold' as const } : {})}>{t.scopes[sc]}</Text>
                </Button>
                <Text dimColor tabular>
                  {counts[sc]}
                </Text>
              </Box>
            )
          })}
        </Box>

        {all.length === 0 ? (
          <Box flexDirection="column" gap="sm">
            <Text dimColor size="footnote">
              {t.loading}
            </Text>
            <Box height={1} width="60%" backgroundColor="subtle" />
            <Box height={1} width="80%" backgroundColor="subtle" />
            <Box height={1} width="45%" backgroundColor="subtle" />
          </Box>
        ) : (
          ''
        )}

        {all.length > 0 && q && results.length === 0 ? (
          <Box flexDirection="column" gap="sm" borderStyle="round" paddingX={1}>
            <Text weight="semibold">{t.noResults(q)}</Text>
            <Text dimColor size="footnote">
              {t.noResultsHelp} {v.includeHidden ? '' : t.noResultsHidden}
            </Text>
            {!v.includeHidden && p.hidden.length > 0 ? (
              <Button key="search-hidden" label={t.searchHidden} onPress={() => void setView($, { includeHidden: true })} />
            ) : (
              ''
            )}
          </Box>
        ) : (
          ''
        )}

        {best
          ? section(
              'f-best',
              q ? t.bestMatch : hasHere ? t.topHere : t.topAll,
              <Box key="best" flexDirection="column" gap="sm" borderStyle="round" borderColor="suggestion" paddingX={1}>
                <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
                  {nameText(best, true)}
                  {tags(best, 'best')}
                </Box>
                <Text size="footnote">{brief(summary(best.description), 120)}</Text>
                {/* The argument itself in mono, brighter than the dim line it ends. */}
                <Box flexDirection="row" alignItems="center" gap="xs" flexWrap="wrap">
                  <Text dimColor size="caption">
                    {sourceLabel(best, t)} · {t.uses(u.counts[best.name] ?? 0, hereCounts[best.name] ?? 0)}
                    {bestArg ? ` · ${t.argWord}` : ''}
                  </Text>
                  {bestArg ? (
                    <Text mono size="caption">
                      {bestArg}
                    </Text>
                  ) : (
                    ''
                  )}
                </Box>
                <Box flexDirection="row" alignItems="center" gap="sm">
                  <Button key="best-run" variant="primary" label={t.run} onPress={() => void openRun(best.name)} />
                  <Button key="best-copy" label={t.copy} onPress={press => void copyCommand($, best.name, '', press.surface)} />
                  <Box flexGrow={1} />
                  <Button key="best-detail" plain dimColor label={t.details} onPress={() => void openDetail(best.name)} />
                </Box>
              </Box>,
            )
          : ''}

        {rest.length > 0
          ? section(
              'f-rest',
              q ? t.otherMatches(rest.length) : hasHere ? t.frequentHere : t.frequentAll,
              <Box flexDirection="column" gap={isGraphical ? ROW_GAP : 'md'}>
                {rest.map((s, i) => row(s, 'res', i === 0))}
              </Box>,
            )
          : ''}

        {sections.length > 0
          ? section(
              'f-groups',
              t.groupsHeading,
              ...sections.map(sec => {
                const title = sec.name === UNGROUPED ? t.ungrouped : sec.name
                const isOpenGroup = isExpanded(sec.name)
                return (
                  <Box key={`section:${sec.name}`} flexDirection="column" gap="sm">
                    <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
                      <Button
                        key={`toggle:${sec.name}`}
                        plain
                        onPress={() => void setView($, { expanded: { ...v.expanded, [sec.name]: !isOpenGroup } })}
                      >
                        <Text {...(isOpenGroup ? { weight: 'semibold' as const } : {})}>
                          {isOpenGroup ? '▾' : '▸'} {title}
                        </Text>
                      </Button>
                      <Text dimColor size="footnote" tabular>
                        {sec.rows.length}
                      </Text>
                    </Box>
                    {isOpenGroup ? (
                      <Box flexDirection="column" gap="md" paddingLeft={1}>
                        {sec.rows.map(s => row(s, 'grp'))}
                      </Box>
                    ) : (
                      ''
                    )}
                  </Box>
                )
              }),
            )
          : ''}

        {/* The footer: pushed to the foot of the pane when the list is short. */}
        <Box flexGrow={1} />
        {statusLine}
        <Text dimColor size="caption">
          {t.legend}
        </Text>
      </Box>
    )
  })
}

// Kept for the tests and for other modules that read the panel's groups.
export { EMPTY_GROUPS }
export type { Groups }

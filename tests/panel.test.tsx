import type { CommandInfo, CommandRunInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { brief, firstArg, hintNote, insertPiece } from '../hooks/model'

const PANE = {
  plugin: 'skill-panel',
  component: 'Pane',
  requestId: 'skills',
  props: {
    title: "Skill'ler",
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 200 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'skill-panel',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

// Made-up commands standing for the session's list: one of each source, and
// two plugins that ship a skill of the same name.
const COMMANDS: CommandInfo[] = [
  { name: 'my:local-review', description: "Bir MR'ı yerelde inceler. İkinci cümle ayrıntıda görünür.", source: 'plugin', plugin: 'my' },
  { name: 'my:worklog', description: 'Haftalık efor önerisi hazırlar.', source: 'plugin', plugin: 'my' },
  { name: 'engineering:debug', description: 'Structured debugging session.', source: 'plugin', plugin: 'engineering' },
  { name: 'design:design-critique', description: 'Structured design feedback.', source: 'plugin', plugin: 'design' },
  { name: 'design-skills:design-critique', description: 'Heuristic design review.', source: 'plugin', plugin: 'design-skills' },
  { name: 'release-notes', description: 'Writes release notes for this repo.', source: 'user' },
  { name: 'security-review', description: 'Reviews pending changes for security.', source: 'builtin' },
  { name: 'clear', description: 'Clear conversation history', source: 'builtin' },
  { name: 'sk', description: 'panel', source: 'plugin', plugin: 'skill-panel' },
]

// The skill files the panel may read: a personal skill taken only by hand, with an argument hint.
const FILES: Record<string, string> = {
  '/home/u/.claude/skills/my/skills/local-review/SKILL.md':
    '---\nname: local-review\nargument-hint: "<mr-link>"\ndisable-model-invocation: true\n---\nBody\n',
  '/home/u/.claude/skills/my/skills/worklog/SKILL.md': '---\nname: worklog\nargument-hint: "[date range]"\n---\nBody\n',
}

const RUN_SK: CommandRunInput = {
  command: 'sk',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
}

// What the message box, clipboard, store and system do in a test, and what reached them.
type Io = {
  /** The box's draft and where its cursor stands (the end when left out). */
  draft: string; cursor?: number; canFill: boolean; canCopy: boolean; canPbcopy: boolean
  /** Whether the desktop box shows a suggestion now (empty box, no turn running). */
  canSuggest: boolean; suggests: string[]
  fills: string[]; copies: string[]; pbcopies: string[]
  locale: string; repoRoot: string | null; now: number
  stored: Record<string, unknown>; saved: { key: string; value: unknown }[]
  registered: string[]; runs: { command: string; args: string }[]
  opened: unknown[]; closed: unknown[]
}
const io = (over: Partial<Io> = {}): Io => ({
  draft: '', canFill: true, canCopy: false, canPbcopy: true, canSuggest: true, suggests: [],
  fills: [], copies: [], pbcopies: [],
  locale: 'tr_TR.UTF-8', repoRoot: null, now: Date.UTC(2026, 10, 6, 12),
  // Most tests start past the first open's group suggestion.
  stored: { prefs: { isSuggestionDismissed: true, lang: 'tr', hidden: [] } },
  saved: [], registered: [], runs: [], opened: [], closed: [], ...over,
})

const keyOf = (e: unknown, field: string) =>
  typeof e === 'string' ? e : String((e as Record<string, unknown>)[field] ?? '')

// Each hook stands for the engine: a call on `$` is answered `{ value }`.
function engine(on: Parameters<TestBody>[1], box: Io) {
  on('prompt.read', () => ({ value: { text: box.draft, cursor: box.cursor ?? box.draft.length } }))
  on('prompt.fill', (_, e) => {
    if (!box.canFill) return { isFilled: false, refusal: 'no_composer' as const }
    box.fills.push(e.text)
    const at = box.cursor ?? box.draft.length
    if (e.mode === 'replace') box.draft = e.text
    else if (e.mode === 'append') box.draft += e.text
    else box.draft = box.draft.slice(0, at) + e.text + box.draft.slice(at)
    box.cursor = e.mode === 'insert' ? at + e.text.length : box.draft.length
    return { isFilled: true }
  })
  // `prompt.suggest` is an event: its hook answers `{ isShown }` itself.
  on('prompt.suggest', (_, e) => {
    if (!box.canSuggest) return { isShown: false }
    box.suggests.push(e.text)
    return { isShown: true }
  })
  on('ui.copy', (_, e) => {
    if (!box.canCopy) return { value: { isCopied: false, reason: 'no-surface' } }
    box.copies.push(e.text)
    return { value: { isCopied: true } }
  })
  on('process.run', (_, e) => {
    const input = e as unknown as { argv: string[]; init?: { stdin?: string } }
    if (input.argv[0] === 'pbcopy' && box.canPbcopy) {
      box.pbcopies.push(input.init?.stdin ?? '')
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    return { value: { exitCode: 1, stdout: '', stderr: 'pbcopy: not found', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('env.get', (_, e) => {
    const name = keyOf(e, 'name')
    return { value: name === 'LANG' ? box.locale : name === 'HOME' ? '/home/u' : undefined }
  })
  on('fs.exists', (_, e) => ({ value: keyOf(e, 'path') === '/home/u/.claude/skills/my' }))
  on('fs.read', (_, e) => {
    const text = FILES[keyOf(e, 'path')]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('clock.now', () => ({ value: box.now }))
  on('session.repo', () => ({
    value: box.repoRoot ? { name: 'a', root: box.repoRoot, remote: null, internal: false } : null,
  }))
  on('session.cwd', () => ({ value: '/work' }))
  let isUp = false
  on('command.register', (_, e) => {
    box.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('command.list', () => ({ value: COMMANDS }))
  on('ui.open', (_, e) => {
    box.opened.push(e)
    isUp = true
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: isUp ? [{ id: 'skills', title: "Skill'ler", isShown: true, isFocused: true, isPlaced: true }] : [],
  }))
  on('ui.close', (_, e) => {
    box.closed.push(e)
    isUp = false
    return { value: undefined }
  })
  on('store.get', (_, e) => ({ value: box.stored[keyOf(e, 'key')] }))
  on('store.set', (_, e) => {
    const set = e as unknown as { key: string; value: unknown }
    box.saved.push(set)
    box.stored[set.key] = set.value
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', (_, e) => {
    box.runs.push({ command: e.command, args: e.args })
    return { text: 'core' }
  })
}

type Found = { text: string; key: string | undefined; props: Record<string, unknown> }
type Drawing = { findAll: (q: { type: string }) => Promise<Found[]> }
const texts = async (ui: Drawing) => (await ui.findAll({ type: 'Text' })).map(t => t.text)
const has = async (ui: Drawing, part: string) => (await texts(ui)).some(t => t.includes(part))
const keys = async (ui: Drawing) => (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '')
const lastSaved = (box: Io, key: string) => [...box.saved].reverse().find(s => s.key === key)?.value

async function start($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], box: Io, surface: 'desktop' | 'terminal' | 'mobile' = 'desktop') {
  engine(on, box)
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(RUN_SK)
}

// ── Notice: the band ─────────────────────────────────────────────────

test('the band opens and closes the panel', async ($, on) => {
  const box = io()
  engine(on, box)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const [i, surface] of (['terminal', 'desktop'] as const).entries()) {
    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'open-skills' })
    expect(box.opened).toHaveLength(i + 1)
    expect(JSON.stringify(box.opened.at(-1))).toContain('"closeOnEscape":true')
    expect((await band.find({ key: 'open-skills' }))?.props.variant).toBe('primary')
    await band.press({ key: 'open-skills' })
    expect(box.closed).toHaveLength(i + 1)
    expect((await band.find({ key: 'open-skills' }))?.props.variant).toBeUndefined()
    await band.unmount()
  }
})

test('the band offers this repo\'s most used skills and says which one was last', async ($, on) => {
  const box = io({ repoRoot: '/repo/a' })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'efor' })
  await ui.input({ key: 'query', text: 'efor' })
  await ui.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, 'bu repoda sık')).toBe(true)
  expect(await has(band, 'son: /my:worklog · şimdi')).toBe(true)
  await band.press({ key: 'chip:my:worklog' })
  expect(box.fills.at(-1)).toBe('/my:worklog ')
  await band.unmount()
})

test('the band gives way to a survey', async ($, on) => {
  engine(on, io())
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>survey</Text>
  })
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })
  expect(await band.find({ key: 'open-skills' })).toBeUndefined()
  await band.unmount()
})

// ── First open ───────────────────────────────────────────────────────

test('a first open shows the inventory and suggested groups; one press sets them up', async ($, on) => {
  const box = io({ stored: {} })
  await start($, on, box)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, 'skill buldum')).toBe(true)
  // Only prefixes with two or more skills become a group: here, the personal ones.
  expect(await has(ui, 'ÖNERİLEN GRUPLAR · 1 seçili')).toBe(true)
  await ui.press({ key: 'apply-suggested' })
  expect(JSON.stringify(lastSaved(box, 'groups'))).toContain('"my:worklog":"Kişisel"')
  expect(box.registered).toContain('sk-kisisel')
  // Back on the find screen, with the groups to browse.
  expect((await ui.find({ key: 'query' }))?.props.autoFocus).toBe(true)
  expect(await has(ui, 'GRUPLAR')).toBe(true)
  await ui.unmount()

  // The group's own command opens the panel with that group open.
  await $.command.run({ ...RUN_SK, command: 'sk-kisisel' })
  const grouped = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(grouped, '▾ Kişisel')).toBe(true)
  expect(await has(grouped, '/my:worklog')).toBe(true)
  await grouped.unmount()
})

test('"I will arrange them" turns the suggestion down and opens the groups screen', async ($, on) => {
  const box = io({ stored: {} })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'suggest:Kişisel' })
  expect(await has(ui, '0 seçili')).toBe(true)
  expect((await ui.find({ key: 'apply-suggested' }))?.props.label).toBe('Grupsuz devam et')
  await ui.press({ key: 'own-groups' })
  expect(JSON.stringify(lastSaved(box, 'prefs'))).toContain('"isSuggestionDismissed":true')
  expect(await ui.find({ key: 'new-group' })).toBeDefined()
  await ui.unmount()
})

// ── Find ─────────────────────────────────────────────────────────────

test('find: search first, the best match with its actions, the other matches', async ($, on) => {
  const box = io()
  await start($, on, box)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'query' }))?.props.autoFocus).toBe(true)
    await ui.input({ key: 'query', text: 'review', kind: 'change' })
    expect(await has(ui, 'EN İYİ EŞLEŞME')).toBe(true)
    const buttons = await keys(ui)
    expect(buttons).toContain('best-run')
    expect(buttons).toContain('best-copy')
    expect(buttons).toContain('best-detail')
    // Name matches come first; Claude Code's own skills join a search.
    expect(await has(ui, 'DİĞER EŞLEŞMELER')).toBe(true)
    expect(buttons).toContain('res:security-review')
    expect(await has(ui, 'elle')).toBe(true)
    await ui.unmount()
  }
})

test('find: Enter puts the best match in the message box; the source chips narrow the list', async ($, on) => {
  const box = io()
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'efor' })
  expect(box.fills).toEqual(['/my:worklog '])
  expect(box.suggests).toHaveLength(0)
  expect(box.pbcopies).toHaveLength(0)
  expect(await has(ui, '/my:worklog mesaj kutusuna, imlecin olduğu yere yazıldı')).toBe(true)

  await ui.input({ key: 'query', text: 'des\nign', kind: 'change' })
  expect((await ui.find({ key: 'query' }))?.props.value).toBe('des ign')
  await ui.input({ key: 'query', text: 'design', kind: 'change' })
  // Each source chip is a rounded outline: blue with a fill on the picked one, white on the rest.
  expect((await ui.find({ key: 'chip:all' }))?.props.borderColor).toBe('suggestion')
  await ui.press({ key: 'scope:project' })
  const picked = await ui.find({ key: 'chip:project' })
  expect(picked?.props.borderColor).toBe('suggestion')
  expect(picked?.props.backgroundColor).toBeDefined()
  // A bordered Box pads itself unless told; the chip names its own, small, padding.
  expect(picked?.props.paddingX).toBe('sm')
  expect(picked?.props.paddingY).toBe(0.25)
  // The others keep the app's own border grey: no colour named.
  const other = await ui.find({ key: 'chip:all' })
  expect(other?.props.borderColor).toBeUndefined()
  expect(other?.props.backgroundColor).toBeUndefined()
  // The search bar: the magnifier, the one-line field (no submitLabel, so no extra
  // button; Enter submits the form) and Enter's hint as a key cap.
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
  const field = await ui.find({ key: 'query' })
  expect(field?.props.rows).toBeUndefined()
  expect(field?.props.submitLabel).toBeUndefined()
  expect((await ui.find({ key: 'search-hint' }))?.props.paddingY).toBe(0)
  expect(await has(ui, '↵ kutuya yaz')).toBe(true)
  expect(await has(ui, '“design” için skill yok')).toBe(true)
  await ui.unmount()
})

test('find: without a query, the most used and the folding groups; Claude Code\'s own stay out', async ($, on) => {
  const box = io({ stored: { prefs: { isSuggestionDismissed: true, lang: 'tr', hidden: [] }, groups: { names: ['Review'], of: { 'my:local-review': 'Review' } } } })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, '▸ Review')).toBe(true)
  expect(await has(ui, '▸ Grupsuz')).toBe(true)
  expect(await has(ui, '/clear')).toBe(false)
  await ui.press({ key: 'toggle:Review' })
  expect((await keys(ui))).toContain('grp:my:local-review')
  await ui.unmount()
})

// ── Detail and compare ───────────────────────────────────────────────

test('detail: the full description, how to call it, manual-only, your use', async ($, on) => {
  const box = io()
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'local', kind: 'change' })
  await ui.press({ key: 'best-detail' })
  expect(await has(ui, 'İkinci cümle ayrıntıda görünür.')).toBe(true)
  expect(await has(ui, 'NASIL ÇAĞRILIR')).toBe(true)
  expect(await has(ui, '<mr-link>')).toBe(true)
  expect(await has(ui, 'kendiliğinden başlatmaz')).toBe(true)
  expect(await has(ui, 'KULLANIMIN')).toBe(true)
  expect(await has(ui, '~/.claude/skills/my/skills/local-review')).toBe(true)
  await ui.press({ key: 'back' })
  expect((await ui.find({ key: 'query' }))?.props.value).toBe('local')
  await ui.unmount()
})

test('compare: two skills of the same name side by side; the unused one can be hidden', async ($, on) => {
  const box = io()
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'critique', kind: 'change' })
  const similar = (await keys(ui)).find(k => k.startsWith('sim:best:'))
  expect(similar).toBeDefined()
  await ui.press({ key: similar ?? '' })
  expect(await has(ui, 'Hangisi bu iş için?')).toBe(true)
  expect(await has(ui, 'Structured design feedback.')).toBe(true)
  expect(await has(ui, 'Heuristic design review.')).toBe(true)
  // The less used of the two is offered for hiding (a tie: the second column).
  const hideKey = (await keys(ui)).find(k => k.startsWith('hide:')) ?? ''
  const hidden = hideKey.slice('hide:'.length)
  expect(hidden.endsWith(':design-critique')).toBe(true)
  await ui.press({ key: hideKey })
  expect(JSON.stringify(lastSaved(box, 'prefs'))).toContain(hidden)
  expect(await has(ui, 'panelden gizlendi')).toBe(true)
  await ui.input({ key: 'query', text: 'critique', kind: 'change' })
  expect((await keys(ui)).some(k => k.endsWith(`:${hidden}`) && !k.startsWith('sim:'))).toBe(false)

  // Groups › Hidden brings it back.
  await ui.press({ key: 'groups-view' })
  await ui.press({ key: 'toggle-hidden' })
  await ui.press({ key: `unhide:${hidden}` })
  expect(JSON.stringify(lastSaved(box, 'prefs'))).toContain('"hidden":[]')
  await ui.unmount()
})

// ── Run ──────────────────────────────────────────────────────────────

test('run: the hint asks for the argument, the preview shows the command, Enter runs it', async ($, on) => {
  const box = io()
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'local', kind: 'change' })
  await ui.press({ key: 'best-run' })
  const field = await ui.find({ key: 'run-arg' })
  expect(field?.props.autoFocus).toBe(true)
  expect(field?.props.placeholder).toBe('<mr-link>')
  expect(await has(ui, 'Bu skill <mr-link> bekliyor')).toBe(true)
  expect(await has(ui, '/my:local-review <mr-link>')).toBe(true)

  await ui.input({ key: 'run-arg', text: '!93' })
  expect(box.runs.at(-1)).toEqual({ command: 'my:local-review', args: '!93' })
  expect(box.pbcopies).toHaveLength(0)
  expect(await has(ui, '/my:local-review !93 başladı.')).toBe(true)
  expect(JSON.stringify(lastSaved(box, 'args'))).toContain('"my:local-review":["!93"]')

  // The argument comes back as a one-click choice next time.
  await ui.input({ key: 'query', text: 'local', kind: 'change' })
  await ui.press({ key: 'best-run' })
  await ui.press({ key: 'recent:0' })
  expect((await ui.find({ key: 'run-arg' }))?.props.value).toBe('!93')
  await ui.unmount()
})

test('run: "put it in the box, I will send it" puts the command with its arguments in the box', async ($, on) => {
  const box = io()
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'efor', kind: 'change' })
  await ui.press({ key: 'best-run' })
  await ui.press({ key: 'mode-copy' })
  await ui.input({ key: 'run-arg', text: 'geçen hafta', kind: 'change' })
  await ui.press({ key: 'run-go' })
  expect(box.fills.at(-1)).toBe('/my:worklog geçen hafta ')
  expect(box.runs.filter(r => r.command === 'my:worklog')).toHaveLength(0)
  await ui.unmount()
})

// ── Copy paths ───────────────────────────────────────────────────────

test('on the terminal the command goes in at the cursor, the draft kept', async ($, on) => {
  const box = io({ draft: 'şu MR: !93' })
  await start($, on, box, 'terminal')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.input({ key: 'query', text: 'local', kind: 'change' })
  await ui.press({ key: 'best-copy' })
  expect(box.fills.at(-1)).toBe(' /my:local-review ')
  expect(box.draft).toBe('şu MR: !93 /my:local-review ')
  await ui.unmount()
})

test('in the desktop app the command goes in where the cursor stands, spaced from the words', async ($, on) => {
  const box = io({ draft: 'önce bunu sonra', cursor: 4 })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'local', kind: 'change' })
  await ui.press({ key: 'best-copy' })
  expect(box.draft).toBe('önce /my:local-review bunu sonra')
  expect(box.cursor).toBe('önce /my:local-review'.length)
  expect(box.suggests).toHaveLength(0)
  expect(box.pbcopies).toHaveLength(0)
  const trace = JSON.stringify(lastSaved(box, 'lastUse'))
  expect(trace).toContain('"read":{"textLength":15,"cursor":4}')
  expect(trace).toContain('"isFilled":true')
  // The trace keeps lengths and offsets, never the draft's words.
  expect(trace).not.toContain('bunu')
  await ui.unmount()
})

test('a box that refuses the write gets the command as its suggestion', async ($, on) => {
  const box = io({ canFill: false })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'efor' })
  expect(box.suggests).toEqual(['/my:worklog '])
  expect(await has(ui, '/my:worklog mesaj kutusunda: Tab ile al')).toBe(true)
  await ui.unmount()
})

test('where nothing takes it, the command is shown to type, in orange', async ($, on) => {
  const box = io({ canFill: false, canPbcopy: false, canSuggest: false })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'efor' })
  const warn = await ui.find({ type: 'Text', text: /Panoya ulaşamadım/ })
  expect(warn?.props.color).toBe('warning')
  expect(await has(ui, '/my:worklog')).toBe(true)
  expect(JSON.stringify(lastSaved(box, 'lastUse'))).toContain('"pbcopy":{"exitCode":1')
  await ui.unmount()
})

// ── Groups ───────────────────────────────────────────────────────────

test('groups: create, fill, order, rename and delete', async ($, on) => {
  const box = io()
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'groups-view' })
  await ui.input({ key: 'new-group', text: 'Review' })
  await ui.input({ key: 'new-group', text: 'Plan' })
  await ui.select({ key: 'assign:my:local-review', value: 'Review' })
  expect(JSON.stringify(lastSaved(box, 'groups'))).toContain('"my:local-review":"Review"')
  expect(box.registered).toContain('sk-review')

  await ui.press({ key: 'down:Review' })
  expect((lastSaved(box, 'groups') as { names: string[] }).names).toEqual(['Plan', 'Review'])

  await ui.press({ key: 'pick:Review' })
  await ui.press({ key: 'rename-start' })
  await ui.input({ key: 'rename-group', text: 'Kod inceleme' })
  expect((lastSaved(box, 'groups') as { names: string[] }).names).toEqual(['Plan', 'Kod inceleme'])
  await ui.press({ key: 'delete-group' })
  expect((lastSaved(box, 'groups') as { names: string[] }).names).toEqual(['Plan'])
  await ui.unmount()
})

// ── Language, mobile, stored values ──────────────────────────────────

test('an English system gets an English panel, and the language can be switched', async ($, on) => {
  const box = io({ locale: 'en_US.UTF-8', stored: { prefs: { isSuggestionDismissed: true, hidden: [] } } })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'query' }))?.props.placeholder).toContain('Search: name or task')
  await ui.press({ key: 'options' })
  await ui.select({ key: 'lang', value: 'tr' })
  expect((await ui.find({ key: 'query' }))?.props.placeholder).toContain('Ara: ad ya da iş')
  await ui.unmount()
})

test('mobile draws a read-only list', async ($, on) => {
  const box = io()
  await start($, on, box, 'mobile')
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await has(ui, '/my:worklog — Haftalık efor önerisi hazırlar.')).toBe(true)
  expect(await ui.findAll({ type: 'Select' })).toHaveLength(0)
  await ui.unmount()
})

test('what an earlier version stored still loads', async ($, on) => {
  const box = io({
    stored: {
      prefs: { isSuggestionDismissed: true },
      groups: { names: ['Review'], of: { 'my:local-review': 'Review' } },
      usage: { counts: { 'my:worklog': 4 }, byPlace: {} },
    },
  })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Turkish for someone who kept groups before; the old counts rank the list.
  expect(await has(ui, 'EN SIK')).toBe(true)
  expect(await has(ui, '/my:worklog')).toBe(true)
  await ui.unmount()
})

test('a long argument hint splits into the argument and its note; long text is cut at a word', () => {
  const hint = '[gitlab-mr-linki]  (RTL-XXXX veya !31 de kabul)'
  expect(firstArg(hint)).toBe('[gitlab-mr-linki]')
  expect(hintNote(hint)).toBe('RTL-XXXX veya !31 de kabul')
  expect(firstArg('<mr-link>')).toBe('<mr-link>')
  expect(hintNote('<mr-link>')).toBe('')
  expect(brief('MR diff çeker, kurallara göre inceler ve bulguları yazar', 30)).toBe('MR diff çeker, kurallara göre…')
})

test('a box that takes neither the write nor a suggestion falls back to the clipboard and says so', async ($, on) => {
  const box = io({ canFill: false, canSuggest: false })
  await start($, on, box)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'local', kind: 'change' })
  await ui.press({ key: 'best-copy' })
  expect(box.pbcopies.at(-1)).toBe('/my:local-review ')
  expect(await has(ui, 'Mesaj kutusu yazıyı almadı')).toBe(true)
  expect(JSON.stringify(lastSaved(box, 'lastUse'))).toContain('"fill":{"isFilled":false')
  expect(JSON.stringify(lastSaved(box, 'lastUse'))).toContain('"suggest":{"isShown":false}')
  expect((await ui.find({ key: 'best-copy' }))?.props.label).toBe('Kutuya yaz')
  await ui.unmount()
})

test('the piece put in the box stands apart from the words around the cursor', () => {
  expect(insertPiece('', 0, '/a')).toBe('/a ')
  expect(insertPiece('metin', 5, '/a')).toBe(' /a ')
  expect(insertPiece('metin ', 6, '/a')).toBe('/a ')
  expect(insertPiece('önce sonra', 4, '/a')).toBe(' /a')
  expect(insertPiece('önce sonra', 5, '/a')).toBe('/a ')
  expect(insertPiece('abc', 99, '/a')).toBe(' /a ')
})

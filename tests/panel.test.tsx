import type { CommandInfo, CommandRunInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

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

// Made-up commands standing for the session's list: one of each source.
const COMMANDS: CommandInfo[] = [
  { name: 'my:local-review', description: 'Bir MR\'ı yerelde inceler. İkinci cümle görünmez.', source: 'plugin', plugin: 'my' },
  { name: 'my:worklog', description: 'Haftalık efor önerisi hazırlar.', source: 'plugin', plugin: 'my' },
  { name: 'engineering:debug', description: 'Structured debugging session.', source: 'plugin', plugin: 'engineering' },
  { name: 'clear', description: 'Clear conversation history', source: 'builtin' },
  { name: 'sk', description: 'panel', source: 'plugin', plugin: 'skill-panel' },
]

const RUN_SK: CommandRunInput = {
  command: 'sk',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
}

// Each hook stands for the engine: a call on `$` is answered `{ value }`.
// What the message box and clipboard do in a test, and what reached them.
type Io = {
  draft: string; canFill: boolean; canCopy: boolean; canPbcopy: boolean
  fills: string[]; copies: string[]; pbcopies: string[]; toasts: string[]
}
const io = (over: Partial<Io> = {}): Io => ({
  draft: '', canFill: true, canCopy: false, canPbcopy: true,
  fills: [], copies: [], pbcopies: [], toasts: [], ...over,
})

function engine(
  on: Parameters<TestBody>[1],
  saved: unknown[],
  opened: unknown[] = [],
  closed: unknown[] = [],
  box: Io = io(),
) {
  on('prompt.read', () => ({ value: { text: box.draft, cursor: box.draft.length } }))
  // `prompt.fill` is an event: its hook answers `{ isFilled }` itself.
  on('prompt.fill', (_, e) => {
    if (!box.canFill) return { isFilled: false, refusal: 'no_composer' as const }
    box.fills.push(e.text)
    box.draft = e.text
    return { isFilled: true }
  })
  on('ui.copy', (_, e) => {
    if (!box.canCopy) return { value: { isCopied: false, reason: 'no-surface' } }
    box.copies.push(e.text)
    return { value: { isCopied: true } }
  })
  // The Mac's clipboard, through `pbcopy` on the host.
  on('process.run', (_, e) => {
    const input = e as unknown as { argv: string[]; init?: { stdin?: string } }
    if (input.argv[0] === 'pbcopy' && box.canPbcopy) {
      box.pbcopies.push(input.init?.stdin ?? '')
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    return { value: { exitCode: 1, stdout: '', stderr: 'pbcopy: not found', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_, e) => {
    box.toasts.push(typeof e === 'string' ? e : JSON.stringify(e))
    return { value: undefined }
  })
  // The engine's record of the panel: up after an open, gone after a close.
  let isUp = false
  on('command.register', () => ({ value: { command: 'sk' } }))
  on('command.list', () => ({ value: COMMANDS }))
  on('ui.open', (_, e) => {
    opened.push(e)
    isUp = true
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: isUp
      ? [{ id: 'skills', title: "Skill'ler", isShown: true, isFocused: true, isPlaced: true }]
      : [],
  }))
  on('ui.close', (_, e) => {
    closed.push(e)
    isUp = false
    return { value: undefined }
  })
  on('store.get', () => ({ value: undefined }))
  on('store.set', (_, e) => {
    saved.push(e)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: 'core' }))
}

test('the panel lists skills with a one-line summary, Claude Code commands left out', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN_SK)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)

    expect(texts).toContain('/my:local-review')
    expect(texts).toContain("Bir MR'ı yerelde inceler.")
    expect(texts).toContain('· Plugin · engineering')
    expect(texts.some(t => t.includes('/clear'))).toBe(false)
    expect(texts.some(t => t === '/sk')).toBe(false)
    await ui.unmount()
  }
})

test('a new group takes a skill and is kept in the store', async ($, on) => {
  const saved: unknown[] = []
  engine(on, saved)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN_SK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'edit' })
  await ui.input({ key: 'new-group', text: 'review' })
  await ui.select({ key: 'assign:my:local-review', value: 'review' })

  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('review (1)')
  expect(texts).toContain('Grupsuz (2)')
  expect(JSON.stringify(saved.at(-1))).toContain('"my:local-review":"review"')

  await ui.select({ key: 'group', value: 'review' })
  const only = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(only).toContain('/my:local-review')
  expect(only).not.toContain('/my:worklog')
  await ui.unmount()
})

test('search matches the description too', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN_SK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'query', text: 'efor', kind: 'change' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('/my:worklog')
  expect(texts).not.toContain('/my:local-review')
  await ui.unmount()
})

test('mobile draws a read-only list', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await $.command.run(RUN_SK)

  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('/my:worklog — Haftalık efor önerisi hazırlar.')
  expect(await ui.findAll({ type: 'Select' })).toHaveLength(0)
  await ui.unmount()
})

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

test('the button opens the panel, and a second press closes it', async ($, on) => {
  const opened: unknown[] = []
  const closed: unknown[] = []
  engine(on, [], opened, closed)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const [i, surface] of (['terminal', 'desktop'] as const).entries()) {
    const band = await $.ui.mount({ ...BAND, surface })

    await band.press({ key: 'open-skills' })
    expect(opened).toHaveLength(2 * i + 1)
    expect(JSON.stringify(opened.at(-1))).toContain('"id":"skills"')
    expect((await band.find({ key: 'open-skills' }))?.props.variant).toBe('primary')

    await band.press({ key: 'open-skills' })
    expect(closed).toHaveLength(2 * i + 1)
    expect(JSON.stringify(closed.at(-1))).toContain('"id":"skills"')
    expect((await band.find({ key: 'open-skills' }))?.props.variant).toBeUndefined()

    await band.press({ key: 'open-skills' })
    expect(opened).toHaveLength(2 * i + 2)
    await band.press({ key: 'open-skills' })
    await band.unmount()
  }
})

test('the button gives way to a survey', async ($, on) => {
  engine(on, [])
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>survey</Text>
  })
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })
  expect(await band.find({ key: 'open-skills' })).toBeUndefined()
  expect((await band.find({ type: 'Text', text: /survey/ }))?.text).toBe('survey')
  await band.unmount()
})

test('on the terminal a click writes the skill at the head of the message box', async ($, on) => {
  const box = io({ draft: 'şu MR: !93' })
  engine(on, [], [], [], box)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(RUN_SK)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'use:my:local-review' })
  expect(box.fills.at(-1)).toBe('/my:local-review şu MR: !93')

  // A second skill takes the first one's place; the rest of the draft stays.
  await ui.press({ key: 'use:my:worklog' })
  expect(box.fills.at(-1)).toBe('/my:worklog şu MR: !93')
  const notes = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(notes).toContain('/my:worklog mesaj kutusuna yazıldı.')
  await ui.unmount()
})

test('where the box will not take it, the clipboard, then the name to type', async ($, on) => {
  const box = io({ canFill: false, canCopy: true, canPbcopy: false })
  const saved: unknown[] = []
  engine(on, saved, [], [], box)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN_SK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'use:my:worklog' })
  expect(box.copies).toEqual(['/my:worklog'])
  let notes = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(notes.some(n => n.includes('panoya kopyalandı'))).toBe(true)

  box.canCopy = false
  await ui.press({ key: 'use:my:worklog' })
  notes = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(notes).toContain('Mesaj kutusuna yazılamadı; elle yaz: /my:worklog')
  const trace = JSON.stringify(saved.at(-1))
  // On desktop the box is skipped: pbcopy, then the surface's clipboard, were tried.
  expect(trace).toContain('"pbcopy":{"exitCode":1')
  expect(trace).toContain('"reason":"no-surface"')
  expect(trace).toContain('lastUse')
  await ui.unmount()
})

test('on desktop a click copies the skill to the clipboard, never the box', async ($, on) => {
  const box = io({ draft: 'taslak' })
  engine(on, [], [], [], box)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN_SK)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'use:my:local-review' })
  expect(box.pbcopies).toEqual(['/my:local-review '])
  expect(box.fills).toHaveLength(0)
  const notes = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(notes).toContain("/my:local-review kopyalandı: mesaj kutusuna tıklayıp ⌘V'ye bas.")
  await ui.unmount()
})

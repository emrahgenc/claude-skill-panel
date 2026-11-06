import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Groups, SkillRow, View } from '../types'

const PANE = 'skills'
const TITLE = "Skill'ler"
const COMMAND = 'sk'
const STORE_KEY = 'groups'
const ALL = '*'
const UNGROUPED = '-'
const NAME_MAX = 40

const EMPTY_GROUPS: Groups = { names: [], of: {} }
const START_VIEW: View = {
  group: ALL,
  source: ALL,
  query: '',
  isEditing: false,
  newName: '',
  renameTo: '',
}

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const skills = atom({ plugin: 'skill-panel', key: 'skills' } as const, [] as SkillRow[], {
  shape: 'skills-1',
})
const groups = atom({ plugin: 'skill-panel', key: 'groups' } as const, EMPTY_GROUPS, {
  shape: 'groups-1',
})
const view = atom({ plugin: 'skill-panel', key: 'view' } as const, START_VIEW, {
  shape: 'view-1',
})
const isOpen = atom({ plugin: 'skill-panel', key: 'isOpen' } as const, false)
const notice = atom({ plugin: 'skill-panel', key: 'notice' } as const, '')

const SOURCE_OPTIONS = [
  { value: ALL, label: 'Tümü (Claude Code komutları hariç)' },
  { value: 'my', label: 'Kişisel (my)' },
  { value: 'project', label: 'Proje / yerel' },
  { value: 'plugin', label: "Plugin'ler" },
  { value: 'builtin', label: 'Claude Code' },
  { value: 'mcp', label: 'MCP' },
]

/** Which source bucket a command falls in. */
export function sourceKey(s: SkillRow): string {
  if (s.source === 'plugin') return s.plugin === 'my' ? 'my' : 'plugin'
  if (s.source === 'user') return 'project'
  return s.source
}

export function sourceLabel(s: SkillRow): string {
  switch (sourceKey(s)) {
    case 'my':
      return 'Kişisel'
    case 'project':
      return 'Proje / yerel'
    case 'plugin':
      return s.plugin ? `Plugin · ${s.plugin}` : 'Plugin'
    case 'builtin':
      return 'Claude Code'
    default:
      return 'MCP'
  }
}

/** The first sentence of a description, cut to one readable line. */
export function summary(description: string): string {
  const text = description.replace(/\s+/g, ' ').replace(/^["'\s]+|["'\s]+$/g, '')
  if (!text) return 'Açıklama yok.'
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence
}

export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
}

function isGroups(value: unknown): value is Groups {
  if (!value || typeof value !== 'object') return false
  const v = value as Groups
  return (
    Array.isArray(v.names) &&
    v.names.every(n => typeof n === 'string') &&
    !!v.of &&
    typeof v.of === 'object'
  )
}

function groupOf(g: Groups, name: string): string {
  const group = g.of[name]
  return group && g.names.includes(group) ? group : UNGROUPED
}

async function loadSkills($: EngineInterface): Promise<void> {
  const listed = await $.command.list()
  const rows: SkillRow[] = listed
    .filter(c => c.plugin !== 'skill-panel')
    .map(c => ({
      name: c.name,
      description: c.description ?? '',
      source: c.source,
      ...(c.plugin ? { plugin: c.plugin } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  await update($, skills, () => rows)
}

/** Reads the skill list afresh and opens the panel; resolves whether a surface draws it. */
async function openPanel($: EngineInterface): Promise<boolean> {
  await loadSkills($)
  const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE, focus: true })
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
    await $.ui.close({ id: PANE })
    await update($, isOpen, () => false)
    return
  }
  await openPanel($)
}

/** The draft with `/name ` in front, in place of a slash command it already starts with. */
export function withCommand(draft: string, name: string): string {
  const rest = draft.replace(/^\s*\/\S+\s*/, '').trimStart()
  return `/${name} ${rest}`
}

/**
 * A skill row's press: writes `/name ` at the head of the message box. Where
 * the box will not take it, the clipboard; where neither does, a toast with
 * the name to type.
 */
async function useSkill(
  $: EngineInterface,
  name: string,
  surface: RenderSurface,
): Promise<void> {
  // Each step's outcome, kept in the store (key `lastUse`) to diagnose a
  // surface where the box does not take the text.
  const trace: Record<string, unknown> = { name, surface }
  const say = async (text: string) => {
    await update($, notice, () => text)
    await $.store.set('lastUse', trace).catch(() => undefined)
  }
  const why = (error: unknown) => (error instanceof Error ? error.message : String(error))

  // The terminal's box is the engine's own, so a fill shows there. The desktop
  // app draws its own message box: a fill is reported done yet never reaches
  // it (seen 2026-11-06), so there the name goes to the Mac's clipboard.
  if (surface === 'terminal') {
    let draft = ''
    try {
      const box = await $.prompt.read()
      draft = box.text
      trace.read = { textLength: box.text.length }
    } catch (error) {
      trace.read = { error: why(error) }
    }

    try {
      const filled = await $.prompt.fill({ text: withCommand(draft, name), mode: 'replace' })
      trace.fill = { isFilled: filled.isFilled, refusal: filled.refusal ?? null }
      if (filled.isFilled) {
        await say(`/${name} mesaj kutusuna yazıldı.`)
        return
      }
    } catch (error) {
      trace.fill = { error: why(error) }
    }
  }

  try {
    const copied = await $.process.run(['pbcopy'], { stdin: `/${name} `, timeoutMs: 5000 })
    trace.pbcopy = { exitCode: copied.exitCode, stderr: copied.stderr.slice(0, 200) }
    if (copied.exitCode === 0) {
      await say(`/${name} kopyalandı: mesaj kutusuna tıklayıp ⌘V'ye bas.`)
      return
    }
  } catch (error) {
    trace.pbcopy = { error: why(error) }
  }

  try {
    const copied = await $.ui.copy({ text: `/${name}`, surface })
    trace.copy = copied
    if (copied.isCopied) {
      await say(`/${name} panoya kopyalandı; mesaj kutusuna yapıştır.`)
      return
    }
  } catch (error) {
    trace.copy = { error: why(error) }
  }

  await say(`Mesaj kutusuna yazılamadı; elle yaz: /${name}`)
}

/** Applies a change to the groups and keeps it past the session. */
async function saveGroups($: EngineInterface, change: (g: Groups) => Groups): Promise<void> {
  let latest: Groups | undefined
  await update($, groups, g => (latest = change(g)))
  if (latest) await $.store.set(STORE_KEY, latest)
}

function setView($: EngineInterface, patch: Partial<View>): Promise<unknown> {
  return update($, view, v => ({ ...v, ...patch }))
}

async function addGroup($: EngineInterface, raw: string): Promise<void> {
  const name = cleanName(raw)
  if (!name || name === ALL || name === UNGROUPED) return
  await saveGroups($, g => (g.names.includes(name) ? g : { ...g, names: [...g.names, name] }))
  await setView($, { newName: '' })
}

async function renameGroup($: EngineInterface, from: string, raw: string): Promise<void> {
  const to = cleanName(raw)
  if (!to || to === from || to === ALL || to === UNGROUPED) return
  await saveGroups($, g => {
    if (g.names.includes(to)) return g
    const of: Record<string, string> = {}
    for (const [skill, group] of Object.entries(g.of)) of[skill] = group === from ? to : group
    return { names: g.names.map(n => (n === from ? to : n)), of }
  })
  await setView($, { group: to, renameTo: '' })
}

async function deleteGroup($: EngineInterface, name: string): Promise<void> {
  await saveGroups($, g => {
    const of: Record<string, string> = {}
    for (const [skill, group] of Object.entries(g.of)) if (group !== name) of[skill] = group
    return { names: g.names.filter(n => n !== name), of }
  })
  await setView($, { group: ALL })
}

async function assign($: EngineInterface, skill: string, group: string): Promise<void> {
  await saveGroups($, g => {
    const of = { ...g.of }
    if (group === UNGROUPED) delete of[skill]
    else of[skill] = group
    return { ...g, of }
  })
}

/** The rows the panel shows, by group, after the filters. */
export function sections(all: SkillRow[], g: Groups, v: View): { name: string; rows: SkillRow[] }[] {
  const query = v.query.trim().toLocaleLowerCase('tr')
  const isOneGroup = v.group !== ALL && v.group !== UNGROUPED
  const visible = all.filter(s => {
    if (v.source === ALL) {
      // Claude Code's own commands (/clear, /help…) stay out unless grouped.
      if (sourceKey(s) === 'builtin' && groupOf(g, s.name) === UNGROUPED && !isOneGroup) return false
    } else if (sourceKey(s) !== v.source) {
      return false
    }
    if (!query) return true
    return (
      s.name.toLocaleLowerCase('tr').includes(query) ||
      s.description.toLocaleLowerCase('tr').includes(query)
    )
  })
  const names = v.group === ALL ? [...g.names, UNGROUPED] : [v.group]
  return names
    .map(name => ({ name, rows: visible.filter(s => groupOf(g, s.name) === name) }))
    .filter(section => section.rows.length > 0)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: "Skill panelini açar: skill'leri gruplar, her birinin ne yaptığını özetler",
    })
    const saved = await $.store.get(STORE_KEY)
    if (isGroups(saved)) await update($, groups, () => saved)

    return next(e)
  })

  // However the panel goes (this button, its own close mark, an unload), the
  // button stops showing it as open.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await update($, isOpen, () => false)
    return closed
  }).catch(($, e, next) => next(e))

  // A one-click way in and out: a small button in the band above the message box.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const isUp = await read($, isOpen)

    return (
      <Box flexDirection="row" gap={1}>
        <Button
          key="open-skills"
          label="Skill'ler"
          {...(isUp ? { variant: 'primary' as const } : {})}
          onPress={() => void togglePanel($)}
        />
        <Text dimColor>
          {isUp ? 'kapatmak için yeniden tıkla' : 'grupla, ara, hangi skill ne yapıyor gör'}
        </Text>
      </Box>
    )
  })

  on('command.run', { command: COMMAND }, async $ => {
    const isPlaced = await openPanel($)

    return {
      text: isPlaced
        ? 'Skill paneli açıldı.'
        : 'Skill paneli açıldı ama bu ekranda gösterilemiyor.',
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { text: 'Skill paneli açılamadı; ayrıntı hata kaydında.' },
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const all = await read($, skills)
    const g = await read($, groups)
    const v = await read($, view)

    if (e.surface === 'mobile') {
      // The mobile app draws no fields: a read-only list of every group.
      const { Box, Text } = $.ui.resolve(e)
      const rows = sections(all, g, { ...v, group: ALL, source: ALL, query: '' })

      return (
        <Box flexDirection="column" gap={1}>
          {rows.map(section => (
            <Box key={`section:${section.name}`} flexDirection="column">
              <Text bold>{section.name === UNGROUPED ? 'Grupsuz' : section.name}</Text>
              {section.rows.map(s => (
                <Text>
                  /{s.name} — {summary(s.description)}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const { Box, Button, Input, Select, Text } = $.ui.resolve(e)
    const lastNotice = await read($, notice)

    const isOneGroup = v.group !== ALL && v.group !== UNGROUPED && g.names.includes(v.group)
    const groupFilter = [
      { value: ALL, label: 'Tüm gruplar' },
      ...g.names.map(n => ({ value: n, label: n })),
      { value: UNGROUPED, label: 'Grupsuz' },
    ]
    const groupChoices = [
      { value: UNGROUPED, label: '— grupsuz —' },
      ...g.names.map(n => ({ value: n, label: n })),
    ]
    const shown = sections(all, g, v)
    const count = shown.reduce((n, s) => n + s.rows.length, 0)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Select
            key="group"
            label="Grup"
            value={groupFilter.some(o => o.value === v.group) ? v.group : ALL}
            options={groupFilter}
            onSelect={value => void setView($, { group: value, renameTo: '' })}
          />
          <Select
            key="source"
            label="Kaynak"
            value={v.source}
            options={SOURCE_OPTIONS}
            onSelect={value => void setView($, { source: value })}
          />
        </Box>
        <Input
          key="query"
          placeholder="Ara: ad ya da açıklama (örn. efor, review, incident)"
          value={v.query}
          onInput={value => void setView($, { query: value })}
          onSubmit={value => void setView($, { query: value })}
        />
        <Box flexDirection="row" gap={1}>
          <Button
            key="edit"
            label={v.isEditing ? 'Düzenlemeyi bitir' : 'Grupları düzenle'}
            {...(v.isEditing ? { variant: 'primary' as const } : {})}
            onPress={() => void setView($, { isEditing: !v.isEditing })}
          />
          <Button key="refresh" label="Yenile" onPress={() => void loadSkills($)} />
        </Box>

        {v.isEditing && (
          <Box flexDirection="column" gap={1} borderStyle="round" paddingX={1}>
            <Input
              key="new-group"
              label="Yeni grup"
              placeholder="Grup adını yazıp Enter'a bas"
              submitLabel="Oluştur"
              value={v.newName}
              onInput={value => void setView($, { newName: value })}
              onSubmit={value => void addGroup($, value)}
            />
            {isOneGroup && (
              <Box flexDirection="column" gap={1}>
                <Input
                  key="rename-group"
                  label={`"${v.group}" grubunun yeni adı`}
                  placeholder={v.group}
                  submitLabel="Kaydet"
                  value={v.renameTo}
                  onInput={value => void setView($, { renameTo: value })}
                  onSubmit={value => void renameGroup($, v.group, value)}
                />
                <Button
                  key="delete-group"
                  label={`"${v.group}" grubunu sil (skill'ler grupsuz kalır)`}
                  onPress={() => void deleteGroup($, v.group)}
                />
              </Box>
            )}
            <Text dimColor>Her skill'in altındaki listeden grubunu seç.</Text>
          </Box>
        )}

        {lastNotice !== '' && <Text bold>{lastNotice}</Text>}

        {all.length === 0 ? (
          <Text dimColor>Skill listesi henüz okunmadı: "Yenile"ye bas.</Text>
        ) : count === 0 ? (
          <Text dimColor>Bu filtreye uyan skill yok.</Text>
        ) : (
          <Text dimColor>
            {count} skill · adına tıkla, kopyalansın; mesaj kutusunda ⌘V
          </Text>
        )}

        {shown.map(section => (
          <Box key={`section:${section.name}`} flexDirection="column" gap={1}>
            <Text bold>
              {section.name === UNGROUPED ? 'Grupsuz' : section.name} ({section.rows.length})
            </Text>
            {section.rows.map(s => (
              <Box key={`row:${s.name}`} flexDirection="column" paddingLeft={2}>
                <Box flexDirection="row" gap={1}>
                  <Button
                    key={`use:${s.name}`}
                    plain
                    onPress={press => void useSkill($, s.name, press.surface)}
                  >
                    <Text bold mono>
                      /{s.name}
                    </Text>
                  </Button>
                  <Text dimColor>· {sourceLabel(s)}</Text>
                </Box>
                <Text dimColor>{summary(s.description)}</Text>
                {v.isEditing && (
                  <Select
                    key={`assign:${s.name}`}
                    label="Grup"
                    value={groupOf(g, s.name)}
                    options={groupChoices}
                    onSelect={value => void assign($, s.name, value)}
                  />
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}

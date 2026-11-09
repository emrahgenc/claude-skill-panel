import type { Register, RenderChildren } from 'claude-code'

import type { Groups, Scope, SkillRow, Status, Usage } from '../types'
import {
  COMMAND,
  EMPTY_GROUPS,
  PANE,
  UNGROUPED,
  addGroup,
  brief,
  assign,
  closePanel,
  copyCommand,
  deleteGroup,
  firstArg,
  fullText,
  go,
  groupOf,
  hintNote,
  isLang,
  isRequiredHint,
  loadSkills,
  loadStored,
  matchParts,
  moveGroup,
  openPanel,
  overlapOf,
  registerGroupCommands,
  renameGroup,
  runSkill,
  saveGroups,
  savePrefs,
  say,
  sameNamed,
  scopeCounts,
  search,
  setHidden,
  setOpen,
  setPlace,
  setView,
  snapshot,
  sourceKey,
  sourceLabel,
  strings,
  suggestGroups,
  summary,
  togglePanel,
  topUsed,
  weekly,
} from './model'
import { LANG_OPTIONS, STRINGS } from './strings'

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

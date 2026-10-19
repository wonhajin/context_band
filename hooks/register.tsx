// Same figures as ~/.claude/statusline.mjs, e.g. "Opus 5.5 · high · Context 7% (74k/1000k) · $3.21",
// drawn in the band above the prompt. Cost is Claude Code's own estimate at API list prices.
// Thresholds match hooks/warn-long-session.mjs: 1st warning yellow, 2nd red.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionMeasureInput } from 'claude-code'

import type { Snapshot } from '../types'

const CTX_WARN = 250_000
const CTX_ALERT = 350_000

const snapshot = atom({ plugin: 'context-band', key: 'snapshot' } as const, {})

const k = (n: number) => Math.round(n / 1000) + 'k'

// An Svg takes no theme key, so the ring's color follows Claude Code's /config theme row, as effortless does.
const RING_DARK_THEME = '#ffffff'
const RING_LIGHT_THEME = '#18181b'
// The Svg box is one text line tall (16px) so it centers on the "Context" text; the ring inside is drawn smaller.
const RING_PX = 16
const RING_R = 4.5
const RING_STROKE = 2.2
// Text sits a little below its line box's middle, so the ring's center is nudged down to meet it.
const RING_CY = 9

async function isLightTheme($: EngineInterface): Promise<boolean> {
  const rows = await $.config.list().catch(() => [])
  const value = rows.find(row => row.key === 'theme')?.value
  return typeof value === 'string' && value.startsWith('light')
}

// Same ring as effortless: a faint full circle, then an arc filled to percent (continuous, not stepped).
export function ringSvg(percent: number, color: string): string {
  const p = Math.max(0, Math.min(100, percent))
  const c = 2 * Math.PI * RING_R
  const circle = `cx="8" cy="${RING_CY}" r="${RING_R}" fill="none" stroke="${color}" stroke-width="${RING_STROKE}"`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle ${circle} stroke-opacity=".25"/><circle ${circle} stroke-linecap="round" stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 ${RING_CY})"/></svg>`
}

// $.session.model() answers the id ("claude-opus-5-5"); the status line shows display_name ("Opus 5.5").
// Anything not shaped like claude-<family>-<major>[-<minor>] is shown as is. A "[1m]"-style tag is kept.
export function displayName(id: string): string {
  const m = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(?:-\d{8})?(\[[^\]]+\])?$/.exec(id)
  if (!m) return id
  const [, family = '', major, minor, tag] = m
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return `${name} ${major}${minor ? '.' + minor : ''}${tag ? ' ' + tag : ''}`
}

type Figures = Pick<SessionMeasureInput, 'context' | 'cost'>

async function refresh($: EngineInterface, patch: Partial<Snapshot> = {}, figures?: Figures) {
  const [usage, model, isLight] = await Promise.all([figures ?? $.session.usage(), $.session.model(), isLightTheme($)])
  await update($, snapshot, prev => ({
    ...prev,
    ...patch,
    model: displayName(model),
    tokens: usage.context.tokens,
    window: usage.context.window,
    percent: usage.context.percent,
    usd: usage.cost?.usd,
    isLight,
  }))
}

export const register: Register = (on, options) => {
  // userConfig toggles; a change in /config reloads the module with the new values.
  const showModel = options.showModel !== false
  const showCost = options.showCost !== false

  on('session.start', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  })

  // Fires whenever context, rate limits or cost move.
  on('session.measure', async ($, e, next) => {
    await refresh($, {}, e).catch(() => undefined)
    return next(e)
  })

  // Effort is only visible on a request; record the main conversation's, observe only.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      await refresh($, { effort: String(e.effort) }).catch(() => undefined)
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const s = await read($, snapshot)
    if (!s.model && !s.window) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    // The terminal has no Svg, so the ring shows on desktop and vscode only.
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const sep = <Text dimColor> · </Text>
    const join = (xs: RenderChildren[]) => xs.flatMap((p, i) => (i === 0 ? [p] : [sep, p]))
    const parts = []
    const modelParts = []
    let ring: RenderChildren = null

    if (showModel && s.model) modelParts.push(<Text color="suggestion">{s.model}</Text>)
    if (showModel && s.effort) modelParts.push(<Text color="suggestion">{s.effort}</Text>)
    if (s.window) {
      const used = s.tokens ?? 0
      const pct = Math.round(s.percent ?? (100 * used) / s.window)
      const color = used >= CTX_ALERT ? 'error' : used >= CTX_WARN ? 'warning' : 'success'
      if (Svg) ring = <Svg source={ringSvg(pct, s.isLight ? RING_LIGHT_THEME : RING_DARK_THEME)} alt={`${pct}% of context`} width={RING_PX} height={RING_PX} />
      parts.push(
        <Text>
          <Text color={color}>Context {pct}%</Text>
          <Text dimColor> ({k(used)}/{k(s.window)})</Text>
        </Text>,
      )
    }
    if (showCost && typeof s.usd === 'number') parts.push(<Text>${s.usd.toFixed(2)}</Text>)

    // Context and cost on the left, model and effort flush right.
    return (
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Box flexDirection="row" alignItems="center" gap={1}>
          {ring}
          <Text>{join(parts)}</Text>
        </Box>
        <Text>{join(modelParts)}</Text>
      </Box>
    )
  })
}

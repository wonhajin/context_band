import { describe, expect, mock, test } from 'claude-code/testing'

import { cacheLabel, displayName } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 } } as const

// What $.session.usage() answers; refresh() reads it when no measurement comes with the call (the effort update).
const USAGE = { startedAt: 0, context: { tokens: 74_000, window: 1_000_000, percent: 7 }, rateLimits: [], cost: { usd: 3.21 } }

type CacheUsage = { cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

// Answers turn.step beneath the plugin; returns a call that runs one model request with the given cache usage.
// Register it before the test's first $ call, as the kit requires of every hook beneath the plugins.
// streaming: runs while the reply streams, e.g. to move the test's clock on.
function mockSteps(on: any, streaming?: () => void) {
  let next: CacheUsage = {}
  let index = 0
  on('turn.step', async function* (_$: unknown, e: { turnId: string; index: number }) {
    streaming?.()
    const usage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...next, model: 'claude-opus-5-5' }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  return async ($: any, cache: CacheUsage, request: { agentId?: string; effort?: string } = {}) => {
    next = cache
    const stream = $.turn.step({ turnId: 't', index: index++, model: 'claude-opus-5-5', messageCount: 1, ...request })
    for await (const _ of stream);
    await stream.result
  }
}

describe('context-band', () => {
  test('draws model, effort, context and cost after a measurement', async ($, on) => {
    const step = mockSteps(on)
    on('session.usage', () => ({ value: USAGE }) as never)
    on('session.model', () => ({ value: 'Opus 5.5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 74_000, window: 1_000_000, percent: 7 },
      cost: { usd: 3.21 },
      rateLimits: [],
      changed: ['context', 'cost'],
    })
    await step($, {}, { effort: 'high' })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND } as never)
      expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^high$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Context 7%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /74k\/1000k/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$3\.21/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('hides model, effort and cost when turned off', { options: { showModel: false, showCost: false } }, async ($, on) => {
    const step = mockSteps(on)
    on('session.usage', () => ({ value: USAGE }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 74_000, window: 1_000_000, percent: 7 },
      cost: { usd: 3.21 },
      rateLimits: [],
      changed: ['context', 'cost'],
    })
    await step($, {}, { effort: 'high' })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND } as never)
      expect(await ui.find({ type: 'Text', text: /Context 7%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /high/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /\$3\.21/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('formats the remaining cache time', () => {
    expect(cacheLabel(42 * 60_000 + 59_000)).toBe('Cache 42m')
    expect(cacheLabel(59_000)).toBe('Cache <1m')
    expect(cacheLabel(0)).toBe('Cache expired')
  })

  test('counts the cache down from the last main-thread request', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const step = mockSteps(on)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 74_000, window: 1_000_000, percent: 7 }, cost: { usd: 3.21 }, rateLimits: [], changed: ['context', 'cost'] })
    await step($, { cache_read_input_tokens: 70_000 })

    await clock.advance(17 * 60_000)
    let ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    const cache: any = await ui.find({ type: 'Text', text: /^Cache 43m$/ })
    expect(cache?.props?.dimColor).toBe(true)
    // Context, cache, cost in that order on the left.
    expect(await ui.find({ type: 'Text', text: /Context 7%[\s\S]*Cache 43m[\s\S]*\$3\.21/ })).toBeDefined()
    await ui.unmount()

    await clock.advance(32 * 60_000)
    ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    const low: any = await ui.find({ type: 'Text', text: /^Cache 11m$/ })
    expect(low?.props?.color).toBe('warning')
    await ui.unmount()

    await clock.advance(11 * 60_000)
    ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^Cache expired$/ })).toBeDefined()
  })

  test('uses the 5m TTL and ignores subagent requests', { options: { cacheTtl: '5m' } }, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const step = mockSteps(on)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    await step($, { cache_creation_input_tokens: 1_000 })
    await clock.advance(2 * 60_000)
    await step($, { cache_read_input_tokens: 1_000 }, { agentId: 'agent-1' })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^Cache 3m$/ })).toBeDefined()
  })

  test('redraws the countdown every 30 seconds with no event behind it', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const step = mockSteps(on)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    await step($, { cache_read_input_tokens: 1_000 })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^Cache 60m$/ })).toBeDefined()
    // The same mounted band, no remount: only the timer can move it.
    await clock.advance(2 * 60_000)
    expect(await ui.find({ type: 'Text', text: /^Cache 58m$/ })).toBeDefined()
  })

  test('shows no cache time when the request touched no cache', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const step = mockSteps(on)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    await step($, {})
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /Context 1%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Cache/ })).toBeUndefined()
  })

  test('counts from when the request was sent, not when the reply ended', async ($, on) => {
    // A hand-held clock: the reply takes 2 minutes to stream.
    let now = 1_000_000
    on('clock.now', () => ({ value: now }) as never)
    const step = mockSteps(on, () => {
      now += 2 * 60_000
    })
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    await step($, { cache_read_input_tokens: 1_000 })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^Cache 58m$/ })).toBeDefined()
  })

  test('drops the countdown after /model and /clear', async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const step = mockSteps(on)
    // Nothing beneath the plugins answers classic events in a test; these stand in for the engine.
    on('classic.PostModelSwitch', () => ({}) as never)
    on('classic.SessionStart', () => ({}) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    const shown = async () => {
      const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
      const found = await ui.find({ type: 'Text', text: /^Cache / })
      await ui.unmount()
      return found !== undefined
    }

    await step($, { cache_read_input_tokens: 1_000 })
    expect(await shown()).toBe(true)
    await $.classic.PostModelSwitch({
      from_model: 'claude-opus-5-5',
      to_model: 'claude-sonnet-5-5',
      requested_model: 'sonnet',
      source: 'command',
      context_tokens: 1_000,
      prompt_cache_warm: true,
      cache_ttl: '1h',
      estimated_cache_write_usd: 0.01,
      pricing: 'catalog',
    } as never)
    expect(await shown()).toBe(false)

    await step($, { cache_read_input_tokens: 1_000 })
    expect(await shown()).toBe(true)
    await $.classic.SessionStart({ source: 'compact' } as never)
    expect(await shown()).toBe(true)
    await $.classic.SessionStart({ source: 'clear' } as never)
    expect(await shown()).toBe(false)
  })

  test('hides the cache time when turned off', { options: { showCache: false } }, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const step = mockSteps(on)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    await step($, { cache_read_input_tokens: 1_000 })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /Cache/ })).toBeUndefined()
  })

  test('shows the model id as its display name', async ($, on) => {
    expect(displayName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(displayName('claude-fable-5-1')).toBe('Fable 5.1')
    expect(displayName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 [1m]')
    expect(displayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(displayName('my-gateway-model')).toBe('my-gateway-model')

    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeDefined()
  })

  test('draws the context ring on desktop and vscode, not on the terminal', async ($, on) => {
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 370_000, window: 1_000_000, percent: 37 }, rateLimits: [], changed: ['context'] })
    for (const surface of ['desktop', 'vscode'] as const) {
      const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND } as never)
      expect(await ui.find({ type: 'Svg' })).toBeDefined()
      await ui.unmount()
    }
    const term = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await term.find({ type: 'Svg' })).toBeUndefined()
    expect(await term.find({ type: 'Text', text: /^Context 37%$/ })).toBeDefined()
  })

  test('the ring follows a light theme', async ($, on) => {
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('config.list', () => ({ value: [{ key: 'theme', value: 'light' }] }) as never)
    await $.session.measure({ context: { tokens: 1_000, window: 200_000, percent: 1 }, rateLimits: [], changed: ['context'] })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'desktop', ...BAND } as never)
    const svg: any = await ui.find({ type: 'Svg' })
    expect(String(svg?.props?.source)).toContain('#18181b')
  })

  test('turns yellow past 250k tokens', async ($, on) => {
    on('session.model', () => ({ value: 'Opus 5.5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 260_000, window: 1_000_000, percent: 26 },
      rateLimits: [],
      changed: ['context'],
    })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    const ctx: any = await ui.find({ type: 'Text', text: /^Context 26%$/ })
    expect(ctx?.props?.color).toBe('warning')
  })

  test('turns red past 350k tokens', async ($, on) => {
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { tokens: 360_000, window: 1_000_000, percent: 36 }, rateLimits: [], changed: ['context'] })
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    const ctx: any = await ui.find({ type: 'Text', text: /^Context 36%$/ })
    expect(ctx?.props?.color).toBe('error')
  })
})

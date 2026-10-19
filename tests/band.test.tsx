import { describe, expect, mock, test } from 'claude-code/testing'

import { cacheLabel, displayName } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 } } as const

type CacheUsage = { cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

// Answers turn.step beneath the plugin; returns a call that runs one model request with the given cache usage.
// Register it before the test's first $ call, as the kit requires of every hook beneath the plugins.
function mockSteps(on: any) {
  let next: CacheUsage = {}
  let index = 0
  on('turn.step', async function* (_$: unknown, e: { turnId: string; index: number }) {
    const usage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...next, model: 'claude-opus-5-5' }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  return async ($: any, cache: CacheUsage, agentId?: string) => {
    next = cache
    const stream = $.turn.step({ turnId: 't', index: index++, model: 'claude-opus-5-5', messageCount: 1, agentId })
    for await (const _ of stream);
    await stream.result
  }
}

describe('context-band', () => {
  test('draws model, context and cost after a measurement', async ($, on) => {
    on('session.model', () => ({ value: 'Opus 5.5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 74_000, window: 1_000_000, percent: 7 },
      cost: { usd: 3.21 },
      rateLimits: [],
      changed: ['context', 'cost'],
    })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND } as never)
      expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Context 7%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /74k\/1000k/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$3\.21/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('hides model, effort and cost when turned off', { options: { showModel: false, showCost: false } }, async ($, on) => {
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 74_000, window: 1_000_000, percent: 7 },
      cost: { usd: 3.21 },
      rateLimits: [],
      changed: ['context', 'cost'],
    })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND } as never)
      expect(await ui.find({ type: 'Text', text: /Context 7%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeUndefined()
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
    await step($, { cache_read_input_tokens: 1_000 }, 'agent-1')
    const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^Cache 3m$/ })).toBeDefined()
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
})

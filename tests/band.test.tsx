import { describe, expect, test } from 'claude-code/testing'

import { displayName } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 } } as const

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

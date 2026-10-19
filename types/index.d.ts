export type Snapshot = {
  model?: string
  effort?: string
  tokens?: number
  window?: number
  percent?: number
  usd?: number
  isLight?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'context-band': { snapshot: Snapshot }
  }
}

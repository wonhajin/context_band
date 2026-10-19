export type Snapshot = {
  model?: string
  effort?: string
  tokens?: number
  window?: number
  percent?: number
  usd?: number
  isLight?: boolean
  // When the main conversation's last request read or wrote the prompt cache (ms since epoch).
  cachedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-band': { snapshot: Snapshot }
  }
}

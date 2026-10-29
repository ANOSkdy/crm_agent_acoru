import { registerHooks } from 'node:module'
// Next normally enforces this boundary at build time. Isolated Node tests use real server modules.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: new URL('./empty.mjs', import.meta.url).href, shortCircuit: true }
  return next(specifier, context)
} })

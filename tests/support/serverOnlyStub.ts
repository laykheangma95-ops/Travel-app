// `server-only` has no npm package — Next.js resolves it internally, and its
// whole job is to fail the BUILD if a server module is pulled into a client
// bundle. Under vitest's node environment there is no bundle and nothing to
// guard, so the import must resolve to a harmless no-op rather than crashing
// every suite that touches a server module.
//
// Aliased in vitest.config.mts. This does not weaken the real guard: the
// production build still resolves the real package and still fails on a
// genuine client import.
export {};

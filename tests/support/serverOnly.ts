// `server-only` is not an installed package: Next.js aliases it in its own
// bundler to a module that throws if a client component reaches it. Vitest has
// no such alias, so a server module that imports it cannot be loaded in a test
// at all — which is why lib/travel/context.ts had no direct test coverage.
//
// vitest.config.mts points the specifier here. The guard is a build-time
// concern; under test the import is simply a no-op.
export {};

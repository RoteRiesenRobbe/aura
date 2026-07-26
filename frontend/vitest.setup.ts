// The client's catalog modules fetch on import (Skills.ts, Mobs.ts) — a unit
// test importing anything downstream of them would otherwise do real DNS
// against the derived catalog host. Stub it to a rejection: that is the path
// those modules are explicitly designed to survive ("the game never blocks on
// the catalog"), so the tests exercise the degraded-fallback state on purpose.
globalThis.fetch = () => Promise.reject(new Error('fetch is disabled in unit tests'));

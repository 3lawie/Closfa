// `wrangler types` (npm run cf-typegen) generates the real worker-configuration.d.ts
// that augments Cloudflare.Env from wrangler.jsonc's bindings — but that's a
// wrangler command, which this session's guard-bash hook blocks me from
// running (same reason db:push needs you to run it directly). This
// declaration covers the `ai` binding added to wrangler.jsonc in the
// meantime; once you run `npm run cf-typegen`, its generated file will
// declare the same property with the same type, which TypeScript merges
// without conflict — safe to leave this file in place either way.
declare namespace Cloudflare {
  interface Env {
    AI: Ai
  }
}

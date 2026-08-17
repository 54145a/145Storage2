# AGENTS.md

## Layout

- `storage.js` is the **source of truth**: hand-written JS with `//@ts-check` and JSDoc types. There is no `.ts` source for the library; `tsconfig.json` type-checks it via `checkJs`.
- `tsconfig.json` (`noEmit`) type-checks the project (`storage.js` + `test.ts`); `scripts/tsconfig.json` (extends it) type-checks the tooling scripts with node types (`buildDocs.ts`, `bench.js`); `tsconfig.build.json` (extends it too) emits `storage.d.ts` from `storage.js` only.
- `storage.d.ts` is **generated** and committed. Don't edit it by hand; rebuild after changing `storage.js`.
- `README.md` is **generated** by `scripts/buildDocs.ts` from `README_template.md` + `test.ts` + `storage.d.ts`. Edit `README_template.md`, never `README.md`.
- `test.ts` is the only test file (plain `node:assert` + console runner, no test framework).
- `typedoc.json` builds the showcase site with **TypeDoc** from `storage.js` (JSDoc → API docs), rendering `README.md` as the front page. It runs via `pnpm dlx` with pinned `typescript@6.0.3` because **TypeDoc doesn't support the repo's TS 7 yet** — never bump those pins. `buildDocs.ts` spawns it (as `pnpm site`), so `pnpm build` produces README + site in one flow.
- `.github/workflows/deploy-docs.yml` deploys `docs/dist` to GitHub Pages (official `configure/upload/deploy-pages` actions; Pages source must be set to "GitHub Actions" in repo settings).
- No lint or formatter is configured.

## Commands

```sh
pnpm install     # installs devDeps (frozen-lockfile in CI)
pnpm test        # node --experimental-webstorage --localstorage-file=test.db test.ts
pnpm bench       # node --experimental-webstorage --localstorage-file=/tmp/bench.db scripts/bench.js  (proxy hot-path micro-benchmark)
pnpm build       # tsc && tsc -p scripts/tsconfig.json && tsc -p tsconfig.build.json && node scripts/buildDocs.ts   (typechecks project + scripts, emits storage.d.ts, regenerates README + showcase site)
pnpm site        # TypeDoc build → docs/dist (site only; buildDocs.ts runs this via pnpm dlx, which pulls typedoc + typescript@6)
```

- Don't name a script `docs` — it collides with pnpm's built-in `docs` subcommand; `site` is used instead.

- Use **pnpm** (npm scripts work too, but pnpm is the repo's package manager). `pnpm-lock.yaml` is **committed** (`.gitignore` has `*lock*` + `!pnpm-lock.yaml`); CI uses `--frozen-lockfile`. Re-run `pnpm install` after changing any `package.json`.
- Tests run `test.ts` directly — requires Node ≥22.6 (type stripping). The command is a hand-rolled `node --experimental-webstorage`, not a test framework.
- `test.db` is the Node experimental localStorage backing file; it's created/overwritten by the test run and gitignored. Delete it before a clean run.
- Typecheck/build use plain `tsc` (root devDependency `typescript` — v7 is the native/tsgo compiler). `tsc` must exit 0 for the project AND `tsc -p scripts/tsconfig.json` for the scripts — a stray type error in any source file breaks `pnpm build` before `tsc -p tsconfig.build.json` emits.

## Conventions / gotchas

- `storage.js` is **not** dependency-free anymore: `FlatUnstorage` accepts an unstorage `Storage` instance (type-only import in JSDoc). Users create their own storage; `unstorage` is a runtime dependency.
- Debounced writes flush asynchronously (`updateDelayMs`, default 100ms) — tests always `await setTimeout(150)` before asserting on raw storage.
- `FlatJSONStorage.load(key?)` is synchronous when the key is cached, returns a Promise otherwise — tests assert this explicitly.
- Template-tag get API: `flat.get\`key\`` (async) — the README and tests lean on this.
- `FlatUnstorage` is **always async** (unstorage's `getItem`/`setItem` are Promise-based): sync reads after a cache miss throw `Key not loaded ... 'await load()'`. Must `await load()` or use `flat.get\`...\``.
- unstorage serialization quirks to respect when testing `FlatUnstorage`:
  - Primitive strings round-trip via `String()` + `destr`, so literals like `"{}"`, `"[]"`, `"0"`, `"true"`/`"false"`, `"null"` come back as other types — don't store those exact strings.
  - `normalizeKey` rewrites `/` `\` `?` and strips leading/trailing `:` in keys; `a/b` collides with `a:b`.
  - The schema markers are safe: the whole schema lives in one JSON document under `__145Storage__flatSchema__`, and `getSchemaNodeValueType` also accepts object/array markers.
- Symbol properties are unsupported by `createDeepProxy` (asserted via `console.assert`).
- License is AGPL-3.0-only; headers on `storage.js` say `@license AGPL-3.0`.

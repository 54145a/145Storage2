# AGENTS.md

## Layout

- `storage.js` is the **source of truth**: hand-written JS with `//@ts-check` and JSDoc types. There is no `.ts` source for the library; `tsconfig.json` type-checks it via `checkJs`.
- `tsconfig.json` (`noEmit`) type-checks the project (`storage.js` + `vitest.config.ts` + `test/**/*.ts`); `scripts/tsconfig.json` (extends it) type-checks the tooling scripts with node types (`buildDocs.ts`, `bench.js`); `tsconfig.build.json` (extends it too) emits `storage.d.ts` from `storage.js` only.
- `storage.d.ts` is **generated** by `tsc` (`emitDeclarationOnly`) from `storage.js` and is **gitignored — never committed**. Don't edit it by hand; rebuild after changing `storage.js`. It is built by the `prepublishOnly` script and shipped inside the published package via the `files` whitelist in `package.json`.
- `README.md` is **generated** by `scripts/buildDocs.ts` from `README_template.md` + `example.js` + `storage.d.ts`. Edit `README_template.md`, never `README.md`.
- Tests live in `test/` (**Vitest** framework, one `*.test.ts` file per storage class; shared helpers in `test/helpers.ts`).
- `typedoc.json` builds the showcase site with **TypeDoc** from `storage.js` (JSDoc → API docs), rendering `README.md` as the front page. It runs via `pnpm dlx` with pinned `typescript@6.0.3` because **TypeDoc doesn't support the repo's TS 7 yet** — never bump those pins. `buildDocs.ts` spawns it (as `pnpm site`), so `pnpm build` produces README + site in one flow.
- CI is split into two workflows (`.github/workflows/`):
  - `ci.yml` (**test & build**): runs `pnpm test` + `pnpm build` on pull requests and pushes to `main`. This is the validation gate — enable branch protection on `main` requiring it to pass before merging.
  - `deploy.yml` (**deploy docs & publish**): runs only on `v*` tags (so the docs site always matches the published npm version — main pushes never deploy docs). `deploy-docs` builds and deploys `docs/dist` to GitHub Pages (official `configure/upload/deploy-pages` actions; Pages source must be set to "GitHub Actions" in repo settings); `publish` runs `pnpm test` + `pnpm build` + `pnpm publish --provenance` (tags bypass branch protection, so the publish job carries its own test/build safety net; it needs the `NPM_TOKEN` secret for registry auth).
- No lint or formatter is configured.

## Commands

```sh
pnpm install     # installs devDeps (frozen-lockfile in CI)
pnpm test        # vitest run (see vitest.config.ts)
pnpm test:watch  # vitest (watch mode)
pnpm bench       # node --experimental-webstorage --localstorage-file=/tmp/bench.db scripts/bench.js  (proxy hot-path micro-benchmark)
pnpm build       # tsc && tsc -p scripts/tsconfig.json && tsc -p tsconfig.build.json && node scripts/buildDocs.ts   (typechecks project + scripts, emits storage.d.ts, regenerates README + showcase site)
pnpm site        # TypeDoc build → docs/dist (site only; buildDocs.ts runs this via pnpm dlx, which pulls typedoc + typescript@6)
```

- Don't name a script `docs` — it collides with pnpm's built-in `docs` subcommand; `site` is used instead.

- Use **pnpm** (npm scripts work too, but pnpm is the repo's package manager). `pnpm-lock.yaml` is **committed** (`.gitignore` has `*lock*` + `!pnpm-lock.yaml`); CI uses `--frozen-lockfile`. Re-run `pnpm install` after changing any `package.json`.
- Tests run under **Vitest** (`vitest.config.ts`). `localStorage` needs Node's `--experimental-webstorage` flag, which only affects the worker processes: the config passes it (plus `--localstorage-file=test.db`) to the forks via `execArgv`. `pool: "forks"` + `isolate: false` + `fileParallelism: false` keep every test file in ONE process running sequentially — `localStorage` is process-global state and all files share the same `test.db` backing file, so parallel forks would corrupt it.
- `test/helpers.ts` provides `waitForFlush(assertion, timeoutMs?)`: it polls an assertion until the debounced flush lands (deadline 2s). **Never use a fixed `setTimeout(150)` wait** — it's a race: under event-loop congestion the 100ms debounce callback can fire later than the wait (verified: a 200ms synchronous block delays the flush past a 150ms wait). Polling turns "eventual consistency" into a deterministic assertion.
- Reads through the same instance's cache are synchronous (no wait needed); only assertions on the raw backing store, or reads through a NEW instance (which go through the adapter), need `waitForFlush`. For `FlatUnstorage` also wait for the schema document (`__145Storage__flatSchema__`) before constructing a fresh instance — it is debounced separately from leaf writes.
- `test.db` is the Node experimental localStorage backing file; it's created/overwritten by the test run and gitignored. Delete it before a clean run.
- Typecheck/build use plain `tsc` (root devDependency `typescript` — v7 is the native/tsgo compiler). `tsc` must exit 0 for the project AND `tsc -p scripts/tsconfig.json` for the scripts — a stray type error in any source file breaks `pnpm build` before `tsc -p tsconfig.build.json` emits.

## Conventions / gotchas

- `storage.js` is dependency-free: `FlatUnstorage` accepts an unstorage `Storage` instance (type-only import in JSDoc). Users create their own storage; `unstorage` is a devDependency only.
- Only the `JSONDebounceStorage` paths are debounced (`updateDelayMs`, default 100ms): whole-blob storages (`WebStorageItemStorage`) and `DEBOUNCE_ARRAY` keys. `FlatJSONStorage` writes `PRIMITIVE`/`FLAT_LINK` leaves to the adapter **synchronously** — `flat.data.count = 1` is in the backing store before the statement returns, and only the array key waits. Tests assert both sides of this asymmetry explicitly (see "persists flat leaves immediately" in `test/flatWebStorage.test.ts`).
- `FlatJSONStorage.load(key?)` is synchronous when the key is cached, returns a Promise otherwise — tests assert this explicitly.
- Template-tag get API: `flat.get\`key\`` (async) — the README and tests lean on this.
- `FlatUnstorage` is **always async** (unstorage's `getItem`/`setItem` are Promise-based): sync reads after a cache miss throw `Key not loaded ... 'await load()'`. Must `await load()` or use `flat.get\`...\``.
- unstorage serialization quirks to respect when testing `FlatUnstorage`:
  - Primitive strings round-trip via `String()` + `destr`, so literals like `"{}"`, `"[]"`, `"0"`, `"true"`/`"false"`, `"null"` come back as other types — don't store those exact strings.
  - `normalizeKey` rewrites `/` `\` `?` and strips leading/trailing `:` in keys; `a/b` collides with `a:b`.
  - The schema markers are safe: the whole schema lives in one JSON document under `__145Storage__flatSchema__`, and `getSchemaNodeValueType` also accepts object/array markers.
- Symbol properties are unsupported by **both** proxies (`createFullDeepProxy` and `createLightDeepProxy`): a user Symbol gets a `console.assert` notice and never reaches the handler, so it is never persisted. Built-in Symbols pass through.
- License is LGPL-3.0-or-later; headers on `storage.js` say `@license LGPL-3.0-or-later`.

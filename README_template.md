# 📦 145 Storage 2: My KV is a **plain Object**

[![npm version](https://img.shields.io/npm/v/@54145a/storage2.svg)](https://www.npmjs.com/package/@54145a/storage2)[![license](https://img.shields.io/npm/l/@54145a/storage2.svg)](./LICENSE)[![GitHub stars](https://img.shields.io/github/stars/54145a/145Storage2.svg)](https://github.com/54145a/145Storage2)
> A JavaScript storage library that uses property accessor syntax, making state persistence as simple as modifying a plain object.

## Why 145 Storage 2

Tired of writing this? 🤮

```javascript
const data = JSON.parse(localStorage.getItem("settings"));
data.count += 1;
localStorage.setItem("settings", JSON.stringify(data));
```

But what if, WHAT IF, you can *just* do **this↓**

```javascript
settings.count += 1;
```

### Core Features

- 🪄 **Deep Reactive Proxy**: Modify any nested property, and it saves automatically.
- 🏗️ **Innovative Flat Storage**: Breaks down nested JSON objects into flat Key-Value pairs. No need to serialize the entire object just to update a deep property!
- ⚡ **Smart Debouncing**: Automatically merges frequent writes (like array operations) for extreme performance.
- 🔒 **Type Safety**: Blocks un-storable values (like `undefined` or `function`) to keep your storage safe.
- 🌐 **Framework Agnostic**: Works in any vanilla JS or framework environment.

## 🚀 Try it now

```typescript
{{TEST}}
```

---

## 🌍 Unstorage: Any KV Backend as a JSON Object

`FlatUnstorage` adapts an [unstorage](https://unstorage.unjs.io/) instance into a `FlatJSONStorage`. This lets you treat **any** key-value backend — memory, filesystem, Redis, HTTP, Vercel KV, etc. — as a plain nested JSON object:

```typescript
import { FlatUnstorage } from "./storage.js";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";
// or memory: import memoryDriver from "unstorage/drivers/memory";

const storage = createStorage({ driver: fsDriver({ base: "./data" }) });
const flat = new FlatUnstorage({ storage });

await flat.init();
await flat.load("");          // unstorage is async: always await load() or use flat.get`...`

flat.data.user = { name: "alice", prefs: { theme: "dark" } };
flat.data.count = (flat.data.count ?? 0) + 1;
```

### ⚠️ Async & serialization caveats

- **Always async**: unstorage's `getItem`/`setItem` are Promise-based, so direct synchronous reads after a cache miss throw (`Key not loaded ... requires 'await load()'`). Call `await flat.load("")` up front, or use the template-tag getter `await flat.get\`key\``.
- **String round-trip**: unstorage's default serializer stores primitives via `String()` and parses with `destr`. String literals like `"{}"`, `"[]"`, `"0"`, `"true"`, `"null"` come back as their non-string types — avoid storing those exact strings through `FlatUnstorage`.
- **Key normalization**: unstorage rewrites `/`, `\`, `?` and strips leading/trailing `:` in keys. Property names containing those characters will be remapped (and `a/b` collides with `a:b`).

---

## 🧠 Under the Hood: Deep Proxy & Flat Schema

How does the magic work?

1. **Deep Proxy**: We intercept all `get`, `set`, and `delete` operations on the object, tracking the exact path (e.g., `["user", "profile", "name"]`).
2. **Schema-Driven Flat Structure**: In `FlatJSONStorage`, we maintain a schema to flatten nested JSON objects in the storage layer. When you modify `data.a.b.c`, only the `a.b.c` key is updated in the adapter. Say goodbye to the performance nightmare of saving the whole object!

---

## 🗺 Roadmap

This project is under active development, but the current version is stable and usable.

- [x] Whole JSON Storage (`WebStorageItemStorage`)
- [x] localStorage / sessionStorage adaptation
- [x] Flat Storage Engine (`FlatJSONStorage` / `FlatWebStorage`)
- [x] Any unstorage KV backend (`FlatUnstorage`)
- [x] Smart debouncing for array operations
- [x] Schema-based deep property traversal and loading
- [x] Synchronous read flat storage
- [x] Docs

This is the initial roadmap. See Github issues for more incoming.

*(XML storage was planned but dropped. We are focusing on making JSON storage perfect!)*

## 🤝 Contributing

Issues, PRs, and suggestions are super welcome! Let's make state persistence elegant, together!

## 🛠 Development

Repo layout:

- `storage.js` is the **source of truth**: hand-written JS with `//@ts-check` + JSDoc types. There is no `.ts` source; `tsconfig.json` type-checks the project (`storage.js` + `test.ts`) via `checkJs`, `scripts/tsconfig.json` type-checks the tooling scripts, and `tsconfig.build.json` emits `storage.d.ts` from `storage.js` only.
- `storage.d.ts` is **generated** by `tsc` (`emitDeclarationOnly`) and committed — rebuild, don't hand-edit.
- `README.md` is **generated** by `scripts/buildDocs.ts` from `README_template.md` + `test.ts` + `storage.d.ts` — edit `README_template.md`, never `README.md`.
- `test.ts` is the only test file (plain `node:assert` + console runner, no test framework).
- `typedoc.json` builds the showcase site with **TypeDoc** (API docs from the `storage.js` JSDoc, this README as front page) — `buildDocs.ts` runs it via `pnpm site`, so `pnpm build` outputs `docs/dist` in one flow.

## 📚 Reference

```typescript
{{DTS}}
```

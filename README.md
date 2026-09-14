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

```sh
npm i @54145a/storage2
```

Three storage flavors, one ergonomic idea: edit a plain object and it persists. The tour below is real, executed code (`example.js` — run it yourself with `pnpm example`):

```js
// Runnable tour of @54145a/storage2. This file is the source of the
// "🚀 Try it now" block in README.md (injected by scripts/buildDocs.ts).
// Run it with: pnpm example
import assert from "node:assert/strict";
import { WebStorageItemStorage, FlatWebStorage, FlatUnstorage } from "./storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

localStorage.clear();

// 1) WebStorageItemStorage — one localStorage key, read/written as a plain object.
const settings = new WebStorageItemStorage("settings", localStorage);
settings.data.count = (settings.data.count ?? 0) + 1;
settings.data.user = { name: "alice", prefs: { theme: "dark" } };
settings.data.user.prefs.theme = "light"; // deep write, no re-serialize
await settings.update(); // flush now; otherwise it auto-flushes ~100ms later
console.log("[1] raw localStorage:", localStorage.getItem("settings"));
assert.equal(JSON.parse(localStorage.getItem("settings") ?? "{}").user.prefs.theme, "light");

// 2) FlatWebStorage — nested JSON flattened to one KV per leaf: only the
// touched leaf is written, so updating a deep property never re-serializes
// the whole object.
const flat = new FlatWebStorage({ namespace: "app", instance: localStorage });
await flat.init();
await flat.load("");
flat.data.count = 10;
flat.data.config = { display: { brightness: 80 } };
flat.data.config.display.brightness = 100; // persists just this leaf
flat.data.tags ??= [];
flat.data.tags.push("a", "b"); // array writes are merged/debounced
console.log("[2] brightness:", await flat.get`config.display.brightness`);
console.log("[2] tags:      ", await flat.get`tags`);
console.log("[2] top keys:  ", flat.getSubKeys(""));
assert.equal(await flat.get`config.display.brightness`, 100);
assert.deepEqual(await flat.get`tags`, ["a", "b"]);

// 3) FlatUnstorage — the same object syntax over any unstorage backend
// (memory here; swap in fs / redis / HTTP / Vercel KV, ...). unstorage is
// async, so always `await load()` up front or read via `flat.get`.
const kv = new FlatUnstorage({ storage: createStorage({ driver: memory() }) });
await kv.init();
await kv.load("");
kv.data.user = { name: "bob", prefs: { theme: "solarized" } };
console.log("[3] theme:", await kv.get`user.prefs.theme`);
assert.equal(await kv.get`user.prefs.theme`, "solarized");

console.log("\n🎉 example.js ran clean — all assertions passed.");
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
- `README.md` is **generated** by `scripts/buildDocs.ts` from `README_template.md` + `example.js` + `storage.d.ts` — edit `README_template.md`, never `README.md`.
- `example.js` is the runnable quick-start injected into the "Try it now" section — it's executed by `pnpm example` and type-checked by `tsc`, so the README examples can't drift from real behavior.
- `test.ts` is the test file (plain `node:assert` + console runner, no test framework).
- `typedoc.json` builds the showcase site with **TypeDoc** (API docs from the `storage.js` JSDoc, this README as front page) — `buildDocs.ts` runs it via `pnpm site`, so `pnpm build` outputs `docs/dist` in one flow.

## 📚 Reference

```typescript
/**
 * @author 145a
 * @license AGPL-3.0
 */
export type DeepProxyHandler = {
    has?: (target: Object, key: string) => boolean;
    get?: (target: Object, key: string, receiver: Object) => any;
    set?: (target: Object, key: string, value: any, receiver: Object | undefined) => boolean;
    deleteProperty?: (target: Object, key: string) => boolean;
    ownKeys?: (target: Object, key: string) => string[];
    getOwnPropertyDescriptor?: (target: Object, key: string, prop: string | symbol) => PropertyDescriptor | undefined;
};
/**
 * @typedef {object} DeepProxyHandler
 * @property {(target: Object, key: string) => boolean} [has]
 * @property {(target: Object, key: string, receiver: Object) => any} [get]
 * @property {(target: Object, key: string, value: any, receiver: Object|undefined) => boolean} [set]
 * @property {(target: Object, key: string) => boolean} [deleteProperty]
 * @property {(target: Object, key: string) => string[]} [ownKeys]
 * @property {(target: Object, key: string, prop: string | symbol) => PropertyDescriptor | undefined} [getOwnPropertyDescriptor]
 */
/**
 * @see createFullDeepProxy
 */
declare class DeepProxyWrapExempt {
    value: any;
    /**
     * @param {*} value
     */
    constructor(value: any);
}
/**
 * The lightweight deep proxy: only the traps a JSON cache actually needs
 * (`set`, `deleteProperty`). No path tracking, no get trap, no pass-through
 * `has` / `ownKeys` / `getOwnPropertyDescriptor` traps — those fall back to
 * V8's native default path, keeping key enumeration and spread fast. Every
 * reachable nested value must already be wrapped by the caller (`_eagerWrap`)
 * so reads are pure native property access through the proxy boundary.
 * Used by `JSONDebounceStorage`; for schema-driven virtual keys see
 * {@link createFullDeepProxy}.
 * @param {object} target
 * @param {DeepProxyHandler} handler
 * @returns {*}
 */
declare function createLightDeepProxy(target: object, handler: DeepProxyHandler): any;
declare class StorageInterface {
    scheduledUpdate: boolean | undefined;
    /**
     * @param {*} observed
     * @returns {*}
     */
    static getRaw(observed: any): any;
    constructor();
    /** @returns {Promise<void>|void} */
    init(): Promise<void> | void;
    isReady: boolean;
    assertReady(): void;
    /** @type {any} */
    _data: any;
    get data(): any;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    updateTimerID: ReturnType<typeof setTimeout> | undefined;
    update(): Promise<void>;
}
/**
 * A storage wrapper that buffers writes: mutations are flushed to `updator` at most
 * once per `updateDelayMs` (default 100ms) after the last change. Reads always come
 * from the in-memory cache (immediately visible); the raw backing store lags by up
 * to `updateDelayMs`. Wait that long before asserting on the raw storage.
 */
declare class DebounceStorage extends StorageInterface {
    updator: (value: any) => Promise<void> | void;
    updateDelayMs: number;
    /**
     * @param {Exclude<any, undefined>} initialValue
     * @param {(value: any)=>Promise<void>|void} updator
     * @param {number} updateDelayMs
     * @param {boolean} structuredCloneExempt When `true`, the user guarantees they
     * will not modify `initialValue` after construction, so the cache holds the
     * original object directly (no clone). Without this flag (the default), the
     * user may freely modify their object, so we `structuredClone` it to keep
     * an isolated private cache. Eager proxy wrapping is always applied regardless.
     */
    constructor(initialValue: Exclude<any, undefined>, updator: (value: any) => Promise<void> | void, updateDelayMs?: number, structuredCloneExempt?: boolean);
    /** @returns {Promise<void>|void} */
    init(): Promise<void> | void;
    /** @protected */
    protected _cache: {};
    get cache(): {};
    scheduledUpdate: boolean;
    abort(): void;
    update(): Promise<void>;
    requestUpdate(): void;
}
/**
 * @extends {DebounceStorage}
 */
declare class JSONDebounceStorage extends DebounceStorage {
    /**
     * @param {object} initialValue
     * @param {(value: Object)=>Promise<void>|void} updator
     * @param {{updateDelayMs?: number, structuredCloneExempt?: boolean,	onSet?: (value: Object, key: string)=>void}} options
     * `onSet` is called with the assigned value and the leaf property name
     * (e.g. `"theme"`), NOT a dotted path (e.g. `"user.profile.theme"`).
     * It fires only when the value actually changes — identical-value
     * assignments are short-circuited before reaching `onSet`.
     */
    constructor(initialValue: object, updator: (value: Object) => Promise<void> | void, { updateDelayMs, structuredCloneExempt, onSet }?: {
        updateDelayMs?: number;
        structuredCloneExempt?: boolean;
        onSet?: (value: Object, key: string) => void;
    });
    /**
     * Recursively replace every nested JSON object/array in `obj` with its
     * light proxy, so that all values reachable from the cache are already
     * wrapped and reads need no `get` trap.
     * @param {Record<string, any>} obj
     * @param {DeepProxyHandler} handler
     */
    static _eagerWrap(obj: Record<string, any>, handler: DeepProxyHandler): void;
    /** @type {ReturnType<typeof createLightDeepProxy>} */
    _data: ReturnType<typeof createLightDeepProxy>;
}
export type FlatStorageAdapter = {
    get: (key: string) => Promise<any> | any;
    set: (key: string, value: any) => Promise<void> | void;
    delete: (key: string) => Promise<void> | void;
};
export type FlatSchemaValueType = "0" | "{}" | "[]";
declare class FlatJSONStorage extends StorageInterface {
    /** @type {FlatStorageAdapter} */
    adapter: FlatStorageAdapter;
    /** @type {{ [k: string]: any }} */
    schema: {
        [k: string]: any;
    };
    /** @type {Map<string, any>} */
    cache: Map<string, any>;
    /** @type {Map<string, string[]>} */
    _splitCache: Map<string, string[]>;
    /** @type {Map<string, Function>} */
    _accessorCache: Map<string, Function>;
    /** @type {Map<string, JSONDebounceStorage>} */
    arrayDebouncers: Map<string, JSONDebounceStorage>;
    /** @type {WeakMap<JSONDebounceStorage, DeepProxyWrapExempt>} */
    _arrayWrappers: WeakMap<JSONDebounceStorage, DeepProxyWrapExempt>;
    /**
     * @type {DeepProxyHandler & { set: NonNullable<DeepProxyHandler["set"]>}}
     * @readonly
     */
    _handler: DeepProxyHandler & {
        set: NonNullable<DeepProxyHandler["set"]>;
    };
    schemaStorage: JSONDebounceStorage | undefined;
    /**
     * @param {FlatStorageAdapter} adapter
     * @param {object} [options]
     * @param {string} [options.namespace]
     */
    constructor(adapter: FlatStorageAdapter, options?: {
        namespace?: string;
    });
    /** @override */
    init(): Promise<void>;
    /**
     * @param {string} key
     */
    _clearCache(key: string): Promise<void>;
    /**
     * @param {string} [key=""]
     * @returns {string[]}
     */
    getSubKeys(key?: string): string[];
    /**
     * @param {string} key
     */
    _deleteSchemaNode(key: string): void;
    /** @param {string} key */
    _getSchemaNode(key: string): any;
    /**
     * @param {string} key
     * @returns {DeepProxyWrapExempt}
     */
    _getArrayWrapper(key: string): DeepProxyWrapExempt;
    /**
     * @param {string} key
     * @param {any[]} [initialArr]
     * @returns {JSONDebounceStorage}
     */
    _getArrayDebouncer(key: string, initialArr?: any[]): JSONDebounceStorage;
    /**
     * @param {string} key
     */
    _abortArrayDebouncer(key: string): void;
    /**
     * Loads a key (or subtree) from the adapter into the cache, returning the value.
     * Synchronous when the key is already cached (or the adapter is synchronous);
     * returns a Promise otherwise. On an async adapter, reading `flat.data.<key>`
     * after a cache miss throws `Key not loaded ... 'await load()'` — await this first.
     * @param {string} [key=""]
     */
    load(key?: string): any;
    /**
     * Template-tag getter: `flat.get\`count\`` or `flat.get\`config.display.brightness\``.
     * Always async — awaits `load()` and returns the value (array keys unwrap to the raw array).
     * @param {readonly string[]} strings
     * @param {readonly any[]} keys
     */
    get(strings: readonly string[], ...keys: readonly any[]): Promise<any>;
    /**
     * @param {string} key
     */
    delete(key?: string): Promise<void>;
}
/**
 * @extends {JSONDebounceStorage}
 */
declare class WebStorageItemStorage extends JSONDebounceStorage {
    /**
     * @param {string} itemName
     * @param {Storage} instance
     * @param {number=} updateDelayMs
     */
    constructor(itemName: string, instance: Storage, updateDelayMs?: number | undefined);
}
declare class FlatWebStorage extends FlatJSONStorage {
    /**
     * @param {object} options
     * @param {string} [options.namespace]
     * @param {Storage} options.instance
     */
    constructor(options: {
        namespace?: string;
        instance: Storage;
    });
}
declare class FlatUnstorage extends FlatJSONStorage {
    /**
     * @param {object} [options]
     * @param {ReturnType<typeof import("unstorage").createStorage>} [options.storage] An unstorage instance.
     * @param {string} [options.namespace]
     */
    constructor(options?: {
        storage?: ReturnType<typeof import("unstorage").createStorage>;
        namespace?: string;
    });
}
export { WebStorageItemStorage, StorageInterface, FlatJSONStorage, FlatWebStorage, FlatUnstorage };
```

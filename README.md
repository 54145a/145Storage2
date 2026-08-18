# 📦 145 Storage 2: My KV is a **plain Object**

[![npm version](https://img.shields.io/npm/v/@54145a/storage2.svg)](https://www.npmjs.com/package/@54145a/storage2)[![license](https://img.shields.io/npm/l/@54145a/storage2.svg)](./LICENSE)[![GitHub stars](https://img.shields.io/github/stars/54145a/145Storage2.svg)](https://github.com/54145a/145Storage2)
> A lightweight, smart JavaScript storage library that makes state persistence as easy as modifying a plain object.

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
import assert from "node:assert/strict";
import { WebStorageItemStorage, FlatWebStorage, FlatUnstorage } from "./storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";


// #region Test Harness
async function test(name: string, fn: () => void | Promise<void>) {
  console.log(`  ▶ ${name}`);
  await fn();
  console.log(`  ✅ ${name}`);
}

function clearLocalStorage() {
  localStorage.clear();
}
// #endregion

// #region WebStorageItemStorage Tests
console.info("\n========================================");
console.info("WebStorageItemStorage");
console.info("========================================");

await test("should auto-persist data on property set", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_settings", localStorage);
  storage.data.count = 42;
  // Allow debounce flush
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_settings") || "{}");
  assert.equal(raw.count, 42);
});

await test("should load existing data from localStorage", async () => {
  clearLocalStorage();
  localStorage.setItem("test_existing", JSON.stringify({ name: "alice", level: 5 }));
  const storage = new WebStorageItemStorage("test_existing", localStorage);
  assert.equal(storage.data.name, "alice");
  assert.equal(storage.data.level, 5);
});

await test("should initialize with empty object when key missing", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_missing", localStorage);
  assert.deepEqual(storage.data, {});
});

await test("should persist nested object modifications", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_nested", localStorage);
  storage.data.user = { name: "bob", prefs: { theme: "dark" } };
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_nested") || "{}");
  assert.equal(raw.user.prefs.theme, "dark");
});

await test("should handle delete property", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_delete", localStorage);
  storage.data.a = 1;
  storage.data.b = 2;
  await new Promise((r) => setTimeout(r, 150));
  delete storage.data.a;
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_delete") || "{}");
  assert.equal(raw.a, undefined);
  assert.equal(raw.b, 2);
});
// #endregion

// #region FlatWebStorage Tests

console.info("\n========================================");
console.info("FlatWebStorage");
console.info("========================================");

await test("init should complete without error", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_init", instance: localStorage });
  await flat.init();
  assert.equal(flat.isReady, true);
});

await test("should store and retrieve a simple value", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_simple", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.count = 10;
  await new Promise((r) => setTimeout(r, 150));
  const val = await flat.get`count`;
  assert.equal(val, 10);
});

await test("should handle array push with debouncing", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_arr", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.items ??= [];
  flat.data.items.push("a");
  flat.data.items.push("b");
  flat.data.items.push("c");
  await new Promise((r) => setTimeout(r, 150));
  const items = await flat.get`items`;
  assert.deepEqual(items, ["a", "b", "c"]);
});

await test("template string get should return correct value", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_tpl", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.username = "charlie";
  await new Promise((r) => setTimeout(r, 150));
  const result = await flat.get`username`;
  assert.equal(result, "charlie");
});

await test("sync read via proxy after cache clear should work", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_sync", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.val = 99;
  await new Promise((r) => setTimeout(r, 150));
  flat.cache.clear();
  flat.arrayDebouncers.clear();
  const syncVal = flat.data.val;
  assert.equal(syncVal, 99);
});

await test("load() should return synchronously for cached keys", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_loadsync", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.x = 7;
  await new Promise((r) => setTimeout(r, 150));
  // Already loaded, so load("x") should be synchronous
  const result = flat.load("x");
  assert.equal(result instanceof Promise, false, "load('x') should be synchronous when cached");
  assert.equal(result, 7);
});

await test("delete should remove a key", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_del", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.toRemove = "bye";
  await new Promise((r) => setTimeout(r, 150));
  await flat.delete("toRemove");
  const val = await flat.get`toRemove`;
  assert.equal(val, undefined);
});

await test("getSubKeys should list child keys", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_subkeys", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.alpha = 1;
  flat.data.beta = 2;
  flat.data.gamma = 3;
  await new Promise((r) => setTimeout(r, 150));
  const keys = flat.getSubKeys("");
  assert.ok(keys.includes("alpha"), `Expected 'alpha' in subkeys, got: [${keys}]`);
  assert.ok(keys.includes("beta"), `Expected 'beta' in subkeys, got: [${keys}]`);
  assert.ok(keys.includes("gamma"), `Expected 'gamma' in subkeys, got: [${keys}]`);
});

await test("getSubKeys on empty FLAT_LINK should return [] not string indices", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_emptylink", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.config = {};
  await new Promise((r) => setTimeout(r, 150));
  const keys = flat.getSubKeys("config");
  assert.deepEqual(keys, [], `Expected empty subkeys for empty FLAT_LINK, got: [${keys}]`);
});

await test("nested object deep set should auto-persist leaf", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_deep", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.config = { display: { brightness: 80 } };
  await new Promise((r) => setTimeout(r, 150));
  flat.data.config.display.brightness = 100;
  await new Promise((r) => setTimeout(r, 150));
  const brightness = await flat.get`config.display.brightness`;
  assert.equal(brightness, 100);
});

await test("multiple namespaces should be isolated", async () => {
  clearLocalStorage();
  const flatA = new FlatWebStorage({ namespace: "iso_a", instance: localStorage });
  const flatB = new FlatWebStorage({ namespace: "iso_b", instance: localStorage });
  await flatA.init();
  await flatB.init();
  await flatA.load("");
  await flatB.load("");
  flatA.data.key = "fromA";
  flatB.data.key = "fromB";
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flatA.get`key`, "fromA");
  assert.equal(await flatB.get`key`, "fromB");
});
// #endregion

// #region FlatUnstorage Tests

function makeUnstorage() {
  return createStorage({ driver: memory() });
}

console.info("\n========================================");
console.info("FlatUnstorage");
console.info("========================================");

await test("unstorage: store and retrieve a simple value", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.count = 10;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flat.get`count`, 10);
});

await test("unstorage: can construct from a storage instance", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.x = 42;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flat.get`x`, 42);
});

await test("unstorage: persists across instances", async () => {
  const storage = makeUnstorage();
  const flatA = new FlatUnstorage({ storage });
  await flatA.init();
  await flatA.load("");
  flatA.data.user = { name: "alice", prefs: { theme: "dark" } };
  await new Promise((r) => setTimeout(r, 150));

  const flatB = new FlatUnstorage({ storage });
  await flatB.init();
  await flatB.load("");
  assert.equal(await flatB.get`user.prefs.theme`, "dark");
});

await test("unstorage: namespaces are isolated", async () => {
  const storage = makeUnstorage();
  const flatA = new FlatUnstorage({ storage, namespace: "ns_a" });
  const flatB = new FlatUnstorage({ storage, namespace: "ns_b" });
  await flatA.init();
  await flatB.init();
  await flatA.load("");
  await flatB.load("");
  flatA.data.key = "fromA";
  flatB.data.key = "fromB";
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flatA.get`key`, "fromA");
  assert.equal(await flatB.get`key`, "fromB");
});

await test("unstorage: load() returns a Promise for async adapters", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.val = 99;
  await new Promise((r) => setTimeout(r, 150));
  flat.cache.clear();
  flat.arrayDebouncers.clear();
  const result = flat.load("val");
  assert.equal(result instanceof Promise, true, "load() should be async for unstorage");
  assert.equal(await result, 99);
});

await test("unstorage: sync read after cache clear throws", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.val = 99;
  await new Promise((r) => setTimeout(r, 150));
  flat.cache.clear();
  flat.arrayDebouncers.clear();
  assert.throws(() => { flat.data.val; }, /not loaded/);
});

await test("unstorage: delete should remove a key", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.toRemove = "bye";
  await new Promise((r) => setTimeout(r, 150));
  await flat.delete("toRemove");
  assert.equal(await flat.get`toRemove`, undefined);
});

await test("unstorage: array push with debouncing", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.items ??= [];
  flat.data.items.push("a");
  flat.data.items.push("b");
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(await flat.get`items`, ["a", "b"]);
});

await test("unstorage: requires storage or driver", () => {
  // @ts-ignore - testing that missing storage throws
  assert.throws(() => new FlatUnstorage({}), /storage/i);
});
// #endregion

// #region Done
console.info("\n🎉 All tests passed!");
// #endregion
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
 * @see createDeepProxy
 */
declare class DeepProxyWrapExempt {
    value: any;
    /**
     * @param {*} value
     */
    constructor(value: any);
}
/**
 * Creates a deep Proxy that reports every property access as a dot-separated key
 * (e.g. `"user.profile.name"`) to `handler`, nesting a proxy for each object.
 * Symbol properties are NOT supported — they're ignored with a `console.assert`
 * notice and never reach `handler`.
 * @param {object} target
 * @param {DeepProxyHandler} handler
 * @param {string} [currentKey=""]
 * @returns {*}
 */
declare function createDeepProxy(target: object, handler: DeepProxyHandler, currentKey?: string): any;
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
     * @param {boolean} structuredCloneExempt Use raw initialValue as cache. DO NOT MODIFY THE OBJECT EVER IF YOU ENABLE THIS.
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
declare class JSONDebounceStorage extends DebounceStorage {
    /**
     * @param {object} initialValue
     * @param {(value: Object)=>Promise<void>|void} updator
     * @param {{updateDelayMs?: number, structuredCloneExempt?: boolean,	onSet?: (value: Object, key: string)=>void}} options
     */
    constructor(initialValue: object, updator: (value: Object) => Promise<void> | void, { updateDelayMs, structuredCloneExempt, onSet }?: {
        updateDelayMs?: number;
        structuredCloneExempt?: boolean;
        onSet?: (value: Object, key: string) => void;
    });
    /** @type {ReturnType<typeof createDeepProxy>} */
    _data: ReturnType<typeof createDeepProxy>;
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
     * @param {object} options
     * @param {ReturnType<typeof import("unstorage").createStorage>} options.storage An unstorage instance.
     * @param {string} [options.namespace]
     */
    constructor(options: {
        storage: ReturnType<typeof import("unstorage").createStorage>;
        namespace?: string;
    });
}
export { WebStorageItemStorage, StorageInterface, FlatJSONStorage, FlatWebStorage, FlatUnstorage };
```

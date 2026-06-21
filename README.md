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

```javascript
import { WebStorageItemStorage, FlatWebStorage } from "@54145a/storage2/storage.js";
const flatLocalStorage = new FlatWebStorage({ namespace: "test", instance: localStorage });
await flatLocalStorage.init();
console.log("Synchronously read count from proxy:", flatLocalStorage.data.count);
```

See `test.js` for more examples!

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
- [x] Smart debouncing for array operations
- [x] Schema-based deep property traversal and loading
- [x] Synchronous read flat storage
- [x] Docs

This is the initial roadmap. See Github issues for more incoming.

*(XML storage was planned but dropped. We are focusing on making JSON storage perfect!)*

## 🤝 Contributing

Issues, PRs, and suggestions are super welcome! Let's make state persistence elegant, together!

## 📚 Reference

```typescript
/**
 * @author 145a
 * @license AGPL-3.0
 */
export type DeepProxyHandler = {
    has?: (target: Object, path: readonly string[]) => boolean;
    get?: (target: Object, path: readonly string[], receiver: Object) => any;
    set?: (target: Object, path: readonly string[], value: any, receiver: Object | undefined) => boolean;
    deleteProperty?: (target: Object, path: readonly string[]) => boolean;
    ownKeys?: (target: Object, path: readonly string[]) => string[];
    getOwnPropertyDescriptor?: (target: Object, path: readonly string[], prop: string | symbol) => PropertyDescriptor | undefined;
};
/**
 * @param {object} target
 * @param {DeepProxyHandler} handler
 * @param {readonly string[]} [currentPath=[]]
 * @returns {*}
 */
declare function createDeepProxy(target: object, handler: DeepProxyHandler, currentPath?: readonly string[]): any;
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
    /** @type {number|undefined} */
    updateTimerID: number | undefined;
    update(): Promise<void>;
}
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
     * @param {{updateDelayMs?: number, structuredCloneExempt?: boolean,	onSet?: (value: Object, path: readonly string[])=>void}} options
     */
    constructor(initialValue: object, updator: (value: Object) => Promise<void> | void, { updateDelayMs, structuredCloneExempt, onSet }?: {
        updateDelayMs?: number;
        structuredCloneExempt?: boolean;
        onSet?: (value: Object, path: readonly string[]) => void;
    });
    /** @type {ReturnType<typeof createDeepProxy>} */
    _data: ReturnType<typeof createDeepProxy>;
}
export type StorageUpdater = (name: string, data: Object) => void;
/** @deprecated */
declare class JSONStorageAdaptor {
    initialValueGetter: (name: string) => Promise<Object> | Object;
    updater: StorageUpdater;
    /**
     * @typedef {(name: string, data: Object)=>void} StorageUpdater
     * @param {(name: string)=>Promise<Object>|Object} initialValueGetter
     * @param {StorageUpdater} updater
     */
    constructor(initialValueGetter: (name: string) => Promise<Object> | Object, updater: StorageUpdater);
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
    /** @type {Map<string, JSONDebounceStorage>} */
    arrayDebouncers: Map<string, JSONDebounceStorage>;
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
     * @param {readonly string[]} path
     */
    _clearCache(path: readonly string[]): Promise<void>;
    /**
     * @param {string} [key=""]
     * @returns {string[]}
     */
    getSubKeys(key?: string): string[];
    /**
     * @param {readonly string[]} path
     */
    _deleteSchemaNode(path: readonly string[]): void;
    /** @param {readonly string[]} path */
    _getSchemaNode(path: readonly string[]): {
        [k: string]: any;
    } | undefined;
    /** @deprecated */
    getSchema(): {
        [k: string]: any;
    };
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
     * @param {string} [key=""]
     */
    load(key?: string): any;
    /**
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
/** @deprecated */
declare class StorageHelper {
    updateDelayMs: number;
    constructor(updateDelayMs?: number);
    /**
     * @deprecated
     * @param {string} name
     * @param {JSONStorageAdaptor} adaptor
     * @returns {Promise<any>}
     */
    getStorage(name: string, adaptor: JSONStorageAdaptor): Promise<any>;
    /** @deprecated */
    static ADAPTORS: {
        LOCAL_STORAGE: JSONStorageAdaptor;
    };
}
export { 
/** @deprecated */ JSONStorageAdaptor, 
/** @deprecated */ JSONStorageAdaptor as StorageAdaptor, WebStorageItemStorage, StorageHelper, StorageInterface, FlatJSONStorage, FlatWebStorage };
```

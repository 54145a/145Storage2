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
    _getSchemaNode(key: string): {
        [k: string]: any;
    } | undefined;
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
     * @param {ReturnType<typeof import("unstorage").createStorage>} [options.storage] An existing unstorage instance.
     * @param {NonNullable<Parameters<typeof import("unstorage").createStorage>[0]>["driver"]} [options.driver] A unstorage driver used to create a storage from when `options.storage` is not given.
     * @param {string} [options.namespace]
     */
    constructor(options?: {
        storage?: ReturnType<typeof import("unstorage").createStorage>;
        driver?: NonNullable<Parameters<typeof import("unstorage").createStorage>[0]>["driver"];
        namespace?: string;
    });
}
export { WebStorageItemStorage, StorageInterface, FlatJSONStorage, FlatWebStorage, FlatUnstorage };

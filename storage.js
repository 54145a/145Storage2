//@ts-check
/**
 * @author 145a
 * @license AGPL-3.0
 */

//#region 
class ProxyCacheEntry {
	/** 
	 * @param {object} proxy 
	 * @param {string} firstKey
	 * @param {DeepProxyHandler} handler
	 */
	constructor(proxy, firstKey, handler) {
		this.proxy = proxy;
		this.firstKey = firstKey;
		this.handler = handler;
		Object.freeze(this);
	}
}
/** @type {WeakMap<object, ProxyCacheEntry>} */
const lightDeepProxyCache = new WeakMap();
/** @type {WeakMap<object, ProxyCacheEntry>} */
const fullDeepProxyCache = new WeakMap();
/** @type {WeakSet<object>} */
const knownDeepProxies = new WeakSet();

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
class DeepProxyWrapExempt {
	/** 
	 * @param {*} value 
	 */
	constructor(value) {
		this.value = value;
	}
}

/**
 * @param {*} prop
 */
/** @type {Set<symbol>} */
const builtInSymbols = new Set();
for (const key of Object.getOwnPropertyNames(Symbol)) {
	try {
		const val = /** @type {any} */ (Symbol)[key];
		if (typeof val === "symbol") builtInSymbols.add(val);
	} catch { }
}
for (const key of Object.getOwnPropertyNames(Symbol.prototype)) {
	try {
		const val = /** @type {any} */ (Symbol.prototype)[key];
		if (typeof val === "symbol") builtInSymbols.add(val);
	} catch { }
}

const assertSymbol = (/** @type {string|symbol} */ prop) => {
	if (typeof prop === "symbol" && !builtInSymbols.has(prop)) {
		console.assert(false,
			`Symbol("${Symbol.keyFor(prop) || prop.description}") is not a built-in Symbol ` +
			`and is not supported by createFullDeepProxy. ` +
			`JSON storage cannot serialize Symbol properties.`
		);
	}
};
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
function createLightDeepProxy(target, handler) {
	const cacheEntry = lightDeepProxyCache.get(target);
	if (cacheEntry && cacheEntry.handler === handler) {
		return cacheEntry.proxy;
	}
	const proxy = new Proxy(target, {
		set(obj, prop, value, receiver) {
			if (handler.set) return handler.set(obj, /** @type {string} */(prop), value, receiver);
			return Reflect.set(obj, prop, value, receiver);
		},
		deleteProperty(obj, prop) {
			if (handler.deleteProperty) return handler.deleteProperty(obj, /** @type {string} */(prop));
			return Reflect.deleteProperty(obj, prop);
		}
	});
	knownDeepProxies.add(proxy);
	lightDeepProxyCache.set(target, new ProxyCacheEntry(proxy, "", handler));
	return proxy;
}
/**
 * The full-featured deep proxy: reports every property access as a
 * dot-separated key (e.g. `"user.profile.name"`) to `handler` and implements
 * every trap (`has` / `ownKeys` / `getOwnPropertyDescriptor` included) so
 * schema-driven virtual keys work — this is what `FlatJSONStorage` runs on.
 * For the minimal fast path used by `JSONDebounceStorage` see
 * {@link createLightDeepProxy}. Symbol properties are prohibited (except the
 * 15 ECMAScript built-in Symbols like `Symbol.iterator`, `Symbol.toPrimitive`,
 * etc.). User-defined Symbols trigger a `console.assert` notice and are
 * silently ignored — they never reach `handler`. This is by design: JSON
 * storage cannot serialize Symbols.
 * @param {object} target
 * @param {DeepProxyHandler} handler
 * @param {string} [currentKey=""]
 * @returns {*}
 */
function createFullDeepProxy(target, handler, currentKey = "") {
	const cacheEntry = fullDeepProxyCache.get(target);
	if (cacheEntry) {
		if (cacheEntry.handler === handler && cacheEntry.firstKey === currentKey) {
			return cacheEntry.proxy;
		}
		console.warn(
			"[createFullDeepProxy] Same object with different context. Overwriting cache.",
			"Old handler/key:", cacheEntry.handler, cacheEntry.firstKey,
			"New handler/key:", handler, currentKey
		);
	}
	const proxy = new Proxy(target, {
		has(target, prop) {
			if (typeof prop === "symbol") { assertSymbol(prop); return Reflect.has(target, prop); }
			if (handler.has) return handler.has(target, currentKey === "" ? prop : currentKey + "." + prop);
			return Reflect.has(target, prop);
		},
		get(obj, prop, receiver) {
			if (typeof prop === "symbol") { assertSymbol(prop); return Reflect.get(obj, prop, receiver); }
			const key = currentKey === "" ? prop : currentKey + "." + prop;
			if (handler.get) {
				const result = handler.get(obj, key, receiver);
				if (result instanceof DeepProxyWrapExempt) return result.value;
				if (typeof result === "object" && result !== null && typeof result !== "function") {
					return createFullDeepProxy(result, handler, key);
				}
				return result;
			}
			const value = Reflect.get(obj, prop, receiver);
			if (typeof value === "object" && value !== null && typeof value !== "function") {
				return createFullDeepProxy(value, handler, key);
			}
			return value;
		},
		set(obj, prop, value, receiver) {
			if (typeof prop === "symbol") { assertSymbol(prop); return Reflect.set(obj, prop, value, receiver); }
			const key = currentKey === "" ? prop : currentKey + "." + prop;
			if (handler.set) return handler.set(obj, key, value, receiver);
			return Reflect.set(obj, prop, value, receiver);
		},
		deleteProperty(obj, prop) {
			if (typeof prop === "symbol") { assertSymbol(prop); return Reflect.deleteProperty(obj, prop); }
			if (handler.deleteProperty) return handler.deleteProperty(obj, currentKey === "" ? prop : currentKey + "." + prop);
			return Reflect.deleteProperty(obj, prop);
		},
		ownKeys(target) {
			if (handler.ownKeys) return handler.ownKeys(target, currentKey);
			return Reflect.ownKeys(target);
		},
		getOwnPropertyDescriptor(target, prop) {
			if (typeof prop === "symbol") { assertSymbol(prop); return Reflect.getOwnPropertyDescriptor(target, prop); }
			if (handler.getOwnPropertyDescriptor) return handler.getOwnPropertyDescriptor(target, currentKey === "" ? prop : currentKey + "." + prop, prop);
			return Reflect.getOwnPropertyDescriptor(target, prop);
		}
	});
	fullDeepProxyCache.set(target, new ProxyCacheEntry(proxy, currentKey, handler));
	return proxy;
}

/** @type { WeakRef<StorageInterface>[] } */
const registeredStorages = [];
class StorageInterface {
	/** 
	 * @param {*} observed 
	 * @returns {*} 
	 */
	static getRaw(observed) {
		if (typeof observed !== 'object' || observed === null) return observed;
		try {
			return JSON.parse(JSON.stringify(observed));
		} catch (e) {
			console.error("[StorageInterface] Failed to get raw value. Possibly unloaded keys or non-serializable data.", e);
			throw e;
		}
	}
	constructor() {
		const proto = Object.getPrototypeOf(this);
		for (const key of Object.getOwnPropertyNames(proto)) {
			const descriptor = Object.getOwnPropertyDescriptor(proto, key);
			if (descriptor?.set && !descriptor.get) {
				throw new TypeError();
			}
		}
		registeredStorages.push(new WeakRef(this));
	}
	/** @returns {Promise<void>|void} */
	init() { }
	isReady = false;
	assertReady() {
		if (!this.isReady) throw new Error("Storage not ready. Call .init() first.");
	}
	/** @type {any} */
	_data;
	get data() {
		return this._data;
	}
	/** @type {ReturnType<typeof setTimeout>|undefined} */
	updateTimerID;
	async update() {
		this.assertReady();
		this.scheduledUpdate = false;
	}
}
//#endregion
//#region 
/**
 * A storage wrapper that buffers writes: mutations are flushed to `updator` at most
 * once per `updateDelayMs` (default 100ms) after the last change. Reads always come
 * from the in-memory cache (immediately visible); the raw backing store lags by up
 * to `updateDelayMs`. Wait that long before asserting on the raw storage.
 */
class DebounceStorage extends StorageInterface {
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
	constructor(initialValue, updator, updateDelayMs = 100, structuredCloneExempt = false) {
		super();
		this._cache = structuredCloneExempt ? initialValue : structuredClone(initialValue);
		this.updator = updator;
		this.updateDelayMs = updateDelayMs;
	}
	/** @returns {Promise<void>|void} */
	init() {
		this.isReady = true;
	};
	/** @protected */
	_cache = {};
	get cache() {
		return this._cache;
	}
	scheduledUpdate = false;
	abort() {
		if (this.updateTimerID) {
			clearTimeout(this.updateTimerID);
			this.updateTimerID = undefined;
		}
		this.scheduledUpdate = false;
	}
	async update() {
		super.update();
		await this.updator(this._cache);
	}
	requestUpdate() {
		this.assertReady();
		if (!this.scheduledUpdate) {
			this.scheduledUpdate = true;
			this.updateTimerID = setTimeout(async () => {
				try {
					await this.update();
				} catch (e) {
					console.error(e);
				}
			}, this.updateDelayMs);
		}
	}
}

/**
 * @param {*} value 
 */
function isPlainObject(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
/**
 * @param {*} value
 * @returns {boolean}
 */
function isJSONValue(value) {
	if (value === null) return true;
	switch (typeof value) {
		case "string":
			return true;
		case "boolean":
			return true;
		case "number": return isFinite(value);
		case "object":
			if (Array.isArray(value)) {
				return value.every(item => isJSONValue(item));
			}
			if (isPlainObject(value)) {
				return Object.values(value).every(v => isJSONValue(v));
			}
			return false;
	}
	return false;
}
/**
 * @param {*} value 
 */
function isJSONStorageStorableValue(value) {
	return isJSONValue(value);
}

/**
 * @param {*} value
 * @param {...*} info
 */
function assertIsJSONStorageStorableValue(value, ...info) {
	if (!isJSONStorageStorableValue(value)) {
		console.error("Value is not JSON-storable:", value, ...info);
		throw new TypeError("Value not JSON-storable.");
	}
}

/**
 * @param {*} array
 * @param {...*} info
 */
function assertIsFlatJSONStorageStorableArray(array, ...info) {
	for (const item of array) {
		if (item === null) continue;
		const type = typeof item;
		if (type === 'number' && isFinite(item)) continue;
		if (type === 'string' || type === 'boolean') continue;
		console.error("[FlatJSONStorage] Array contains non-primitive value:", item, ...info);
		throw new TypeError("Non-primitive array.");
	}
}
/**
 * @extends {DebounceStorage}
 */
class JSONDebounceStorage extends DebounceStorage {
	/** 
	 * @param {object} initialValue
	 * @param {(value: Object)=>Promise<void>|void} updator
	 * @param {{updateDelayMs?: number, structuredCloneExempt?: boolean,	onSet?: (value: Object, key: string)=>void}} options
	 * `onSet` is called with the assigned value and the leaf property name
	 * (e.g. `"theme"`), NOT a dotted path (e.g. `"user.profile.theme"`).
	 * It fires only when the value actually changes — identical-value
	 * assignments are short-circuited before reaching `onSet`.
	 */
	constructor(initialValue, updator, { updateDelayMs, structuredCloneExempt, onSet = () => { } } = {}) {
		super(initialValue, updator, updateDelayMs, structuredCloneExempt);
		// --- Eager wrapping (always active) ---
		// Every reachable nested JSON object/array in the cache is replaced
		// with a light proxy (Valtio-style). The data proxy therefore needs
		// no `get` trap: reads are pure native property access through the
		// proxy boundary. This works even for structuredCloneExempt mode
		// because the proxy is transparent — reads from the user's own
		// reference behave identically to plain-object reads.
		const handler = {
			/**
			 * @param {object} target
			 * @param {string} prop
			 * @param {*} value
			 * @param {object|undefined} receiver
			 */
			set: (target, prop, value, receiver) => {
				if (Object.hasOwn(target, /** @type {string} */(prop)) && Object.is((/** @type {Record<string|symbol, any>} */ (target))[/** @type {string} */ (prop)], value)) return true;
				assertIsJSONStorageStorableValue(value);
				onSet(value, prop);
				this.requestUpdate();
				return Reflect.set(target, prop, toStoredValue(value), Array.isArray(target) ? target : receiver);
			},
			/**
			 * @param {object} target
			 * @param {string} prop
			 */
			deleteProperty: (target, prop) => {
				this.requestUpdate();
				return Reflect.deleteProperty(target, prop);
			}
		};
		/**
		 * JSON object/array values are stored wrapped in light proxies, so
		 * reads need no `get` trap. Already-wrapped values pass through.
		 * The assigned value's OWN nested objects/arrays are recursively
		 * wrapped too — otherwise reads would return raw inner values whose
		 * mutations bypass every trap (and persistence).
		 * @param {*} value
		 * @returns {*}
		 */
		function toStoredValue(value) {
			if (value === null || typeof value !== "object" || !(Array.isArray(value) || isPlainObject(value))) {
				return value;
			}
			if (knownDeepProxies.has(value)) return value;
			const proxy = createLightDeepProxy(value, handler);
			JSONDebounceStorage._eagerWrap(value, handler);
			return proxy;
		}
		this._data = createLightDeepProxy(this._cache, handler);
		JSONDebounceStorage._eagerWrap(this._cache, handler);
		this.init();
	}
	/**
	 * Recursively replace every nested JSON object/array in `obj` with its
	 * light proxy, so that all values reachable from the cache are already
	 * wrapped and reads need no `get` trap.
	 * @param {Record<string, any>} obj
	 * @param {DeepProxyHandler} handler
	 */
	static _eagerWrap(obj, handler) {
		for (const key of Object.keys(obj)) {
			const val = obj[key];
			if (val !== null && typeof val === "object" && !knownDeepProxies.has(val) && (Array.isArray(val) || isPlainObject(val))) {
				obj[key] = createLightDeepProxy(val, handler);
				JSONDebounceStorage._eagerWrap(val, handler);
			}
		}
	}
	/** @type {ReturnType<typeof createLightDeepProxy>} */
	_data;
}


//#endregion
//#region
const FLAT_SCHEMA_KEY = "__145Storage__flatSchema__";
/**
 * @typedef {object} FlatStorageAdapter 
 * @property {(key: string) => Promise<any> | any} get 
 * @property {(key: string, value: any) => Promise<void> | void} set 
 * @property {(key: string) => Promise<void> | void} delete 
 */
/**
 * @typedef {"0" | "{}" | "[]"} FlatSchemaValueType
 */

/**
 * @type {Record<string, FlatSchemaValueType>}
 */
const FlatSchemaValueType = {
	PRIMITIVE: "0",
	FLAT_LINK: "{}",
	DEBOUNCE_ARRAY: "[]"
};
const FlatSchemaValueTypeMarker = {
	[FlatSchemaValueType.PRIMITIVE]: 0,
	[FlatSchemaValueType.FLAT_LINK]: "{}",
	[FlatSchemaValueType.DEBOUNCE_ARRAY]: "[]"
}
/**
 * @param {*} node
 * @returns {FlatSchemaValueType|undefined} 
 */
function getSchemaNodeValueType(node) {
	if (node === undefined || node === null) return undefined;
	// New string markers
	if (node === "{}") return FlatSchemaValueType.FLAT_LINK;
	if (node === "[]") return FlatSchemaValueType.DEBOUNCE_ARRAY;
	if (isPlainObject(node)) return FlatSchemaValueType.FLAT_LINK;
	if (Array.isArray(node)) return FlatSchemaValueType.DEBOUNCE_ARRAY;
	// Fallback for primitive markers (currently number 0)
	return FlatSchemaValueType.PRIMITIVE;
}
/**
 * @param {*} node
 * @returns {boolean}
 */
function isSchemaLeafNode(node) {
	const type = getSchemaNodeValueType(node);
	return type === FlatSchemaValueType.PRIMITIVE || type === FlatSchemaValueType.DEBOUNCE_ARRAY;
}
/**
 * @param {*} result
 */
const handleAdapterResult = (result) => {
	if (result instanceof Promise) result.catch(console.error);
};
class FlatJSONStorage extends StorageInterface {
	/**
	 * @param {FlatStorageAdapter} adapter
	 * @param {object} [options]
	 * @param {string} [options.namespace]
	 */
	constructor(adapter, options = {}) {
		super();
		const { namespace } = options;
		if (namespace) {
			const rawAdapter = adapter;
			/** @type {FlatStorageAdapter} */
			this.adapter = {
				get: (key) => rawAdapter.get(`${namespace}:${key}`),
				set: (key, value) => rawAdapter.set(`${namespace}:${key}`, value),
				delete: (key) => rawAdapter.delete(`${namespace}:${key}`),
			};
		} else {
			this.adapter = adapter;
		}

		/** @type {JSONDebounceStorage} */
		this.schemaStorage;

		/** @type {{ [k: string]: any }} */
		this.schema = {};

		/** @type {Map<string, any>} */
		this.cache = new Map();

		/** @type {Map<string, string[]>} */
		this._splitCache = new Map();

		/** @type {Map<string, Function>} */
		this._accessorCache = new Map();

		/** @type {Map<string, JSONDebounceStorage>} */
		this.arrayDebouncers = new Map();

		/** @type {WeakMap<JSONDebounceStorage, DeepProxyWrapExempt>} */
		this._arrayWrappers = new WeakMap();

		/**
		 * @type {DeepProxyHandler & { set: NonNullable<DeepProxyHandler["set"]>}}
		 * @readonly
		 */
		this._handler = {
			has: (target, key) => {
				const schemaNode = this._getSchemaNode(key);
				return schemaNode !== undefined;
			},
			get: (target, key) => {
				this.assertReady();
				if (this.cache.has(key)) {
					const cached = this.cache.get(key);
					if (Array.isArray(cached)) return this._getArrayWrapper(key);
					return cached;
				}
				const schemaNode = this._getSchemaNode(key);
				const nodeType = getSchemaNodeValueType(schemaNode);
				if (nodeType === FlatSchemaValueType.FLAT_LINK) {
					const subTarget = {};
					this.cache.set(key, subTarget);
					return subTarget;
				}
				if (nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
					if (!this.arrayDebouncers.has(key)) {
						const loadResult = this.load(key);
						if (loadResult instanceof Promise) {
							throw new Error(`[FlatJSONStorage] Key not loaded (async adapter requires 'await load()'): "${key}".`);
						}
					}
					return this._getArrayWrapper(key);
				}
				if (nodeType === undefined) {
					return undefined;
				}

				const loadResult = this.load(key);
				if (loadResult instanceof Promise) {
					throw new Error(`[FlatJSONStorage] Key not loaded (async adapter requires 'await load()'): "${key}".`);
				}
				return this.cache.get(key);
			},
			set: (target, key, value) => {
				assertIsJSONStorageStorableValue(value, "flat key:", key);

				const oldSchemaNode = this._getSchemaNode(key);
				const oldNodeType = getSchemaNodeValueType(oldSchemaNode);

				/** @type FlatSchemaValueType */
				let newNodeType;
				if (isPlainObject(value)) newNodeType = FlatSchemaValueType.FLAT_LINK;
				else if (Array.isArray(value)) newNodeType = FlatSchemaValueType.DEBOUNCE_ARRAY;
				else newNodeType = FlatSchemaValueType.PRIMITIVE;

				const isOldBranch = oldNodeType === FlatSchemaValueType.FLAT_LINK || oldNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY;
				if (isOldBranch && !(oldNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY && newNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY)) {
					this._clearCache(key).catch(console.error);
				}

				let schemaTypeMarker = FlatSchemaValueTypeMarker[newNodeType];

				let parts = this._splitCache.get(key);
				if (!parts) { parts = key.split("."); this._splitCache.set(key, parts); }
				let node = this.schema;
				for (let i = 0; i < parts.length - 1; i++) {
					if (!node[parts[i]] || typeof node[parts[i]] !== "object") node[parts[i]] = {};
					node = node[parts[i]];
				}
				node[parts[parts.length - 1]] = schemaTypeMarker;

				if (newNodeType === FlatSchemaValueType.FLAT_LINK) {
					this.cache.set(key, {});
					for (const subKey of Object.keys(value)) {
						const childKey = key === "" ? subKey : `${key}.${subKey}`;
						this._handler.set(target, childKey, value[subKey], undefined);
					}
				} else if (newNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
					assertIsFlatJSONStorageStorableArray(value, "at key:", key);
					const debouncer = this._getArrayDebouncer(key, value);
					debouncer._data.splice(0, debouncer._data.length, ...value);
				} else {
					this.cache.set(key, value);
					try {
						handleAdapterResult(this.adapter.set(key, value));
					} catch (e) {
						console.error(e);
					}
				}
				return true;
			},
			deleteProperty: (target, key) => {
				const schemaNode = this._getSchemaNode(key);
				const nodeType = getSchemaNodeValueType(schemaNode);

				if (nodeType === FlatSchemaValueType.FLAT_LINK || nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
					this._clearCache(key).catch(console.error);
				}
				this.cache.delete(key);
				try {
					handleAdapterResult(this.adapter.delete(key));
				} catch (e) {
					console.error(e);
				}
				this._deleteSchemaNode(key);
				return true;
			},
			ownKeys: (target, key) => {
				const schemaNode = this._getSchemaNode(key);
				if (schemaNode && typeof schemaNode === "object") {
					return Object.keys(schemaNode);
				}
				return [];
			},
			getOwnPropertyDescriptor: (target, key, prop) => {
				const schemaNode = this._getSchemaNode(key);
				if (schemaNode !== undefined) {
					return { configurable: true, enumerable: true, writable: true, value: undefined };
				}
				return undefined;
			}
		}

		this._data = createFullDeepProxy({}, this._handler);
	}

	/** @override */
	async init() {
		const storedSchema = await this.adapter.get(FLAT_SCHEMA_KEY);
		const initialSchema = (storedSchema && typeof storedSchema === "object") ? storedSchema : {};

		this.schemaStorage = new JSONDebounceStorage(
			initialSchema,
			async (val) => { await this.adapter.set(FLAT_SCHEMA_KEY, val); },
			{ structuredCloneExempt: true }
		);
		this.schema = this.schemaStorage.data;

		this.isReady = true;
	}

	/**
	 * @param {string} key
	 */
	async _clearCache(key) {
		const node = this._getSchemaNode(key);
		const nodeType = getSchemaNodeValueType(node);
		if (nodeType === undefined) return;
		if (nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
			this._abortArrayDebouncer(key);
		}
		const subKeys = this.getSubKeys(key);
		/** @type {Promise<void>[]} */
		const deletePromises = [];
		for (const k of subKeys) {
			this.cache.delete(k);
			try {
				const p = this.adapter.delete(k);
				if (p instanceof Promise) deletePromises.push(p.catch(console.error));
			} catch (e) {
				console.error(e);
			}
			const flatNode = this._getSchemaNode(k);
			if (getSchemaNodeValueType(flatNode) === FlatSchemaValueType.DEBOUNCE_ARRAY) {
				this._abortArrayDebouncer(k);
			}
		}
		await Promise.all(deletePromises);
	}

	/**
	 * @param {string} [key=""]
	 * @returns {string[]}
	 */
	getSubKeys(key = "") {
		const node = this._getSchemaNode(key);
		if (node === undefined) return [];
		if (isSchemaLeafNode(node)) {
			return [key];
		}
		if (!isPlainObject(node)) return [];
		/** @type {string[]} */
		const keys = [];
		/**
		 * @param {{[k: string]: any}} currentNode
		 * @param {string} prefix
		 */
		const traverseSchema = (currentNode, prefix) => {
			for (const subKey of Object.keys(currentNode)) {
				const childKey = prefix === "" ? subKey : `${prefix}.${subKey}`;
				const childNode = currentNode[subKey];
				if (isSchemaLeafNode(childNode)) {
					keys.push(childKey);
				} else {
					traverseSchema(childNode, childKey);
				}
			}
		};
		traverseSchema(node, key);
		return keys;
	};

	/**
	 * @param {string} key
	 */
	_deleteSchemaNode(key) {
		if (key === "") return;
		let parts = this._splitCache.get(key);
		if (!parts) { parts = key.split("."); this._splitCache.set(key, parts); }
		let node = this.schema;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!node[parts[i]]) return;
			node = node[parts[i]];
		}
		delete node[parts[parts.length - 1]];
	}
	/** @param {string} key */
	_getSchemaNode(key) {
		if (key === "") return this.schema;
		let fn = this._accessorCache.get(key);
		if (!fn) {
			const parts = key.split(".");
			try {
				fn = new Function("obj", "return obj" + parts.map(p => `[${JSON.stringify(p)}]`).join(""));
			} catch {
				fn = (/** @type {any} */ obj) => {
					let node = obj;
					for (const p of parts) {
						if (node && typeof node === "object") node = node[p];
						else return undefined;
					}
					return node;
				};
			}
			this._accessorCache.set(key, fn);
		}
		return fn(this.schema);
	}
	/**
	 * @param {string} key
	 * @returns {DeepProxyWrapExempt}
	 */
	_getArrayWrapper(key) {
		const debouncer = this._getArrayDebouncer(key);
		let wrapper = this._arrayWrappers.get(debouncer);
		if (!wrapper) {
			wrapper = new DeepProxyWrapExempt(debouncer._data);
			this._arrayWrappers.set(debouncer, wrapper);
		}
		return wrapper;
	}
	/**
	 * @param {string} key
	 * @param {any[]} [initialArr]
	 * @returns {JSONDebounceStorage}
	 */
	_getArrayDebouncer(key, initialArr) {
		let debouncer = this.arrayDebouncers.get(key);
		if (!debouncer) {
			let arrTarget = initialArr || this.cache.get(key);
			if (!Array.isArray(arrTarget)) {
				throw new TypeError(
					`[FlatJSONStorage] Expected an array but got ${typeof arrTarget} at "${key}". Schema and cache are out of sync.`
				);
			}
			debouncer = new JSONDebounceStorage(
				arrTarget,
				async (newVal) => {
					this.cache.set(key, newVal);
					await this.adapter.set(key, newVal);
				},
				{
					structuredCloneExempt: true,
					onSet: (value, path) => {
						assertIsFlatJSONStorageStorableArray([value], "in debounce array at key:", key, "path:", path);
					}
				}
			);
			this.arrayDebouncers.set(key, debouncer);
			if (!this.cache.has(key)) {
				this.cache.set(key, debouncer.cache);
			}
		}
		return debouncer;
	}
	/**
	 * @param {string} key
	 */
	_abortArrayDebouncer(key) {
		const debouncer = this.arrayDebouncers.get(key);
		if (debouncer) {
			debouncer.abort();
			this.arrayDebouncers.delete(key);
			this.cache.delete(key);
		}
	}

	/**
	 * Loads a key (or subtree) from the adapter into the cache, returning the value.
	 * Synchronous when the key is already cached (or the adapter is synchronous);
	 * returns a Promise otherwise. On an async adapter, reading `flat.data.<key>`
	 * after a cache miss throws `Key not loaded ... 'await load()'` — await this first.
	 * @param {string} [key=""]
	 */
	load(key = "") {
		this.assertReady();
		const node = this._getSchemaNode(key);
		if (node === undefined) return undefined;
		const nodeType = getSchemaNodeValueType(node);
		const subKeys = this.getSubKeys(key);
		/** @type {Promise<void>[]} */
		const promises = [];
		/**
		 * @param {string} flatKey
		 * @param {any} value
		 */
		const handleGetHandlerResult = (flatKey, value) => {
			this.cache.set(flatKey, value);
			const flatNode = this._getSchemaNode(flatKey);
			if (getSchemaNodeValueType(flatNode) === FlatSchemaValueType.DEBOUNCE_ARRAY) {
				this._getArrayDebouncer(flatKey, value);
			}
		};
		for (const flatKey of subKeys) {
			if (!this.cache.has(flatKey) && !this.arrayDebouncers.has(flatKey)) {
				const value = this.adapter.get(flatKey);
				if (value instanceof Promise) {
					promises.push(value.then(realValue => handleGetHandlerResult(flatKey, realValue)));
				} else {
					handleGetHandlerResult(flatKey, value);
				}
			}
		}
		if (nodeType === FlatSchemaValueType.FLAT_LINK) {
			if (!this.cache.has(key)) {
				this.cache.set(key, {});
			}
		}
		const getReturnValue = () => {
			if (nodeType === FlatSchemaValueType.FLAT_LINK) {
				return this.cache.get(key);
			}
			if (nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
				return this._getArrayWrapper(key);
			}
			return this.cache.get(key);
		};
		if (promises.length > 0) {
			return Promise.all(promises).then(getReturnValue);
		}
		return getReturnValue();
	}
	/**
	 * Template-tag getter: `flat.get\`count\`` or `flat.get\`config.display.brightness\``.
	 * Always async — awaits `load()` and returns the value (array keys unwrap to the raw array).
	 * @param {readonly string[]} strings
	 * @param {readonly any[]} keys
	 */
	async get(strings, ...keys) {
		let path = strings[0];
		keys.forEach((k, i) => path += k + strings[i + 1]);
		const result = await this.load(path);
		if (result instanceof DeepProxyWrapExempt) {
			return result.value;
		}
		return result;
	}
	/**
	 * @param {string} key
	 */
	async delete(key = "") {
		this.assertReady();
		const node = this._getSchemaNode(key);
		if (node === undefined) return;
		const nodeType = getSchemaNodeValueType(node);
		if (nodeType === FlatSchemaValueType.FLAT_LINK || nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
			await this._clearCache(key);
		}
		this.cache.delete(key);
		await this.adapter.delete(key);
		if (key === "") {
			for (const k in this.schema) delete this.schema[k];
		} else {
			this._deleteSchemaNode(key);
		}
	}
}
//#endregion
//#region
/**
 * @extends {JSONDebounceStorage}
 */
class WebStorageItemStorage extends JSONDebounceStorage {
	/** 
	 * @param {string} itemName 
	 * @param {Storage} instance 
	 * @param {number=} updateDelayMs 
	 */
	constructor(itemName, instance, updateDelayMs) {
		const existingData = instance.getItem(itemName);
		let initialValue = {};
		try {
			initialValue = existingData ? JSON.parse(existingData) : {};
		} catch (e) {
			console.error(e);
		}
		super(initialValue, value => instance.setItem(itemName, JSON.stringify(value)), { updateDelayMs });
	}
}
class FlatWebStorage extends FlatJSONStorage {
	/** 
	 * @param {object} options 
	 * @param {string} [options.namespace] 
	 * @param {Storage} options.instance 
	 */
	constructor(options) {
		const { instance, ...rest } = options;
		if (!instance) throw new TypeError("Storage instance is required");
		/** 
		 * @type {FlatStorageAdapter} 
		 */
		const adapter = {
			get: (key) => {
				const val = instance.getItem(key);
				if (!val) return undefined;
				try {
					return JSON.parse(val);
				} catch (e) {
					console.error(e);
					return undefined;
				}
			},
			set: (key, value) => {
				instance.setItem(key, JSON.stringify(value));
			},
			delete: (key) => {
				instance.removeItem(key);
			}
		};
		super(adapter, rest);
	}
}
class FlatUnstorage extends FlatJSONStorage {
	/** 
	 * @param {object} [options] 
	 * @param {ReturnType<typeof import("unstorage").createStorage>} [options.storage] An unstorage instance.
	 * @param {string} [options.namespace] 
	 */
	constructor(options = {}) {
		const { storage, namespace } = options;
		if (!storage) throw new TypeError("'storage' is required for FlatUnstorage.");
		/** @type {FlatStorageAdapter} */
		const adapter = {
			get: (key) => storage.getItem(key),
			set: (key, value) => storage.setItem(key, value),
			delete: (key) => storage.removeItem(key),
		};
		super(adapter, { namespace });
	}
}

function cleanUpStorage() {
	for (const storage of registeredStorages.map(ref => ref.deref())) {
		if (!storage || !storage.scheduledUpdate) continue;
		clearTimeout(storage.updateTimerID);
		clearInterval(storage.updateTimerID);
		storage.update();
	}
}

/** @type {any} */
const globalScope = globalThis;
if (typeof globalScope.addEventListener === "function") {
	globalScope.addEventListener("visibilitychange", () => cleanUpStorage());
}

export {
	WebStorageItemStorage,
	StorageInterface,
	FlatJSONStorage,
	FlatWebStorage,
	FlatUnstorage
};

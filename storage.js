//@ts-check
/**
 * @author 145a
 * @license AGPL-3.0
 */

//#region 
class ProxyCacheEntry {
	/** 
	 * @param {object} proxy 
	 * @param {readonly string[]} firstPath
	 * @param {DeepProxyHandler} handler
	 */
	constructor(proxy, firstPath, handler) {
		this.proxy = proxy;
		this.firstPath = firstPath;
		this.handler = handler;
		Object.freeze(this);
	}
}
/** @type {WeakMap<object, ProxyCacheEntry>} */
const deepProxyCache = new WeakMap();

/** 
 * @typedef {object} DeepProxyHandler 
 * @property {(target: Object, path: readonly string[]) => boolean} [has] 
 * @property {(target: Object, path: readonly string[], receiver: Object) => any} [get] 
 * @property {(target: Object, path: readonly string[], value: any, receiver: Object|undefined) => boolean} [set] 
 * @property {(target: Object, path: readonly string[]) => boolean} [deleteProperty] 
 * @property {(target: Object, path: readonly string[]) => string[]} [ownKeys] 
 * @property {(target: Object, path: readonly string[], prop: string | symbol) => PropertyDescriptor | undefined} [getOwnPropertyDescriptor] 
 */

/** 
 * @see createDeepProxy 
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
const assertSymbol = prop => {
	console.assert(typeof prop !== "symbol", "Symbol properties are not supported by createDeepProxy.");
};
/**
 * @param {object} target
 * @param {DeepProxyHandler} handler
 * @param {readonly string[]} [currentPath=[]]
 * @returns {*}
 */
function createDeepProxy(target, handler, currentPath = []) {
	const cacheEntry = deepProxyCache.get(target);
	if (cacheEntry) {
		if (cacheEntry.handler === handler && cacheEntry.firstPath.join(".") === currentPath.join(".")) {
			return cacheEntry.proxy;
		}
		console.warn(
			"[createDeepProxy] Same object with different context. Overwriting cache.",
			"Old handler/path:", cacheEntry.handler, cacheEntry.firstPath,
			"New handler/path:", handler, currentPath
		);
	}
	const proxy = new Proxy(target, {
		has(target, prop) {
			assertSymbol(prop);
			const path = [...currentPath, String(prop)];
			if (handler.has) return handler.has(target, path);
			return Reflect.has(target, prop);
		},
		get(obj, prop, receiver) {
			assertSymbol(prop);
			const path = Object.freeze([...currentPath, prop.toString()]);
			if (handler.get) {
				const result = handler.get(obj, path, receiver);
				if (result instanceof DeepProxyWrapExempt) return result.value;
				if (typeof result === "object" && result !== null && typeof result !== "function") {
					return createDeepProxy(result, handler, path);
				}
				return result;
			}
			const value = Reflect.get(obj, prop, receiver);
			if (typeof value === "object" && value !== null && typeof value !== "function") {
				return createDeepProxy(value, handler, path);
			}
			return value;
		},
		set(obj, prop, value, receiver) {
			assertSymbol(prop);
			const path = [...currentPath, String(prop)];
			if (handler.set) return handler.set(obj, path, value, receiver);
			return Reflect.set(obj, prop, value, receiver);
		},
		deleteProperty(obj, prop) {
			assertSymbol(prop);
			const path = [...currentPath, String(prop)];
			if (handler.deleteProperty) return handler.deleteProperty(obj, path);
			return Reflect.deleteProperty(obj, prop);
		},
		ownKeys(target) {
			if (handler.ownKeys) return handler.ownKeys(target, currentPath);
			return Reflect.ownKeys(target);
		},
		getOwnPropertyDescriptor(target, prop) {
			assertSymbol(prop);
			const path = [...currentPath, prop.toString()];
			if (handler.getOwnPropertyDescriptor) return handler.getOwnPropertyDescriptor(target, path, prop);
			return Reflect.getOwnPropertyDescriptor(target, prop);
		}
	});
	deepProxyCache.set(target, new ProxyCacheEntry(proxy, currentPath, handler));
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
	/** @type {number|undefined} */
	updateTimerID;
	async update() {
		this.assertReady();
		this.scheduledUpdate = false;
	}
}
//#endregion
//#region 
class DebounceStorage extends StorageInterface {
	/** 
	 * @param {Exclude<any, undefined>} initialValue 
	 * @param {(value: any)=>Promise<void>|void} updator 
	 * @param {number} updateDelayMs 
	 * @param {boolean} structuredCloneExempt Use raw initialValue as cache. DO NOT MODIFY THE OBJECT EVER IF YOU ENABLE THIS.
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
class JSONDebounceStorage extends DebounceStorage {
	/** 
	 * @param {object} initialValue
	 * @param {(value: Object)=>Promise<void>|void} updator
	 * @param {{updateDelayMs?: number, structuredCloneExempt?: boolean,	onSet?: (value: Object, path: readonly string[])=>void}} options
	 */
	constructor(initialValue, updator, { updateDelayMs, structuredCloneExempt, onSet = () => { } } = {}) {
		super(initialValue, updator, updateDelayMs, structuredCloneExempt);
		this._data = createDeepProxy(this._cache, {
			set: (target, path, value, receiver) => {
				assertIsJSONStorageStorableValue(value);
				onSet(value, path);
				this.requestUpdate();
				const prop = path[path.length - 1];
				return Reflect.set(target, prop, value, Array.isArray(target) ? target : receiver);
			},
			deleteProperty: (target, path) => {
				this.requestUpdate();
				const prop = path[path.length - 1];
				return Reflect.deleteProperty(target, prop);
			}
		});
		this.init();
	}
	/** @type {ReturnType<createDeepProxy>} */
	_data;
}


/** @deprecated */
class JSONStorageAdaptor {
	/** 
	 * @typedef {(name: string, data: Object)=>void} StorageUpdater 
	 * @param {(name: string)=>Promise<Object>|Object} initialValueGetter 
	 * @param {StorageUpdater} updater 
	 */
	constructor(initialValueGetter, updater) {
		this.initialValueGetter = initialValueGetter;
		this.updater = updater;
	}
};
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
 * @enum {string}
 */
const FlatSchemaValueType = {
	PRIMITIVE: "0",
	FLAT_LINK: "{}",
	DEBOUNCE_ARRAY: "[]"
};
const FlatSchemaValueTypeMarker = {
	[FlatSchemaValueType.PRIMITIVE]: 0,
	[FlatSchemaValueType.FLAT_LINK]: {},
	[FlatSchemaValueType.DEBOUNCE_ARRAY]: []
}
/**
 * @param {*} node
 * @returns {FlatSchemaValueType|undefined} 
 */
function getSchemaNodeValueType(node) {
	if (node === undefined || node === null) return undefined;
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

		/** @type {Map<string, JSONDebounceStorage>} */
		this.arrayDebouncers = new Map();

		/**
		 * @type {DeepProxyHandler & { set: NonNullable<DeepProxyHandler["set"]>}}
		 * @readonly
		 */
		this._handler = {
			has: (target, path) => {
				const schemaNode = this._getSchemaNode(path);
				return schemaNode !== undefined;
			},
			get: (target, path) => {
				this.assertReady();
				const key = path.join(".");
				const schemaNode = this._getSchemaNode(path);
				const nodeType = getSchemaNodeValueType(schemaNode);
				if (nodeType === FlatSchemaValueType.FLAT_LINK) {
					let subTarget = this.cache.get(key);
					if (!subTarget || typeof subTarget !== "object") {
						subTarget = {};
						this.cache.set(key, subTarget);
					}
					return subTarget;
				}
				if (nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
					if (!this.cache.has(key) && !this.arrayDebouncers.has(key)) {
						const loadResult = this.load(key);
						if (loadResult instanceof Promise) {
							throw new Error(`[FlatJSONStorage] Key not loaded (async adapter requires 'await load()'): "${key}".`);
						}
					}
					const debouncer = this._getArrayDebouncer(key);
					return new DeepProxyWrapExempt(debouncer._data);
				}

				if (this.cache.has(key)) {
					return this.cache.get(key);
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
			set: (target, path, value) => {
				const key = path.join(".");
				assertIsJSONStorageStorableValue(value, "flat path:", path);

				/*if (typeof value === "object" && value !== null) {
					try {
						value = StorageInterface.getRaw(value);
					} catch (e) {
						throw new TypeError(`[FlatJSONStorage] Failed to serialize value at "${key}".`);
					}
				}*/

				const oldSchemaNode = this._getSchemaNode(path);
				const oldNodeType = getSchemaNodeValueType(oldSchemaNode);

				/** @type FlatSchemaValueType */
				let newNodeType;
				if (isPlainObject(value)) newNodeType = FlatSchemaValueType.FLAT_LINK;
				else if (Array.isArray(value)) newNodeType = FlatSchemaValueType.DEBOUNCE_ARRAY;
				else newNodeType = FlatSchemaValueType.PRIMITIVE;

				const isOldBranch = oldNodeType === FlatSchemaValueType.FLAT_LINK || oldNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY;
				if (isOldBranch && !(oldNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY && newNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY)) {
					this._clearCache(path).catch(console.error);
				}

				let schemaTypeMarker = FlatSchemaValueTypeMarker[newNodeType];

				let node = this.schema;
				for (let i = 0; i < path.length - 1; i++) {
					if (!node[path[i]] || typeof node[path[i]] !== "object") node[path[i]] = {};
					node = node[path[i]];
				}
				node[path[path.length - 1]] = schemaTypeMarker;

				if (newNodeType === FlatSchemaValueType.FLAT_LINK) {
					this.cache.set(key, {});
					for (const subKey of Object.keys(value)) {
						this._handler.set(target, [...path, subKey], value[subKey], undefined);
					}
				} else if (newNodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
					assertIsFlatJSONStorageStorableArray(value, "at path:", path);
					const debouncer = this._getArrayDebouncer(key, value);
					debouncer._data.splice(0, debouncer._data.length, ...value);
				} else {
					this.cache.set(key, value);
					(async () => {
						await this.adapter.set(key, value);
					})().catch(console.error);
				}
				return true;
			},
			deleteProperty: (target, path) => {
				const key = path.join(".");
				const schemaNode = this._getSchemaNode(path);
				const nodeType = getSchemaNodeValueType(schemaNode);

				if (nodeType === FlatSchemaValueType.FLAT_LINK || nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
					this._clearCache(path).catch(console.error);
				}
				this.cache.delete(key);
				(async () => {
					await this.adapter.delete(key);
				})().catch(console.error);
				this._deleteSchemaNode(path);
				return true;
			},
			ownKeys: (target, path) => {
				const schemaNode = this._getSchemaNode(path);
				if (schemaNode && typeof schemaNode === "object") {
					return Object.keys(schemaNode);
				}
				return [];
			},
			getOwnPropertyDescriptor: (target, path, prop) => {
				const schemaNode = this._getSchemaNode(path);
				if (schemaNode !== undefined) {
					return { configurable: true, enumerable: true, writable: true, value: undefined };
				}
				return undefined;
			}
		}

		this._data = createDeepProxy({}, this._handler);
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
	 * @param {readonly string[]} path
	 */
	async _clearCache(path) {
		const key = path.join(".");
		const node = this._getSchemaNode(path);
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
			const p = (async () => await this.adapter.delete(k))().catch(console.error);
			deletePromises.push(p);
			const flatPath = k.split(".");
			const flatNode = this._getSchemaNode(flatPath);
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
		const path = key === "" ? [] : key.split(".");
		const node = this._getSchemaNode(path);
		if (node === undefined) return [];
		if (isSchemaLeafNode(node)) {
			return [key];
		}
		/** @type {string[]} */
		const keys = [];
		/**
		 * @param {{[k: string]: any}} currentNode
		 * @param {string[]} currentPath
		 */
		const traverseSchema = (currentNode, currentPath) => {
			for (const subKey of Object.keys(currentNode)) {
				const childPath = [...currentPath, subKey];
				const childNode = currentNode[subKey];
				if (isSchemaLeafNode(childNode)) {
					keys.push(childPath.join("."));
				} else {
					traverseSchema(childNode, childPath);
				}
			}
		};
		traverseSchema(node, path);
		return keys;
	};

	/**
	 * @param {readonly string[]} path
	 */
	_deleteSchemaNode(path) {
		if (path.length === 0) return;
		let node = this.schema;
		for (let i = 0; i < path.length - 1; i++) {
			if (!node[path[i]]) return;
			node = node[path[i]];
		}
		delete node[path[path.length - 1]];
	}
	/** @param {readonly string[]} path */
	_getSchemaNode(path) {
		let node = this.schema;
		for (const key of path) {
			if (node && typeof node === "object") node = node[key];
			else return undefined;
		}
		return node;
	}
	/** @deprecated */
	getSchema() {
		return this.schema;
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
	 * @param {string} [key=""]
	 */
	load(key = "") {
		this.assertReady();
		const path = key === "" ? [] : key.split(".");
		const node = this._getSchemaNode(path);
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
			const flatPath = flatKey.split(".");
			const flatNode = this._getSchemaNode(flatPath);
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
				const debouncer = this._getArrayDebouncer(key);
				return new DeepProxyWrapExempt(debouncer._data);
			}
			return this.cache.get(key);
		};
		if (promises.length > 0) {
			return Promise.all(promises).then(getReturnValue);
		}
		return getReturnValue();
	}
	/**
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
		const path = key === "" ? [] : key.split(".");
		const node = this._getSchemaNode(path);
		if (node === undefined) return;
		const nodeType = getSchemaNodeValueType(node);
		if (nodeType === FlatSchemaValueType.FLAT_LINK || nodeType === FlatSchemaValueType.DEBOUNCE_ARRAY) {
			await this._clearCache(path);
		}
		this.cache.delete(key);
		await this.adapter.delete(key);
		if (path.length === 0) {
			for (const k in this.schema) delete this.schema[k];
		} else {
			this._deleteSchemaNode(path);
		}
	}
}
//#endregion
//#region
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

function cleanUpStorage() {
	for (const storage of registeredStorages.map(ref => ref.deref())) {
		if (!storage || !storage.scheduledUpdate) continue;
		clearTimeout(storage.updateTimerID);
		clearInterval(storage.updateTimerID);
		storage.update();
	}
}

if (typeof addEventListener !== "undefined") {
	addEventListener("visibilitychange", event => cleanUpStorage());
}

/** @deprecated */
class StorageHelper {
	constructor(updateDelayMs = 100) {
		this.updateDelayMs = updateDelayMs;
	}
	/** 
	 * @deprecated 
	 * @param {string} name 
	 * @param {JSONStorageAdaptor} adaptor 
	 * @returns {Promise<any>} 
	 */
	async getStorage(name, adaptor) {
		const newStorage = new JSONDebounceStorage(await adaptor.initialValueGetter(name) ?? {}, value => adaptor.updater(name, value), { updateDelayMs: this.updateDelayMs });
		return newStorage.data;
	}
	/** @deprecated */
	static ADAPTORS = {
		LOCAL_STORAGE: new JSONStorageAdaptor(
			(name) => {
				const existingData = localStorage.getItem(name);
				try {
					return existingData ? JSON.parse(existingData) : {};
				} catch (e) {
					console.error(e);
					return {};
				}
			},
			async (name, data) => {
				localStorage.setItem(name, JSON.stringify(data));
			}
		)
	};
}

export {
    /** @deprecated */ JSONStorageAdaptor,
    /** @deprecated */ JSONStorageAdaptor as StorageAdaptor,
	WebStorageItemStorage,
	StorageHelper,
	StorageInterface,
	FlatJSONStorage,
	FlatWebStorage
};

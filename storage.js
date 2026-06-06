/**
 * @author 145a
 * @license AGPL-3.0
 */

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
 */
function isFlatStorageStorable(value) {
	const type = typeof value;
	if (type === "number" || type === "string" || type === "boolean" || value === null) return true;
	if (value === undefined || type === "function" || type === "symbol") return false;
	if (type === "object") {
		if (Array.isArray(value)) {
			return false;//todo:数组
			for (let i = 0; i < value.length; i++) {
				const itemType = typeof value[i];
				if (itemType !== "number" && itemType !== "string" && itemType !== "boolean" && value[i] !== null) {
					return false;
				}
			}
			return true;
		}
		if (isPlainObject(value)) {
			for (const subKey of Object.keys(value)) {
				if (!isFlatStorageStorable(value[subKey])) return false;
			}
			return true;
		}
		return false;
	}
	return false;
}

class ProxyCacheEntry {
	/**
	 * @param {object} proxy 
	 * @param {readonly string[]} firstPath 
	 */
	constructor(proxy, firstPath) {
		this.proxy = proxy;
		this.firstPath = firstPath;
		Object.freeze(this);
	}
}

/** @type {WeakMap<object, ProxyCacheEntry>} */
const deepProxyCache = new WeakMap();

/** @type { WeakRef<StorageInterface>[] } */
const registeredStorages = [];

/**
 * @typedef {Object} DeepProxyHandler
 * @property {(target: Object, path: readonly string[], receiver: Object) => any} [get]
 * @property {(target: Object, path: readonly string[], value: any, receiver: Object|undefined) => boolean} [set]
 * @property {(target: Object, path: readonly string[]) => boolean} [deleteProperty]
 * @property {(target: Object, path: readonly string[]) => string[]} [ownKeys]
 * @property {(target: Object, path: readonly string[], prop: string | symbol) => PropertyDescriptor | undefined} [getOwnPropertyDescriptor]
 */
/**
 * @param {object} target
 * @param {DeepProxyHandler} handler
 * @param {readonly string[]} [currentPath=[]]
 * @returns {*}
 * @todo 将路径检查移动
 */
function createDeepProxy(target, handler, currentPath = []) {
	const cacheEntry = deepProxyCache.get(target);
	if (cacheEntry) {
		if (cacheEntry.firstPath.join(".") !== currentPath.join(".")) {
			console.warn(
				"Same object with different paths.",
				"First path:", cacheEntry.firstPath,
				"Current path:", currentPath
			);
		}
		return cacheEntry.proxy;
	}
	/**
	 * @param {keyof any} prop 
	 */
	const assertSymbol = prop => {
		console.assert(typeof prop !== "symbol", "Symbol properties are not supported by createDeepProxy.");
	};
	const proxy = new Proxy(target, {
		get(obj, prop, receiver) {
			assertSymbol(prop);
			const path = Object.freeze([...currentPath, prop.toString()]);
			if (handler.get) {
				const result = handler.get(obj, path, receiver);
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
			if (handler.set) {
				return handler.set(obj, path, value, receiver);
			}
			return Reflect.set(obj, prop, value, receiver);
		},
		deleteProperty(obj, prop) {
			assertSymbol(prop);
			const path = [...currentPath, String(prop)];
			if (handler.deleteProperty) {
				return handler.deleteProperty(obj, path);
			}
			return Reflect.deleteProperty(obj, prop);
		},
		ownKeys(target) {
			if (handler.ownKeys) {
				return handler.ownKeys(target, currentPath);
			}
			return Reflect.ownKeys(target);
		},
		getOwnPropertyDescriptor(target, prop) {
			assertSymbol(prop);
			const path = [...currentPath, prop.toString()];
			if (handler.getOwnPropertyDescriptor) {
				return handler.getOwnPropertyDescriptor(target, path, prop);
			}
			return Reflect.getOwnPropertyDescriptor(target, prop);
		}
	});
	deepProxyCache.set(target, new ProxyCacheEntry(proxy, currentPath));
	return proxy;
}
class StorageInterface {
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
	data;
	/** @type {number|undefined} */
	updateTimerID;
	async update() {
		this.assertReady();
		this.scheduledUpdate = false;
	}
}
//#region 
class DebounceStorage extends StorageInterface {
	/**
	 * @param {any} initialValue 
	 * @param {(value: any)=>Promise<void>|void} updator
	 * @param {number} updateDelayMs  
	 */
	constructor(initialValue, updator, updateDelayMs = 100) {
		super();
		Object.assign(this.cache, initialValue);
		this.updator = updator;
		this.updateDelayMs = updateDelayMs;
	}
	/** @returns {Promise<void>|void} */
	init() {
		this.isReady = true;
	};
	/** @protected */
	cache = {};
	scheduledUpdate = false;
	async update() {
		super.update();
		await this.updator(this.cache);
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
class JSONDebounceStorage extends DebounceStorage {
	/**
	 * @param {Object} initialValue 
	 * @param {(value: Object)=>Promise<void>|void} updator
	 * @param {number=} updateDelayMs  
	 */
	constructor(initialValue, updator, updateDelayMs) {
		super(initialValue, updator, updateDelayMs);
		this.data = createDeepProxy(this.cache, {
			set: (target, path, value, receiver) => {
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
	data;
}
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
		super(initialValue, value => instance.setItem(itemName, JSON.stringify(value)), updateDelayMs);
	}
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

const SCHEMA_KEY = "__145Storage__flatSchema__";

/** @typedef {Object} FlatStorageAdapter
 * @property {(key: string) => Promise<any> | any} get
 * @property {(key: string, value: any) => Promise<void> | void} set
 * @property {(key: string) => Promise<void> | void} delete
 */

class FlatJSONStorage extends StorageInterface {
	/**
	 * @param {FlatStorageAdapter} adapter
	 * @param {Object} [options]
	 * @param {string} [options.namespace]
	 */
	constructor(adapter, options = {}) {
		super();
		const { namespace } = options;
		if (namespace) {
			const rawAdapter = adapter;
			/**
			 * @type {FlatStorageAdapter}
			 */
			this.adapter = {
				get: (key) => rawAdapter.get(`${namespace}:${key}`),
				set: (key, value) => rawAdapter.set(`${namespace}:${key}`, value),
				delete: (key) => rawAdapter.delete(`${namespace}:${key}`),
			};
		} else {
			this.adapter = adapter;
		}
		/** @type {{ [k: string]: any }} */
		this.schema = {};
		/** @type {Map<string, any>} */
		this.cache = new Map();
		/**
		 * @type {DeepProxyHandler}
		 * @readonly
		 */
		this._handler = {
			get: (target, path) => {
				this.assertReady();
				const key = path.join(".");
				const schemaNode = this._getSchemaNode(path);
				if (schemaNode && typeof schemaNode === "object") {
					let subTarget = this.cache.get(key);
					if (!subTarget || typeof subTarget !== "object") {
						subTarget = {};
						this.cache.set(key, subTarget);
					}
					return createDeepProxy(subTarget, this._handler, path);
				}
				if (this.cache.has(key)) {
					return this.cache.get(key);
				}
				if (schemaNode === undefined) {
					return undefined;
				}
				throw new Error(`[FlatJSONStorage] Key not loaded: "${key}".`);
			},
			set: (target, path, value) => {
				const key = path.join(".");
				if (!isFlatStorageStorable(value)) {
					throw new TypeError(
						`[FlatJSONStorage] Invalid value at "${key}". Only plain objects, and arrays containing only numbers/strings/booleans/null are allowed.`
					);
				}
				const oldSchemaNode = this._getSchemaNode(path);
				const oldValue = this.cache.get(key);
				if (oldSchemaNode !== undefined && typeof oldSchemaNode === "object") {
					const prefix = key + ".";
					const keysToDelete = [...this.cache.keys()].filter(k => k.startsWith(prefix));
					keysToDelete.forEach(k => {
						this.cache.delete(k);
						(async () => { await this.adapter.delete(k); })().catch(console.error);
					});
				}
				if (isPlainObject(value)) {
					this.cache.set(key, value);
					let node = this.schema;
					for (let i = 0; i < path.length - 1; i++) {
						if (!node[path[i]] || typeof node[path[i]] !== "object") node[path[i]] = {};
						node = node[path[i]];
					}
					node[path[path.length - 1]] = {};
					for (const subKey of Object.keys(value)) {
						this._handler.set(target, [...path, subKey], value[subKey], undefined);
					}
					this._updateSchema().catch(console.error);
				} else {
					this.cache.set(key, value);
					this._createSchemaNode(path);
					(async () => { await this.adapter.set(key, value); })().catch(console.error);
				}

				return true;
			},
			deleteProperty: (target, path) => {
				const key = path.join(".");
				const schemaNode = this._getSchemaNode(path);
				if (schemaNode && typeof schemaNode === "object") {
					const prefix = key + ".";
					const keysToDelete = [...this.cache.keys()].filter(k => k.startsWith(prefix));
					keysToDelete.forEach(k => {
						this.cache.delete(k);
						(async () => { await this.adapter.delete(k); })().catch(console.error);
					});
				}
				this.cache.delete(key);
				(async () => { await this.adapter.delete(key); })().catch(console.error);
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
					return {
						configurable: true,
						enumerable: true,
						value: undefined
					};
				}
				return undefined;
			}
		}
		this.data = createDeepProxy({}, this._handler);
	}
	/*this.data = createDeepProxy({}, {
		get: (target, path) => {
			this.assertReady();
			const key = path.join(".");
			const schemaNode = this._getSchemaNode(path);
			if (schemaNode && typeof schemaNode === "object") {
				return createDeepProxy({}, this.data.handler, path);
			}
			if (this.cache.has(key)) {
				return this.cache.get(key);
			}
			throw new Error(`[FlatJSONStorage] Key not loaded: "${key}".`);
		},
		set: (target, path, value) => {
			const key = path.join(".");
			this.cache.set(key, value);
			this._createSchemaNode(path);
			(async () => {
				await this.adapter.set(key, value);
			})().catch(console.error);
			return true;
		},
		deleteProperty: (target, path) => {
			const key = path.join(".");
			const schemaNode = this._getSchemaNode(path);
			if (schemaNode && typeof schemaNode === "object") {
				const prefix = key + ".";
				const keysToDelete = [...this.cache.keys()].filter(k => k.startsWith(prefix));
				keysToDelete.forEach(k => this.delete(k));
			}
			this.delete(key);
			this._deleteSchemaNode(path);
			return true;
		}
	}, []);
}*/
	/** @override */
	async init() {
		const storedSchema = await this.adapter.get(SCHEMA_KEY);
		if (storedSchema && typeof storedSchema === "object") {
			this.schema = storedSchema;
		} else {
			this.schema = {};
			await this._updateSchema();
		}
		this.isReady = true;
	}
	async _updateSchema() {
		await this.adapter.set(SCHEMA_KEY, this.schema);
	}
	/** @param {readonly string[]} path */
	_createSchemaNode(path) {
		let node = this.schema;
		for (let i = 0; i < path.length - 1; i++) {
			const key = path[i];
			if (!node[key] || typeof node[key] !== "object") node[key] = {};
			node = node[key];
		}
		node[path[path.length - 1]] = 0;
		this._updateSchema().catch(console.error);
	}
	/** @param {readonly string[]} path */
	_deleteSchemaNode(path) {
		if (path.length === 0) return;
		let node = this.schema;
		for (let i = 0; i < path.length - 1; i++) {
			if (!node[path[i]]) return;
			node = node[path[i]];
		}
		delete node[path[path.length - 1]];
		this._updateSchema().catch(console.error);
	}
	/** @param {string} key */
	async load(key) {
		const value = await this.adapter.get(key);
		this.cache.set(key, value);
		return value;
	}
	/** @param {string} key */
	async delete(key) {
		this.cache.delete(key);
		await this.adapter.delete(key);
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
	/**
	 * @param {readonly string[]} strings
	 * @param {readonly any[]} keys
	 */
	async get(strings, ...keys) {
		let path = strings[0];
		keys.forEach((k, i) => path += k + strings[i + 1]);
		return this.load(path);
	}
	getSchema() {
		return this.schema;
	}
}
class FlatWebStorage extends FlatJSONStorage {
	/**
	 * @param {Object} options
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

if (typeof addEventListener !== "undefined") {
	addEventListener("visibilitychange", event => {
		for (const storage of registeredStorages.map(ref => ref.deref())) {
			if (!storage || !storage.scheduledUpdate) continue;
			clearTimeout(storage.updateTimerID);
			clearInterval(storage.updateTimerID);
			storage.update();
		}
	});
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
		const newStorage = new JSONDebounceStorage(await adaptor.initialValueGetter(name) ?? {}, value => adaptor.updater(name, value), this.updateDelayMs);
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
	/** @deprecated */
	JSONStorageAdaptor,
	/** @deprecated */
	JSONStorageAdaptor as StorageAdaptor,
	WebStorageItemStorage,
	StorageHelper,
	FlatJSONStorage,
	FlatWebStorage
};

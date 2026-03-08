class ProxyCacheEntry {
	/**
	 * @param {object} proxy 
	 * @param {readonly string[]} firstPath 
	 */
	constructor(proxy, firstPath) {
		this.proxy = proxy;
		this.firstPath = firstPath;
	}
}

/** @type {WeakMap<object, ProxyCacheEntry>} */
const deepProxyCache = new WeakMap();

/** @type { WeakRef<StorageInterface>[] } */
const registeredStorages = [];

/**
 * @typedef {Object} DeepProxyHandler
 * @property {(target: Object, path: readonly string[], receiver: Object) => any} [get]
 * @property {(target: Object, path: readonly string[], value: any, receiver: Object) => boolean} [set]
 * @property {(target: Object, path: readonly string[]) => boolean} [deleteProperty]
 */
/**
 * @param {object} target
 * @param {DeepProxyHandler} handler
 * @param {readonly string[]} [currentPath=[]]
 * @returns {*}
 */
function createDeepProxy(target, handler, currentPath = []) {
	const cacheEntry = deepProxyCache.get(target);
	if (cacheEntry) {
		if (cacheEntry.firstPath.join('.') !== currentPath.join('.')) {
			console.warn(
				"Same object with different paths.",
				"First path:", cacheEntry.firstPath,
				"Current path:", currentPath
			);
		}
		return cacheEntry.proxy;
	}
	const proxy = new Proxy(target, {
		get(obj, prop, receiver) {
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
			const path = [...currentPath, String(prop)];
			if (handler.set) {
				return handler.set(obj, path, value, receiver);
			}
			return Reflect.set(obj, prop, value, receiver);
		},
		deleteProperty(obj, prop) {
			const path = [...currentPath, String(prop)];
			if (handler.deleteProperty) {
				return handler.deleteProperty(obj, path);
			}
			return Reflect.deleteProperty(obj, prop);
		}
	});
	deepProxyCache.set(target, new ProxyCacheEntry(proxy, currentPath));
	return proxy;
}

class StorageInterface {
	/**
	 * @param {any} initialValue 
	 * @param {(value: any)=>Promise<void>|void} updator
	 * @param {number} updateDelayMs  
	 */
	constructor(initialValue, updator, updateDelayMs = 100) {
		Object.assign(this.cache, initialValue);
		this.updator = updator;
		this.updateDelayMs = updateDelayMs;
		registeredStorages.push(new WeakRef(this));
	}
	isReady = false;
	/** @returns {Promise<void>|void} */
	init() {
		this.isReady = true;
	};
	assertReady() {
		if (!this.isReady) throw new Error("Storage not ready, call .init() first.");
	}
	/** @protected */
	cache = {};
	scheduledUpdate = false;
	/**
	 * @type {NonNullable<any>}
	 */
	data;
	async update() {
		this.assertReady();
		this.scheduledUpdate = false;
		await this.updator(this.cache);
	};
	/** @type {number|undefined} */
	updateTimeoutID;
	requestUpdate() {
		this.assertReady();
		if (!this.scheduledUpdate) {
			this.scheduledUpdate = true;
			this.updateTimeoutID = setTimeout(async () => {
				try {
					await this.update();
				} catch (e) {
					console.error(e);
				}
			}, this.updateDelayMs);
		}
	}
}
class JSONStorage extends StorageInterface {
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
				return Reflect.set(target, prop, value, receiver);
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
class WebStorageItemStorage extends JSONStorage {
	/**
	 * @param {string} itemName
	 * @param {Storage} instance 
	 * @param {number=} updateDelayMs
	 */
	constructor(itemName, instance, updateDelayMs) {
		const existingData = instance.getItem(itemName);
		try {
			super(existingData ? JSON.parse(existingData) : {}, value => instance.setItem(itemName, JSON.stringify(value)), updateDelayMs);
		} catch (e) {
			console.error(e);
			super({}, () => { }, 0);
		}
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
if (typeof addEventListener !== "undefined") {
	addEventListener("beforeunload", event => {
		for (const storage of registeredStorages.map(ref => ref.deref())) {
			if (!storage || !storage.scheduledUpdate) continue;
			clearTimeout(storage.updateTimeoutID);
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
		const newStorage = new JSONStorage(await adaptor.initialValueGetter(name) ?? {}, value => adaptor.updater(name, value), this.updateDelayMs);
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
	WebStorageItemStorage,
	/** @deprecated */
	JSONStorageAdaptor,
	/** @deprecated */
	JSONStorageAdaptor as StorageAdaptor,
	StorageHelper
};
const deepProxyCache = new WeakMap();
/** @type { WeakRef<StorageInterface>[] } */
const registeredStorages = [];
/**
 * @param {Object} target
 * @param {ProxyHandler<Object>} handler
 * @returns {Object<any,any>}
 */
function createDeepProxy(target, handler) {
	const deepHandler = Object.assign({}, handler);
	deepHandler.get = (target, property) => {
		const value = Reflect.get(target, property);
		if (typeof value === "object" && typeof value !== "function" && value !== null) {
			if (!deepProxyCache.has(value)) deepProxyCache.set(value, createDeepProxy(value, handler));
			return deepProxyCache.get(value);
		} else {
			if (handler.get) {
				return handler.get(target, property, undefined);
			} else {
				return value;
			}
		}
	};
	return new Proxy(target, deepHandler);
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
			set: (target, property, value) => {
				this.requestUpdate();
				return Reflect.set(target, property, value);
			},
			deleteProperty: (target, property) => {
				this.requestUpdate();
				return Reflect.deleteProperty(target, property);
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
	}
}
export {
	WebStorageItemStorage,
	/** @deprecated */
	JSONStorageAdaptor,
	/** @deprecated */
	JSONStorageAdaptor as StorageAdaptor,
	StorageHelper
};
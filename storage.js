const deepProxyCache = new WeakMap();
/**
 * @param {Object} target
 * @param {ProxyHandler<Object>} handler
 */
function createDeepProxy(target, handler) {
    const deepHandler = Object.assign({}, handler);
    deepHandler.get = (target, property) => {
        const value = Reflect.get(target, property);
        if (typeof value === "object" && typeof value !== "function" && value !== null) {
            if (deepProxyCache.has(value)) return deepProxyCache.get(value);
            else {
                deepProxyCache.set(value, createDeepProxy(value, handler));
                return deepProxyCache.get(value);
            }
        } else {
            if (handler.get) {
                return handler.get(target, property, void 0);
            } else {
                return value;
            }
        }
    };
    return new Proxy(target, deepHandler);
}
/** @interface */
class Storage {
    /**
     * @param {any} initialValue 
     * @param {(value: any)=>Promise<void>|void} updator
     * @param {Number} updateDelayMs  
     */
    constructor(initialValue, updator, updateDelayMs = 100) {
        Object.assign(this.cache, initialValue);
        this.updator = updator;
        this.updateDelayMs = updateDelayMs;
    }
    /** @protected */
    cache = {};
    scheduledUpdate = false;
    /**
     * @type {NonNullable<any>|null}
     */
    data;
    async update() {
        this.scheduledUpdate = false;
        await this.updator(this.cache);
    };
    requestUpdate() { };
    /** @type {Number|undefined} */
    updateTimeoutID;
}
class JSONStorage extends Storage {
    /**
     * @param {Object} initialValue 
     * @param {(value: Object)=>Promise<void>|void} updator
     * @param {Number} updateDelayMs  
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
    }
    /** @type {Object|null} */
    data = null;
    requestUpdate() {
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
class JSONStorageAdaptor {
    /**
     * @typedef {(name: String, data: Object)=>void} StorageUpdater
     * @param {(name: String)=>Promise<Object>|Object} initialValueGetter 
     * @param {StorageUpdater} updater 
     */
    constructor(initialValueGetter, updater) {
        this.initialValueGetter = initialValueGetter;
        this.updater = updater;
    }
};
class StorageHelper {
    constructor(updateDelayMs = 100) {
        this.updateDelayMs = updateDelayMs;
        if (typeof addEventListener !== "undefined") {
            addEventListener("beforeunload", event => {
                for (const storage of this.#registerdStorages.map(ref => ref.deref())) {
                    if (!storage || !storage.scheduledUpdate) continue;
                    clearTimeout(storage.updateTimeoutID);
                    storage.update();
                }
            });
        }
    }
    /** @type { WeakRef<Storage>[] } */#registerdStorages = [];

    /**
     * @param {String} name 
     * @param {JSONStorageAdaptor} adaptor 
     * @returns {Promise<any>}
     */
    async getStorage(name, adaptor) {
        const newStorage = new JSONStorage(await adaptor.initialValueGetter(name) ?? {}, value => adaptor.updater(name, value), this.updateDelayMs);
        this.#registerdStorages.push(new WeakRef(newStorage));
        return newStorage.data;
    }
    /**  
     * @deprecated
     * @param {Object} initialValue 
     * @param {(data: Object)=>void} legacyUpdater
     */
    createStorageObject(initialValue, legacyUpdater) {
        let scheduledUpdate = false;
        const cache = Object.assign({}, initialValue);
        const requestUpdate = () => {
            if (!scheduledUpdate) {
                scheduledUpdate = true;
                setTimeout(async () => {
                    scheduledUpdate = false;
                    try {
                        await legacyUpdater(cache);
                    } catch (e) {
                        console.error(e);
                    }
                }, this.updateDelayMs);
            }
        }
        return createDeepProxy(cache, {
            set(target, property, value) {
                requestUpdate();
                return Reflect.set(target, property, value);
            },
            deleteProperty(target, property) {
                requestUpdate();
                return Reflect.deleteProperty(target, property);
            }
        });
    }
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
    /**
     * @deprecated
     * @param {String} name
     * @returns {any}
     */
    getLocalStorage(name) {
        const initialValue = localStorage.getItem(name);
        return this.createStorageObject(
            initialValue ? JSON.parse(initialValue) : {},
            (data) => StorageHelper.ADAPTORS.LOCAL_STORAGE.updater(name, data)
        );
    }
}
export {
    JSONStorageAdaptor,
    JSONStorageAdaptor as StorageAdaptor,
    /** @deprecated */
    JSONStorageAdaptor as StorageAdapter,
    StorageHelper
};
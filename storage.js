class StorageAdapter {
    /**
     * @typedef {(name: String, data: Object)=>void} StorageUpdator
     * @param {(name: String)=>Promise<Object>|Object} defaultValueGetter 
     * @param {StorageUpdator} updator 
     */
    constructor(defaultValueGetter, updator) {
        this.defaultValueGetter = defaultValueGetter;
        this.updator = updator;
    }
};
class StorageHelper {
    constructor(updateDelayMs = 100) {
        this.updateDelayMs = updateDelayMs;
    }
    #deepProxyCache = new WeakMap();
    /**
     * @param {Object} target
     * @param {ProxyHandler<Object>} handler
     */
    createDeepProxy(target, handler) {
        const deepHandler = Object.assign({}, handler);
        deepHandler.get = (target, property) => {
            const value = Reflect.get(target, property);
            if (typeof value === "object" && typeof value !== "function" && value !== null) {
                if (this.#deepProxyCache.has(value)) return this.#deepProxyCache.get(value);
                else {
                    this.#deepProxyCache.set(value, this.createDeepProxy(value, handler));
                    return this.#deepProxyCache.get(value);
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
    /**
     * @param {String} name 
     * @param {StorageAdapter} adaptor 
     * @returns {Promise<any>}
     */
    async getStorage(name, adaptor) {
        let scheduledUpdate = false;
        const cache = {};
        Object.assign(cache, await adaptor.defaultValueGetter(name));
        const requestUpdate = () => {
            if (!scheduledUpdate) {
                scheduledUpdate = true;
                setTimeout(async () => {
                    scheduledUpdate = false;
                    try {
                        await adaptor.updator(name, cache);
                    } catch (e) {
                        console.error(e);
                    }
                }, this.updateDelayMs);
            }
        }
        return this.createDeepProxy(cache, {
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
    /**  
     * @deprecated
     * @param {Object} defaultValue 
     * @param {(data: Object)=>void} legacyUpdator
     */
    createStorageObject(defaultValue, legacyUpdator) {
        let scheduledUpdate = false;
        const cache = Object.assign({}, defaultValue);
        const requestUpdate = () => {
            if (!scheduledUpdate) {
                scheduledUpdate = true;
                setTimeout(async () => {
                    scheduledUpdate = false;
                    try {
                        await legacyUpdator(cache);
                    } catch (e) {
                        console.error(e);
                    }
                }, this.updateDelayMs);
            }
        }
        return this.createDeepProxy(cache, {
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
    /** @todo Cookie, File, IndexedDB, SQL */
    static ADAPTORS = {
        LOCAL_STORAGE: new StorageAdapter(
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
        const defaultValue = localStorage.getItem(name);
        return this.createStorageObject(
            defaultValue ? JSON.parse(defaultValue) : {},
            (data) => StorageHelper.ADAPTORS.LOCAL_STORAGE.updator(name, data)
        );
    }
}
export { StorageAdapter, StorageHelper };
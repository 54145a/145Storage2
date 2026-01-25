class StorageAdaptor {
    /**
     * @typedef {(name: String, data: Object)=>void} StorageUpdater
     * @param {(name: String)=>Promise<Object>|Object} defaultValueGetter 
     * @param {StorageUpdater} updater 
     */
    constructor(defaultValueGetter, updater) {
        this.defaultValueGetter = defaultValueGetter;
        this.updater = updater;
    }
};
class StorageHelper {
    constructor(updateDelayMs = 100) {
        this.updateDelayMs = updateDelayMs;
        if (typeof addEventListener !== "undefined") {
            addEventListener("beforeunload", async event => {
                event.preventDefault();
                for (const func of this.#registerdStorageUpdateFunctionList.map(ref => ref.deref())) {
                    if (!func) return;
                    await func();
                }
            });
        }
    }
    #deepProxyCache = new WeakMap();
    /** @type { WeakRef<Function>[] } */#registerdStorageUpdateFunctionList = [];
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
     * @param {StorageAdaptor} adaptor 
     * @returns {Promise<any>}
     */
    async getStorage(name, adaptor) {
        let scheduledUpdate = false;
        const cache = {};
        Object.assign(cache, await adaptor.defaultValueGetter(name));
        const updateCurrentStorage = async () => await adaptor.updater(name, cache);
        /** @type {Number} */let updateTimeoutID;
        const requestUpdate = () => {
            if (!scheduledUpdate) {
                scheduledUpdate = true;
                updateTimeoutID = setTimeout(async () => {
                    scheduledUpdate = false;
                    try {
                        await updateCurrentStorage();
                    } catch (e) {
                        console.error(e);
                    }
                }, this.updateDelayMs);
            }
        };
        this.#registerdStorageUpdateFunctionList.push(new WeakRef(updateCurrentStorage));
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
     * @param {(data: Object)=>void} legacyUpdater
     */
    createStorageObject(defaultValue, legacyUpdater) {
        let scheduledUpdate = false;
        const cache = Object.assign({}, defaultValue);
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
    static ADAPTORS = {
        LOCAL_STORAGE: new StorageAdaptor(
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
            (data) => StorageHelper.ADAPTORS.LOCAL_STORAGE.updater(name, data)
        );
    }
}
export { StorageAdaptor, /** @deprecated */StorageAdaptor as StorageAdapter, StorageHelper };
const UPDATE_MIN_INTERVAL = 100;

/**
 * @param {Object} target
 * @param {ProxyHandler<Object>} handler
 */
function createDeepProxy(target, handler) {
    const deepHandler = Object.assign({}, handler);
    deepHandler.get = (target, property) => {
        const value = Reflect.get(target, property);
        if (typeof value === "object" && value !== null) {
            return createDeepProxy(value, handler);
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
 * @param {Object} defaultValue 
 * @param {(data: Object)=>Promise<Boolean>} updator 
 * @returns 
 */
function createStorageObject(defaultValue, updator) {
    let scheduledUpdate = false;
    const cache = Object.assign({}, defaultValue);
    function requestUpdate() {
        if (!scheduledUpdate) {
            scheduledUpdate = true;
            setTimeout(async () => {
                scheduledUpdate = false;
                try {
                    await updator(cache);
                } catch (e) {
                    console.error(e);
                }
            }, UPDATE_MIN_INTERVAL);
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
/**
 * @param {String} name 
 * @returns {Object}
 */
function getLocalStorage(name) {
    const defaultValue = localStorage.getItem(name);
    return createStorageObject(
        defaultValue ? JSON.parse(defaultValue) : {},
        async (data) => {
            try {
                localStorage.setItem(name, JSON.stringify(data));
                return false;
            } catch (e) {
                console.error(e);
                return false;
            }
        }
    );
}
export { createDeepProxy, createStorageObject, getLocalStorage };
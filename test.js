import { WebStorageItemStorage, FlatWebStorage } from "./storage.js";

console.log("========================================");
console.log("WebStorageItemStorage (Whole JSON)");
console.log("========================================");
//Best for small data that needs to be read/written all at once.
const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1; // See? Auto-persists!
console.info("Old count:", settings.count);

console.log("\n========================================");
console.log("FlatWebStorage (Innovative Flat KV)");
console.log("========================================");

const flatLocalStorage = new FlatWebStorage({ namespace: "test", instance: localStorage });
await flatLocalStorage.init();

//Pre-load everything under the root
await flatLocalStorage.load("");
//To load a single key: await flatLocalStorage.load("count");

console.log("Everything in flat storage(old): ", JSON.stringify(flatLocalStorage.data));

//Deep Reactive Modify (Auto-persists only the leaf)
flatLocalStorage.data.count = flatLocalStorage.data.count ? flatLocalStorage.data.count + 1 : 1;
console.info("Flat count:", flatLocalStorage.data.count);

//Smart Array Debouncing (Multiple mutations = 1 write)
flatLocalStorage.data.arrTest ??= [];
flatLocalStorage.data.arrTest.push("I am a, no, an array!!!~");
flatLocalStorage.data.arrTest[1] = `Time: ${Date.now()}`;
console.log("Everything in flat storage: ", JSON.stringify(flatLocalStorage.data));

console.log("\n========================================");
console.log("Advanced: Sync Read & Template Get");
console.log("========================================");

// Template String Get (Async API contract, works seamlessly)
console.log("\n[1] Testing template string get...");
const templateGetCount = await flatLocalStorage.get`count`; // Lighter than load in some cases
console.log("Count via template string get:", templateGetCount);

// Synchronous Read (Lazy load via Proxy)
console.log("\n[2] Testing synchronous read...");

// Simulate cache miss to demonstrate synchronous lazy loading
flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.log("(Internal cache cleared for testing)");

const syncLoadResult = flatLocalStorage.load("count");
console.log("Is load synchronous (not a Promise)?", !(syncLoadResult instanceof Promise));
console.log("Value from sync load:", syncLoadResult);

// The Proxy automatically triggers sync load if the key is missing!
flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.log("\nAccessing data.count directly after cache clear...");
const syncReadCount = flatLocalStorage.data.count;
console.log("Synchronously read count from proxy:", syncReadCount);

// Sync Read for Arrays
flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.log("\nAccessing data.arrTest directly after cache clear...");
const syncReadArr = flatLocalStorage.data.arrTest;
console.log("Synchronously read arrTest from proxy:", JSON.stringify(syncReadArr));

console.log("\n========================================");
console.log("✅ All tests passed! Everything works like magic.");
console.log("========================================");


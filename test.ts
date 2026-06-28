/**
 * @file test.ts
 */
import { WebStorageItemStorage, FlatWebStorage } from "./storage.js";

console.info("========================================");
console.info("WebStorageItemStorage (Whole JSON)");
console.info("========================================");
//Best for small data that needs to be read/written all at once.
const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1; //See? Auto-persists!
console.log("Old count:", settings.count);

console.info("\n========================================");
console.info("FlatWebStorage (Innovative Flat KV)");
console.info("========================================");

const flatLocalStorage = new FlatWebStorage({ namespace: "test", instance: localStorage });
await flatLocalStorage.init();

//Pre-load everything under the root, not necessary for synchronous storage but simulates typical async usage and demonstrates the load API.
await flatLocalStorage.load("");
//To load a single key: await flatLocalStorage.load("count");

console.log("Everything in flat storage(old): ", JSON.stringify(flatLocalStorage.data));

//Deep Reactive Modify (Auto-persists only the leaf)
flatLocalStorage.data.count = flatLocalStorage.data.count ? flatLocalStorage.data.count + 1 : 1;
console.log("Flat count:", flatLocalStorage.data.count);

//Smart Array Debouncing (Multiple mutations = 1 write)
flatLocalStorage.data.arrTest ??= [];
flatLocalStorage.data.arrTest.push("I am a, no, an array!!!~");
flatLocalStorage.data.arrTest[1] = `Time: ${Date.now()}`;
console.log("Everything in flat storage: ", JSON.stringify(flatLocalStorage.data));

console.info("\n========================================");
console.info("Advanced: Sync Read & Template Get");
console.info("========================================");

//Template String Get (Async API contract, works seamlessly, lighter then loading the whole object first, strongly recommended for asynchronous contexts)
console.info("\n[1] Testing template string get...");
console.log("Count via template string get:", await flatLocalStorage.get`count`);

//Synchronous Read (Lazy load via Proxy)
console.info("\n[2] Testing synchronous read...");

//Simulate cache miss to demonstrate synchronous lazy loading
flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.info("(Internal cache cleared for testing)");

const syncLoadResult = flatLocalStorage.load("count");
console.log("Is load synchronous (not a Promise)?", !(syncLoadResult instanceof Promise));
console.log("Value from sync load:", syncLoadResult);

//Automatically triggers sync load if possiible
flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.info("\nAccessing data.count directly after cache clear...");
console.log("Synchronously read count from proxy:", flatLocalStorage.data.count);

//Sync Read for Arrays
flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.info("\nAccessing data.arrTest directly after cache clear...");
const syncReadArr = flatLocalStorage.data.arrTest;
console.log("Synchronously read arrTest from proxy:", JSON.stringify(syncReadArr));

import { WebStorageItemStorage, FlatWebStorage } from "./storage.js";

const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1;//See?
console.info("Old count:", settings.count);

const flatLocalStorage = new FlatWebStorage({ namespace: "test", instance: localStorage });
await flatLocalStorage.init();
await flatLocalStorage.load("");
await flatLocalStorage.load("count");

console.log("Everything in flat storage(old): ", JSON.stringify(flatLocalStorage.data));

flatLocalStorage.data.count = flatLocalStorage.data.count ? flatLocalStorage.data.count + 1 : 1;
console.info("Flat count:", flatLocalStorage.data.count);

flatLocalStorage.data.arrTest ??= [];
flatLocalStorage.data.arrTest.push("I am a, no, an array!!!~");
flatLocalStorage.data.arrTest[1] = `Time: ${Date.now()}`;

console.log("Everything in flat storage: ", JSON.stringify(flatLocalStorage.data));

console.log("\n[1] Testing template string get...");
const templateGetCount = await flatLocalStorage.get`count`;//Get a single key via template string get. Should be the same as flatLocalStorage.load("count") but lighter in some caces.
console.log("Count via template string get:", templateGetCount);

console.log("\n[2] Testing synchronous read...");

flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.log("Internal cache cleared.");//Only for tersting purposes, not recommended in production.

const syncLoadResult = flatLocalStorage.load("count");
console.log("Is load synchronous (not a Promise)?", !(syncLoadResult instanceof Promise));
console.log("Value from sync load:", syncLoadResult);

flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.log("\nAccessing data.count directly after cache clear...");
const syncReadCount = flatLocalStorage.data.count;
console.log("Synchronously read count from proxy:", syncReadCount);

flatLocalStorage.cache.clear();
flatLocalStorage.arrayDebouncers.clear();
console.log("\nAccessing data.arrTest directly after cache clear...");
const syncReadArr = flatLocalStorage.data.arrTest;
console.log("Synchronously read arrTest from proxy:", JSON.stringify(syncReadArr));

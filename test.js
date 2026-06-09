import { WebStorageItemStorage, FlatWebStorage } from "./storage.js";
const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1;//See?
console.info("Old count:", settings.count);
const flatLocalStorage = new FlatWebStorage({
	namespace: "test",
	instance: localStorage
});

await flatLocalStorage.init();
await flatLocalStorage.load("");

await flatLocalStorage.load("count")

console.log("Everything in flat storage(old): ", JSON.stringify(flatLocalStorage.data));

flatLocalStorage.data.count = flatLocalStorage.data.count ? flatLocalStorage.data.count + 1 : 1;
console.info("Flat count:", flatLocalStorage.data.count);

flatLocalStorage.data.arrTest ??= [];
flatLocalStorage.data.arrTest.push("I am a, no, an array!!!~");
flatLocalStorage.data.arrTest[1] = `Time: ${Date.now()}`;

console.log("Everything in flat storage: ", JSON.stringify(flatLocalStorage.data));

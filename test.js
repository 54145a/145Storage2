import { WebStorageItemStorage, FlatWebStorage } from "./storage.js";
const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1;//See?
console.info("Old count:", settings.count);
const flatLocalStorage = new FlatWebStorage({
	namespace: "test",
	instance: localStorage
});
await flatLocalStorage.init();
flatLocalStorage.data.count = await flatLocalStorage.load("count") ? flatLocalStorage.data.count + 1 : 1;
console.info("Flat count:", flatLocalStorage.data.count);
await flatLocalStorage.load("");
console.log("Everything in flat storage: ", JSON.stringify(flatLocalStorage.data));
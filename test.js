import { WebStorageItemStorage } from "./storage.js";
const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1;//See?
console.info("Count:", settings.count);
import { StorageHelper } from "./storage.js";
const storage = new StorageHelper();
const settings = await storage.getStorage("settings", StorageHelper.ADAPTORS.LOCAL_STORAGE);
settings.count = settings.count ? settings.count + 1 : 1;
console.info("Count:", settings.count);
## 145 Storage 2
My localStorage is a **Javascript  Object** :)

> A lightweight, intelligent storage library for JavaScript that makes state persistence as easy as modifying an object.

### ✨ Features

* **⚡ Auto-Persistence**: Seamlessly syncs object changes to storage (LocalStorage, etc.) without manual save calls.
* **🛡️ Built-in Debouncing**: Rapid changes (e.g., typing in an input) are automatically batched to prevent excessive I/O operations.
* **🔍 Deep Proxying**: Automatically tracks changes in nested objects and arrays, ensuring every level of your data is reactive.
* **🧩 Modular Adapters**(upcoming): Designed to support multiple storage backends (LocalStorage, File, IndexedDB, etc.).

### 🚀 Usage

```html
<script type="importmap">
    {
        "imports": {
            "145-storage-2/": "./node_modules/145-storage-2/"
        }
    }
</script>
```
```js
import { StorageHelper } from "145-storage-2/storage.js";
const storage = new StorageHelper();
const settings = await storage.getStorage("settings", StorageHelper.ADAPTORS.LOCAL_STORAGE);
settings.count = settings.count ? settings.count + 1 : 1;
console.info("Count: ", Ssettings.count);
```

This project is still in development and should't be used in production.
### 🗺 Roadmap
- [x] LocalStorage
- [ ] Raw file
- [ ] Indexed DB
- [ ] SQL
- [ ] First Release
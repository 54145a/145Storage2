## 145 Storage 2

My localStorage is a **Javascript  Object**

> A lightweight, intelligent storage library for JavaScript that makes state persistence as easy as modifying an object.

### ✨ Features

* **⚡ Auto-Persistence**: Seamlessly syncs object changes to storage (LocalStorage, etc.) without manual save calls.
* **🛡️ Built-in Debouncing**: Rapid changes (e.g., typing in an input) are automatically batched to prevent excessive I/O operations.
* **🔍 Deep Proxying**: Automatically tracks changes in nested objects and arrays, ensuring every level of your data is reactive.
* **🧩 Modular Adaptors**(upcoming): Designed to support multiple storage backends (LocalStorage, IndexedDB, etc.).

### 🚀 Usage
See test.js for Node.js examples.

To run the examples:

```shell
node --experimental-webstorage --localstorage-file=test.txt test.js
```

This project is still in development and should't be used in production.
### 🗺 Roadmap
- [x] JSON
- [x] LocalStorage
- [ ] XML
- [ ] First Release
- [ ] IndexedDB
- [ ] File System
- [ ] SQL
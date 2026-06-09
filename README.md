# 📦 145 Storage 2: My KV is a **plain Object**

> A lightweight, smart JavaScript storage library that makes state persistence as easy as modifying a plain object.

## Why 145 Storage 2?

Tired of writing this? 🤮

```javascript
const data = JSON.parse(localStorage.getItem("settings"));
data.count += 1;
localStorage.setItem("settings", JSON.stringify(data));
```

But what if, WHAT IF, you can *just* do **this↓**

```javascript
settings.count += 1;
```

### Core Features

- 🪄 **Deep Reactive Proxy**: Modify any nested property, and it saves automatically.
- 🏗️ **Innovative Flat Storage**: Breaks down nested JSON objects into flat Key-Value pairs. No need to serialize the entire object just to update a deep property!
- ⚡ **Smart Debouncing**: Automatically merges frequent writes (like array operations) for extreme performance.
- 🔒 **Type Safety**: Blocks un-storable values (like `undefined` or `function`) to keep your storage safe.
- 🌐 **Framework Agnostic**: Works in any vanilla JS or framework environment.

### The Story

145 Storage 2 is originally built on top of the legacy 145 Storage, which is now deprecated (source available at Box3-Tools) was built for interacting with the Box3 game engine's builtin database interface. I've been working on the idea of elegant state persistence since soon after I knew JavaScript.

## 🚀 Quick Start

### Whole JSON Storage

Best for small data that needs to be read/written all at once. Binds to a single Storage key.

```javascript
import { WebStorageItemStorage } from "@54145a/storage2/storage.js";
// Create a reactive storage object in one line
const settings = new WebStorageItemStorage("settings", localStorage).data;
// 🪄 Modify directly, auto-persists!
settings.count = settings.count ? settings.count + 1 : 1;
settings.user = { name: "Alice" };
console.info("Count:", settings.count);
```

### Flat Key-Value Storage

Best for large data where you need to update deep properties efficiently. It flattens nested objects into keys like `user.name` and `user.age`, saving only what changed.

```javascript
import { FlatWebStorage } from "@54145a/storage2/storage.js";
const flatStorage = new FlatWebStorage({ 
    namespace: "myApp", 
    instance: localStorage 
});
await flatStorage.init();
await flatStorage.load(""); // Load everything under the root
flatStorage.data.count = flatStorage.data.count ? flatStorage.data.count + 1 : 1;
flatStorage.data.arrTest = flatStorage.data.arrTest ?? [];
flatStorage.data.arrTest = ["I am an array!!!~"];
flatStorage.data.arrTest[1] = `Time: ${Date.now()}`; // Array mutations auto-save
if ("count" in flatStorage.data) {
    console.log("Count exists!");
}
console.log("Everything:", JSON.stringify(flatStorage.data));
```

---

## 🧠 Under the Hood: Deep Proxy & Flat Schema

How does the magic work?

1. **Deep Proxy**: We intercept all `get`, `set`, and `delete` operations on the object, tracking the exact path (e.g., `["user", "profile", "name"]`).
2. **Schema-Driven Flat Structure**: In `FlatJSONStorage`, we maintain a schema to flatten nested JSON objects in the storage layer. When you modify `data.a.b.c`, only the `a.b.c` key is updated in the adapter. Say goodbye to the performance nightmare of saving the whole object!

---

## 🗺 Roadmap

This project is under active development, but the current version is stable and usable.

- [x] Whole JSON Storage (`WebStorageItemStorage`)
- [x] localStorage / sessionStorage adaptation
- [x] Flat Storage Engine (`FlatJSONStorage` / `FlatWebStorage`)
- [x] Smart debouncing for array operations
- [x] Schema-based deep property traversal and loading
- [ ] Synchronous read flat storage
- [ ] Docs
- [ ] Unstorage backend adaptation
- [ ] IndexedDB adaptation

*(XML storage was planned but dropped. We are focusing on making JSON storage perfect!)*

## 🤝 Contributing

Issues, PRs, and suggestions are super welcome! Let's make state persistence elegant, together!

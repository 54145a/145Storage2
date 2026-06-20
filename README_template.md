# 📦 145 Storage 2: My KV is a **plain Object**

[![npm version](https://img.shields.io/npm/v/@54145a/storage2.svg)](https://www.npmjs.com/package/@54145a/storage2)[![license](https://img.shields.io/npm/l/@54145a/storage2.svg)](./LICENSE)[![GitHub stars](https://img.shields.io/github/stars/54145a/145Storage2.svg)](https://github.com/54145a/145Storage2)
> A lightweight, smart JavaScript storage library that makes state persistence as easy as modifying a plain object.

## Why 145 Storage 2

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

## 🚀 Try it now

```javascript

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
- [x] Synchronous read flat storage
- [x] Docs

This is the initial roadmap. See Github issues for more incoming.

*(XML storage was planned but dropped. We are focusing on making JSON storage perfect!)*

## 🤝 Contributing

Issues, PRs, and suggestions are super welcome! Let's make state persistence elegant, together!

## 📚 Reference

```typescript
{{DTS}}
```

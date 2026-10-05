// Runnable tour of @54145a/storage2. This file is the source of the
// "🚀 Try it now" block in README.md (injected by scripts/buildDocs.ts).
// Run it with: pnpm example
import assert from "node:assert/strict";
import { WebStorageItemStorage, FlatWebStorage, FlatUnstorage } from "./storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

localStorage.clear();

// 1) WebStorageItemStorage — one localStorage key, read/written as a plain object.
const settings = new WebStorageItemStorage("settings", localStorage);
settings.data.count = (settings.data.count ?? 0) + 1;
settings.data.user = { name: "alice", prefs: { theme: "dark" } };
settings.data.user.prefs.theme = "light"; // deep write, no re-serialize
await settings.update(); // flush now; otherwise it auto-flushes ~100ms later
console.log("[1] raw localStorage:", localStorage.getItem("settings"));
assert.equal(JSON.parse(localStorage.getItem("settings") ?? "{}").user.prefs.theme, "light");

// 2) FlatWebStorage — nested JSON flattened to one KV per leaf: only the
// touched leaf is written, so updating a deep property never re-serializes
// the whole object.
const flat = new FlatWebStorage({ namespace: "app", instance: localStorage });
await flat.init();
await flat.load("");
flat.data.count = 10;
flat.data.config = { display: { brightness: 80 } };
flat.data.config.display.brightness = 100; // persists just this leaf
flat.data.tags ??= [];
flat.data.tags.push("a", "b"); // array writes are merged/debounced
console.log("[2] brightness:", await flat.get`config.display.brightness`);
console.log("[2] tags:      ", await flat.get`tags`);
console.log("[2] top keys:  ", flat.getSubKeys(""));
assert.equal(await flat.get`config.display.brightness`, 100);
assert.deepEqual(await flat.get`tags`, ["a", "b"]);

// 3) FlatUnstorage — the same object syntax over any unstorage backend
// (memory here; swap in fs / redis / HTTP / Vercel KV, ...). unstorage is
// async, so always `await load()` up front or read via `flat.get`.
const kv = new FlatUnstorage({ storage: createStorage({ driver: memory() }) });
await kv.init();
await kv.load("");
kv.data.user = { name: "bob", prefs: { theme: "solarized" } };
console.log("[3] theme:", await kv.get`user.prefs.theme`);
assert.equal(await kv.get`user.prefs.theme`, "solarized");

console.log("\n🎉 example.js ran clean — all assertions passed.");

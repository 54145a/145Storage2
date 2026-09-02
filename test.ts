import assert from "node:assert/strict";
import { WebStorageItemStorage, FlatWebStorage, FlatUnstorage } from "./storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";


// #region Test Harness
async function test(name: string, fn: () => void | Promise<void>) {
  console.log(`  ▶ ${name}`);
  await fn();
  console.log(`  ✅ ${name}`);
}

function clearLocalStorage() {
  localStorage.clear();
}
// #endregion

// #region WebStorageItemStorage Tests
console.info("\n========================================");
console.info("WebStorageItemStorage");
console.info("========================================");

await test("should auto-persist data on property set", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_settings", localStorage);
  storage.data.count = 42;
  // Allow debounce flush
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_settings") || "{}");
  assert.equal(raw.count, 42);
});

await test("should load existing data from localStorage", async () => {
  clearLocalStorage();
  localStorage.setItem("test_existing", JSON.stringify({ name: "alice", level: 5 }));
  const storage = new WebStorageItemStorage("test_existing", localStorage);
  assert.equal(storage.data.name, "alice");
  assert.equal(storage.data.level, 5);
});

await test("should initialize with empty object when key missing", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_missing", localStorage);
  assert.deepEqual(storage.data, {});
});

await test("should persist nested object modifications", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_nested", localStorage);
  storage.data.user = { name: "bob", prefs: { theme: "dark" } };
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_nested") || "{}");
  assert.equal(raw.user.prefs.theme, "dark");
});

await test("should persist deep mutations on later-assigned nested objects", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_deep_late", localStorage);
  storage.data.user = { profile: { theme: "dark" }, tags: ["a"] };
  // Deep leaf write and array mutation through the later-assigned object must
  // go through the traps (regression: inner values were left unwrapped).
  storage.data.user.profile.theme = "light";
  storage.data.user.tags.push("b");
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_deep_late") || "{}");
  assert.equal(raw.user.profile.theme, "light");
  assert.deepEqual(raw.user.tags, ["a", "b"]);
});

await test("reusing a proxied object must not re-wrap it (no proxy-of-proxy)", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_reuse", localStorage);
  const shared = { profile: { name: "x" } };
  storage.data.a = shared;
  // Re-inserting a reference to the same (already-proxied) object and reading
  // back a proxied nested value must yield the SAME proxies — not a fresh
  // wrapper layer around a wrapper (regression: _eagerWrap had no guard).
  storage.data.b = { z: shared };
  storage.data.c = { p: storage.data.a.profile };
  assert.equal(storage.data.a, storage.data.b.z);
  assert.equal(storage.data.a.profile, storage.data.c.p);
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_reuse") || "{}");
  assert.equal(raw.a.profile.name, "x");
  assert.equal(raw.b.z.profile.name, "x");
  assert.equal(raw.c.p.name, "x");
});

await test("should handle delete property", async () => {
  clearLocalStorage();
  const storage = new WebStorageItemStorage("test_delete", localStorage);
  storage.data.a = 1;
  storage.data.b = 2;
  await new Promise((r) => setTimeout(r, 150));
  delete storage.data.a;
  await new Promise((r) => setTimeout(r, 150));
  const raw = JSON.parse(localStorage.getItem("test_delete") || "{}");
  assert.equal(raw.a, undefined);
  assert.equal(raw.b, 2);
});

// #endregion

// #region FlatWebStorage Tests

console.info("\n========================================");
console.info("FlatWebStorage");
console.info("========================================");

await test("init should complete without error", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_init", instance: localStorage });
  await flat.init();
  assert.equal(flat.isReady, true);
});

await test("should store and retrieve a simple value", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_simple", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.count = 10;
  await new Promise((r) => setTimeout(r, 150));
  const val = await flat.get`count`;
  assert.equal(val, 10);
});

await test("should handle array push with debouncing", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_arr", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.items ??= [];
  flat.data.items.push("a");
  flat.data.items.push("b");
  flat.data.items.push("c");
  await new Promise((r) => setTimeout(r, 150));
  const items = await flat.get`items`;
  assert.deepEqual(items, ["a", "b", "c"]);
});

await test("template string get should return correct value", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_tpl", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.username = "charlie";
  await new Promise((r) => setTimeout(r, 150));
  const result = await flat.get`username`;
  assert.equal(result, "charlie");
});

await test("sync read via proxy after cache clear should work", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_sync", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.val = 99;
  await new Promise((r) => setTimeout(r, 150));
  flat.cache.clear();
  flat.arrayDebouncers.clear();
  const syncVal = flat.data.val;
  assert.equal(syncVal, 99);
});

await test("load() should return synchronously for cached keys", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_loadsync", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.x = 7;
  await new Promise((r) => setTimeout(r, 150));
  // Already loaded, so load("x") should be synchronous
  const result = flat.load("x");
  assert.equal(result instanceof Promise, false, "load('x') should be synchronous when cached");
  assert.equal(result, 7);
});

await test("delete should remove a key", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_del", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.toRemove = "bye";
  await new Promise((r) => setTimeout(r, 150));
  await flat.delete("toRemove");
  const val = await flat.get`toRemove`;
  assert.equal(val, undefined);
});

await test("getSubKeys should list child keys", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_subkeys", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.alpha = 1;
  flat.data.beta = 2;
  flat.data.gamma = 3;
  await new Promise((r) => setTimeout(r, 150));
  const keys = flat.getSubKeys("");
  assert.ok(keys.includes("alpha"), `Expected 'alpha' in subkeys, got: [${keys}]`);
  assert.ok(keys.includes("beta"), `Expected 'beta' in subkeys, got: [${keys}]`);
  assert.ok(keys.includes("gamma"), `Expected 'gamma' in subkeys, got: [${keys}]`);
});

await test("getSubKeys on empty FLAT_LINK should return [] not string indices", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_emptylink", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.config = {};
  await new Promise((r) => setTimeout(r, 150));
  const keys = flat.getSubKeys("config");
  assert.deepEqual(keys, [], `Expected empty subkeys for empty FLAT_LINK, got: [${keys}]`);
});

await test("nested object deep set should auto-persist leaf", async () => {
  clearLocalStorage();
  const flat = new FlatWebStorage({ namespace: "t_deep", instance: localStorage });
  await flat.init();
  await flat.load("");
  flat.data.config = { display: { brightness: 80 } };
  await new Promise((r) => setTimeout(r, 150));
  flat.data.config.display.brightness = 100;
  await new Promise((r) => setTimeout(r, 150));
  const brightness = await flat.get`config.display.brightness`;
  assert.equal(brightness, 100);
});

await test("multiple namespaces should be isolated", async () => {
  clearLocalStorage();
  const flatA = new FlatWebStorage({ namespace: "iso_a", instance: localStorage });
  const flatB = new FlatWebStorage({ namespace: "iso_b", instance: localStorage });
  await flatA.init();
  await flatB.init();
  await flatA.load("");
  await flatB.load("");
  flatA.data.key = "fromA";
  flatB.data.key = "fromB";
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flatA.get`key`, "fromA");
  assert.equal(await flatB.get`key`, "fromB");
});
// #endregion

// #region FlatUnstorage Tests

function makeUnstorage() {
  return createStorage({ driver: memory() });
}

console.info("\n========================================");
console.info("FlatUnstorage");
console.info("========================================");

await test("unstorage: store and retrieve a simple value", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.count = 10;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flat.get`count`, 10);
});

await test("unstorage: can construct from a storage instance", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.x = 42;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flat.get`x`, 42);
});

await test("unstorage: persists across instances", async () => {
  const storage = makeUnstorage();
  const flatA = new FlatUnstorage({ storage });
  await flatA.init();
  await flatA.load("");
  flatA.data.user = { name: "alice", prefs: { theme: "dark" } };
  await new Promise((r) => setTimeout(r, 150));

  const flatB = new FlatUnstorage({ storage });
  await flatB.init();
  await flatB.load("");
  assert.equal(await flatB.get`user.prefs.theme`, "dark");
});

await test("unstorage: namespaces are isolated", async () => {
  const storage = makeUnstorage();
  const flatA = new FlatUnstorage({ storage, namespace: "ns_a" });
  const flatB = new FlatUnstorage({ storage, namespace: "ns_b" });
  await flatA.init();
  await flatB.init();
  await flatA.load("");
  await flatB.load("");
  flatA.data.key = "fromA";
  flatB.data.key = "fromB";
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await flatA.get`key`, "fromA");
  assert.equal(await flatB.get`key`, "fromB");
});

await test("unstorage: load() returns a Promise for async adapters", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.val = 99;
  await new Promise((r) => setTimeout(r, 150));
  flat.cache.clear();
  flat.arrayDebouncers.clear();
  const result = flat.load("val");
  assert.equal(result instanceof Promise, true, "load() should be async for unstorage");
  assert.equal(await result, 99);
});

await test("unstorage: sync read after cache clear throws", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.val = 99;
  await new Promise((r) => setTimeout(r, 150));
  flat.cache.clear();
  flat.arrayDebouncers.clear();
  assert.throws(() => { flat.data.val; }, /not loaded/);
});

await test("unstorage: delete should remove a key", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.toRemove = "bye";
  await new Promise((r) => setTimeout(r, 150));
  await flat.delete("toRemove");
  assert.equal(await flat.get`toRemove`, undefined);
});

await test("unstorage: array push with debouncing", async () => {
  const flat = new FlatUnstorage({ storage: makeUnstorage() });
  await flat.init();
  await flat.load("");
  flat.data.items ??= [];
  flat.data.items.push("a");
  flat.data.items.push("b");
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(await flat.get`items`, ["a", "b"]);
});

await test("unstorage: requires storage or driver", () => {
  // @ts-ignore - testing that missing storage throws
  assert.throws(() => new FlatUnstorage({}), /storage/i);
});
// #endregion

// #region Done
console.info("\n🎉 All tests passed!");
// #endregion


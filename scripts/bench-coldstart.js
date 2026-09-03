// bench-coldstart.js: 1MB JSON — cold start + deep path read
// Flat: store via API (builds schema), then reconstruct (cold start)
// Debounce: store as blob, then reconstruct (cold start)
// Valtio: no adapter, proxy creation
import { proxy } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";

// --- Generate ~1MB of nested JSON data ---
const MB_DATA = {};
const MB_SIZE = 10000;
for (let i = 0; i < MB_SIZE; i++) {
  MB_DATA[`k${i}`] = {
    id: i,
    name: `item_${i}`,
    config: { enabled: i % 2 === 0, priority: i % 10 },
    nested: { deep: { value: i * 42, label: `deep_${i}`, tags: ["a","b","c"] } },
  };
}
const MB_JSON = JSON.stringify(MB_DATA);
console.log(`Dataset: ${MB_SIZE} keys, ${(MB_JSON.length / 1024).toFixed(0)} KB JSON\n`);

// --- Pre-populate: write data using each storage's API ---
// Use synchronous adapters to avoid async issues

// Synchronous adapter (Storage API compatible)
function makeSyncAdapter(store) {
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

// Flat: write through API (builds schema + persists to adapter)
const flatRaw = {};
const flatPrep = new FlatWebStorage({ instance: makeSyncAdapter(flatRaw), namespace: "mb" });
await flatPrep.init();
await flatPrep.load("");
for (let i = 0; i < MB_SIZE; i++) flatPrep.data[`k${i}`] = MB_DATA[`k${i}`];
// Wait for schema debounce flush (100ms default delay)
await new Promise(r => setTimeout(r, 200));

// Debounce: pre-populate blob directly in synchronous adapter
const debRaw = {};
debRaw["data"] = MB_JSON;
const debAdapter = makeSyncAdapter(debRaw);

console.log("Data pre-populated.\n");

// --- Benchmark: cold start from pre-populated adapters ---
function bench(name, fn, N = 10) {
  for (let i = 0; i < 3; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) fn();
  const ms = performance.now() - t0;
  return { name, ms, perOp: (ms / N).toFixed(1) };
}
function printBench(r) {
  console.log(`  ${r.name.padEnd(44)} ${r.perOp.padStart(8)} ms/op`);
}

console.log("=== Cold start + read deep path ===\n");

// Flat: reconstruct + load("") (loads all keys from adapter using persisted schema)
printBench(bench("[Flat]  reconstruct + load('')", async () => {
  const f = new FlatWebStorage({ instance: makeSyncAdapter(flatRaw), namespace: "mb" });
  await f.init();
  await f.load("");                              // loads all keys via persisted schema
  const _ = f.data.k5000.nested.deep.value;      // read deep path
}));

// Flat: reconstruct + load('k5000') (partial load — ONE key)
printBench(bench("[Flat]  reconstruct + load('k5000')", async () => {
  const f = new FlatWebStorage({ instance: makeSyncAdapter(flatRaw), namespace: "mb" });
  await f.init();
  await f.load("k5000");                         // loads ONLY this key
  const _ = f.data.k5000.nested.deep.value;
}));

// Debounce: reconstruct from adapter (loads entire blob at construction)
printBench(bench("[Debounce] reconstruct (loads all from adapter)", async () => {
  const d = new WebStorageItemStorage("data", debAdapter, 200000);
  await d.init();
  const _ = d.data.k5000.nested.deep.value;
}));

// Valtio: proxy creation + eager init over entire dataset
printBench(bench("[Valtio]  proxy + eager init", () => {
  const p = proxy(JSON.parse(MB_JSON));
  const _ = p.k5000.nested.deep.value;
}));

// --- Verification ---
console.log("\n--- Verification ---");
{
  const f = new FlatWebStorage({ instance: makeSyncAdapter(flatRaw), namespace: "mb" });
  await f.init();
  await f.load("k5000");
  console.log(`  Flat  k5000.nested.deep.value = ${f.data.k5000.nested.deep.value}`);
}
{
  const d = new WebStorageItemStorage("data", debAdapter, 200000);
  await d.init();
  console.log(`  Debounce k5000.nested.deep.value = ${d.data.k5000.nested.deep.value}`);
}
{
  const p = proxy(JSON.parse(MB_JSON));
  console.log(`  Valtio  k5000.nested.deep.value = ${p.k5000.nested.deep.value}`);
}

console.log("\n=== Analysis ===");
console.log("Flat 'load(\\'k5000\\')' reads ONLY k5000 from adapter — partial load.");
console.log("Flat 'load(\\'\\')' reads ALL 10000 keys — full load (slower).");
console.log("Debounce must load entire blob at construction — no partial load.");
console.log("Valtio has no adapter — proxy creation wraps entire dataset.");

process.exit(0);

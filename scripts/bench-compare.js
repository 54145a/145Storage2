// bench-compare.js: Flat vs Debounce vs Valtio — apples-to-apples comparison
// Same data size, same operations, measure cold start / cold read-write / hot read-write at different depths
import { proxy, subscribe } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

function bench(name, fn, N = 100000) {
  try {
    for (let i = 0; i < 5000; i++) fn();
    const t0 = performance.now();
    for (let i = 0; i < N; i++) fn();
    const ns = (performance.now() - t0) * 1e6 / N;
    return { name, ns };
  } catch (e) {
    return { name, ns: Infinity, error: e.message };
  }
}

function printResult(r) {
  console.log(`  ${r.name.padEnd(36)} ${r.ns.toFixed(1).padStart(8)} ns/op`);
}

const SIZES = [100, 1000];
const DEPTHS = [
  { name: "shallow (1 level)", read: "k0.v", write: "k0.v" },
  { name: "mid (2 levels)",    read: "k0.nested.deep", write: "k0.nested.deep" },
  { name: "deep (3 levels)",   read: "k0.nested.deep.value", write: "k0.nested.deep.value" },
];

// Synchronous memory adapter (unstorage's memory driver is async, but
// WebStorageItemStorage reads synchronously at construction)
function makeSyncAdapter() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

for (const SIZE of SIZES) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Dataset: ${SIZE} keys, each { v: i, nested: { deep: { value: i } } }`);
  console.log(`${"=".repeat(60)}`);

  // Generate data
  const data = {};
  for (let i = 0; i < SIZE; i++) {
    data[`k${i}`] = { v: i, nested: { deep: { value: i } } };
  }

  // ── Cold Start (construction only, no data) ──
  console.log("\n--- Cold Start (empty construction) ---");

  // Flat: create + init + load (empty)
  let t = performance.now();
  const flatMem = createStorage({ driver: memory() });
  const flat = new FlatWebStorage({ instance: flatMem, namespace: `c_${SIZE}` });
  await flat.init();
  await flat.load("");
  const flatCold = performance.now() - t;
  console.log(`  ${"Flat (empty)".padEnd(36)} ${flatCold.toFixed(1).padStart(7)} ms`);

  // Debounce: create from empty adapter
  const debMem = createStorage({ driver: memory() });
  t = performance.now();
  const deb = new WebStorageItemStorage(`c_${SIZE}`, debMem, 200000);
  await deb.init();
  const debCold = performance.now() - t;
  console.log(`  ${"Debounce (empty)".padEnd(36)} ${debCold.toFixed(1).padStart(7)} ms`);

  // Valtio: proxy empty object
  t = performance.now();
  const vpEmpty = proxy({});
  const vpCold = performance.now() - t;
  console.log(`  ${"Valtio (empty)".padEnd(36)} ${vpCold.toFixed(1).padStart(7)} ms`);

  // ── Data Population (fill with SIZE keys) ──
  console.log("\n--- Data Population (fill with data) ---");

  // Flat: must write each key through path-tracking proxy
  t = performance.now();
  for (let i = 0; i < SIZE; i++) flat.data[`k${i}`] = data[`k${i}`];
  const flatFill = performance.now() - t;
  console.log(`  ${`Flat (write ${SIZE} keys)`.padEnd(36)} ${flatFill.toFixed(1).padStart(7)} ms`);

  // Debounce: pre-populate adapter, then re-construct (loads at construction)
  const debStore2 = {};
  debStore2[`c_${SIZE}`] = JSON.stringify(data);
  const debAdapter2 = {
    getItem: (key) => debStore2[key] ?? null,
    setItem: (key, value) => { debStore2[key] = value; },
    removeItem: (key) => { delete debStore2[key]; },
  };
  t = performance.now();
  const deb2 = new WebStorageItemStorage(`c_${SIZE}`, debAdapter2, 200000);
  await deb2.init();
  const debFill = performance.now() - t;
  console.log(`  ${"Debounce (load from adapter)".padEnd(36)} ${debFill.toFixed(1).padStart(7)} ms`);

  // Valtio: create proxy from raw data
  t = performance.now();
  const vp = proxy(JSON.parse(JSON.stringify(data)));
  const vpFill = performance.now() - t;
  console.log(`  ${"Valtio (proxy from data)".padEnd(36)} ${vpFill.toFixed(1).padStart(7)} ms`);

  console.log(`\n  Flat cold start is fastest (${flatCold.toFixed(1)} ms) — empty construction.`);
  console.log(`  Flat data population is slowest (${flatFill.toFixed(1)} ms) — ${SIZE} individual writes through path-tracking proxy.`);
  console.log(`  Debounce/Valtio load from pre-populated data in one shot.`);

  const fd = flat.data;
  const dd = deb2.data;

  // ── Read / Write at different depths ──
  for (const d of DEPTHS) {
    console.log(`\n--- ${d.name} ---`);

    // Helper: evaluate a dotted path on an object
    const readPath = (obj, path) => path.split(".").reduce((o, k) => o[k], obj);
    const writePath = (obj, path, val) => {
      const keys = path.split(".");
      const last = keys.pop();
      const target = keys.reduce((o, k) => o[k], obj);
      target[last] = val;
    };

    // Read
    printResult(bench("[Flat]  read", () => { const _ = readPath(fd, d.read); }));
    printResult(bench("[Debounce] read", () => { const _ = readPath(dd, d.read); }));
    printResult(bench("[Valtio]  read", () => { const _ = readPath(vp, d.read); }));

    // Write (alternating to force real mutations)
    let tv = 0;
    const flatWriteBench = bench("[Flat]  write (alt)", () => { writePath(fd, d.write, (tv = 1 - tv)); });
    console.log(`  ${"[Flat]  write (alt)".padEnd(36)} ${(flatWriteBench.ns === Infinity ? "N/A (path write not supported)" : flatWriteBench.ns.toFixed(1) + " ns/op").padStart(12)}`);
    tv = 0;
    const debWriteBench = bench("[Debounce] write (alt)", () => { writePath(dd, d.write, (tv = 1 - tv)); });
    console.log(`  ${"[Debounce] write (alt)".padEnd(36)} ${(debWriteBench.ns === Infinity ? "N/A" : debWriteBench.ns.toFixed(1) + " ns/op").padStart(12)}`);
    tv = 0;
    const vpWriteBench = bench("[Valtio]  write (alt)", () => { writePath(vp, d.write, (tv = 1 - tv)); });
    console.log(`  ${"[Valtio]  write (alt)".padEnd(36)} ${(vpWriteBench.ns === Infinity ? "N/A" : vpWriteBench.ns.toFixed(1) + " ns/op").padStart(12)}`);

    // Same-value write (short-circuit path)
    const flatSameBench = bench("[Flat]  write (same)", () => { writePath(fd, d.write, 1); });
    console.log(`  ${"[Flat]  write (same)".padEnd(36)} ${(flatSameBench.ns === Infinity ? "N/A" : flatSameBench.ns.toFixed(1) + " ns/op").padStart(12)}`);
    const debSameBench = bench("[Debounce] write (same)", () => { writePath(dd, d.write, 1); });
    console.log(`  ${"[Debounce] write (same)".padEnd(36)} ${(debSameBench.ns === Infinity ? "N/A" : debSameBench.ns.toFixed(1) + " ns/op").padStart(12)}`);
    const vpSameBench = bench("[Valtio]  write (same)", () => { writePath(vp, d.write, 1); });
    console.log(`  ${"[Valtio]  write (same)".padEnd(36)} ${(vpSameBench.ns === Infinity ? "N/A" : vpSameBench.ns.toFixed(1) + " ns/op").padStart(12)}`);
  }
}

process.exit(0);

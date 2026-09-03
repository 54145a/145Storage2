// bench-quick.js: Cold start + nested read using real localStorage
// Run: node --experimental-webstorage --localstorage-file=/tmp/bench.db scripts/bench-quick.js
import { proxy } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";

const ls = globalThis.localStorage;

function populateFlat(ns, data) {
  const keys = Object.keys(data);
  ls.clear();
  const f = new FlatWebStorage({ instance: ls, namespace: ns });
  return f.init().then(() => f.load("")).then(async () => {
    for (const k of keys) f.data[k] = data[k];
    await new Promise(r => setTimeout(r, 200));
  });
}

async function measureColdRead(ns, debounceKey, data) {
  const keys = Object.keys(data);

  // Flat: reconstruct + load(keys[0]) — partial load, reads 1 key
  const t0 = performance.now();
  const f = new FlatWebStorage({ instance: ls, namespace: ns });
  await f.init();
  await f.load(keys[0]);
  void f.data[keys[0]].nested.deep.value;
  const flatT = performance.now() - t0;

  // Debounce: construct (loads entire blob at construction)
  const t1 = performance.now();
  const d = new WebStorageItemStorage(debounceKey, ls, 200000);
  await d.init();
  void d.data[keys[0]].nested.deep.value;
  const debT = performance.now() - t1;

  return { flatT, debT };
}

console.log("═══════════════════════════════════════════════════════════════");
console.log("  Cold Start + Nested Read (real localStorage)");
console.log("═══════════════════════════════════════════════════════════════\n");

const sizes = [100, 1000, 10000];
const results = [];

for (const SIZE of sizes) {
  const data = {};
  for (let i = 0; i < SIZE; i++) {
    data[`k${i}`] = {
      id: i, name: `item_${i}`,
      config: { enabled: i % 2 === 0, priority: i % 10 },
      nested: { deep: { value: i * 42, label: `deep_${i}` } },
    };
  }
  await populateFlat(`flat_${SIZE}`, data);
  ls.setItem(`deb_${SIZE}`, JSON.stringify(data));
  const r = await measureColdRead(`flat_${SIZE}`, `deb_${SIZE}`, data);
  results.push({ SIZE, ...r });
}

console.log("  ┌────────────┬──────────┬──────────────────┐");
console.log("  │ Data Size  │   Flat   │    Debounce      │");
console.log("  ├────────────┼──────────┼──────────────────┤");
for (const { SIZE, flatT, debT } of results) {
  const faster = flatT < debT ? "flat" : "deb";
  const fmt = (ms, lbl) => lbl === faster ? `(${ms.toFixed(0)} ms)` : ms.toFixed(0) + " ms";
  console.log(`  │ ${(SIZE + " keys").padEnd(10)} │ ${fmt(flatT, "flat").padStart(8)} │ ${fmt(debT, "deb").padStart(14)} │`);
}
console.log("  └────────────┴──────────┴──────────────────┘");

console.log("\n  Flat: load one key (partial load) — reads only what it needs");
console.log("  Debounce: construct loads entire blob — must read everything\n");

ls.clear();
process.exit(0);

// bench-quick.js: Cold start + nested read — the one metric that matters
// For data of size X, measure: time from "nothing" to "reading a deep nested value"
import { proxy } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";

function makeSyncAdapter(store) {
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

async function measureColdRead(data) {
  const keys = Object.keys(data);
  const JSONBlob = JSON.stringify(data);

  // Flat: build schema via API, then reconstruct + load + read
  const flatRaw = {};
  const flatPrep = new FlatWebStorage({ instance: makeSyncAdapter(flatRaw), namespace: "mb" });
  await flatPrep.init(); await flatPrep.load("");
  for (const k of keys) flatPrep.data[k] = data[k];
  await new Promise(r => setTimeout(r, 200)); // schema flush

  const tFlat0 = performance.now();
  const f = new FlatWebStorage({ instance: makeSyncAdapter(flatRaw), namespace: "mb" });
  await f.init(); await f.load("");
  void f.data[keys[0]].nested.deep.value;
  const flatMs = performance.now() - tFlat0;

  // Debounce: pre-populate blob, then construct + read
  const debRaw = {};
  debRaw["d"] = JSONBlob;
  const debAdapter = makeSyncAdapter(debRaw);

  const tDeb0 = performance.now();
  const d = new WebStorageItemStorage("d", debAdapter, 200000);
  await d.init();
  void d.data[keys[0]].nested.deep.value;
  const debMs = performance.now() - tDeb0;

  // Valtio: proxy creation + eager init + read
  const tVp0 = performance.now();
  const p = proxy(JSON.parse(JSONBlob));
  void p[keys[0]].nested.deep.value;
  const vpMs = performance.now() - tVp0;

  return { flatMs, debMs, vpMs };
}

// ── Main ──
console.log("═══════════════════════════════════════════════════════════════");
console.log("  Cold Start + Nested Read — the one metric that matters");
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
  const jsonKB = (JSON.stringify(data).length / 1024).toFixed(0);
  const r = await measureColdRead(data);
  results.push({ SIZE, jsonKB, ...r });
}

// Print table
console.log("  ┌────────────┬──────────┬────────────────┬──────────┐");
console.log("  │ Data Size  │   Flat   │    Debounce    │  Valtio  │");
console.log("  ├────────────┼──────────┼────────────────┼──────────┤");
for (const { SIZE, jsonKB, flatMs, debMs, vpMs } of results) {
  const fastest = Math.min(flatMs, debMs, vpMs);
  const fmt = (ms) => ms === fastest ? `(${ms.toFixed(0)} ms)` : ms.toFixed(0) + " ms";
  console.log(`  │ ${(SIZE + " keys").padEnd(10)} │ ${fmt(flatMs).padStart(8)} │ ${fmt(debMs).padStart(14)} │ ${fmt(vpMs).padStart(8)} │`);
}
console.log("  └────────────┴──────────┴────────────────┴──────────┘");

console.log("\n  Each cell = total time: construct → populate → read k0.nested.deep.value");
console.log("  Flat: build schema via API, reconstruct, load(''), read");
console.log("  Debounce: construct from adapter (loads entire blob at construction), read");
console.log("  Valtio: proxy creation + eager init over entire dataset, read");
console.log("  (Bold values = fastest for that row)\n");

process.exit(0);

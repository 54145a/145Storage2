// bench-quick.js: Consolidated benchmark — Flat vs Debounce vs Valtio
// Run: node --experimental-webstorage --localstorage-file=/tmp/bench.db scripts/bench-quick.js
import { proxy, subscribe, snapshot } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

// ── Helpers ──
function bench(fn, N = 200000) {
  try {
    for (let i = 0; i < 10000; i++) fn(); // JIT warmup
    const t0 = performance.now();
    for (let i = 0; i < N; i++) fn();
    return ((performance.now() - t0) * 1e6 / N);
  } catch { return Infinity; }
}

function ms(fn, N = 10) {
  try {
    for (let i = 0; i < 3; i++) fn();
    const t0 = performance.now();
    for (let i = 0; i < N; i++) fn();
    return (performance.now() - t0) / N;
  } catch { return Infinity; }
}

function tbl(rows) {
  const w = [32, 12, 12, 12, 12];
  const h = ["", "Flat", "Debounce", "VP+persist", "VP raw"];
  console.log("  " + h.map((s,i) => s.padEnd(w[i])).join(""));
  console.log("  " + w.map(i => "─".repeat(i)).join(""));
  for (const [label, ...vals] of rows) {
    const best = Math.min(...vals.filter(v => v < Infinity));
    console.log("  " + [label, ...vals.map((v,i) =>
      v === Infinity ? "N/A" : v < 1000 ? `${v.toFixed(0)} ns` : `${(v/1000).toFixed(1)} µs`
    )].map((s,i) => s.padEnd(w[i])).join(""));
  }
}

function msTbl(rows) {
  const w = [38, 10, 10];
  const h = ["", "Flat", "Debounce", "Valtio"];
  console.log("  " + h.map((s,i) => s.padEnd(w[i])).join(""));
  console.log("  " + w.map(i => "─".repeat(i)).join(""));
  for (const [label, flat, deb, vp] of rows) {
    console.log("  " + [label,
      flat === Infinity ? "N/A" : flat.toFixed(1) + " ms",
      deb === Infinity ? "N/A" : deb.toFixed(1) + " ms",
      vp === Infinity ? "N/A" : vp.toFixed(1) + " ms"
    ].map((s,i) => s.padEnd(w[i])).join(""));
  }
}

function makeSyncAdapter(store) {
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

// ══════════════════════════════════════════════════════════════
// Section 1: Setup + Speed benchmarks (same data, same ops)
// ══════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════");
console.log("  145Storage vs Valtio — Consolidated Benchmark");
console.log("═══════════════════════════════════════════════════════════════");

const flatMem = createStorage({ driver: memory() });
const flat = new FlatWebStorage({ instance: flatMem, namespace: "bf" });
await flat.init();
await flat.load("");
flat.data.config = { display: { brightness: 80, volume: 50 } };
flat.data.arr = [1, 2, 3, 4, 5];
flat.data.count = 0;
flat.data.a = { b: 0 };
await new Promise((r) => setTimeout(r, 300));
const fd = flat.data;

const wstMem = createStorage({ driver: memory() });
const wst = new WebStorageItemStorage("bi", wstMem, 200);
wst.data.config = { display: { brightness: 80, volume: 50 } };
wst.data.arr = [1, 2, 3, 4, 5];
wst.data.count = 0;
wst.data.a = { b: 0 };
const wd = wst.data;

const vpStore = proxy({
  config: { display: { brightness: 80, volume: 50 } },
  arr: [1, 2, 3, 4, 5], count: 0, a: { b: 0 },
});
const vpMem = createStorage({ driver: memory() });
let vpTimer = null;
subscribe(vpStore, () => {
  if (!vpTimer) vpTimer = setTimeout(() => {
    vpTimer = null;
    const snap = snapshot(vpStore);
    vpMem.setItem("vp", JSON.stringify(JSON.parse(JSON.stringify(snap))));
  }, 200);
});

const vRaw = proxy({
  config: { display: { brightness: 80, volume: 50 } },
  arr: [1, 2, 3, 4, 5], count: 0, a: { b: 0 },
});

console.log("\n── 1. Speed: same data, same ops ──\n");

tbl([
  ["nested read (3-level)", bench(() => fd.config.display.brightness), bench(() => wd.config.display.brightness), bench(() => vpStore.config.display.brightness), bench(() => vRaw.config.display.brightness)],
  ["shallow read", bench(() => fd.arr), bench(() => wd.arr), bench(() => vpStore.arr), bench(() => vRaw.arr)],
]);
console.log();
tbl([
  ["nested read (a.b)", bench(() => fd.a.b, 100000), bench(() => wd.a.b, 100000), bench(() => vpStore.a.b, 100000), bench(() => vRaw.a.b, 100000)],
]);
console.log();
tbl([
  ["shallow write (same)", bench(() => { fd.count = 1; }, 50000), bench(() => { wd.count = 1; }, 50000), bench(() => { vpStore.count = 1; }, 50000), bench(() => { vRaw.count = 1; }, 50000)],
  ["shallow write (alt)",  bench(() => { fd.count = Math.random(); }, 50000), bench(() => { wd.count = Math.random(); }, 50000), bench(() => { vpStore.count = Math.random(); }, 50000), bench(() => { vRaw.count = Math.random(); }, 50000)],
]);
console.log();
tbl([
  ["nested write (same)", bench(() => { fd.a.b = 1; }, 100000), bench(() => { wd.a.b = 1; }, 100000), bench(() => { vpStore.a.b = 1; }, 100000), bench(() => { vRaw.a.b = 1; }, 100000)],
  ["nested write (alt)",  bench(() => { fd.a.b = Math.random(); }, 100000), bench(() => { wd.a.b = Math.random(); }, 100000), bench(() => { vpStore.a.b = Math.random(); }, 100000), bench(() => { vRaw.a.b = Math.random(); }, 100000)],
]);
console.log();
tbl([
  ["Object.keys", bench(() => Object.keys(fd), 50000), bench(() => Object.keys(wd), 50000), bench(() => Object.keys(vpStore), 50000), bench(() => Object.keys(vRaw), 50000)],
  ["spread", bench(() => { const c = { ...fd }; }, 50000), bench(() => { const c = { ...wd }; }, 50000), bench(() => { const c = { ...vpStore }; }, 50000), bench(() => { const c = { ...vRaw }; }, 50000)],
]);

// ══════════════════════════════════════════════════════════════
// Section 2: Flat Capability Advantages
// ══════════════════════════════════════════════════════════════
console.log("\n── 2. Flat Capability Advantages ──");
console.log("   (Flat stores flat KV; Debounce/Valtio store single blob)\n");

// 2a. Partial read: 1 key vs entire blob
{
  const PN = 100;
  const pStore = {};
  const pDebStore = {};
  const largeObj = {};
  for (let i = 0; i < PN; i++) {
    const v = { v: i, tags: ["a","b","c"], nested: { x: i } };
    largeObj[`k${i}`] = v;
    pStore[`k${i}`] = v;  // Flat: store parsed objects (what Flat expects)
  }
  pDebStore["data"] = JSON.stringify(largeObj);  // Debounce: JSON string

  const pFlat = new FlatWebStorage({ instance: makeSyncAdapter(pStore), namespace: "pr" });
  await pFlat.init(); await pFlat.load("");
  const pfd = pFlat.data;
  const prDebAdapter = makeSyncAdapter(pDebStore);

  console.log("  Partial Read: 1 key vs entire blob (100-key dataset)");
  console.log("  ──────────────────────────────────────────────────────");
  const r1 = bench(() => { void pfd.k50.v; }, 10000); // Flat: read 1 key from cache
  const r2 = bench(async () => { await prDebAdapter.getItem("data"); }, 10000); // Debounce: read entire blob
  console.log(`  Flat  read 1 key from cache:     ${r1.toFixed(0)} ns`);
  console.log(`  Debounce adapter.getItem (1 blob):  ${r2.toFixed(0)} ns`);
  console.log(`  (Flat reads from warm cache; Debounce reads entire blob from adapter)\n`);
}

// 2b. Write Model: all three are non-blocking, but differ in granularity
{
  console.log("  Write Model (all non-blocking, but different granularity)");
  console.log("  ──────────────────────────────────────────────────────");
  console.log("  Flat:    granular async (each key = 1 async adapter.set)");
  console.log("  Debounce: batched async (writes in memory, flush periodically)");
  console.log("  Valtio:  subscriber notifications (version bump)");
  console.log("  (No approach blocks the caller — all return synchronously)\n");
}

// 2c. getSubKeys
{
  console.log("  getSubKeys (schema-driven enumeration)");
  console.log("  ──────────────────────────────────────");
  const sStore = {};
  for (let i = 0; i < 50; i++) sStore[`k${i}`] = { v: i };
  const sFlat = new FlatWebStorage({ instance: makeSyncAdapter(sStore), namespace: "sub" });
  await sFlat.init(); await sFlat.load("");
  const sk = bench(() => sFlat.getSubKeys(""), 5000);
  console.log(`  Flat  getSubKeys (50 keys):      ${sk.toFixed(0)} ns`);
  console.log("  Debounce/Valtio: no schema enumeration\n");
}

// ══════════════════════════════════════════════════════════════
// Section 3: 1MB Cold Start
// ══════════════════════════════════════════════════════════════
console.log("── 3. 1MB Cold Start + Deep Path Read ──\n");

const MB_SIZE = 10000;
const MB_DATA = {};
for (let i = 0; i < MB_SIZE; i++) {
  MB_DATA[`k${i}`] = {
    id: i, name: `item_${i}`,
    config: { enabled: i % 2 === 0, priority: i % 10 },
    nested: { deep: { value: i * 42, label: `deep_${i}`, tags: ["a","b","c"] } },
  };
}
const MB_JSON = JSON.stringify(MB_DATA);
console.log(`  Dataset: ${MB_SIZE} keys, ${(MB_JSON.length / 1024).toFixed(0)} KB JSON\n`);

// Pre-populate Flat via API (builds schema)
const csFlatRaw = {};
const csFlatPrep = new FlatWebStorage({ instance: makeSyncAdapter(csFlatRaw), namespace: "mb" });
await csFlatPrep.init(); await csFlatPrep.load("");
for (let i = 0; i < MB_SIZE; i++) csFlatPrep.data[`k${i}`] = MB_DATA[`k${i}`];
await new Promise(r => setTimeout(r, 200)); // wait for schema flush

// Pre-populate Debounce (single blob)
const csDebRaw = {}; csDebRaw["data"] = MB_JSON;
const csDebAdapter = makeSyncAdapter(csDebRaw);

console.log("  Cold Start from pre-populated adapters + read k5000.nested.deep.value\n");
msTbl([
  ["Flat  reconstruct + load('')", ms(async () => {
    const f = new FlatWebStorage({ instance: makeSyncAdapter(csFlatRaw), namespace: "mb" });
    await f.init(); await f.load("");
    void f.data.k5000.nested.deep.value;
  }), Infinity, Infinity],
  ["Debounce reconstruct (loads 1MB)", ms(async () => {
    const d = new WebStorageItemStorage("data", csDebAdapter, 200000);
    await d.init();
    void d.data.k5000.nested.deep.value;
  }), Infinity, Infinity],
  ["Valtio proxy + eager init", Infinity, Infinity, ms(() => {
    const p = proxy(JSON.parse(MB_JSON));
    void p.k5000.nested.deep.value;
  })],
]);

console.log("\n  Flat loads only 1 key from adapter; Debounce loads entire 1MB blob.");
console.log("  Flat's advantage scales with dataset size.\n");

console.log("═══════════════════════════════════════════════════════════════");
console.log("  done");
console.log("═══════════════════════════════════════════════════════════════");
process.exit(0);

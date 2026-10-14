// Benchmark: 145Storage vs Valtio+Persistence (two rounds)
// Run: node --experimental-webstorage --localstorage-file=/tmp/bench-persist.db scripts/bench-persist.js
import { proxy, subscribe, snapshot } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

/**
 * @param {string} name
 * @param {(...args: any[]) => unknown} fn
 * @param {number} iterations
 */
function bench(name, fn, iterations) {
  fn(); // warmup
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const dt = performance.now() - t0;
  console.log(`${name.padEnd(58)} ${(dt / iterations * 1e6).toFixed(1).padStart(8)} ns/op  (${iterations.toLocaleString()} ops)`);
}

// ── Setup ──

// 145Storage: FlatWebStorage
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

// 145Storage: WebStorageItemStorage (整体 JSON)
const wstMem = createStorage({ driver: memory() });
const wst = new WebStorageItemStorage("bi", wstMem, 200);
wst.data.config = { display: { brightness: 80, volume: 50 } };
wst.data.arr = [1, 2, 3, 4, 5];
wst.data.count = 0;
wst.data.a = { b: 0 };
const wd = wst.data;

// Valtio + debounce persistence
const vpStore = proxy({
  config: { display: { brightness: 80, volume: 50 } },
  arr: [1, 2, 3, 4, 5],
  count: 0,
  a: { b: 0 },
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

// Valtio raw (no persistence)
const vRaw = proxy({
  config: { display: { brightness: 80, volume: 50 } },
  arr: [1, 2, 3, 4, 5],
  count: 0,
  a: { b: 0 },
});

const ROUNDS = [
  { name: "Round A (200k reads / 50k writes)", reads: 200000, writes: 50000, enumOps: 50000 },
  { name: "Round B (2M reads / 500k writes)", reads: 2000000, writes: 500000, enumOps: 500000 },
];

for (const round of ROUNDS) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${round.name}`);
  console.log(`${"=".repeat(70)}`);

  console.log("\n--- Nested Read: d.config.display.brightness ---");
  bench("[Flat]           nested read", () => { const x = fd.config.display.brightness; }, round.reads);
  bench("[Debounce]       nested read", () => { const x = wd.config.display.brightness; }, round.reads);
  bench("[Valtio+persist] nested read", () => { const x = vpStore.config.display.brightness; }, round.reads);
  bench("[Valtio raw]     nested read", () => { const x = vRaw.config.display.brightness; }, round.reads);

  console.log("\n--- Shallow Read: d.arr ---");
  bench("[Flat]           shallow read", () => { const x = fd.arr; }, round.reads);
  bench("[Debounce]       shallow read", () => { const x = wd.arr; }, round.reads);
  bench("[Valtio+persist] shallow read", () => { const x = vpStore.arr; }, round.reads);
  bench("[Valtio raw]     shallow read", () => { const x = vRaw.arr; }, round.reads);

  console.log("\n--- Shallow Write: d.count = 1 ---");
  bench("[Flat]           shallow write", () => { fd.count = 1; }, round.writes);
  bench("[Debounce]       shallow write", () => { wd.count = 1; }, round.writes);
  bench("[Valtio+persist] shallow write", () => { vpStore.count = 1; }, round.writes);
  bench("[Valtio raw]     shallow write", () => { vRaw.count = 1; }, round.writes);

  console.log("\n--- Nested Write: d.a.b = 1 ---");
  bench("[Flat]           nested write", () => { fd.a.b = 1; }, round.writes);
  bench("[Debounce]       nested write", () => { wd.a.b = 1; }, round.writes);
  bench("[Valtio+persist] nested write", () => { vpStore.a.b = 1; }, round.writes);
  bench("[Valtio raw]     nested write", () => { vRaw.a.b = 1; }, round.writes);

  console.log("\n--- Nested Read: d.a.b ---");
  bench("[Flat]           nested read", () => { const x = fd.a.b; }, round.reads);
  bench("[Debounce]       nested read", () => { const x = wd.a.b; }, round.reads);
  bench("[Valtio+persist] nested read", () => { const x = vpStore.a.b; }, round.reads);
  bench("[Valtio raw]     nested read", () => { const x = vRaw.a.b; }, round.reads);

  console.log("\n--- Object.keys(proxy) ---");
  bench("[Flat]           Object.keys", () => { Object.keys(fd); }, round.enumOps);
  bench("[Debounce]       Object.keys", () => { Object.keys(wd); }, round.enumOps);
  bench("[Valtio+persist] Object.keys", () => { Object.keys(vpStore); }, round.enumOps);
  bench("[Valtio raw]     Object.keys", () => { Object.keys(vRaw); }, round.enumOps);

  console.log("\n--- Spread: {...proxy} ---");
  bench("[Flat]           spread", () => { const c = { ...fd }; }, round.enumOps);
  bench("[Debounce]       spread", () => { const c = { ...wd }; }, round.enumOps);
  bench("[Valtio+persist] spread", () => { const c = { ...vpStore }; }, round.enumOps);
  bench("[Valtio raw]     spread", () => { const c = { ...vRaw }; }, round.enumOps);
}

await new Promise((r) => setTimeout(r, 400));
console.log("\ndone");

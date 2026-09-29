// Benchmark: 145Storage (Flat + Debounce) vs Valtio
// Run: node --experimental-webstorage --localstorage-file=/tmp/bench-valtio.db scripts/bench-valtio.js
import { proxy, subscribe, snapshot } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";

const N = 200000;

/**
 * @param {string} name
 * @param {(...args: any[]) => unknown} fn
 * @param {number} [iterations]
 */
function bench(name, fn, iterations = N) {
  fn(); // warmup
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const dt = performance.now() - t0;
  console.log(`${name.padEnd(58)} ${(dt / iterations * 1e6).toFixed(1).padStart(8)} ns/op  (${iterations.toLocaleString()} ops)`);
}

// ── 145Storage: FlatWebStorage ──
const flat = new FlatWebStorage({ instance: localStorage, namespace: "bench_flat" });
await flat.init();
await flat.load("");
flat.data.config = { display: { brightness: 80, volume: 50 } };
flat.data.arr = [1, 2, 3, 4, 5];
flat.data.count = 0;
flat.data.a = { b: 0 };
await new Promise((r) => setTimeout(r, 300));
const fd = flat.data;

// ── 145Storage: WebStorageItemStorage (整体 JSON) ──
const wst = new WebStorageItemStorage("bench_item", localStorage, 200);
wst.data.config = { display: { brightness: 80, volume: 50 } };
wst.data.arr = [1, 2, 3, 4, 5];
wst.data.count = 0;
wst.data.a = { b: 0 };
const wd = wst.data;

// ── Valtio ──
const vState = proxy({
  config: { display: { brightness: 80, volume: 50 } },
  arr: [1, 2, 3, 4, 5],
  count: 0,
  a: { b: 0 },
});

console.log("=== Nested Read: d.config.display.brightness ===");
bench("[Flat]      nested read", () => { const x = fd.config.display.brightness; });
bench("[Debounce]  nested read", () => { const x = wd.config.display.brightness; });
bench("[Valtio]    nested read", () => { const x = vState.config.display.brightness; });

console.log("\n=== Shallow Read: d.arr ===");
bench("[Flat]      shallow read", () => { const x = fd.arr; });
bench("[Debounce]  shallow read", () => { const x = wd.arr; });
bench("[Valtio]    shallow read", () => { const x = vState.arr; });

console.log("\n=== Shallow Write: d.count = 1 ===");
bench("[Flat]      shallow write", () => { fd.count = 1; }, 50000);
bench("[Debounce]  shallow write", () => { wd.count = 1; }, 50000);
bench("[Valtio]    shallow write", () => { vState.count = 1; }, 50000);

console.log("\n=== Nested Write: d.a.b = 1 ===");
bench("[Flat]      nested write", () => { fd.a.b = 1; }, 100000);
bench("[Debounce]  nested write", () => { wd.a.b = 1; }, 100000);
bench("[Valtio]    nested write", () => { vState.a.b = 1; }, 100000);

console.log("\n=== Nested Read: d.a.b ===");
bench("[Flat]      nested read", () => { const x = fd.a.b; }, 100000);
bench("[Debounce]  nested read", () => { const x = wd.a.b; }, 100000);
bench("[Valtio]    nested read", () => { const x = vState.a.b; }, 100000);

console.log("\n=== Object.keys(proxy) ===");
bench("[Flat]      Object.keys", () => { Object.keys(fd); }, 50000);
bench("[Debounce]  Object.keys", () => { Object.keys(wd); }, 50000);
bench("[Valtio]    Object.keys", () => { Object.keys(vState); }, 50000);

console.log("\n=== Spread: {...proxy} ===");
bench("[Flat]      spread", () => { const c = { ...fd }; }, 50000);
bench("[Debounce]  spread", () => { const c = { ...wd }; }, 50000);
bench("[Valtio]    spread", () => { const c = { ...vState }; }, 50000);

console.log("\n=== With Subscription ===");
let sink = 0;
const unsub = subscribe(vState, () => { sink++; });
bench("[Valtio+sub] shallow write", () => { vState.count = 1; }, 50000);
bench("[Valtio+sub] nested write", () => { vState.a.b = 1; }, 50000);
unsub();

const snap = snapshot(vState);
bench("[Valtio]    snapshot read", () => { const x = snap.config.display.brightness; });

await new Promise((r) => setTimeout(r, 400));
console.log("\ndone");

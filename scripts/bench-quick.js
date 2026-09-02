// Quick benchmark: 145Storage vs Valtio (Round A only, moderate iterations)
// Run: node --experimental-webstorage --localstorage-file=/tmp/bench-quick.db scripts/bench-quick.js
import { proxy, subscribe, snapshot } from "valtio/vanilla";
import { FlatWebStorage, WebStorageItemStorage } from "../storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

const N = 200000;

function bench(name, fn, iterations = N) {
  for (let i = 0; i < 10000; i++) fn(); // JIT warmup
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const dt = performance.now() - t0;
  console.log(`${name.padEnd(58)} ${(dt / iterations * 1e6).toFixed(1).padStart(8)} ns/op  (${iterations.toLocaleString()} ops)`);
}

// ── Setup ──
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

const vRaw = proxy({
  config: { display: { brightness: 80, volume: 50 } },
  arr: [1, 2, 3, 4, 5],
  count: 0,
  a: { b: 0 },
});

console.log("=== Nested Read: d.config.display.brightness ===");
bench("[Flat]           nested read", () => { const x = fd.config.display.brightness; });
bench("[Debounce]       nested read", () => { const x = wd.config.display.brightness; });
bench("[Valtio+persist] nested read", () => { const x = vpStore.config.display.brightness; });
bench("[Valtio raw]     nested read", () => { const x = vRaw.config.display.brightness; });

console.log("\n=== Shallow Read: d.arr ===");
bench("[Flat]           shallow read", () => { const x = fd.arr; });
bench("[Debounce]       shallow read", () => { const x = wd.arr; });
bench("[Valtio+persist] shallow read", () => { const x = vpStore.arr; });
bench("[Valtio raw]     shallow read", () => { const x = vRaw.arr; });

console.log("\n=== Shallow Write: d.count = 1 ===");
// Same-value writes measure the redundant-write short-circuit path
// (Debounce: Object.is guard; Valtio: objectIs guard; Flat: full work).
let t0v = 0, t1v = 0;
bench("[Flat]           shallow write (same-value)", () => { fd.count = 1; }, 50000);
bench("[Debounce]       shallow write (same-value)", () => { wd.count = 1; }, 50000);
bench("[Valtio+persist] shallow write (same-value)", () => { vpStore.count = 1; }, 50000);
bench("[Valtio raw]     shallow write (same-value)", () => { vRaw.count = 1; }, 50000);

// Alternating values force a REAL mutation on every iteration.
bench("[Flat]           shallow write (alternating)", () => { fd.count = (t0v = 1 - t0v); }, 50000);
bench("[Debounce]       shallow write (alternating)", () => { wd.count = (t1v = 1 - t1v); }, 50000);
bench("[Valtio+persist] shallow write (alternating)", () => { vpStore.count = (t0v = 1 - t0v); }, 50000);
bench("[Valtio raw]     shallow write (alternating)", () => { vRaw.count = (t1v = 1 - t1v); }, 50000);

console.log("\n=== Nested Write: d.a.b = 1 ===");
bench("[Flat]           nested write (same-value)", () => { fd.a.b = 1; }, 100000);
bench("[Debounce]       nested write (same-value)", () => { wd.a.b = 1; }, 100000);
bench("[Valtio+persist] nested write (same-value)", () => { vpStore.a.b = 1; }, 100000);
bench("[Valtio raw]     nested write (same-value)", () => { vRaw.a.b = 1; }, 100000);

bench("[Flat]           nested write (alternating)", () => { fd.a.b = (t0v = 1 - t0v); }, 100000);
bench("[Debounce]       nested write (alternating)", () => { wd.a.b = (t1v = 1 - t1v); }, 100000);
bench("[Valtio+persist] nested write (alternating)", () => { vpStore.a.b = (t0v = 1 - t0v); }, 100000);
bench("[Valtio raw]     nested write (alternating)", () => { vRaw.a.b = (t1v = 1 - t1v); }, 100000);

console.log("\n=== Nested Read: d.a.b ===");
bench("[Flat]           nested read", () => { const x = fd.a.b; }, 100000);
bench("[Debounce]       nested read", () => { const x = wd.a.b; }, 100000);
bench("[Valtio+persist] nested read", () => { const x = vpStore.a.b; }, 100000);
bench("[Valtio raw]     nested read", () => { const x = vRaw.a.b; }, 100000);

console.log("\n=== Object.keys(proxy) ===");
bench("[Flat]           Object.keys", () => { Object.keys(fd); }, 50000);
bench("[Debounce]       Object.keys", () => { Object.keys(wd); }, 50000);
bench("[Valtio+persist] Object.keys", () => { Object.keys(vpStore); }, 50000);
bench("[Valtio raw]     Object.keys", () => { Object.keys(vRaw); }, 50000);

console.log("\n=== Spread: {...proxy} ===");
bench("[Flat]           spread", () => { const c = { ...fd }; }, 50000);
bench("[Debounce]       spread", () => { const c = { ...wd }; }, 50000);
bench("[Valtio+persist] spread", () => { const c = { ...vpStore }; }, 50000);
bench("[Valtio raw]     spread", () => { const c = { ...vRaw }; }, 50000);

await new Promise((r) => setTimeout(r, 400));
console.log("\ndone");

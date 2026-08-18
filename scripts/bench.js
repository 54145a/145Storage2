// Benchmarks hot proxy paths. Run: node --experimental-webstorage --localstorage-file=/tmp/bench.db scripts/bench.js
import { WebStorageItemStorage, FlatUnstorage } from "../storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

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
  console.log(`${name.padEnd(52)} ${(dt / iterations * 1e6).toFixed(1).padStart(8)} ns/op  (${iterations.toLocaleString()} ops)`);
}

const storage = new FlatUnstorage({ storage: createStorage({ driver: memory() }) });
await storage.init();
await storage.load("");
storage.data.config = { display: { brightness: 80, volume: 50 } };
storage.data.arr = [1, 2, 3, 4, 5];
await new Promise((r) => setTimeout(r, 300));

const d = storage.data;

bench("nested read  d.config.display.brightness", () => {
  const x = d.config.display.brightness;
});
bench("shallow read d.arr", () => {
  const x = d.arr;
});
bench("shallow write d.count = i", () => {
  d.count = 1;
}, 50000);

// enumeration-heavy ops (hit ownKeys + getOwnPropertyDescriptor traps)
bench("Object.keys(proxy)", () => {
  Object.keys(d);
}, 50000);
bench("spread {...d}", () => {
  const copy = { ...d };
}, 50000);

// JSONDebounceStorage (WebStorageItemStorage) write path
const wst = new WebStorageItemStorage("bench_item", localStorage, 200);
wst.data.user = { name: "alice", prefs: { theme: "dark" } };
wst.data.a = {};
const wd = wst.data;
bench("nested write wst.data.a.b = i", () => {
  wd.a.b = 1;
}, 100000);
bench("nested read  wst.data.a.b", () => {
  const x = wd.a.b;
}, 100000);

await new Promise((r) => setTimeout(r, 400));
console.log("done");

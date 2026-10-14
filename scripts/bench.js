// Benchmarks hot proxy paths. Run: node --experimental-webstorage --localstorage-file=/tmp/bench.db scripts/bench.js
import { WebStorageItemStorage, FlatUnstorage, FlatWebStorage } from "../storage.js";
import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

const N = 200000;
const REPS = 5;

// Every measured value lands here. The traps are side-effect free, so V8 may
// delete a whole `Object.keys(proxy)` whose result nothing reads — a discarded
// result can measure a fraction of the work actually being done.
let sink = 0;

/**
 * Runs `iterations` passes REPS times and reports the best pass. A single
 * averaged pass mostly reports scheduling noise plus whatever the loop costs
 * before V8 finishes optimizing it — on a loaded machine the two differ by an
 * order of magnitude for identical code.
 * @param {string} name
 * @param {(i: number) => unknown} fn
 * @param {number} [iterations]
 */
function bench(name, fn, iterations = N) {
  for (let i = 0; i < 1000; i++) fn(i); // warmup
  let best = Infinity;
  for (let r = 0; r < REPS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) fn(i);
    const dt = (performance.now() - t0) / iterations * 1e6;
    if (dt < best) best = dt;
  }
  console.log(`${name.padEnd(50)} ${best.toFixed(1).padStart(8)} ns/op  (${iterations.toLocaleString()}×${REPS})`);
}

const storage = new FlatUnstorage({ storage: createStorage({ driver: memory() }) });
await storage.init();
await storage.load("");
storage.data.config = { display: { brightness: 80, volume: 50 } };
storage.data.arr = [1, 2, 3, 4, 5];
await new Promise((r) => setTimeout(r, 300));

const d = storage.data;

console.log("reads");
bench("nested read  d.config.display.brightness", () => { sink += d.config.display.brightness; });
bench("shallow read d.arr", () => { sink += d.arr.length; });

console.log("\nenumeration (ownKeys trap + one descriptor per key)");
bench("Object.keys(proxy)", () => { sink += Object.keys(d).length; }, 50000);
bench("spread {...d}", () => { sink += Object.keys({ ...d }).length; }, 50000);
let enumWrite = 0;
bench("write then enumerate (caches invalidated)", () => { d.count = enumWrite++; sink += Object.keys(d).length; }, 20000);

// Writes must vary: assigning the same value every iteration hits the
// identical-value fast path, which reports the no-op guard, not a write.
console.log("\nwrites — FlatJSONStorage (memory driver)");
let w = 0;
bench("shallow write d.count = w++", () => { d.count = w++; }, 50000);
bench("  same, constant value (fast path)", () => { d.count = 1; }, 50000);
bench("nested write d.config.display.brightness", (i) => { d.config.display.brightness = i; }, 50000);

console.log("\nwrites — FlatJSONStorage (synchronous localStorage adapter)");
const web = new FlatWebStorage({ instance: localStorage, namespace: "bench_web" });
await web.init();
await web.load("");
web.data.config = { display: { brightness: 80 } };
await new Promise((r) => setTimeout(r, 300));
let v = 0;
bench("shallow write web.count = v++", () => { web.data.count = v++; }, 20000);

console.log("\nJSONDebounceStorage (whole-document, debounced)");
const wst = new WebStorageItemStorage("bench_item", localStorage, 20);
wst.data.user = { name: "alice", prefs: { theme: "dark" } };
wst.data.a = {};
const wd = wst.data;
let k = 0;
bench("nested write wst.data.a.b = k++", () => { wd.a.b = k++; }, 100000);
bench("  same, constant value (fast path)", () => { wd.a.b = 1; }, 100000);
bench("nested read  wst.data.a.b", () => { sink += wd.a.b; }, 100000);

await new Promise((r) => setTimeout(r, 400));
console.log(`\ndone (sink: ${sink})`);

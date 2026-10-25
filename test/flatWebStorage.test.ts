import { describe, it, expect } from "vitest";
import { FlatJSONStorage, FlatWebStorage } from "../storage.js";
import { clearLocalStorage, waitForFlush } from "./helpers.js";

function makeFlat(namespace: string) {
	return new FlatWebStorage({ namespace, instance: localStorage });
}

describe("FlatWebStorage", () => {
	it("init should complete without error", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_init");
		await flat.init();
		expect(flat.isReady).toBe(true);
	});

	it("stores and retrieves a simple value", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_simple");
		await flat.init();
		await flat.load("");
		flat.data.count = 10;
		// PRIMITIVE 叶子同步写入适配器，无需等待防抖。
		expect(localStorage.getItem("t_simple:count")).toBe("10");
		expect(await flat.get`count`).toBe(10);
	});

	it("handles array push with debouncing", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_arr");
		await flat.init();
		await flat.load("");
		flat.data.items ??= [];
		flat.data.items.push("a");
		flat.data.items.push("b");
		flat.data.items.push("c");
		await waitForFlush(() => {
			expect(JSON.parse(localStorage.getItem("t_arr:items") ?? "null")).toEqual(["a", "b", "c"]);
		});
		expect(await flat.get`items`).toEqual(["a", "b", "c"]);
	});

	it("persists a replaced array and a new instance reloads it", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_arr_repl");
		await flat.init();
		await flat.load("");
		// The debouncer replays a replacement onto its own array with splice(), where
		// every index write is already Object.is-equal — the no-op write fast path
		// must not swallow the flush (regression: the key stayed at []).
		flat.data.items = ["a", "b"];
		// 数组值与 schema 标记各自走 100ms 防抖；显式等两者都落地，
		// 不依赖定时器触发顺序。
		await waitForFlush(() => {
			expect(JSON.parse(localStorage.getItem("t_arr_repl:items") ?? "null")).toEqual(["a", "b"]);
			expect(JSON.parse(localStorage.getItem("t_arr_repl:__145Storage__flatSchema__") ?? "{}")).toMatchObject({
				items: "[]",
			});
		});
		// A fresh instance reads the array through the adapter, so the stored
		// contents must reach the debouncer instead of an empty one.
		const fresh = makeFlat("t_arr_repl");
		await fresh.init();
		expect(await fresh.get`items`).toEqual(["a", "b"]);
	});

	it("persists flat leaves immediately; only array keys are debounced", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_debounce");
		await flat.init();
		await flat.load("");
		// Documented asymmetry: requestUpdate() only backs DEBOUNCE_ARRAY keys and
		// whole-blob storages. A single value reaches the adapter before the
		// assignment statement returns.
		flat.data.count = 1;
		flat.data.cfg = { theme: "dark" };
		expect(localStorage.getItem("t_debounce:count")).toBe("1");
		expect(localStorage.getItem("t_debounce:cfg.theme")).toBe(JSON.stringify("dark"));
		flat.data.items = [1];
		expect(localStorage.getItem("t_debounce:items")).toBeNull();
		await waitForFlush(() => {
			expect(JSON.parse(localStorage.getItem("t_debounce:items") ?? "null")).toEqual([1]);
		});
	});

	it("template string get returns the correct value", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_tpl");
		await flat.init();
		await flat.load("");
		flat.data.username = "charlie";
		expect(await flat.get`username`).toBe("charlie");
	});

	it("reads synchronously via the proxy after a cache clear", async () => {
		// 白盒回归测试：直接操作内部缓存字段，验证同步适配器在缓存失效后
		// 仍能同步重载（重构时若字段改名需同步更新）。
		clearLocalStorage();
		const flat = makeFlat("t_sync");
		await flat.init();
		await flat.load("");
		flat.data.val = 99;
		flat.cache.clear();
		flat.arrayDebouncers.clear();
		expect(flat.data.val).toBe(99);
	});

	it("load() returns synchronously for cached keys", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_loadsync");
		await flat.init();
		await flat.load("");
		flat.data.x = 7;
		// Already loaded, so load("x") should be synchronous
		const result = flat.load("x");
		expect(result instanceof Promise).toBe(false);
		expect(result).toBe(7);
	});

	it("delete removes a key", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_del");
		await flat.init();
		await flat.load("");
		flat.data.toRemove = "bye";
		await flat.delete("toRemove");
		expect(await flat.get`toRemove`).toBeUndefined();
	});

	it("getSubKeys lists child keys", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_subkeys");
		await flat.init();
		await flat.load("");
		flat.data.alpha = 1;
		flat.data.beta = 2;
		flat.data.gamma = 3;
		// schema 的内存更新是同步的，无需等待防抖。
		expect(flat.getSubKeys("").sort()).toEqual(["alpha", "beta", "gamma"]);
	});

	it("getSubKeys on an empty FLAT_LINK returns [] not string indices", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_emptylink");
		await flat.init();
		await flat.load("");
		flat.data.config = {};
		expect(flat.getSubKeys("config")).toEqual([]);
	});

	it("enumeration stays correct while keys are added, replaced and removed", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_enum");
		await flat.init();
		await flat.load("");
		// Warm the ownKeys/descriptor caches first, then mutate underneath them:
		// invalidation is per path now, so a stale entry would show up as a key
		// that no longer exists but still enumerates.
		flat.data.a = 1;
		flat.data.b = { c: 2, d: { e: 3 } };
		expect(Object.keys(flat.data).sort()).toEqual(["a", "b"]);
		flat.data.a = 2;
		expect(Object.keys(flat.data).sort()).toEqual(["a", "b"]);
		flat.data.b = 5; // branch -> primitive: the former children must vanish
		expect({ ...flat.data }).toEqual({ a: 2, b: 5 });
		expect(JSON.stringify(flat.data)).toBe(JSON.stringify({ a: 2, b: 5 }));
		delete flat.data.a;
		expect(Object.keys(flat.data)).toEqual(["b"]);
		flat.data.fresh = { deep: { leaf: 1 } };
		expect(Object.keys(flat.data).sort()).toEqual(["b", "fresh"]);
		expect(Object.keys(flat.data.fresh)).toEqual(["deep"]);
		expect(Object.keys(flat.data.fresh.deep)).toEqual(["leaf"]); // warms ownKeys("fresh.deep")
		flat.data.fresh.deep.added = 2; // new child of that branch
		expect(Object.keys(flat.data.fresh.deep).sort()).toEqual(["added", "leaf"]);
		expect(Object.keys(flat.data.fresh)).toEqual(["deep"]); // its parent is unchanged
		const seen: string[] = [];
		for (const k in flat.data) seen.push(k);
		expect(seen.sort()).toEqual(["b", "fresh"]);
		expect("deep" in flat.data.fresh).toBe(true);
	});

	it("reports undefined for a missing deep path instead of throwing", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_missingpath");
		await flat.init();
		await flat.load("");
		flat.data.config = { display: { brightness: 80 } };
		expect(flat.data.nothing).toBeUndefined();
		expect(flat.data.config.nope).toBeUndefined();
		expect("nope" in flat.data.config).toBe(false);
		// These resolve a multi-segment path that does not exist: the schema lookup
		// used to throw (and `load`/`get` propagated it) instead of reporting "no such key".
		expect(flat.getSubKeys("nope.deeper").length).toBe(0);
		expect(await flat.load("nope.deeper")).toBeUndefined();
		expect(await flat.get`nope.deeper`).toBeUndefined();
	});

	it("auto-persists a leaf set through a nested object", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_deep");
		await flat.init();
		await flat.load("");
		flat.data.config = { display: { brightness: 80 } };
		flat.data.config.display.brightness = 100;
		// 叶子写入是同步的：缓存与适配器都立即可见。
		expect(localStorage.getItem("t_deep:config.display.brightness")).toBe("100");
		expect(await flat.get`config.display.brightness`).toBe(100);
	});

	it("isolates multiple namespaces", async () => {
		clearLocalStorage();
		const flatA = makeFlat("iso_a");
		const flatB = makeFlat("iso_b");
		await flatA.init();
		await flatB.init();
		await flatA.load("");
		await flatB.load("");
		flatA.data.key = "fromA";
		flatB.data.key = "fromB";
		expect(localStorage.getItem("iso_a:key")).toBe('"fromA"');
		expect(localStorage.getItem("iso_b:key")).toBe('"fromB"');
		expect(await flatA.get`key`).toBe("fromA");
		expect(await flatB.get`key`).toBe("fromB");
	});

	// #region 新增：构造校验与写入契约

	it("throws when the Storage instance is missing", () => {
		// @ts-expect-error - testing that a missing instance throws
		expect(() => new FlatWebStorage({})).toThrow(TypeError);
	});

	it("rejects non-JSON values with TypeError", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_illegal");
		await flat.init();
		await flat.load("");
		const illegal: unknown[] = [undefined, NaN, Infinity, () => {}, new Date()];
		for (const value of illegal) {
			expect(() => {
				flat.data.x = value;
			}).toThrow(TypeError);
		}
	});

	it("rejects arrays containing non-primitive values", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_badarr");
		await flat.init();
		await flat.load("");
		expect(() => {
			flat.data.arr = [{}];
		}).toThrow(TypeError);
		expect(() => {
			flat.data.arr = [1, "two", null, true];
		}).not.toThrow();
	});

	it("supports interpolation in the template-tag get", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_interp");
		await flat.init();
		await flat.load("");
		flat.data.user = { name: "alice" };
		const key = "user.name";
		expect(await flat.get`${key}`).toBe("alice");
	});

	it("removes child keys from the adapter when a branch is replaced by a primitive", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_branch");
		await flat.init();
		await flat.load("");
		flat.data.b = { c: 2, d: { e: 3 } };
		// FLAT_LINK 的叶子写入同步落地。
		expect(localStorage.getItem("t_branch:b.c")).toBe("2");
		expect(localStorage.getItem("t_branch:b.d.e")).toBe("3");
		flat.data.b = 5; // branch -> primitive: _clearCache 同步删除子键
		expect(localStorage.getItem("t_branch:b.c")).toBeNull();
		expect(localStorage.getItem("t_branch:b.d.e")).toBeNull();
		expect(localStorage.getItem("t_branch:b")).toBe("5");
	});

	it("delete('') removes every key and the schema", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_delall");
		await flat.init();
		await flat.load("");
		flat.data.a = 1;
		flat.data.b = { c: 2 };
		await flat.delete("");
		expect(localStorage.getItem("t_delall:a")).toBeNull();
		expect(localStorage.getItem("t_delall:b.c")).toBeNull();
		expect(await flat.get`a`).toBeUndefined();
		// schema 文档的清理走防抖 flush。
		await waitForFlush(() => {
			expect(localStorage.getItem("t_delall:__145Storage__flatSchema__")).toBe("{}");
		});
	});

	it("returns undefined for corrupt JSON stored in the adapter", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_corrupt");
		await flat.init();
		await flat.load("");
		flat.data.a = 1;
		expect(localStorage.getItem("t_corrupt:a")).toBe("1");
		localStorage.setItem("t_corrupt:a", "{bad"); // 模拟适配器侧的损坏数据
		flat.cache.clear();
		flat.arrayDebouncers.clear();
		const errors: unknown[][] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args);
		};
		try {
			expect(await flat.get`a`).toBeUndefined();
		} finally {
			console.error = originalError;
		}
		expect(errors.length).toBe(1);
	});

	it("supports the in operator at the root level", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_has");
		await flat.init();
		await flat.load("");
		flat.data.count = 1;
		expect("count" in flat.data).toBe(true);
		expect("nope" in flat.data).toBe(false);
	});

	it("keeps an existing array when using ??=", async () => {
		clearLocalStorage();
		const flat = makeFlat("t_nullish");
		await flat.init();
		await flat.load("");
		flat.data.items = ["x"];
		flat.data.items ??= ["y"]; // 已存在 —— 不覆盖
		expect(await flat.get`items`).toEqual(["x"]);
	});


	// #region 新增：代理 target 归属隔离（不依赖调用方传入对象）

	it("isolates a schema object shared by two adapters (no user-supplied object)", async () => {
		// 两个适配器对「尚无 schema」返回同一个模块级默认对象。该对象是库自身
		// 交给 JSONDebounceStorage 的（structuredCloneExempt），并非用户传入；
		// 若按 raw target 复用，两个实例的 schema 会互相污染。
		const defaultSchema = {};
		const makeAdapter = () => {
			const store = new Map<string, unknown>();
			return {
				store,
				adapter: {
					get: (key: string) => (key === "__145Storage__flatSchema__" ? defaultSchema : store.get(key)),
					set: (key: string, value: unknown) => void store.set(key, value),
					delete: (key: string) => void store.delete(key),
				},
			};
		};
		const one = makeAdapter();
		const two = makeAdapter();
		const flatOne = new FlatJSONStorage(one.adapter);
		const flatTwo = new FlatJSONStorage(two.adapter);
		await flatOne.init();
		await flatTwo.init();

		flatOne.data.a = 1;
		await waitForFlush(() => {
			expect(one.store.get("__145Storage__flatSchema__")).toEqual({ a: 0 });
		});
		flatTwo.data.b = 2;
		await waitForFlush(() => {
			expect(two.store.get("__145Storage__flatSchema__")).toEqual({ b: 0 });
		});
		// 第二个实例的 schema 写入不得混入第一个实例的后端。
		expect(one.store.get("__145Storage__flatSchema__")).toEqual({ a: 0 });
	});

	it("isolates an array object shared by two array keys (no user-supplied object)", async () => {
		// 适配器对缺失的 key 返回同一个共享空数组；两个数组键各自建立
		// debouncer 时都拿到这个 raw target。它同样不是用户传入的。
		const EMPTY: unknown[] = [];
		const store = new Map<string, unknown>([["__145Storage__flatSchema__", { a: "[]", b: "[]" }]]);
		const flat = new FlatJSONStorage({
			get: (key: string) => (key === "__145Storage__flatSchema__" ? store.get(key) : (store.get(key) ?? EMPTY)),
			set: (key: string, value: unknown) => void store.set(key, value),
			delete: (key: string) => void store.delete(key),
		});
		await flat.init();

		flat.data.a;
		flat.data.b;
		flat.data.a.push(1);
		await waitForFlush(() => {
			expect(store.get("a")).toEqual([1]);
		});
		// b 的视图不得被 a 的写入污染。
		expect(JSON.parse(JSON.stringify(flat.data.b))).toEqual([]);

		flat.data.b.push(9);
		await waitForFlush(() => {
			expect(store.get("b")).toEqual([9]);
		});
		expect(store.get("a")).toEqual([1]);
	});

	// #endregion
});

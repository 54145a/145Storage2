import { describe, it, expect } from "vitest";
import { FlatUnstorage, StorageInterface } from "../storage.js";
import { clearLocalStorage, makeUnstorage, waitForFlush } from "./helpers.js";

describe("FlatUnstorage", () => {
	it("stores and retrieves a simple value", async () => {
		const flat = new FlatUnstorage({ storage: makeUnstorage() });
		await flat.init();
		await flat.load("");
		flat.data.count = 10;
		// 缓存写入是同步的，读取无需等待防抖。
		expect(await flat.get`count`).toBe(10);
	});

	it("can construct from a storage instance", async () => {
		const flat = new FlatUnstorage({ storage: makeUnstorage() });
		await flat.init();
		await flat.load("");
		flat.data.x = 42;
		expect(await flat.get`x`).toBe(42);
	});

	it("persists across instances", async () => {
		const storage = makeUnstorage();
		const flatA = new FlatUnstorage({ storage });
		await flatA.init();
		await flatA.load("");
		flatA.data.user = { name: "alice", prefs: { theme: "dark" } };
		// unstorage 适配器是异步的，且 schema 文档走 100ms 防抖：
		// 新实例 init 时要读到 schema，必须等两者都落地。
		await waitForFlush(async () => {
			expect(await storage.getItem("user.prefs.theme")).toBe("dark");
			expect(await storage.getItem("__145Storage__flatSchema__")).toMatchObject({
				user: { prefs: { theme: 0 } },
			});
		});

		const flatB = new FlatUnstorage({ storage });
		await flatB.init();
		await flatB.load("");
		expect(await flatB.get`user.prefs.theme`).toBe("dark");
	});

	it("isolates namespaces", async () => {
		const storage = makeUnstorage();
		const flatA = new FlatUnstorage({ storage, namespace: "ns_a" });
		const flatB = new FlatUnstorage({ storage, namespace: "ns_b" });
		await flatA.init();
		await flatB.init();
		await flatA.load("");
		await flatB.load("");
		flatA.data.key = "fromA";
		flatB.data.key = "fromB";
		await waitForFlush(async () => {
			expect(await storage.getItem("ns_a:key")).toBe("fromA");
			expect(await storage.getItem("ns_b:key")).toBe("fromB");
		});
		expect(await flatA.get`key`).toBe("fromA");
		expect(await flatB.get`key`).toBe("fromB");
	});

	it("load() returns a Promise for async adapters", async () => {
		const storage = makeUnstorage();
		const flat = new FlatUnstorage({ storage });
		await flat.init();
		await flat.load("");
		flat.data.val = 99;
		// 清缓存前先等异步写入落地，否则 load 读到的是 undefined。
		await waitForFlush(async () => {
			expect(await storage.getItem("val")).toBe(99);
		});
		flat.cache.clear();
		flat.arrayDebouncers.clear();
		const result = flat.load("val");
		expect(result instanceof Promise).toBe(true);
		expect(await result).toBe(99);
	});

	it("throws on a sync read after a cache clear", async () => {
		const storage = makeUnstorage();
		const flat = new FlatUnstorage({ storage });
		await flat.init();
		await flat.load("");
		flat.data.val = 99;
		await waitForFlush(async () => {
			expect(await storage.getItem("val")).toBe(99);
		});
		flat.cache.clear();
		flat.arrayDebouncers.clear();
		expect(() => {
			flat.data.val;
		}).toThrow(/not loaded/);
	});

	it("delete removes a key", async () => {
		const storage = makeUnstorage();
		const flat = new FlatUnstorage({ storage });
		await flat.init();
		await flat.load("");
		flat.data.toRemove = "bye";
		await waitForFlush(async () => {
			expect(await storage.getItem("toRemove")).toBe("bye");
		});
		await flat.delete("toRemove");
		expect(await storage.getItem("toRemove")).toBeNull();
		expect(await flat.get`toRemove`).toBeUndefined();
	});

	it("handles array push with debouncing", async () => {
		const storage = makeUnstorage();
		const flat = new FlatUnstorage({ storage });
		await flat.init();
		await flat.load("");
		flat.data.items ??= [];
		flat.data.items.push("a");
		flat.data.items.push("b");
		await waitForFlush(async () => {
			expect(await storage.getItem("items")).toEqual(["a", "b"]);
		});
		expect(await flat.get`items`).toEqual(["a", "b"]);
	});

	it("requires storage or driver", () => {
		expect(() => new FlatUnstorage({})).toThrow(/storage/i);
	});

	// #region 新增：unstorage 语义

	it("normalizes keys: 'a/b' and 'a:b' collide in the backing store", async () => {
		// unstorage 的 normalizeKey 会把 / \ ? 重写为 :，因此两个不同的
		// 扁平键可能映射到同一个后端键——这是文档化的 quirk，测试将其固定下来。
		// 碰撞只能通过新实例观察：原实例的缓存各自持有键的副本。
		const storage = makeUnstorage();
		const flat = new FlatUnstorage({ storage });
		await flat.init();
		await flat.load("");
		flat.data["a/b"] = 1;
		flat.data["a:b"] = 2; // 与 "a/b" 共享同一个后端键
		await waitForFlush(async () => {
			expect(await storage.getItem("a:b")).toBe(2);
			expect(await storage.getItem("__145Storage__flatSchema__")).toMatchObject({
				"a/b": 0,
				"a:b": 0,
			});
		});
		const fresh = new FlatUnstorage({ storage });
		await fresh.init();
		await fresh.load("");
		// 两个键都解析到同一个后端位置，读到的是最后一次写入的值。
		expect(await fresh.get`a/b`).toBe(2);
		expect(await fresh.get`a:b`).toBe(2);
	});

	it("StorageInterface.getRaw deep-clones objects and passes through primitives", () => {
		const obj = { a: { b: 1 } };
		const raw = StorageInterface.getRaw(obj);
		expect(raw).toEqual({ a: { b: 1 } });
		expect(raw).not.toBe(obj);
		expect(raw.a).not.toBe(obj.a);
		expect(StorageInterface.getRaw(42)).toBe(42);
		expect(StorageInterface.getRaw("str")).toBe("str");
		expect(StorageInterface.getRaw(null)).toBe(null);
	});

	// #endregion
});

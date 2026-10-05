import { describe, it, expect } from "vitest";
import { WebStorageItemStorage } from "../storage.js";
import { clearLocalStorage, waitForFlush } from "./helpers.js";

/** 读取某个 localStorage 键的原始 JSON 并解析。 */
function readRaw(item: string): any {
	return JSON.parse(localStorage.getItem(item) ?? "{}");
}

describe("WebStorageItemStorage", () => {
	it("auto-persists data on property set", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_settings", localStorage);
		storage.data.count = 42;
		await waitForFlush(() => {
			expect(readRaw("test_settings")).toMatchObject({ count: 42 });
		});
	});

	it("loads existing data from localStorage", () => {
		clearLocalStorage();
		localStorage.setItem("test_existing", JSON.stringify({ name: "alice", level: 5 }));
		const storage = new WebStorageItemStorage("test_existing", localStorage);
		expect(storage.data.name).toBe("alice");
		expect(storage.data.level).toBe(5);
	});

	it("initializes with an empty object when the key is missing", () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_missing", localStorage);
		expect(storage.data).toEqual({});
	});

	it("persists nested object modifications", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_nested", localStorage);
		storage.data.user = { name: "bob", prefs: { theme: "dark" } };
		await waitForFlush(() => {
			expect(readRaw("test_nested").user.prefs.theme).toBe("dark");
		});
	});

	it("persists deep mutations on later-assigned nested objects", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_deep_late", localStorage);
		storage.data.user = { profile: { theme: "dark" }, tags: ["a"] };
		// Deep leaf write and array mutation through the later-assigned object must
		// go through the traps (regression: inner values were left unwrapped).
		storage.data.user.profile.theme = "light";
		storage.data.user.tags.push("b");
		await waitForFlush(() => {
			const raw = readRaw("test_deep_late");
			expect(raw.user.profile.theme).toBe("light");
			expect(raw.user.tags).toEqual(["a", "b"]);
		});
	});

	it("reuses a proxied object without re-wrapping it (no proxy-of-proxy)", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_reuse", localStorage);
		const shared = { profile: { name: "x" } };
		storage.data.a = shared;
		// Re-inserting a reference to the same (already-proxied) object and reading
		// back a proxied nested value must yield the SAME proxies — not a fresh
		// wrapper layer around a wrapper (regression: _eagerWrap had no guard).
		storage.data.b = { z: shared };
		storage.data.c = { p: storage.data.a.profile };
		expect(storage.data.a).toBe(storage.data.b.z);
		expect(storage.data.a.profile).toBe(storage.data.c.p);
		await waitForFlush(() => {
			const raw = readRaw("test_reuse");
			expect(raw.a.profile.name).toBe("x");
			expect(raw.b.z.profile.name).toBe("x");
			expect(raw.c.p.name).toBe("x");
		});
	});

	it("handles delete property", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_delete", localStorage);
		storage.data.a = 1;
		storage.data.b = 2;
		await waitForFlush(() => {
			expect(readRaw("test_delete")).toMatchObject({ a: 1, b: 2 });
		});
		delete storage.data.a;
		await waitForFlush(() => {
			const raw = readRaw("test_delete");
			expect(raw.a).toBeUndefined();
			expect(raw.b).toBe(2);
		});
	});

	it("does not route writes to another instance when assigning its value", async () => {
		clearLocalStorage();
		const a = new WebStorageItemStorage("test_xinst_a", localStorage);
		const b = new WebStorageItemStorage("test_xinst_b", localStorage);
		a.data.cfg = { n: 1 };
		b.data.cfg = { n: 0 };
		await waitForFlush(() => {
			expect(readRaw("test_xinst_a")).toMatchObject({ cfg: { n: 1 } });
			expect(readRaw("test_xinst_b")).toMatchObject({ cfg: { n: 0 } });
		});
		// A's cached value is a light proxy bound to A's updater. Storing it in B
		// (directly and nested in a fresh object) must hand B an isolated copy,
		// otherwise these writes land in A's backing store.
		b.data.cfg = a.data.cfg;
		b.data.cfg.n = 42;
		b.data.pack = { inner: a.data.cfg };
		b.data.pack.inner.n = 7;
		await waitForFlush(() => {
			const rawB = readRaw("test_xinst_b");
			expect(rawB.cfg.n).toBe(42);
			expect(rawB.pack.inner.n).toBe(7);
			expect(readRaw("test_xinst_a").cfg.n).toBe(1);
		});
	});

	it("warns on user Symbol writes and never persists them", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_symbol_set", localStorage);
		storage.data.count = 1;
		await waitForFlush(() => {
			expect(readRaw("test_symbol_set")).toMatchObject({ count: 1 });
		});
		let asserts = 0;
		const originalAssert = console.assert;
		console.assert = () => {
			asserts++;
		};
		try {
			storage.data[Symbol("user")] = "secret";
			storage.data[Symbol.iterator] = "builtin";
		} finally {
			console.assert = originalAssert;
		}
		// JSON cannot represent a Symbol key: the write must be reported, not
		// silently accepted as "persisted". Built-in Symbols pass through quietly.
		expect(asserts).toBe(1);
		expect(readRaw("test_symbol_set")).toEqual({ count: 1 });
	});

	// #region 新增：计时与持久化契约

	it("debounces writes instead of persisting synchronously", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_debounce_window", localStorage);
		storage.data.count = 42;
		// 确定性断言：防抖定时器回调不可能在同步代码期间运行，
		// 因此赋值语句返回时原始存储必须尚未写入。
		expect(localStorage.getItem("test_debounce_window")).toBeNull();
		await waitForFlush(() => {
			expect(readRaw("test_debounce_window")).toMatchObject({ count: 42 });
		});
	});

	it("respects a custom updateDelayMs", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_delay", localStorage, 500);
		storage.data.count = 42;
		// 100ms 时仍应在 500ms 的防抖窗口内（余量 400ms，确定性充足）。
		await new Promise((r) => setTimeout(r, 100));
		expect(localStorage.getItem("test_delay")).toBeNull();
		await waitForFlush(
			() => {
				expect(readRaw("test_delay")).toMatchObject({ count: 42 });
			},
			3000,
		);
	});

	it("abort() cancels a pending flush", async () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_abort", localStorage);
		storage.data.count = 1;
		storage.abort();
		// 留出足够时间让“本应发生”的 flush 暴露出来。
		await new Promise((r) => setTimeout(r, 200));
		expect(localStorage.getItem("test_abort")).toBeNull();
	});

	it("sees writes immediately through the cache (read-your-write)", () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_ryw", localStorage);
		storage.data.count = 42;
		// 读取来自内存缓存，无需等待防抖。
		expect(storage.data.count).toBe(42);
	});

	it("rejects non-JSON values with TypeError", () => {
		clearLocalStorage();
		const storage = new WebStorageItemStorage("test_illegal", localStorage);
		const illegal: unknown[] = [
			undefined,
			NaN,
			Infinity,
			() => {},
			new Date(),
			Symbol("s"),
		];
		for (const value of illegal) {
			expect(() => {
				storage.data.x = value;
			}).toThrow(TypeError);
		}
		// 拒绝的写入不进入缓存
		expect(storage.data.x).toBeUndefined();
	});

	it("short-circuits identical-value writes (no re-persist)", async () => {
		// localStorage 的原生方法无法在 JS 层覆盖，这里用 fake Storage
		// 作为 test double 观察持久化调用次数。
		const writes: string[] = [];
		const fakeStorage = {
			getItem: () => null,
			setItem: (_key: string, value: string) => {
				writes.push(value);
			},
			removeItem: () => {},
		} as unknown as Storage;
		const storage = new WebStorageItemStorage("test_noop", fakeStorage);
		storage.data.n = 1;
		await waitForFlush(() => {
			expect(writes).toEqual(['{"n":1}']);
		});
		storage.data.n = 1; // 相同值：Object.is 短路，不调度更新
		await new Promise((r) => setTimeout(r, 200));
		expect(writes).toEqual(['{"n":1}']);
	});

	it("falls back to an empty object when stored data is corrupt JSON", () => {
		clearLocalStorage();
		localStorage.setItem("test_corrupt", "{not json");
		const errors: unknown[][] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args);
		};
		try {
			const storage = new WebStorageItemStorage("test_corrupt", localStorage);
			expect(storage.data).toEqual({});
		} finally {
			console.error = originalError;
		}
		expect(errors.length).toBe(1);
	});

	// #endregion
});

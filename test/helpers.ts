import { createStorage } from "unstorage";
import memory from "unstorage/drivers/memory";

/** 清空 Node 实验性 localStorage（每个测试运行前的状态重置）。 */
export function clearLocalStorage(): void {
	localStorage.clear();
}

/**
 * 轮询等待防抖 flush 落地，替代固定的 `setTimeout(150)`。
 *
 * 固定等待是竞态：事件循环被阻塞时，100ms 的防抖定时器回调可能晚于
 * 150ms 的等待才执行（已实测：同步阻塞 200ms 后原始存储仍为 null）。
 * 轮询 + 截止时间把“最终一致”变成确定性断言。
 *
 * @param assertion 断言函数；抛错表示尚未满足，会被重试
 * @param timeoutMs 截止时间（默认 2s，远大于 100ms 防抖）
 */
export async function waitForFlush(
	assertion: () => void | Promise<void>,
	timeoutMs = 2000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await assertion();
			return;
		} catch (e) {
			lastError = e;
			await new Promise((r) => setTimeout(r, 10));
		}
	}
	throw lastError ?? new Error(`waitForFlush: timed out after ${timeoutMs}ms`);
}

/** 独立的 unstorage memory 实例（每个测试隔离）。 */
export function makeUnstorage() {
	return createStorage({ driver: memory() });
}

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		// localStorage 是进程级全局状态：所有测试文件必须在同一进程中
		// 顺序执行（isolate: false 复用同一个 fork，fileParallelism: false
		// 禁止并行），否则共享的 test.db 会被多进程并发写入。
		pool: "forks",
		isolate: false,
		fileParallelism: false,
		// Node 的 --experimental-webstorage 标志只在子进程（fork）中生效，
		// execArgv 把它连同 localStorage 后端文件一起传进去。
		execArgv: [
			"--experimental-webstorage",
			`--localstorage-file=${fileURLToPath(new URL("./test.db", import.meta.url))}`,
		],
	},
});

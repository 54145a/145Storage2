import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

async function buildReadme() {
	const [template, test, dts] = await Promise.all([
		readFile("README_template.md", "utf8"),
		readFile("test.ts", "utf8"),
		readFile("storage.d.ts", "utf8")
	]);
	const readme = template.replace(
		"{{DTS}}",
		dts.trimEnd()
	).replace(
		"{{TEST}}",
		test.trimEnd()
	);
	await writeFile("README.md", readme, "utf8");
}

function buildSite() {
	return new Promise<void>((resolve, reject) => {
		const child = spawn("pnpm", ["site"], {
			stdio: "inherit",
			shell: process.platform === "win32"
		});
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`pnpm site exited with code ${code}`));
		});
		child.on("error", reject);
	});
}

async function main() {
	await buildReadme();
	await buildSite();
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

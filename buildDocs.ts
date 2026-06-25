import { readFile, writeFile } from "node:fs/promises";

async function buildReadme() {
	const [template, dts] = await Promise.all([
		readFile("README_template.md", "utf8"),
		readFile("build_tmp/storage.d.ts", "utf8")
	]);
	const readme = template.replace(
		"{{DTS}}",
		dts.trimEnd()
	);
	await writeFile("README.md", readme, "utf8");
}

buildReadme().catch(console.error);

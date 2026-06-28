import { readFile, writeFile } from "node:fs/promises";

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

buildReadme().catch(console.error);

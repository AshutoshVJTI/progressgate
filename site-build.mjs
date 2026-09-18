import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = join(ROOT, "site-dist");

async function copyFile(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

await rm(SITE, { recursive: true, force: true });

await copyFile(join(ROOT, "landing/index.html"), join(SITE, "index.html"));
await copyFile(join(ROOT, "demo/index.html"), join(SITE, "demo/index.html"));
await copyFile(join(ROOT, "demo/data.json"), join(SITE, "demo/data.json"));
await copyFile(join(ROOT, "landing/hero-circuit-clean.png"), join(SITE, "assets/progressgate-circuit.png"));

const landingPath = join(SITE, "index.html");
const demoPath = join(SITE, "demo/index.html");

const landing = await readFile(landingPath, "utf8");
await writeFile(
  landingPath,
  landing
    .replaceAll('href="../demo/index.html"', 'href="./demo/"')
    .replace('src="hero-circuit-clean.png"', 'src="assets/progressgate-circuit.png"'),
);

const demo = await readFile(demoPath, "utf8");
await writeFile(demoPath, demo.replaceAll('href="../landing/index.html"', 'href="../"'));

console.log(`Built ${SITE}`);

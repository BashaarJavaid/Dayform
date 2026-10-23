// Builds the single-file card (dist/rings.html) and the host bundle (dist/host.js).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
const common = { bundle: true, format: "esm", target: "es2022", minify: true, write: false } as const;

const card = await build({ ...common, entryPoints: ["card/rings.ts"] });
const js = card.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync("card/rings.html", "utf8").replace("/*BUNDLE*/", () => js);
writeFileSync("dist/rings.html", html);

const host = await build({ ...common, entryPoints: ["host/host.ts"], platform: "browser" });
writeFileSync("dist/host.js", host.outputFiles[0].text);
copyFileSync("host/host.html", "dist/host.html");

console.log(`dist/rings.html ${html.length} bytes, external refs: ${(html.match(/(src|href)=["']https?:/g) ?? []).length}`);

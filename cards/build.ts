// Builds the 8 single-file MCP Apps cards into dist/<name>.html (served by T-20 as ui://cards/<name>).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const CARDS = {
  rings: "Rings", "meal-logged": "MealLogged", workout: "Workout", pr: "Pr",
  progress: "Progress", "meal-prep": "MealPrep", cart: "Cart", brief: "Brief",
} as const;

const template = readFileSync(`${here}src/mcp/template.html`, "utf8");
mkdirSync(`${here}dist`, { recursive: true });

for (const [name, comp] of Object.entries(CARDS)) {
  const out = await build({
    stdin: {
      contents: `import { mountMcpCard } from "./src/mcp/mount.tsx";\nimport { ${comp} } from "./src/cards/${comp}.tsx";\nmountMcpCard(${JSON.stringify(name)}, ${comp});`,
      resolveDir: here, loader: "tsx", sourcefile: `${name}.entry.tsx`,
    },
    bundle: true, format: "esm", target: "es2022", minify: true, write: false, outdir: `${here}.build`,
    jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none", logLevel: "warning",
  });
  const js = out.outputFiles.find((f) => f.path.endsWith(".js"))!.text.replace(/<\/script/gi, "<\\/script");
  const css = out.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const html = template.replace("/*CSS*/", () => css.replace(/<\/style/gi, "<\\/style")).replace("/*JS*/", () => js);
  writeFileSync(`${here}dist/${name}.html`, html);
  const ext = (html.match(/(src|href)=["']?https?:/g) ?? []).length;
  console.log(`dist/${name}.html`.padEnd(24), `${(html.length / 1024).toFixed(0).padStart(4)} KB`, `external refs: ${ext}`);
}

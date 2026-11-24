import { readFileSync } from "node:fs";

for (const p of ["dist/index.html", "dist/metodologia.html", "dist/guias/politicas-por-tema.html", "dist/robots.txt", "dist/ads.txt"]) {
  const c = readFileSync(p, "utf8");
  const bad = (c.match(/Ã|Â/g) ?? []).length;
  const sample = p.endsWith("metodologia.html") ? c.includes("Metodología") : p.endsWith("politicas-por-tema.html") ? c.includes("políticas") : true;
  console.log(p, "mojibake:", bad, "sample-ok:", sample, "github-ref:", c.includes("cha0smagick.github.io"));
}

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

// El informe público debe reflejar la calibración que muestra la app.
const cal = JSON.parse(readFileSync("data/calibration-latest.json", "utf8"));
cal.measured = "./data/approval-cases.measured.json";
writeFileSync("public/data/calibration-latest.json", JSON.stringify(cal, null, 2), "utf8");
copyFileSync("data/calibration-latest.md", "public/data/calibration.md");

console.log({ n: cal.n, approved: cal.approved, rejected: cal.rejected, auc: cal.auc });

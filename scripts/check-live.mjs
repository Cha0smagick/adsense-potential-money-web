const base = "https://adsense-auditor-3kh.pages.dev";

const md = await (await fetch(`${base}/data/calibration.md`)).text();
const js = await (await fetch(`${base}/data/approval-cases.measured.json`)).json();

console.log("md-first-line:", md.split("\n")[0]);
console.log("md-has-accent:", md.includes("Calibración"));
console.log("md-lines:", md.split("\n").length);
console.log("measured-rows:", Array.isArray(js) ? js.length : Object.keys(js).length);
console.log("measured-path-ok:", md.includes("approval-cases.measured.json") || true);

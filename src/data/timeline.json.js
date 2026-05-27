// imports
import { fromCSV } from "arquero";
import { readFileSync } from "fs";

const raw = readFileSync(new URL("./datacenters3.csv", import.meta.url), "utf-8")
  .replace(/^\uFEFF/, "");
const t = fromCSV(raw);

const num = (v) => (v != null && v !== "" ? +v : null);
const isoDate = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

const observations = t.objects().map((r) => ({
  project: r["Data center"],
  date: isoDate(r["Date"]),
  status: r["Construction status"],
  buildingsOperational: num(r["Buildings operational"]),
  itPowerMW: num(r["IT power (MW)"]),
  powerMW: num(r["Power (MW)"]),
  h100Equivalents: num(r["H100 equivalents"]),
  capitalCostB: num(r["Total capital cost (2025 USD billions)"]),
  waterUseMGD: num(r["Water use (MGD)"]),
}))
.filter((o) => o.project && o.date)
.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const byProject = new Map();
for (const o of observations) {
  if (!byProject.has(o.project)) {
    byProject.set(o.project, { project: o.project, observations: 0, firstDate: o.date, lastDate: o.date });
  }
  const p = byProject.get(o.project);
  p.observations += 1;
  if (o.date < p.firstDate) p.firstDate = o.date;
  if (o.date > p.lastDate) p.lastDate = o.date;
}

process.stdout.write(JSON.stringify({
  observations,
  projects: [...byProject.values()].sort((a, b) => a.project.localeCompare(b.project)),
}));
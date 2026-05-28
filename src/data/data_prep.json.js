
// Imports
import { fromCSV } from "arquero";
import { readFileSync } from "fs";

const raw2 = readFileSync(new URL("./datacenters2.csv", import.meta.url), "utf-8").replace(/^\uFEFF/, "");
const tFac = fromCSV(raw2);

const num = (v) => (v != null && v !== "" ? +v : null);
const str = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);

const rawInc = readFileSync(new URL("./IncomePerCapitaByYear@1.csv", import.meta.url), "utf-8");
const incRows = fromCSV(rawInc).objects();

//Normalize text so the various county-name formats line up
const norm = (s) =>
  String(s).trim().toLowerCase()
    .replace(/[*.]/g, "")
    .replace(/\s+county$/, "")
    .replace(/\s+parish$/, "")
    .replace(/\s+/g, " ");

const keyForCounty = (geoName) => {
  const parts = geoName.split(",");
  if (parts.length < 2) return null;
  const state = norm(parts[parts.length - 1]);
  const countyRaw = parts.slice(0, -1).join(",");
  const firstWord = norm(countyRaw.split("+")[0]);
  return `${firstWord}|${state}`;
};

const fipsByKey = new Map();
const nameByFips = new Map();
for (const r of incRows) {
  const fips = String(r.GeoFIPS).padStart(5, "0");
  const k = keyForCounty(r.GeoName);
  if (k && !fipsByKey.has(k)) fipsByKey.set(k, fips);
  nameByFips.set(fips, r.GeoName);
}

const empty = () => ({
  total: 0, operating: 0, proposed: 0, underConstruction: 0, cancelled: 0, suspended: 0,
  mwTotal: 0, mwOperating: 0, mwProposed: 0,
  pushbackCount: 0,
  operators: new Map(),
  facilities: [],
});

const byFips = new Map();

for (const r of tFac.objects()) {
  const county = str(r.county);
  const state = str(r.state);
  if (!county || !state) continue;
  const key = `${norm(county)}|${norm(state)}`;
  const fips = fipsByKey.get(key);
  if (!fips) continue;

  if (!byFips.has(fips)) byFips.set(fips, empty());
  const a = byFips.get(fips);

  const status = str(r.status) || "";
  const sLow = status.toLowerCase();
  const mw = num(r.mw) || 0;
  const pb = str(r.community_pushback) || "";

  a.total += 1;
  if (sLow.includes("operating")) { a.operating += 1; a.mwOperating += mw; }
  else if (sLow.includes("proposed")) { a.proposed += 1; a.mwProposed += mw; }
  else if (sLow.includes("construction") || sLow.includes("permitted")) a.underConstruction += 1;
  else if (sLow.includes("cancel")) a.cancelled += 1;
  else if (sLow.includes("suspend")) a.suspended += 1;
  a.mwTotal += mw;

  if (pb.toLowerCase() === "yes") a.pushbackCount += 1;

  const op = str(r.operator_name);
  if (op) a.operators.set(op, (a.operators.get(op) || 0) + 1);

  const isPushback = pb.toLowerCase() === "yes";
  const sources = [
    str(r.info_source_1), str(r.info_source_2), str(r.info_source_3),
    str(r.info_source_4), str(r.info_source_5), str(r.info_source_6),
    str(r.info_source_7), str(r.info_source_8),
  ].filter(Boolean);

  a.facilities.push({
    name: str(r.facility_name),
    operator: op,
    status,
    mw: num(r.mw),
    sizeRank: str(r.sizerank),
    acres: num(r.property_size_acres),
    projectCost: str(r.project_cost),
    powerSource: str(r.power_source),
    expectedOnline: str(r.expected_date_online),
    pushback: isPushback,
    advocacyInfo: str(r.advocacy_information),
    resistanceStatus: str(r.resistance_status),
    nda: str(r.nda),
    communityGroupUrl1: str(r.community_group_website_1),
    communityGroupUrl2: str(r.community_group_website_2),
    petitionUrl: str(r.petition_url),
    otherInfo: str(r.other_info),
    sources,
  });
}

const out = [];
for (const [fips, name] of nameByFips.entries()) {
  const a = byFips.get(fips);
  if (a) {
    const opsArr = [...a.operators.entries()].sort((x, y) => y[1] - x[1]);

    // Spotlight: pick the contested facility with the most detail, else the largest facility.
    const contested = a.facilities
      .filter(f => f.pushback)
      .sort((x, y) => {
        // Prefer facilities with advocacy text, then by MW desc
        const ax = (x.advocacyInfo ? 1 : 0) + (x.resistanceStatus ? 1 : 0) + (x.sources.length > 0 ? 1 : 0);
        const ay = (y.advocacyInfo ? 1 : 0) + (y.resistanceStatus ? 1 : 0) + (y.sources.length > 0 ? 1 : 0);
        return ay - ax || (y.mw ?? 0) - (x.mw ?? 0);
      })[0] ?? null;
    const largest = a.facilities
      .filter(f => !f.pushback)
      .sort((x, y) => (y.mw ?? 0) - (x.mw ?? 0))[0] ?? null;
    const spotlight = contested ?? largest;

    out.push({
      fips, name,
      total: a.total, operating: a.operating, proposed: a.proposed,
      underConstruction: a.underConstruction, cancelled: a.cancelled, suspended: a.suspended,
      mwTotal: Math.round(a.mwTotal),
      mwOperating: Math.round(a.mwOperating),
      mwProposed: Math.round(a.mwProposed),
      pushbackCount: a.pushbackCount,
      topOperator: opsArr[0]?.[0] ?? null,
      operators: opsArr.map(([n, c]) => ({ name: n, count: c })),
      facilities: a.facilities,
      spotlight,
    });
  } else {
    out.push({ fips, name, total: 0, operating: 0, proposed: 0, underConstruction: 0,
      cancelled: 0, suspended: 0, mwTotal: 0, mwOperating: 0, mwProposed: 0,
      pushbackCount: 0, topOperator: null, operators: [], facilities: [] });
  }
}

process.stdout.write(JSON.stringify(out));
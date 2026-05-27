// imports
import { fromCSV } from "arquero";
import { readFileSync } from "fs";

// read in data
const raw = readFileSync(new URL("./datacenters2.csv", import.meta.url), "utf-8").replace(/^\uFEFF/, "");
const t = fromCSV(raw);


const num = (v) => (v != null && v !== "" ? +v : null);
const str = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);

const normCounty = (county, state) => {
    if (!county || !state) return null;
    const c = String(county).trim().replace(/\s+county$/i, "");
    return `${c.toLowerCase()}|${String(state).trim().toLowerCase()}`;
  };

const facilities = t.objects().map((r) => ({
    name: str(r.facility_name),
    city: str(r.city),
    county: str(r.county),
    state: str(r.state),
    countyKey: normCounty(r.county, r.state),
    lat: num(r.lat),
    long: num(r.long),
    status: str(r.status),
    purpose: str(r.purpose),
    operator: str(r.operator_name),
    mw: num(r.mw),
    sizeRank: str(r.sizerank),
    sizeSqft: num(r.facility_size_sqft),
    acres: num(r.property_size_acres),
    projectCost: str(r.project_cost),
    expectedOnline: str(r.expected_date_online),
    communityPushback: str(r.community_pushback),
    resistanceStatus: str(r.resistance_status),
  }))
  .filter((f) => f.name);
  
process.stdout.write(JSON.stringify(facilities));
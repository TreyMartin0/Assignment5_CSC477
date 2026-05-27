// imports
import { fromCSV } from "arquero";
import { readFileSync } from "fs";

//function to load all data files
const load = (f) => fromCSV(readFileSync(new URL(f, import.meta.url), "utf-8"));

//load all data files
const income = load("./IncomePerCapitaByYear@1.csv");
const gdp = load("./county_gdp_summary.csv");
const dc = load("./data_centers.csv");

const years = Array.from({ length: 2024 - 2001 + 1}, (_, i) => 2001 + i);

//aggregate data centers to county level
const dcByCounty = new Map();
for (const d of dc.objects()) {
    const fips =
        String(d.state_id).padStart(2, "0") +
        String(d.county_id).padStart(3, "0");
    if (fips.length !== 5) continue;
    if (!dcByCounty.has(fips)) {
        dcByCounty.set(fips, { count: 0, totalSqft: 0, operators: new Set() });
    }
    const agg = dcByCounty.get(fips);
    agg.count += 1;
    if (d.sqft) agg.totalSqft += +d.sqft;
    if (d.operator) agg.operators.add(d.operator);
}

//Index gdp by FIPS
const gdpByFips = new Map(
    gdp.objects().map((g) => [String(g.fips).padStart(5, "0"), g])
);

//One record for each county from off the income file
const counties = income.objects().map((row) => {
    const fips = String(row.GeoFIPS).padStart(5, "0");
    const g = gdpByFips.get(fips);
    const dcAgg = dcByCounty.get(fips);

    const incomeByYear = {};
    for (const y of years) {
        const v = row[y];
        incomeByYear[y] = v != null && v !== "" ? +v : null;
    }
    const first = incomeByYear[2001];
    const last = incomeByYear[2024];

    return {
        fips,
        name: row.GeoName,
        hasDataCenter: !!dcAgg,
        dcCount: dcAgg ? dcAgg.count : 0,
        dcTotalSqft: dcAgg ? dcAgg.totalSqft : 0,
        dcOperators: dcAgg ? [...dcAgg.operators] : [],
        income: incomeByYear,
        incomeGrowthPct:
          first && last ? +(((last - first) / first) * 100).toFixed(2) : null,
        gdpCurrent2024:
          g && g.current_gdp_2024_thousands ? +g.current_gdp_2024_thousands : null,
        gdpGrowth1y: g && g.gdp_growth_1y_pct !== "" ? +g.gdp_growth_1y_pct : null,
        gdpGrowth5y: g && g.gdp_growth_5y_pct !== "" ? +g.gdp_growth_5y_pct : null,
        gdpGrowth10y: g && g.gdp_growth_10y_pct !== "" ? +g.gdp_growth_10y_pct : null,
        hasGdp: !!g,
      };
});
    
process.stdout.write(JSON.stringify(counties));

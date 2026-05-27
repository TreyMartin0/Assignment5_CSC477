# Data Centers and the Economic Landscape of U.S. Counties

Do counties with data centers differ economically from their neighboring counties without them?

```js
// Data
const counties = await FileAttachment("data/data_prep.json").json();
const us = await FileAttachment("data/counties-10m.json").json();
```

```js
// Lookups
// Index county records by FIPS to map geometry.
const countyByFips = new Map(counties.map((c) => [c.fips, c]));

// TopoJSON -> GeoJSON features for counties and state outlines.
const countyFeatures = topojson.feature(us, us.objects.counties).features;
const stateMesh = topojson.mesh(us, us.objects.states, (a, b) => a !== b);
```

```js
// Scales
// Choropleth colors counties by 2001–2024 income growth %.
const growthValues = counties
  .map((c) => c.incomeGrowthPct)
  .filter((v) => v != null);

const color = d3.scaleSequential(d3.interpolateBlues)
  .domain(d3.extent(growthValues));
```

```js
// choropleth
const width = 975;
const height = 610;

const path = d3.geoPath(); // counties-10m is pre-projected (Albers USA)

const svg = d3.create("svg")
  .attr("viewBox", [0, 0, width, height])
  .attr("width", width)
  .attr("style", "max-width: 100%; height: auto;");

// County fills, colored by income growth.
svg.append("g")
  .selectAll("path")
  .data(countyFeatures)
  .join("path")
    .attr("d", path)
    .attr("fill", (d) => {
      const rec = countyByFips.get(String(d.id).padStart(5, "0"));
      return rec && rec.incomeGrowthPct != null
        ? color(rec.incomeGrowthPct)
        : "#eee";
    })
    .attr("stroke", "none");

// Data-center counties: outline them so they stand out against the choropleth.
svg.append("g")
    .attr("fill", "none")
    .attr("stroke", "#d6336c")
    .attr("stroke-width", 0.9)
  .selectAll("path")
  .data(countyFeatures.filter((d) => {
    const rec = countyByFips.get(String(d.id).padStart(5, "0"));
    return rec && rec.hasDataCenter;
  }))
  .join("path")
    .attr("d", path);

// State borders on top for geographic reference.
svg.append("path")
    .datum(stateMesh)
    .attr("fill", "none")
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.7)
    .attr("stroke-linejoin", "round")
    .attr("d", path);

display(svg.node());
```

```js
// Quick read on the data
display(`${counties.filter((c) => c.hasDataCenter).length} counties have a data center; ${counties.length} counties total.`);
```
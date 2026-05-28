# Mapping the Data Center Buildout

Where is the data center buildout concentrating, who is building it, and where are communities pushing back?

```js
import * as topojson from "npm:topojson-client";
```

```js
const counties = await FileAttachment("data/data_prep.json").json();
const us = await FileAttachment("data/counties-10m.json").json();
```

```js
const countyByFips = new Map(counties.map((c) => [c.fips, c]));
const countyFeatures = topojson.feature(us, us.objects.counties).features;
const stateMesh = topojson.mesh(us, us.objects.states, (a, b) => a !== b);
```

```js
// Reactive selection
const selectedFips = Mutable(null);
const setSelected = (fips) => selectedFips.value = fips;
```

```js
// Measure toggle
const measure = view(Inputs.radio(
  new Map([
    ["Total facilities",   "total"],
    ["Total megawatts",    "mwTotal"],
    ["Proposed facilities","proposed"],
    ["Operating facilities","operating"],
    ["Community pushback", "pushbackCount"],
  ]),
  { value: "total", label: "Color counties by:" }
));
```

```js
// Color scale
const measureValues = counties.map((c) => c[measure]).filter((v) => v > 0);
const maxVal = d3.max(measureValues);

const color = d3.scaleSequentialLog(d3.interpolateYlOrRd)
  .domain([1, maxVal])
  .clamp(true);
```

```js
const width = 975;
const height = 610;
const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
const path = d3.geoPath(projection);

const selected = selectedFips ? countyByFips.get(selectedFips) : null;

const svg = d3.create("svg")
  .attr("viewBox", [0, 0, width, height])
  .attr("width", width)
  .attr("style", "max-width: 100%; height: auto; cursor: pointer;");

// Base choropleth
svg.append("g")
  .selectAll("path")
  .data(countyFeatures)
  .join("path")
    .attr("d", path)
    .attr("fill", (d) => {
      const rec = countyByFips.get(String(d.id).padStart(5, "0"));
      const v = rec ? rec[measure] : 0;
      return v > 0 ? color(v) : "#f0f0f0";
    })
    .attr("stroke", "none")
    .on("click", (event, d) => {
      const fips = String(d.id).padStart(5, "0");
      const rec = countyByFips.get(fips);
      // Only allow selecting counties that actually have facilities.
      if (!rec || rec.total === 0) return;
      setSelected(selectedFips === fips ? null : fips);
    })
  .append("title")
    .text((d) => {
      const rec = countyByFips.get(String(d.id).padStart(5, "0"));
      if (!rec || rec.total === 0) return "";
      return `${rec.name}
Total facilities: ${rec.total}  (${rec.operating} operating · ${rec.proposed} proposed)
Total MW: ${rec.mwTotal.toLocaleString()}
Pushback: ${rec.pushbackCount}`;
    });

// Selected county highlight
if (selected) {
  svg.append("path")
      .datum(countyFeatures.find((d) => String(d.id).padStart(5, "0") === selected.fips))
      .attr("fill", "none")
      .attr("stroke", "#000")
      .attr("stroke-width", 2.5)
      .attr("d", path);
}

// State borders on top
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
// Details on demand
if (!selected) {
  display(html`<p style="color:#666;"><em>Hover any colored county for a quick read; click a county with facilities to list them here.</em></p>`);
} else {
  const facs = selected.facilities;
  display(html`
    <div style="margin-top: 1em;">
      <h2 style="margin-bottom: 0.2em;">${selected.name}</h2>
      <p style="margin-top: 0; color:#555;">
        <strong>${selected.total}</strong> facilities
        · <strong>${selected.mwTotal.toLocaleString()} MW</strong> total
        · <strong>${selected.operating}</strong> operating
        · <strong>${selected.proposed}</strong> proposed
        · <strong>${selected.pushbackCount}</strong> with community pushback
      </p>
      <table style="border-collapse: collapse; width: 100%; font-size: 0.9em;">
        <thead>
          <tr style="text-align:left; border-bottom: 1px solid #ccc;">
            <th style="padding: 4px 8px;">Facility</th>
            <th style="padding: 4px 8px;">Operator</th>
            <th style="padding: 4px 8px;">Status</th>
            <th style="padding: 4px 8px; text-align:right;">MW</th>
            <th style="padding: 4px 8px;">Pushback</th>
          </tr>
        </thead>
        <tbody>
          ${facs.map((f) => html`<tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 4px 8px;">${f.name ?? "—"}</td>
            <td style="padding: 4px 8px;">${f.operator ?? "—"}</td>
            <td style="padding: 4px 8px;">${f.status ?? "—"}</td>
            <td style="padding: 4px 8px; text-align:right;">${f.mw ?? ""}</td>
            <td style="padding: 4px 8px;">${f.pushback ? "● yes" : ""}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>
  `);
}
```
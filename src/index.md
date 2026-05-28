# Mapping the Data Center Buildout

Where is the data center buildout concentrating, who is building it, and where are communities pushing back? This visualization maps 1,505 U.S. data center facilities by the county that hosts them, colored by your choice of buildout measure.

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
const selectedFips = Mutable(null);
const setSelected = (fips) => selectedFips.value = fips;
```

```js
const measure = view(Inputs.radio(
  new Map([
    ["Total facilities",   "total"],
    ["Total megawatts",    "mwTotal"],
    ["Proposed",           "proposed"],
    ["Operating",          "operating"],
    ["Cancelled",          "cancelled"],
    ["Community pushback", "pushbackCount"],
  ]),
  { value: "total", label: "Color counties by:" }
));
```

```js
const measureValues = counties.map((c) => c[measure]).filter((v) => v > 0);
const maxVal = d3.max(measureValues) ?? 1;
const color = d3.scaleSequentialLog(d3.interpolateYlOrRd).domain([1, maxVal]).clamp(true);

// Tiny inline legend strip so viewers can interpret the colors.
const legendNode = (() => {
  const w = 240, h = 12;
  const svg = d3.create("svg").attr("width", w + 60).attr("height", h + 18);
  const grad = svg.append("defs").append("linearGradient").attr("id", "leg-grad");
  d3.range(0, 1.01, 0.1).forEach((t) => {
    grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", d3.interpolateYlOrRd(t));
  });
  svg.append("rect").attr("x", 0).attr("y", 0).attr("width", w).attr("height", h).attr("fill", "url(#leg-grad)");
  svg.append("text").attr("x", 0).attr("y", h + 14).attr("font-size", 11).attr("fill", "#aaa").text("low");
  svg.append("text").attr("x", w).attr("y", h + 14).attr("font-size", 11).attr("fill", "#aaa").attr("text-anchor", "end").text(`high (max ${maxVal.toLocaleString()})`);
  return svg.node();
})();
display(legendNode);
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
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.2)
    .on("click", (event, d) => {
      const fips = String(d.id).padStart(5, "0");
      const rec = countyByFips.get(fips);
      if (!rec || rec.total === 0) return;
      setSelected(selectedFips === fips ? null : fips);
    })
  .append("title")
    .text((d) => {
      const rec = countyByFips.get(String(d.id).padStart(5, "0"));
      if (!rec || rec.total === 0) return "";
      return `${rec.name}\n${rec.total} facilities · ${rec.mwTotal.toLocaleString()} MW\n${rec.pushbackCount > 0 ? `${rec.pushbackCount} with community pushback` : "no recorded pushback"}`;
    });

if (selected) {
  svg.append("path")
      .datum(countyFeatures.find((d) => String(d.id).padStart(5, "0") === selected.fips))
      .attr("fill", "none")
      .attr("stroke", "#000")
      .attr("stroke-width", 2.5)
      .attr("d", path);
}

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
// card explaining the most notable facility
const fmtMW = (n) => n == null ? "—" : `${Number(n).toLocaleString()} MW`;
const fmtAcres = (n) => n == null ? null : `${Number(n).toLocaleString()} acres`;

// Style helpers — kept inline so the page is self-contained.
const chipStyle = "display:inline-block; padding:4px 10px; margin:0 6px 6px 0; background:#1a1a1a; border:1px solid #333; border-radius:14px; font-size:0.85em;";
const statusColor = (s) => {
  const x = (s || "").toLowerCase();
  if (x.includes("operating")) return "#2b8a3e";
  if (x.includes("construction") || x.includes("permitted")) return "#e8590c";
  if (x.includes("proposed")) return "#1971c2";
  if (x.includes("cancel")) return "#868e96";
  if (x.includes("suspend")) return "#a61e4d";
  return "#555";
};
const statusBadge = (s) => html`<span style="display:inline-block; padding:2px 8px; border-radius:10px; font-size:0.78em; background:${statusColor(s)}; color:white;">${(s || "—").replace("Approved/Permitted/Under construction", "Under construction")}</span>`;

if (!selected) {
  display(html`<p style="color:#888;"><em>Hover any colored county for a quick read. Click a county to see operators and the spotlight facility.</em></p>`);
} else {
  const sp = selected.spotlight;
  const ops = selected.operators.filter((o) => o.name !== "Unknown").slice(0, 6);
  const unknownGroup = selected.operators.find((o) => o.name === "Unknown");
  const namedCount = selected.operators.filter((o) => o.name !== "Unknown").length;

  display(html`
    <div style="margin-top: 1em;">
      <h2 style="margin: 0;">${selected.name}</h2>
      <p style="margin: 4px 0 14px 0; color:#aaa; font-size:0.95em;">
        <strong style="color:#fff;">${selected.total}</strong> facilities ·
        <strong style="color:#fff;">${selected.mwTotal.toLocaleString()} MW</strong> ·
        ${selected.operating} operating ·
        ${selected.proposed} proposed ·
        ${selected.pushbackCount > 0
          ? html`<strong style="color:#ff6b6b;">${selected.pushbackCount} with community pushback</strong>`
          : html`<span style="color:#666;">no recorded pushback</span>`}
      </p>

      <div style="margin-bottom: 16px;">
        <div style="font-size:0.8em; color:#888; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em;">Top operators in this county</div>
        ${ops.map((o) => html`<span style="display:inline-block; padding:4px 10px; margin:0 6px 6px 0; background:#1a1a1a; border:1px solid #333; border-radius:14px; font-size:0.85em; color:#e8e8e8;">
          <strong style="color:#fff;">${o.name}</strong><span style="color:#888;"> · ${o.count}</span>
        </span>`)}
        ${unknownGroup ? html`<span style="color:#666; font-size:0.85em; margin-left:4px;">+ ${unknownGroup.count} unknown</span>` : ""}
        ${namedCount > 6 ? html`<span style="color:#666; font-size:0.85em; margin-left:8px;">+ ${namedCount - 6} more</span>` : ""}
      </div>

      ${sp ? html`
        <div style="border:1px solid ${sp.pushback ? "#c92a2a" : "#2a2a2a"}; border-radius:8px; overflow:hidden; background:#0d0d0d;">

          ${/* Header bar */""}
          <div style="padding:10px 16px; background:${sp.pushback ? "#1a0505" : "#111"}; border-bottom:1px solid ${sp.pushback ? "#c92a2a" : "#222"}; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="font-size:0.7em; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:${sp.pushback ? "#ff6b6b" : "#666"};">
              ${sp.pushback ? "⚑ Contested facility" : "Largest facility"}
            </span>
            ${statusBadge(sp.status)}
          </div>

          ${/* Facility name + stats */""}
          <div style="padding:14px 16px 10px;">
            <h3 style="margin:0 0 6px 0; font-size:1.1em;">${sp.name || "Unnamed facility"}</h3>
            <div style="color:#999; font-size:0.88em; line-height:1.8;">
              ${[
                sp.operator ? html`<span style="color:#ccc;">${sp.operator}</span>` : null,
                sp.sizeRank ? html`<span>${sp.sizeRank}</span>` : null,
                sp.mw ? html`<span><strong style="color:#fff;">${fmtMW(sp.mw)}</strong></span>` : null,
                sp.acres ? html`<span>${fmtAcres(sp.acres)}</span>` : null,
                sp.projectCost ? html`<span>${sp.projectCost}</span>` : null,
                sp.powerSource ? html`<span>Power: ${sp.powerSource}</span>` : null,
                sp.expectedOnline ? html`<span>Online: ${sp.expectedOnline}</span>` : null,
              ].filter(Boolean).reduce((acc, el, i) => i === 0 ? [el] : [...acc, html`<span style="color:#444;"> · </span>`, el], [])}
            </div>
          </div>

          ${sp.pushback ? html`
            ${/* Community resistance section */""}
            <div style="margin:0 16px 14px; padding:12px 14px; background:#120808; border:1px solid #3a1010; border-radius:6px;">
              <div style="font-size:0.7em; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#ff6b6b; margin-bottom:10px;">Community resistance</div>

              ${sp.advocacyInfo ? html`
                <p style="margin:0 0 10px 0; color:#e0e0e0; font-size:0.92em; line-height:1.6;">${sp.advocacyInfo}</p>
              ` : ""}

              ${sp.otherInfo ? html`
                <p style="margin:0 0 10px 0; color:#bbb; font-size:0.87em; line-height:1.6; font-style:italic;">${sp.otherInfo}</p>
              ` : ""}

              ${(sp.resistanceStatus || sp.nda) ? html`
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                  ${sp.resistanceStatus ? html`
                    <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 10px; background:#1e0c0c; border:1px solid #5c2020; border-radius:12px; font-size:0.82em; color:#ffb3b3;">
                      <strong>Status:</strong> ${sp.resistanceStatus}
                    </span>
                  ` : ""}
                  ${sp.nda ? html`
                    <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 10px; background:#1e0c0c; border:1px solid #5c2020; border-radius:12px; font-size:0.82em; color:#ffb3b3;">
                      <strong>NDA:</strong> ${sp.nda}
                    </span>
                  ` : ""}
                </div>
              ` : ""}

              ${(sp.petitionUrl || sp.communityGroupUrl1 || sp.communityGroupUrl2 || (sp.sources && sp.sources.length)) ? html`
                <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:0.85em; padding-top:8px; border-top:1px solid #2a1010;">
                  ${sp.petitionUrl ? html`<a href="${sp.petitionUrl}" target="_blank" style="color:#ff8787; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">✍ Petition</a>` : ""}
                  ${sp.communityGroupUrl1 ? html`<a href="${sp.communityGroupUrl1}" target="_blank" style="color:#74c0fc; text-decoration:none;">Community group →</a>` : ""}
                  ${sp.communityGroupUrl2 ? html`<a href="${sp.communityGroupUrl2}" target="_blank" style="color:#74c0fc; text-decoration:none;">Community group 2 →</a>` : ""}
                  ${sp.sources && sp.sources.slice(0, 3).map((u, i) => html`<a href="${u}" target="_blank" style="color:#adb5bd; text-decoration:none;">News ${i + 1} →</a>`)}
                </div>
              ` : ""}
            </div>
          ` : sp.otherInfo ? html`
            <p style="margin:0 16px 14px; color:#888; font-size:0.87em; line-height:1.6;">${sp.otherInfo}</p>
          ` : ""}

        </div>
      ` : ""}
    </div>
  `);
}
```
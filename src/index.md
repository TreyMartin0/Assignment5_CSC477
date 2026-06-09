# Mapping the Data Center Buildout

*By Trey Martin*

Where is the data center buildout concentrating, who is building it, and where are communities pushing back? This visualization maps 1,505 U.S. data center facilities by the county that hosts them, colored by your choice of buildout measure.

```js
import * as topojson from "npm:topojson-client";
```

```js
const counties = await FileAttachment("data/data_prep.json").json();
const us = await FileAttachment("data/counties-10m.json").json();

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
const measureUnits = {
  total:         "facilities",
  mwTotal:       "MW",
  proposed:      "proposed centers",
  operating:     "operating centers",
  cancelled:     null,
  pushbackCount: "pushback count",
};

const noDataColor = "#9db5c2";   // blue-grey — visually distinct from YlOrRd
const cancelledColor = "#c92a2a";
const measureValues = counties.map((c) => c[measure]).filter((v) => v > 0);
const isBinary = measure === "cancelled";

const maxVal = d3.max(measureValues) ?? 1;
const color = isBinary
  ? null
  : d3.scaleSequentialLog(d3.interpolateYlOrRd).domain([1, maxVal]).clamp(true);

const unit = measureUnits[measure] ?? "";

const legendNode = (() => {
  // Match the same theme detection used by the main visualization cell
  const _legDark = (() => {
    for (const t of [document.documentElement, document.body]) {
      const bg = getComputedStyle(t).backgroundColor;
      const m = bg.match(/[\d.]+/g)?.map(Number);
      if (m?.length >= 3 && (m[3] ?? 1) > 0.01)
        return (m[0]*299 + m[1]*587 + m[2]*114) / 1000 < 128;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  })();
  const legTxt = _legDark ? "#888" : "#555";

  const svgLeg = d3.create("svg").attr("height", 46);
  if (isBinary) {
    svgLeg.attr("width", 300);
    svgLeg.append("rect").attr("x", 0).attr("y", 2).attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", cancelledColor);
    svgLeg.append("text").attr("x", 22).attr("y", 13).attr("font-size", 12).attr("fill", legTxt).text("Has cancelled facilities");
    svgLeg.append("rect").attr("x", 0).attr("y", 24).attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", noDataColor);
    svgLeg.append("text").attr("x", 22).attr("y", 35).attr("font-size", 12).attr("fill", legTxt).text("No data");
  } else {
    const w = 220, h = 12;
    svgLeg.attr("width", w + 20);
    const grad = svgLeg.append("defs").append("linearGradient").attr("id", "leg-grad");
    d3.range(0, 1.01, 0.1).forEach((t) => {
      grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", d3.interpolateYlOrRd(t));
    });
    svgLeg.append("rect").attr("x", 0).attr("y", 0).attr("width", w).attr("height", h).attr("fill", "url(#leg-grad)");
    svgLeg.append("text").attr("x", 0).attr("y", h + 14).attr("font-size", 11).attr("fill", legTxt).text(`1 ${unit}`);
    svgLeg.append("text").attr("x", w).attr("y", h + 14).attr("font-size", 11).attr("fill", legTxt).attr("text-anchor", "end").text(`${maxVal.toLocaleString()} ${unit}`);
    svgLeg.append("rect").attr("x", 0).attr("y", h + 22).attr("width", 14).attr("height", 12).attr("rx", 2).attr("fill", noDataColor);
    svgLeg.append("text").attr("x", 20).attr("y", h + 32).attr("font-size", 11).attr("fill", legTxt).text("No data");
  }
  return svgLeg.node();
})();
display(legendNode);
```

```js
// Helper functions used by the detail panel
const fmtMW = (n) => n == null ? "—" : `${Number(n).toLocaleString()} MW`;
const fmtAcres = (n) => n == null ? null : `${Number(n).toLocaleString()} acres`;

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

const measureMeta = {
  total:        { filter: null,        label: "Largest facility" },
  mwTotal:      { filter: null,        label: "Highest-capacity facility" },
  proposed:     { filter: "proposed",  label: "Largest proposed facility" },
  operating:    { filter: "operating", label: "Largest operating facility" },
  cancelled:    { filter: "cancel",    label: "Largest cancelled facility" },
  pushbackCount:{ filter: "pushback",  label: "Contested facility" },
};

function pickSpotlight(facilities, measure) {
  const meta = measureMeta[measure] ?? measureMeta.total;
  let pool = facilities;
  if (meta.filter === "pushback") {
    pool = facilities.filter(f => f.pushback).sort((a, b) => {
      const score = f => (f.advocacyInfo ? 2 : 0) + (f.resistanceStatus ? 1 : 0) + (f.sources?.length > 0 ? 1 : 0);
      return score(b) - score(a) || (b.mw ?? 0) - (a.mw ?? 0);
    });
  } else if (meta.filter) {
    pool = facilities.filter(f => f.status?.toLowerCase().includes(meta.filter));
  }
  if (!pool.length) pool = facilities;
  return pool.slice().sort((a, b) => (b.mw ?? 0) - (a.mw ?? 0))[0] ?? null;
}
```

```js
{
  // Theme palette — reads the actual rendered page background so it tracks
  // Observable Framework's active theme (not just the OS-level preference).
  const isDark = (() => {
    for (const target of [document.documentElement, document.body]) {
      const bg = getComputedStyle(target).backgroundColor;
      const m = bg.match(/[\d.]+/g)?.map(Number);
      if (m?.length >= 3 && (m[3] ?? 1) > 0.01)
        return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000 < 128;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  })();
  const T = {
    scatterBg:         isDark ? "#111"                  : "#f7f7f7",
    gridLine:          isDark ? "#1e1e1e"               : "#e4e4e4",
    axisText:          isDark ? "#777"                  : "#666",
    axisLabel:         isDark ? "#888"                  : "#555",
    hint:              isDark ? "#444"                  : "#bbb",
    tooltipBg:         isDark ? "rgba(15,15,15,0.92)"   : "rgba(245,245,245,0.95)",
    tooltipFg:         isDark ? "#eee"                  : "#111",
    tooltipSub:        isDark ? "#ccc"                  : "#555",
    stateMesh:         isDark ? "#fff"                  : "#aaa",
    countyStroke:      isDark ? "#fff"                  : "#ccc",
    hoverBorder:       isDark ? "#eee"                  : "#111",
    detailEmpty:       isDark ? "#888"                  : "#666",
    detailStat:        isDark ? "#aaa"                  : "#555",
    detailNum:         isDark ? "#fff"                  : "#000",
    detailFaded:       isDark ? "#666"                  : "#999",
    opLabel:           isDark ? "#888"                  : "#666",
    chipBg:            isDark ? "#1a1a1a"               : "#f0f0f0",
    chipBorder:        isDark ? "#333"                  : "#ddd",
    chipText:          isDark ? "#e8e8e8"               : "#222",
    chipCount:         isDark ? "#888"                  : "#666",
    spotBg:            isDark ? "#0d0d0d"               : "#f8f8f8",
    spotBorder:        isDark ? "#2a2a2a"               : "#ddd",
    spotHeaderNormal:  isDark ? "#111"                  : "#ebebeb",
    spotHeaderPb:      isDark ? "#1a0505"               : "#fff0f0",
    spotDividerNormal: isDark ? "#222"                  : "#e0e0e0",
    spotLabel:         isDark ? "#666"                  : "#888",
    spotContent:       isDark ? "#999"                  : "#555",
    spotCite:          isDark ? "#ccc"                  : "#333",
    spotSep:           isDark ? "#444"                  : "#ccc",
    resBox:            isDark ? "#120808"               : "#fff5f5",
    resBorder:         isDark ? "#3a1010"               : "#ffc0c0",
    resChipBg:         isDark ? "#1e0c0c"               : "#ffeeee",
    resChipBorder:     isDark ? "#5c2020"               : "#ffaaaa",
    resChipText:       isDark ? "#ffb3b3"               : "#c92a2a",
    resLinkBorder:     isDark ? "#2a1010"               : "#ffcccc",
    petitionLink:      isDark ? "#ff8787"               : "#c92a2a",
    communityLink:     isDark ? "#74c0fc"               : "#1971c2",
    newsLink:          isDark ? "#adb5bd"               : "#555",
    dotStroke:         isDark ? "#fff"                  : "#000",
  };

  const width = 975;
  const height = 610;
  const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
  const path = d3.geoPath(projection);

  const selected = selectedFips ? countyByFips.get(selectedFips) : null;
  let hoverGroup;

  // --- Floating HTML tooltip ---
  const tooltip = html`<div style="
    position: absolute;
    pointer-events: none;
    opacity: 0;
    background: ${T.tooltipBg};
    color: ${T.tooltipFg};
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.82em;
    line-height: 1.6;
    max-width: 230px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    transition: opacity 0.08s;
    z-index: 10;
  ">`;

  // --- Map SVG ---
  const svg = d3.create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("style", "max-width: 100%; height: auto; cursor: pointer; display: block;");

  const mapCountyPaths = svg.append("g")
    .selectAll("path")
    .data(countyFeatures)
    .join("path")
      .attr("d", path)
      .attr("fill", (d) => {
        const rec = countyByFips.get(String(d.id).padStart(5, "0"));
        const v = rec ? rec[measure] : 0;
        if (v <= 0) return noDataColor;
        return isBinary ? cancelledColor : color(v);
      })
      .attr("stroke", T.countyStroke)
      .attr("stroke-width", 0.2)
      .on("mouseover", (event, d) => {
        const rec = countyByFips.get(String(d.id).padStart(5, "0"));
        if (!rec || rec[measure] <= 0) return;
        hoverGroup.selectAll("path").remove();
        hoverGroup.append("path")
          .datum(d)
          .attr("fill", "none")
          .attr("stroke", T.hoverBorder)
          .attr("stroke-width", 1.8)
          .attr("pointer-events", "none")
          .attr("d", path);
        const v = rec[measure];
        const extra = (!isBinary && measure !== "total" && measure !== "mwTotal" && v != null)
          ? `<br><span style="color:${T.tooltipSub};">${v.toLocaleString()} ${unit}</span>`
          : "";
        const pushbackLine = rec.pushbackCount > 0
          ? `<br><span style="color:#ff8787;">${rec.pushbackCount} with community pushback</span>`
          : "";
        tooltip.innerHTML = `
          <strong style="font-size:1.02em;">${rec.name}</strong><br>
          ${rec.total} facilities · ${rec.mwTotal.toLocaleString()} MW${extra}${pushbackLine}
        `;
        tooltip.style.opacity = "1";
      })
      .on("mousemove", (event) => {
        const box = svg.node().getBoundingClientRect();
        const x = event.clientX - box.left + 14;
        const y = event.clientY - box.top - 36;
        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
      })
      .on("mouseout", () => {
        hoverGroup?.selectAll("path").remove();
        tooltip.style.opacity = "0";
      })
      .on("click", (event, d) => {
        const fips = String(d.id).padStart(5, "0");
        const rec = countyByFips.get(fips);
        if (!rec || rec[measure] <= 0) return;
        setSelected(selectedFips === fips ? null : fips);
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
      .attr("stroke", T.stateMesh)
      .attr("stroke-width", 0.7)
      .attr("stroke-linejoin", "round")
      .attr("d", path);

  hoverGroup = svg.append("g").attr("pointer-events", "none");

  // --- Detail panel content ---
  let detailContent;
  if (!selected) {
    detailContent = html`<p style="color:${T.detailEmpty}; margin-top:0;"><em>Click a colored county to see operators and the spotlight facility.</em></p>`;
  } else {
    const sp = pickSpotlight(selected.facilities, measure);
    const ops = selected.operators.filter((o) => o.name !== "Unknown").slice(0, 6);
    const unknownGroup = selected.operators.find((o) => o.name === "Unknown");
    const namedCount = selected.operators.filter((o) => o.name !== "Unknown").length;

    detailContent = html`
      <div>
        <h2 style="margin: 0 0 4px 0; font-size:1.15em;">${selected.name}</h2>
        <p style="margin: 4px 0 14px 0; color:${T.detailStat}; font-size:0.9em; line-height:1.7;">
          <strong style="color:${T.detailNum};">${selected.total}</strong> facilities ·
          <strong style="color:${T.detailNum};">${selected.mwTotal.toLocaleString()} MW</strong> ·
          ${selected.operating} operating ·
          ${selected.proposed} proposed ·
          ${selected.pushbackCount > 0
            ? html`<strong style="color:#ff6b6b;">${selected.pushbackCount} with community pushback</strong>`
            : html`<span style="color:${T.detailFaded};">no recorded pushback</span>`}
        </p>

        <div style="margin-bottom: 16px;">
          <div style="font-size:0.78em; color:${T.opLabel}; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em;">Top operators</div>
          ${ops.map((o) => html`<span style="display:inline-block; padding:4px 10px; margin:0 6px 6px 0; background:${T.chipBg}; border:1px solid ${T.chipBorder}; border-radius:14px; font-size:0.82em; color:${T.chipText};">
            <strong style="color:${T.detailNum};">${o.name}</strong><span style="color:${T.chipCount};"> · ${o.count}</span>
          </span>`)}
          ${unknownGroup ? html`<span style="color:${T.detailFaded}; font-size:0.82em; margin-left:4px;">+ ${unknownGroup.count} unknown</span>` : ""}
          ${namedCount > 6 ? html`<span style="color:${T.detailFaded}; font-size:0.82em; margin-left:8px;">+ ${namedCount - 6} more</span>` : ""}
        </div>

        ${sp ? html`
          <div style="border:1px solid ${sp.pushback ? "#c92a2a" : T.spotBorder}; border-radius:8px; overflow:hidden; background:${T.spotBg};">

            <div style="padding:10px 16px; background:${sp.pushback ? T.spotHeaderPb : T.spotHeaderNormal}; border-bottom:1px solid ${sp.pushback ? "#c92a2a" : T.spotDividerNormal}; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span style="font-size:0.7em; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:${sp.pushback ? "#ff6b6b" : T.spotLabel};">
                ${sp.pushback ? "⚑ " : ""}${measureMeta[measure]?.label ?? "Spotlight"}
              </span>
              ${statusBadge(sp.status)}
            </div>

            <div style="padding:14px 16px 10px;">
              <h3 style="margin:0 0 6px 0; font-size:1.05em;">${sp.name || "Unnamed facility"}</h3>
              <div style="color:${T.spotContent}; font-size:0.85em; line-height:1.8;">
                ${[
                  sp.operator ? html`<span style="color:${T.spotCite};">${sp.operator}</span>` : null,
                  sp.sizeRank ? html`<span>${sp.sizeRank}</span>` : null,
                  sp.mw ? html`<span><strong style="color:${T.detailNum};">${fmtMW(sp.mw)}</strong></span>` : null,
                  sp.acres ? html`<span>${fmtAcres(sp.acres)}</span>` : null,
                  sp.projectCost ? html`<span>${sp.projectCost}</span>` : null,
                  sp.powerSource ? html`<span>Power: ${sp.powerSource}</span>` : null,
                  sp.expectedOnline ? html`<span>Online: ${sp.expectedOnline}</span>` : null,
                ].filter(Boolean).reduce((acc, el, i) => i === 0 ? [el] : [...acc, html`<span style="color:${T.spotSep};"> · </span>`, el], [])}
              </div>
            </div>

            ${sp.pushback ? html`
              <div style="margin:0 16px 14px; padding:12px 14px; background:${T.resBox}; border:1px solid ${T.resBorder}; border-radius:6px;">
                <div style="font-size:0.7em; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#ff6b6b; margin-bottom:10px;">Community resistance</div>

                ${sp.advocacyInfo ? html`
                  <p style="margin:0 0 10px 0; color:${T.spotCite}; font-size:0.9em; line-height:1.6;">${sp.advocacyInfo}</p>
                ` : ""}

                ${sp.otherInfo ? html`
                  <p style="margin:0 0 10px 0; color:${T.spotContent}; font-size:0.85em; line-height:1.6; font-style:italic;">${sp.otherInfo}</p>
                ` : ""}

                ${(sp.resistanceStatus || sp.nda) ? html`
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    ${sp.resistanceStatus ? html`
                      <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 10px; background:${T.resChipBg}; border:1px solid ${T.resChipBorder}; border-radius:12px; font-size:0.82em; color:${T.resChipText};">
                        <strong>Status:</strong> ${sp.resistanceStatus}
                      </span>
                    ` : ""}
                    ${sp.nda ? html`
                      <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 10px; background:${T.resChipBg}; border:1px solid ${T.resChipBorder}; border-radius:12px; font-size:0.82em; color:${T.resChipText};">
                        <strong>NDA:</strong> ${sp.nda}
                      </span>
                    ` : ""}
                  </div>
                ` : ""}

                ${(sp.petitionUrl || sp.communityGroupUrl1 || sp.communityGroupUrl2 || (sp.sources && sp.sources.length)) ? html`
                  <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:0.85em; padding-top:8px; border-top:1px solid ${T.resLinkBorder};">
                    ${sp.petitionUrl ? html`<a href="${sp.petitionUrl}" target="_blank" style="color:${T.petitionLink}; text-decoration:none;">✍ Petition</a>` : ""}
                    ${sp.communityGroupUrl1 ? html`<a href="${sp.communityGroupUrl1}" target="_blank" style="color:${T.communityLink}; text-decoration:none;">Community group →</a>` : ""}
                    ${sp.communityGroupUrl2 ? html`<a href="${sp.communityGroupUrl2}" target="_blank" style="color:${T.communityLink}; text-decoration:none;">Community group 2 →</a>` : ""}
                    ${sp.sources && sp.sources.slice(0, 3).map((u, i) => html`<a href="${u}" target="_blank" style="color:${T.newsLink}; text-decoration:none;">News ${i + 1} →</a>`)}
                  </div>
                ` : ""}
              </div>
            ` : sp.otherInfo ? html`
              <p style="margin:0 16px 14px; color:${T.spotContent}; font-size:0.85em; line-height:1.6;">${sp.otherInfo}</p>
            ` : ""}

          </div>
        ` : ""}
      </div>
    `;
  }

  // --- Scatter: all counties, colored by opposition/cancellation status ---
  const scatterCfg = {
    total:         { xKey: "mwTotal",       yKey: "total",         xLabel: "Total MW",              yLabel: "Total facilities" },
    mwTotal:       { xKey: "total",         yKey: "mwTotal",       xLabel: "Total facilities",       yLabel: "Total MW" },
    proposed:      { xKey: "total",         yKey: "proposed",      xLabel: "Total facilities",       yLabel: "Proposed facilities" },
    operating:     { xKey: "total",         yKey: "operating",     xLabel: "Total facilities",       yLabel: "Operating facilities" },
    cancelled:     { xKey: "total",         yKey: "cancelled",     xLabel: "Total facilities",       yLabel: "Cancelled facilities" },
    pushbackCount: { xKey: "total",         yKey: "pushbackCount", xLabel: "Total facilities",       yLabel: "Facilities w/ pushback" },
  };
  const cfg = scatterCfg[measure] ?? scatterCfg.total;
  const scatterData = counties.filter(c => c[cfg.xKey] > 0 && c[cfg.yKey] > 0);

  const catOf = (d) => {
    if (d.pushbackCount > 0 && d.cancelled > 0) return "both";
    if (d.pushbackCount > 0) return "pushback";
    if (d.cancelled > 0) return "cancelled";
    return "normal";
  };
  const catColor   = { both: "#c92a2a", pushback: "#f08c00", cancelled: "#868e96", normal: noDataColor };
  const catRadius  = { both: 6,         pushback: 5,         cancelled: 4,         normal: 3 };
  const catOpacity = { both: 1,         pushback: 0.9,       cancelled: 0.75,      normal: 0.4 };

  const sm = { top: 38, right: 24, bottom: 48, left: 58 };
  const sw = 975, sh = 260;

  const xSc = d3.scaleLog()
    .domain(d3.extent(scatterData, d => d[cfg.xKey])).nice()
    .range([sm.left, sw - sm.right]);
  const ySc = d3.scaleLog()
    .domain(d3.extent(scatterData, d => d[cfg.yKey])).nice()
    .range([sh - sm.bottom, sm.top]);

  const svgSc = d3.create("svg")
    .attr("viewBox", [0, 0, sw, sh])
    .attr("width", sw)
    .attr("style", "max-width: 100%; height: auto; display: block;");

  svgSc.append("rect")
    .attr("x", sm.left).attr("y", sm.top)
    .attr("width", sw - sm.left - sm.right)
    .attr("height", sh - sm.top - sm.bottom)
    .attr("fill", T.scatterBg);

  svgSc.append("g")
    .attr("transform", `translate(0,${sh - sm.bottom})`)
    .call(d3.axisBottom(xSc).ticks(6, "~s").tickSize(-(sh - sm.top - sm.bottom)))
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll(".tick line").attr("stroke", T.gridLine))
    .call(g => g.selectAll(".tick text").attr("fill", T.axisText).attr("font-size", 10));

  svgSc.append("g")
    .attr("transform", `translate(${sm.left},0)`)
    .call(d3.axisLeft(ySc).ticks(5, "~s").tickSize(-(sw - sm.left - sm.right)))
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll(".tick line").attr("stroke", T.gridLine))
    .call(g => g.selectAll(".tick text").attr("fill", T.axisText).attr("font-size", 10));

  svgSc.append("text")
    .attr("x", sm.left + (sw - sm.left - sm.right) / 2).attr("y", sh - 8)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", T.axisLabel)
    .text(`${cfg.xLabel} (log)`);
  svgSc.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(sm.top + (sh - sm.top - sm.bottom) / 2)).attr("y", 16)
    .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", T.axisLabel)
    .text(`${cfg.yLabel} (log)`);

  [
    { cat: "both",      label: "Pushback + cancellations" },
    { cat: "pushback",  label: "Community pushback" },
    { cat: "cancelled", label: "Cancelled, no pushback" },
    { cat: "normal",    label: "No opposition recorded" },
  ].forEach(({ cat, label }, i) => {
    const lx = sm.left + i * 195, ly = sm.top - 22;
    svgSc.append("circle").attr("cx", lx).attr("cy", ly + 4)
      .attr("r", catRadius[cat]).attr("fill", catColor[cat]).attr("opacity", catOpacity[cat]);
    svgSc.append("text").attr("x", lx + catRadius[cat] + 5).attr("y", ly + 8)
      .attr("font-size", 9.5).attr("fill", T.axisLabel).text(label);
  });

  svgSc.append("text")
    .attr("x", sw - sm.right - 4).attr("y", sm.top - 18)
    .attr("text-anchor", "end").attr("font-size", 9.5).attr("fill", T.hint)
    .text("drag to brush · click to select");

  const scatterTooltip = html`<div style="position:absolute; pointer-events:none; opacity:0; background:${T.tooltipBg}; color:${T.tooltipFg}; padding:7px 11px; border-radius:6px; font-size:0.8em; line-height:1.6; max-width:220px; box-shadow:0 2px 8px rgba(0,0,0,0.3); z-index:10;">`;

  const sortedScatter = [...scatterData].sort((a, b) => {
    const order = { normal: 0, cancelled: 1, pushback: 2, both: 3 };
    return order[catOf(a)] - order[catOf(b)];
  });

  const dots = svgSc.append("g")
    .selectAll("circle")
    .data(sortedScatter)
    .join("circle")
      .attr("cx", d => xSc(d[cfg.xKey]))
      .attr("cy", d => ySc(d[cfg.yKey]))
      .attr("r",  d => catRadius[catOf(d)])
      .attr("fill", d => catColor[catOf(d)])
      .attr("stroke", d => d.fips === selectedFips ? T.dotStroke : "none")
      .attr("stroke-width", 2)
      .attr("opacity", d => d.fips === selectedFips ? 1 : catOpacity[catOf(d)])
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        const cat = catOf(d);
        const catLabel = { both: "Pushback + cancellations", pushback: "Community pushback", cancelled: "Cancelled, no pushback", normal: "No opposition" };
        scatterTooltip.innerHTML = `
          <strong>${d.name}</strong><br>
          ${d.total} facilities · ${d.mwTotal.toLocaleString()} MW<br>
          <span style="color:${catColor[cat]};">${catLabel[cat]}</span>
          ${d.pushbackCount > 0 ? `<br><span style="color:#ff8787;">${d.pushbackCount} with pushback</span>` : ""}
          ${d.cancelled > 0 ? `<br><span style="color:${T.axisText};">${d.cancelled} cancelled</span>` : ""}
        `;
        scatterTooltip.style.opacity = "1";
      })
      .on("mousemove", (event) => {
        const box = svgSc.node().getBoundingClientRect();
        scatterTooltip.style.left = (event.clientX - box.left + 12) + "px";
        scatterTooltip.style.top  = (event.clientY - box.top  - 32) + "px";
      })
      .on("mouseout", () => { scatterTooltip.style.opacity = "0"; })
      .on("click", (event, d) => {
        setSelected(selectedFips === d.fips ? null : d.fips);
      });

  // D3 brush — directly mutates DOM opacity, no reactive re-render
  const brush = d3.brush()
    .extent([[sm.left, sm.top], [sw - sm.right, sh - sm.bottom]])
    .on("brush", ({selection}) => {
      if (!selection) return;
      const [[x0, y0], [x1, y1]] = selection;
      const inBrush = new Set(
        scatterData
          .filter(d => xSc(d[cfg.xKey]) >= x0 && xSc(d[cfg.xKey]) <= x1 &&
                       ySc(d[cfg.yKey]) >= y0 && ySc(d[cfg.yKey]) <= y1)
          .map(d => d.fips)
      );
      dots.attr("opacity", d => inBrush.has(d.fips) ? 1 : 0.05);
      mapCountyPaths.attr("opacity", d => {
        const fips = String(d.id).padStart(5, "0");
        return inBrush.has(fips) ? 1 : 0.12;
      });
    })
    .on("end", ({selection}) => {
      if (!selection) {
        dots.attr("opacity", d => catOpacity[catOf(d)]);
        mapCountyPaths.attr("opacity", 1);
      }
    });

  svgSc.append("g").call(brush);

  // --- Layout: top row [map | detail panel], scatter full-width below ---
  const mapPane = html`<div style="position: relative; flex: 1 1 auto; min-width: 0;">`;
  mapPane.appendChild(svg.node());
  mapPane.appendChild(tooltip);

  const sidePane = html`<div style="flex: 0 0 300px; padding-top: 0.2em;">`;
  sidePane.appendChild(detailContent);

  const topRow = html`<div style="display: flex; gap: 1.5em; align-items: flex-start; margin-top: 0.5em;">`;
  topRow.appendChild(mapPane);
  topRow.appendChild(sidePane);

  const scatterPane = html`<div style="position: relative; margin-top: 0.75em;">`;
  scatterPane.appendChild(svgSc.node());
  scatterPane.appendChild(scatterTooltip);

  const wrapper = html`<div>`;
  wrapper.appendChild(topRow);
  wrapper.appendChild(scatterPane);

  display(wrapper);
}
```

## Design Rationale
I first began this assignment with a different focus: do data center counties grow economically differently from their neighbors. After making a version of this, I found that my data had too little information to make any claims about my findings. Rather than making a claim I couldn't defend honestly, I decided to move to a more concrete question: where is the buildout happening, who is running it, and where are communities pushing back? I chose this so that every measure is a counted fact and not an inferred effect.

The quesiton I ask is pretty spatial, so I decide to go with a choropleth as my view. Counties were colored on a sequential ramp with a logarithmic scale. I made this decision because some counties, like Loudoun, VA and Pike, OH dominate the distribution and would saturate a linear scale. Counties with no data are rendered in blue-grey (#9db5c2) to make them clearly distinguishable from both the light yellow low end and the dark red high end of the YlOrRd scale.

The radio button toggle is a main interaction. They allow the viewer to switch between total facilities, total megawatts, proposed, operating, cancelled, and community pushback, turning the map into six views and showing interesting comparisons in the data. For example, the densest counties are not always the largest in raw power, and the pushback hotspots are in a different geography from facility count hotspots.

The click-to-detail panel saw various iterations. My early version listed every facility as a table row, which would overwhelm the viewer for big counties. I tried collapsing by facility name, but found duplicates that were actually distinct facilities at different addresses sharing a project name. The final version I landed on groups by operator and uses a spotlight card to give one facility deep treatment rather than spreading attention across many. The panel sits beside the map in a two-column layout so it is always visible—no scrolling required.

A linked scatter plot below the map plots each county by facility count (X) against total MW capacity (Y), both on log scales, with dots colored by the active measure. Dragging a brush rectangle on the scatter highlights the corresponding counties on the map and dims the rest, enabling the viewer to ask spatial questions that the choropleth alone cannot answer—for example, whether high-capacity counties cluster geographically or are dispersed. Clicking a dot selects the county in the detail panel, and clicking a county on the map highlights its dot in the scatter.

Hover tooltips use a floating HTML div rather than the browser's native title attribute, giving consistent styling and immediate feedback without browser-imposed delays.

The pushback field also saw some iteration. The "pushback count" alone was abstract and didn't give a viewer any information as to why. The dataset also didn't have a "reason" field, but does include evidence fields: advocacy descriptions, resistance status, NDA flags, petition URLs, and news sources. The spotlight card displays these when present.

Encoding channels are kept separate: color encodes the chosen measure, a black outline marks the selected county, and the detail panel uses a categorical palette for status.

## References / Data Sources 

U.S data center facility records (data_centers.csv) - https://data.msdlive.org/records/65g71-a4731

FracTracker Alliance, National Data Centers Tracker. (datacenter2.csv) - https://www.fractracker.org/2025/07/national-data-centers-tracker/

Frontier AI data center construction observations (datacenters3.csv) - https://epoch.ai/data/data-centers

County boundary geometry — us-atlas (https://github.com/topojson/us-atlas)

Github Repository - https://github.com/TreyMartin0/Assignment5_CSC477

*There are two additional datasets in the repository that are not used, but I can provide links upon request if needed*

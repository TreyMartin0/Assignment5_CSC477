//imports
import { readFileSync } from "fs";
import { createRequire } from "module";
import { neighbors } from "topojson-client";

const require = createRequire(import.meta.url);
const usAtlasPath = require.resolve("us-atlas/counties-10m.json");
const us = JSON.parse(readFileSync(usAtlasPath, "utf-8"));

const counties = us.objects.counties.geometries;
const nbrIndices = neighbors(counties);

const adjacency = {};
counties.forEach((geom, i) => {
  const fips = String(geom.id).padStart(5, "0");
  adjacency[fips] = nbrIndices[i].map((j) =>
    String(counties[j].id).padStart(5, "0")
  );
});

process.stdout.write(JSON.stringify(adjacency));
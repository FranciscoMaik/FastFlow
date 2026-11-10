// Converte uma resposta da Overpass API (formato `out geom tags`) no GeoJSON
// usado pelas telas de simulação. Rodar uma vez por região:
//   node scripts/gerar-malha.mjs caminho/overpass.json > data/malha.geojson
//   node scripts/gerar-malha.mjs jordanesia.json > data/malha-jordanesia.geojson
//   node scripts/gerar-malha.mjs polvilho.json > data/malha-polvilho.geojson
//
// Consultas (sul, oeste, norte, leste) — as mesmas áreas de data/locais.json:
//   Centro:     (-23.365,-46.890,-23.345,-46.866) → data/malha.geojson
//   Jordanésia: (-23.343,-46.850,-23.327,-46.830) → data/malha-jordanesia.geojson
//   Polvilho:   (-23.418,-46.856,-23.398,-46.832) → data/malha-polvilho.geojson
//   Ponunduva:  (-23.336,-46.930,-23.316,-46.906) → data/malha-ponunduva.geojson
//
//   [out:json];way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|
//   primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|
//   residential|living_street)$"](S,W,N,E);out geom tags;
//
// As rodovias (motorway/trunk) e suas alças (*_link) precisam estar na consulta:
// sem as alças, a rodovia vira uma "ilha" desligada das ruas e não recebe veículos.
import { readFileSync } from "node:fs";

const VELOCIDADE_PADRAO = { motorway: 80, motorway_link: 40, trunk: 60, trunk_link: 40,
  primary: 50, primary_link: 40, secondary: 40, secondary_link: 30, tertiary: 40,
  tertiary_link: 30, unclassified: 30, residential: 30, living_street: 20 };

// Convenção do OpenStreetMap: rodovias expressas e suas alças são mão única mesmo
// sem a etiqueta "oneway" (cada pista é desenhada separada).
function sentidoUnico({ oneway, highway }) {
  if (oneway === "yes") return 1;
  if (oneway === "-1") return -1;
  if (oneway === "no") return 0;
  return highway === "motorway" || highway === "motorway_link" ? 1 : 0;
}

const entrada = JSON.parse(readFileSync(process.argv[2], "utf8"));
const vias = entrada.elements.filter((e) => e.type === "way" && e.geometry);

const features = vias.map((via) => {
  const velocidade = parseInt(via.tags.maxspeed, 10) || VELOCIDADE_PADRAO[via.tags.highway] || 30;
  const oneway = sentidoUnico(via.tags);
  return {
    type: "Feature",
    properties: {
      osmId: via.id,
      nome: via.tags.name || null,
      tipo: via.tags.highway,
      sentidoUnico: oneway,
      velocidade,
    },
    geometry: {
      type: "LineString",
      coordinates: via.geometry.map((p) => [+p.lon.toFixed(7), +p.lat.toFixed(7)]),
    },
  };
});

process.stdout.write(JSON.stringify({ type: "FeatureCollection", features }));

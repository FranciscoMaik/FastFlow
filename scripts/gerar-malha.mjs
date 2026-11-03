// Converte uma resposta da Overpass API (formato `out geom tags`) no GeoJSON
// usado pela tela de bloqueio. Rodar uma única vez quando a região mudar:
//   node scripts/gerar-malha.mjs caminho/overpass.json > data/malha.geojson
//
// Consulta usada (centro de Cajamar/SP):
//   [out:json];way["highway"~"^(primary|secondary|tertiary|residential|unclassified|
//   trunk|primary_link|secondary_link|tertiary_link|living_street)$"]
//   (-23.365,-46.890,-23.345,-46.866);out geom tags;
import { readFileSync } from "node:fs";

const VELOCIDADE_PADRAO = { trunk: 60, primary: 50, primary_link: 40, secondary: 40,
  secondary_link: 30, tertiary: 40, tertiary_link: 30, unclassified: 30,
  residential: 30, living_street: 20 };

const entrada = JSON.parse(readFileSync(process.argv[2], "utf8"));
const vias = entrada.elements.filter((e) => e.type === "way" && e.geometry);

const features = vias.map((via) => {
  const velocidade = parseInt(via.tags.maxspeed, 10) || VELOCIDADE_PADRAO[via.tags.highway] || 30;
  const oneway = via.tags.oneway === "yes" ? 1 : via.tags.oneway === "-1" ? -1 : 0;
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

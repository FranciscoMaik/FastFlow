// Converte o GeoJSON de vias (gerado por scripts/gerar-malha.mjs) no grafo do motor.
// Pontos compartilhados por mais de uma via (ou extremidades) viram cruzamentos;
// cada pedaço de via entre dois cruzamentos vira um trecho.
import { Grafo } from "../motor/grafo.js";

const RAIO_TERRA = 6371000;
const SITUACOES_INATIVAS = new Set([
  "false",
  "0",
  "no",
  "inactive",
  "disabled",
  "disused",
  "abandoned",
  "construction",
  "proposed",
  "closed",
]);
const TIPOS_VIA_INATIVA = new Set(["construction", "proposed", "abandoned", "disused", "razed", "demolished"]);

export function distanciaMetros([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA * Math.asin(Math.sqrt(a));
}

function geometria(pontos) {
  const acumulado = [0];
  for (let i = 1; i < pontos.length; i++) {
    acumulado.push(acumulado[i - 1] + distanciaMetros(pontos[i - 1], pontos[i]));
  }
  return { pontos, acumulado, comprimento: acumulado[acumulado.length - 1] };
}

// Ponto (lat, lon) a `distancia` metros do início de uma geometria.
export function pontoNaGeometria({ pontos, acumulado }, distancia) {
  if (distancia <= 0) return pontos[0];
  for (let i = 1; i < pontos.length; i++) {
    if (acumulado[i] >= distancia) {
      const parte = acumulado[i] - acumulado[i - 1];
      const t = parte === 0 ? 0 : (distancia - acumulado[i - 1]) / parte;
      const [lat1, lon1] = pontos[i - 1];
      const [lat2, lon2] = pontos[i];
      return [lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t];
    }
  }
  return pontos[pontos.length - 1];
}

function viaOperacional(properties) {
  const valores = [properties.ativo, properties.operacional, properties.status];
  const tipo = String(properties.tipo ?? "").toLowerCase();
  return (
    !valores.some((valor) => valor === false || (valor != null && SITUACOES_INATIVAS.has(String(valor).toLowerCase()))) &&
    !TIPOS_VIA_INATIVA.has(tipo) &&
    !["no", "private"].includes(String(properties.access ?? "").toLowerCase()) &&
    !["no", "private"].includes(String(properties.motor_vehicle ?? "").toLowerCase()) &&
    !["no", "private"].includes(String(properties.vehicle ?? "").toLowerCase())
  );
}

export function construirGrafo(geojson) {
  const grafo = new Grafo();
  const vias = geojson.features.filter((f) => f.geometry?.type === "LineString");
  const chave = ([lon, lat]) => `${lon},${lat}`;

  const usos = new Map();
  const extremidades = new Set();
  for (const via of vias) {
    const coords = via.geometry.coordinates;
    coords.forEach((c) => usos.set(chave(c), (usos.get(chave(c)) ?? 0) + 1));
    extremidades.add(chave(coords[0]));
    extremidades.add(chave(coords[coords.length - 1]));
  }
  const ehCruzamento = (k) => extremidades.has(k) || usos.get(k) > 1;

  const idsDeNo = new Map();
  const no = (coord) => {
    const k = chave(coord);
    if (!idsDeNo.has(k)) {
      const id = `n${idsDeNo.size + 1}`;
      idsDeNo.set(k, id);
      grafo.adicionarNo(id, { lat: coord[1], lon: coord[0] });
    }
    return idsDeNo.get(k);
  };

  let contador = 0;
  for (const via of vias) {
    const { nome, tipo, sentidoUnico, velocidade } = via.properties;
    const operacional = viaOperacional(via.properties);
    const coords = via.geometry.coordinates;
    let inicio = 0;
    for (let i = 1; i < coords.length; i++) {
      if (i < coords.length - 1 && !ehCruzamento(chave(coords[i]))) continue;
      const fatia = coords.slice(inicio, i + 1);
      inicio = i;
      const pontos = fatia.map(([lon, lat]) => [lat, lon]);
      const geo = geometria(pontos);
      if (geo.comprimento < 0.5) continue;

      const trechoId = `t${++contador}`;
      const de = no(fatia[0]);
      const para = no(fatia[fatia.length - 1]);
      const velocidadeMs = velocidade / 3.6;
      const peso = operacional ? geo.comprimento / velocidadeMs : Infinity;
      const arestas = [];
      const criar = (sufixo, origem, destino, g) => {
        const id = `${trechoId}${sufixo}`;
        grafo.adicionarAresta({
          id, de: origem, para: destino, peso, trechoId,
          comprimento: g.comprimento, velocidade: velocidadeMs, geometria: g,
        });
        arestas.push(id);
      };
      if (sentidoUnico !== -1) criar(">", de, para, geo);
      if (sentidoUnico !== 1) criar("<", para, de, geometria([...pontos].reverse()));

      grafo.adicionarTrecho({
        id: trechoId,
        arestas,
        sentido: sentidoUnico === 0 ? 0 : sentidoUnico === -1 ? -1 : 1,
        permiteDuplo: sentidoUnico === 0,
        nome: nome ?? null,
        tipo,
        operacional,
        sentidoUnico: sentidoUnico !== 0,
        comprimento: geo.comprimento,
        pontos,
        extremidades: [de, para],
        meio: pontoNaGeometria(geo, geo.comprimento / 2),
      });
    }
  }

  descreverReferencias(grafo);
  return grafo;
}

// Para cada trecho, descobre as ruas transversais nas extremidades
// ("entre Rua A e Rua B"), o que ajuda a identificar o trecho na lista.
function descreverReferencias(grafo) {
  const nomesPorNo = new Map();
  for (const trecho of grafo.trechos.values()) {
    for (const n of trecho.meta.extremidades) {
      if (!nomesPorNo.has(n)) nomesPorNo.set(n, new Set());
      if (trecho.meta.nome) nomesPorNo.get(n).add(trecho.meta.nome);
    }
  }
  for (const trecho of grafo.trechos.values()) {
    const [a, b] = trecho.meta.extremidades.map((n) => {
      const outros = [...nomesPorNo.get(n)].filter((nome) => nome !== trecho.meta.nome);
      return outros[0] ?? null;
    });
    trecho.meta.referencia =
      a && b && a !== b ? `entre ${a} e ${b}` : a || b ? `próximo a ${a || b}` : null;
  }
}

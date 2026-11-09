// Gera data/rotas-contingencia.json: o traçado de cada rota da página de
// contingência seguindo as ruas reais (OSRM sobre dados do OpenStreetMap).
// Os pontos em js/contingencia.js são só "pontos de passagem" aproximados; aqui
// cada um é encaixado na via mais próxima e o trajeto entre eles é calculado.
// Rodar de novo sempre que os cenários mudarem:
//   node scripts/gerar-rotas-contingencia.mjs
import { readFileSync, writeFileSync } from "node:fs";

const OSRM = "https://router.project-osrm.org/route/v1/driving/";

// Lê o objeto `cenarios` de js/contingencia.js (a fonte única dos pontos).
const fonte = readFileSync(new URL("../js/contingencia.js", import.meta.url), "utf8");
const inicio = fonte.indexOf("const cenarios = ");
const fim = fonte.indexOf("\n  };\n", inicio);
if (inicio < 0 || fim < 0) throw new Error("Bloco `cenarios` não encontrado em contingencia.js");
const cenarios = new Function(`${fonte.slice(inicio, fim + 5)}; return cenarios;`)();

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function tracar(pontos) {
  const coords = pontos.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const url = `${OSRM}${coords}?overview=full&geometries=geojson&continue_straight=true`;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const resposta = await fetch(url);
    if (resposta.ok) {
      const dados = await resposta.json();
      if (dados.code === "Ok") {
        const rota = dados.routes[0];
        return {
          pontos: rota.geometry.coordinates.map(([lon, lat]) => [+lat.toFixed(6), +lon.toFixed(6)]),
          distanciaM: Math.round(rota.distance),
          duracaoS: Math.round(rota.duration),
          encaixes: dados.waypoints.map((w) => Math.round(w.distance)),
        };
      }
      throw new Error(`OSRM: ${dados.code} ${dados.message ?? ""}`);
    }
    if (resposta.status < 500 && resposta.status !== 429) {
      throw new Error(`OSRM ${resposta.status}: ${await resposta.text()}`);
    }
    console.error(`  OSRM respondeu ${resposta.status}; tentativa ${tentativa}`);
    await pausa(3000 * tentativa);
  }
  throw new Error("OSRM indisponível após várias tentativas");
}

// Quantas vezes o traçado volta sobre si mesmo (curva de ~180°): sinal de que um
// ponto de passagem caiu numa rua lateral e a rota entrou e saiu dela.
function voltas(pontos) {
  let n = 0;
  for (let i = 2; i < pontos.length; i++) {
    const ax = pontos[i - 1][1] - pontos[i - 2][1], ay = pontos[i - 1][0] - pontos[i - 2][0];
    const bx = pontos[i][1] - pontos[i - 1][1], by = pontos[i][0] - pontos[i - 1][0];
    const norma = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (norma > 0 && (ax * bx + ay * by) / norma < -0.9) n++;
  }
  return n;
}

// Ponto do traçado mais próximo de `alvo` (aproximação plana, suficiente em ~10 km).
function maisProximo(pontos, alvo) {
  const kx = Math.cos((alvo[0] * Math.PI) / 180);
  let melhor = pontos[0], menor = Infinity;
  for (let i = 1; i < pontos.length; i++) {
    const [ay, ax] = pontos[i - 1], [by, bx] = pontos[i];
    const dx = (bx - ax) * kx, dy = by - ay;
    const t = Math.max(0, Math.min(1,
      (((alvo[1] - ax) * kx) * dx + (alvo[0] - ay) * dy) / (dx * dx + dy * dy || 1)));
    const p = [ay + t * dy, ax + t * (bx - ax)];
    const d = Math.hypot((alvo[1] - p[1]) * kx, alvo[0] - p[0]);
    if (d < menor) { menor = d; melhor = p; }
  }
  return [+melhor[0].toFixed(6), +melhor[1].toFixed(6)];
}

// Os pontos de js/contingencia.js foram marcados à mão e ficam até centenas de
// metros fora das ruas; usá-los todos força o traçado a entrar em ruas laterais.
// Por isso só origem, destino e UM ponto intermediário guiam o cálculo: o
// bloqueio na rota principal (que tem de passar por ele) e o ponto central do
// desenho original nos desvios (que tem de se afastar dele).
function pontosDePassagem(cenario, tipo, rota) {
  const { pontos } = rota;
  const meio = tipo === "primary" ? cenario.bloqueio : pontos[Math.floor(pontos.length / 2)];
  return [pontos[0], meio, pontos[pontos.length - 1]];
}

const saida = {};
for (const [id, cenario] of Object.entries(cenarios)) {
  saida[id] = { bloqueio: cenario.bloqueio, rotas: {} };
  for (const [tipo, rota] of Object.entries(cenario.rotas)) {
    const tracado = await tracar(pontosDePassagem(cenario, tipo, rota));
    saida[id].rotas[tipo] = {
      pontos: tracado.pontos,
      distanciaM: tracado.distanciaM,
      duracaoS: tracado.duracaoS,
    };
    console.error(
      `${id} / ${tipo}: ${tracado.pontos.length} pontos, ` +
        `${(tracado.distanciaM / 1000).toFixed(1)} km, ${Math.round(tracado.duracaoS / 60)} min, ` +
        `encaixe máx. ${Math.max(...tracado.encaixes)} m, voltas: ${voltas(tracado.pontos)}`
    );
    await pausa(1000);
  }
  saida[id].bloqueio = maisProximo(saida[id].rotas.primary.pontos, cenario.bloqueio);
}

writeFileSync(
  new URL("../data/rotas-contingencia.json", import.meta.url),
  JSON.stringify(saida)
);
console.error("Gerado data/rotas-contingencia.json");

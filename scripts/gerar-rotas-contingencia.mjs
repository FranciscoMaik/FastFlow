// Gera data/rotas-contingencia.json: o traçado de cada rota da página de
// contingência seguindo as ruas reais (OSRM sobre dados do OpenStreetMap).
//
// Regra do bloqueio:
// 1. A rota principal é origem → destino (perfil driving), sem waypoint forçado.
// 2. O OSRM devolve a velocidade de cada trecho (reflete a classe da via:
//    rodovia/arterial rápida, coletora, residencial...). Não depende do Overpass.
// 3. O bloqueio vai para a janela contínua de ~300 m com maior velocidade
//    média, na parte central do trajeto (30%–70%): uma via com tráfego real,
//    nunca um beco, rua sem saída ou trecho de acesso residencial.
//
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
  const url = `${OSRM}${coords}?overview=full&geometries=geojson&continue_straight=true&steps=true&annotations=speed,distance`;
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
          velocidades: rota.legs.flatMap((l) => l.annotation.speed),
          distancias: rota.legs.flatMap((l) => l.annotation.distance),
          passos: rota.legs.flatMap((l) => l.steps).map((p) => ({ nome: p.name || "", metros: p.distance })),
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

function distanciaMetros(a, b) {
  const kx = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[1] - a[1]) * kx, b[0] - a[0]) * 111320;
}

// Escolhe a janela de ~300 m com maior velocidade média (via de maior classe)
// entre 30% e 70% do trajeto; empate favorece o meio.
function escolherBloqueios(rota) {
  const { pontos, velocidades, distancias, passos } = rota;
  const total = distancias.reduce((a, b) => a + b, 0);
  const acum = [0];
  distancias.forEach((d, i) => acum.push(acum[i] + d));
  const JANELA = 300;
  const candidatos = [];
  for (let i = 0; i < distancias.length; i++) {
    const centro = (acum[i] + acum[i + 1]) / 2;
    const fracao = centro / total;
    if (fracao < 0.3 || fracao > 0.7) continue;
    let soma = 0, peso = 0;
    for (let j = 0; j < distancias.length; j++) {
      if (acum[j + 1] < centro - JANELA / 2 || acum[j] > centro + JANELA / 2) continue;
      soma += velocidades[j] * distancias[j];
      peso += distancias[j];
    }
    const media = soma / (peso || 1);
    const pontuacao = media - Math.abs(fracao - 0.5) * 10;
    candidatos.push({ i, centro, fracao, media, pontuacao });
  }
  candidatos.sort((a, b) => b.pontuacao - a.pontuacao);
  // Até 6 candidatos, afastados 500 m entre si, para tentar na ordem.
  const escolhidos = [];
  for (const c of candidatos) {
    if (escolhidos.every((e) => Math.abs(e.centro - c.centro) > 500)) escolhidos.push(c);
    if (escolhidos.length === 6) break;
  }
  return escolhidos.map(converter);

  function converter(melhor) {
  const t = (melhor.centro - acum[melhor.i]) / (distancias[melhor.i] || 1);
  const [ay, ax] = pontos[melhor.i], [by, bx] = pontos[melhor.i + 1];
  let restante = melhor.centro, nome = "";
  for (const passo of passos) {
    if (restante <= passo.metros) { nome = passo.nome; break; }
    restante -= passo.metros;
  }
  return {
    ponto: [+(ay + t * (by - ay)).toFixed(6), +(ax + t * (bx - ax)).toFixed(6)],
    name: nome,
    velocidadeKmh: Math.round(melhor.media * 3.6),
    fracao: +melhor.fracao.toFixed(2),
  };
  }
}

function distanciaAoTracado(pontos, alvo) {
  const kx = Math.cos((alvo[0] * Math.PI) / 180);
  let menor = Infinity;
  for (let i = 1; i < pontos.length; i++) {
    const ax = (pontos[i - 1][1] - alvo[1]) * kx, ay = pontos[i - 1][0] - alvo[0];
    const dx = (pontos[i][1] - alvo[1]) * kx - ax, dy = pontos[i][0] - alvo[0] - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    menor = Math.min(menor, Math.hypot(ax + t * dx, ay + t * dy) * 111320);
  }
  return menor;
}

// Candidatos de desvio: waypoint deslocado perpendicularmente ao trajeto no
// ponto do bloqueio, dos dois lados e em vários afastamentos. Só valem os que
// o OSRM traça fora do bloqueio (> 80 m).
async function candidatosDesvio(origem, destino, bloqueio) {
  const kx = Math.cos((bloqueio[0] * Math.PI) / 180);
  const dx = (destino[1] - origem[1]) * kx, dy = destino[0] - origem[0];
  const norma = Math.hypot(dx, dy) || 1;
  const validos = [];
  for (const metros of [500, 900, 1400, 2000]) {
    for (const lado of [1, -1]) {
      const g = metros / 111320;
      const meio = [
        +(bloqueio[0] + ((dx / norma) * lado) * g).toFixed(6),
        +(bloqueio[1] + ((-dy / norma) * lado * g) / kx).toFixed(6),
      ];
      try {
        const tracado = await tracar([origem, meio, destino]);
        const dist = distanciaAoTracado(tracado.pontos, bloqueio);
        if (process.env.DEBUG_DESVIO) console.error(`  dbg ${metros}m lado ${lado}: ${(tracado.distanciaM/1000).toFixed(1)} km, ${Math.round(dist)} m`);
        if (dist > 80) validos.push(tracado);
      } catch (erro) {
        console.error(`  desvio descartado: ${erro.message}`);
      }
      await pausa(700);
    }
  }
  return validos.sort((a, b) => a.duracaoS - b.duracaoS);
}

const saida = {};
const metadadosBloqueio = {};

for (const [id, cenario] of Object.entries(cenarios)) {
  const primariaSeed = cenario.rotas.primary.pontos;
  const origem = primariaSeed[0];
  const destino = primariaSeed[primariaSeed.length - 1];

  const primaria = await tracar([origem, destino]);
  // Testa os candidatos em ordem de classe da via; fica com o primeiro que
  // admite dois desvios distintos (evita bloqueio em gargalo sem alternativa).
  let escolha = null, desvios = [];
  for (const candidato of escolherBloqueios(primaria)) {
    const encontrados = await candidatosDesvio(origem, destino, candidato.ponto);
    const distintos = encontrados.filter((d, i) =>
      encontrados.slice(0, i).every((o) => Math.abs(o.distanciaM - d.distanciaM) / o.distanciaM > 0.08));
    if (!escolha || distintos.length > desvios.length) { escolha = candidato; desvios = encontrados; }
    if (distintos.length >= 2) break;
    console.error(`  bloqueio @${candidato.fracao} sem desvios suficientes; tentando outro ponto`);
  }
  const bloqueio = escolha.ponto;

  saida[id] = {
    bloqueio,
    local: escolha.name,
    rotas: {
      primary: { pontos: primaria.pontos },
    },
  };
  metadadosBloqueio[id] = {
    bloqueio,
    name: escolha.name,
    velocidadeKmh: escolha.velocidadeKmh,
    fracao: escolha.fracao,
  };

  console.error(
    `${id} / primary: ${primaria.pontos.length} pts, ` +
      `${(primaria.distanciaM / 1000).toFixed(1)} km, ${Math.round(primaria.duracaoS / 60)} min, ` +
      `voltas: ${voltas(primaria.pontos)}, bloqueio=${escolha.velocidadeKmh} km/h ` +
      `"${escolha.name || "sem nome"}" @${escolha.fracao}`
  );
  const usados = [];
  for (const tipo of Object.keys(cenario.rotas)) {
    if (tipo === "primary") continue;
    // O mais rápido ainda não usado e com extensão ao menos 8% diferente.
    const tracado =
      desvios.find((d) => usados.every((u) => Math.abs(u.distanciaM - d.distanciaM) / u.distanciaM > 0.08)) ||
      desvios.find((d) => !usados.includes(d)) ||
      desvios[0];
    if (!tracado) throw new Error(`${id}: nenhum desvio válido fora do bloqueio`);
    if (usados.includes(tracado)) console.error(`  AVISO ${id}/${tipo}: só há um desvio válido; repetido`);
    usados.push(tracado);
    saida[id].rotas[tipo] = { pontos: tracado.pontos };
    console.error(
      `${id} / ${tipo}: ${tracado.pontos.length} pts, ` +
        `${(tracado.distanciaM / 1000).toFixed(1)} km, ${Math.round(tracado.duracaoS / 60)} min, ` +
        `distância do bloqueio: ${Math.round(distanciaAoTracado(tracado.pontos, bloqueio))} m`
    );
  }
}

writeFileSync(
  new URL("../data/rotas-contingencia.json", import.meta.url),
  JSON.stringify(saida)
);
writeFileSync(
  new URL("../data/rotas-contingencia-bloqueios.json", import.meta.url),
  JSON.stringify(metadadosBloqueio, null, 2)
);
console.error("Gerado data/rotas-contingencia.json");
console.error("Metadados: data/rotas-contingencia-bloqueios.json");

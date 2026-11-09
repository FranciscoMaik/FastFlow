// “Onde construir?” — pares <300 m + ranking F2. Rodar:
// node --test tests/motor/oportunidadesLigacao.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  DIST_MAX_M,
  DIST_MIN_M,
  MAX_CANDIDATOS_AVALIAR,
  MAX_PARES_ESPACIAIS,
  TOP_ONDE_CONSTRUIR,
  paresProximos,
  oportunidadesLigacao,
  oportunidadesLigacaoAsync,
  indiceLigacoesExistentes,
} from "../../js/motor/oportunidadesLigacao.js";

/** ~111 m por 0.001° lat. */
function criarMalhaComLacuna() {
  const g = new Grafo();
  const no = (id, lat, lon) => g.adicionarNo(id, { lat, lon });
  // A--B--C em linha; D ao norte de A; E perto de C sem ligação direta C–E.
  no("A", 0, 0);
  no("B", 0, 0.001); // ~111 m
  no("C", 0, 0.002); // ~222 m de A
  no("D", 0.001, 0); // ~111 m de A
  no("E", 0.0005, 0.002); // ~55 m de C — lacuna útil
  no("F", 0.003, 0.003); // longe (>300 m de todos)

  const ligar = (id, a, b, comprimento = 100) => {
    const base = { trechoId: id, comprimento, velocidade: 10, peso: comprimento / 10 };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
    g.adicionarTrecho({
      id,
      arestas: [`${id}>`, `${id}<`],
      nome: id,
      comprimento,
      extremidades: [a, b],
      pontos: [
        [g.nos.get(a).lat, g.nos.get(a).lon],
        [g.nos.get(b).lat, g.nos.get(b).lon],
      ],
    });
  };

  ligar("AB", "A", "B");
  ligar("BC", "B", "C");
  ligar("AD", "A", "D");
  // Sem CE, sem AE, sem BE — candidatos espaciais.
  return g;
}

test("constantes de cap ficam apertadas", () => {
  assert.equal(DIST_MAX_M, 300);
  assert.equal(DIST_MIN_M, 40);
  assert.ok(MAX_PARES_ESPACIAIS <= 15);
  assert.ok(MAX_CANDIDATOS_AVALIAR <= MAX_PARES_ESPACIAIS);
  assert.ok(TOP_ONDE_CONSTRUIR <= MAX_CANDIDATOS_AVALIAR);
});

test("paresProximos exclui arestas existentes e respeita distância/cap", () => {
  const g = criarMalhaComLacuna();
  const existentes = indiceLigacoesExistentes(g);
  assert.ok(existentes.has("A|B"));
  assert.ok(existentes.has("B|C"));

  const pares = paresProximos(g, { maxDist: 300, minDist: 40, maxPares: 5 });
  assert.ok(pares.length <= 5);
  assert.ok(pares.every((p) => p.comprimento >= 40 && p.comprimento < 300));
  assert.ok(pares.every((p) => !existentes.has(
    p.de < p.para ? `${p.de}|${p.para}` : `${p.para}|${p.de}`
  )));
  // F (longe) não deve aparecer com A.
  assert.ok(!pares.some((p) => (p.de === "A" && p.para === "F") || (p.de === "F" && p.para === "A")));
});

test("oportunidadesLigacao respeita caps e só retorna ganhos", () => {
  const g = criarMalhaComLacuna();
  const r = oportunidadesLigacao(g, {
    maxParesEspaciais: 6,
    maxCandidatos: 6,
    maxResultados: 3,
    demanda: { n: 40, semente: 2 },
  });
  assert.equal(r.ok, true);
  assert.ok(r.candidatosAvaliados <= 6);
  assert.ok(r.itens.length <= 3);
  for (const item of r.itens) {
    assert.ok(item.ganhoTempo > 0);
    assert.ok(item.deltaTempo < 0);
    assert.ok(item.comprimento < 300);
    assert.ok(item.mudanca?.tipo === "adicionarLigacao");
  }
});

test("oportunidadesLigacaoAsync reporta progresso e pode cancelar", async () => {
  const g = criarMalhaComLacuna();
  const progressos = [];
  const r = await oportunidadesLigacaoAsync(
    g,
    { maxParesEspaciais: 4, maxCandidatos: 4, demanda: { n: 30, semente: 1 } },
    { onProgress: (p) => progressos.push(p) }
  );
  assert.equal(r.ok, true);
  assert.ok(progressos.length >= 1);
  assert.ok(progressos.some((p) => p.fase === "avaliar"));

  const ac = new AbortController();
  ac.abort();
  const cancelado = await oportunidadesLigacaoAsync(g, {}, { signal: ac.signal });
  assert.equal(cancelado.ok, false);
  assert.equal(cancelado.cancelado, true);
});

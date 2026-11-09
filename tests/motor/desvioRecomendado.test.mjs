// Desvio recomendado (Fase 2): candidatos + busca limitada de inversões.
// Rodar: node --test tests/motor/desvioRecomendado.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { avaliar } from "../../js/motor/avaliadorImpacto.js";
import {
  avaliarDesvioRecomendado,
  candidatosDesvio,
  DEMANDA_DESVIO,
  MAX_CANDIDATOS,
} from "../../js/motor/desvioRecomendado.js";

//   A ─── B ─── C
//   │           │
//   D ───────── E
//               │
//               F
// Bloquear AB força A→C pelo desvio AD→DE→EC; inverter um trecho do corredor
// de desvio pode alterar o custo.
function criarMalha() {
  const g = new Grafo();
  const ligar = (id, a, b, { comprimento = 100, nome, meio } = {}) => {
    const base = { trechoId: id, comprimento, velocidade: 10, peso: comprimento / 10 };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
    g.adicionarTrecho({
      id,
      arestas: [`${id}>`, `${id}<`],
      nome,
      ...(meio ? { meio } : {}),
    });
  };
  ligar("AB", "A", "B", { nome: "Principal", meio: [0, 0] });
  ligar("BC", "B", "C", { nome: "Principal", meio: [0, 0.001] });
  ligar("AD", "A", "D", { nome: "Desvio", meio: [0.001, 0] });
  ligar("DE", "D", "E", { nome: "Desvio", meio: [0.001, 0.001] });
  ligar("EC", "E", "C", { nome: "Desvio", meio: [0.001, 0.002] });
  ligar("EF", "E", "F", { nome: "Ramal", meio: [0.002, 0.001] });
  return g;
}

const PARES = [
  { origem: "A", destino: "C" },
  { origem: "C", destino: "A" },
  { origem: "A", destino: "F" },
  { origem: "F", destino: "A" },
  { origem: "B", destino: "D" },
  { origem: "D", destino: "B" },
];

test("constantes de limite da busca", () => {
  assert.equal(DEMANDA_DESVIO.n, 150);
  assert.ok(MAX_CANDIDATOS <= 20);
  assert.ok(MAX_CANDIDATOS >= 10);
});

test("candidatosDesvio prioriza corredor, vizinho e limita quantidade", () => {
  const g = criarMalha();
  const cands = candidatosDesvio(g, "AB", { max: 4 });
  assert.ok(cands.length <= 4);
  assert.ok(cands.every((c) => c.trechoId !== "AB"));
  assert.ok(cands.some((c) => c.trechoId === "BC" && c.motivo === "corredor"));
  assert.ok(cands.some((c) => c.trechoId === "AD"));
});

test("candidatosDesvio ignora trechos bloqueados", () => {
  const g = criarMalha();
  g.bloquearTrecho("BC");
  const ids = candidatosDesvio(g, "AB").map((c) => c.trechoId);
  assert.ok(!ids.includes("BC"));
});

test("avaliarDesvioRecomendado não muta o grafo e devolve estrutura ok", () => {
  const g = criarMalha();
  const r = avaliarDesvioRecomendado(g, "AB", { paresOD: PARES, maxCandidatos: 5 });
  assert.equal(r.ok, true);
  assert.equal(r.trechoId, "AB");
  assert.equal(g.trechos.get("AB").bloqueado, false);
  assert.equal(g.trechos.get("AD").sentido, 0);
  assert.ok(r.candidatosAvaliados > 0);
  assert.ok(r.amostra.tamanho === PARES.length);
  if (r.recomendacao) {
    assert.equal(r.recomendacao.mudanca.tipo, "inverter");
    assert.ok(r.recomendacao.melhoria > 0);
    assert.ok(r.recomendacao.avaliacao.delta.tempoMedioViagem != null);
  }
});

test("recomendação, quando existe, melhora o Δ tempo vs bloqueio sozinho", () => {
  const g = criarMalha();
  // Malha assimétrica: AD mão única A→D; inverter AD pode abrir volta útil.
  g.definirSentido("AD", 1);
  g.definirSentido("DE", 1);
  g.definirSentido("EC", 1);

  const bloqueio = avaliar({
    grafo: g,
    paresOD: PARES,
    mudancas: { tipo: "bloquear", trechoId: "AB" },
  });
  const tempoBloqueio = bloqueio.delta.tempoMedioViagem.absoluto;

  const r = avaliarDesvioRecomendado(g, "AB", {
    paresOD: PARES,
    maxCandidatos: 8,
    avaliacaoBloqueio: bloqueio,
  });
  assert.equal(r.ok, true);
  if (r.recomendacao) {
    assert.ok(r.recomendacao.melhoria > 0);
    assert.ok(r.recomendacao.tempoMitigado < tempoBloqueio + 1e-9);
  }
});

test("trecho já bloqueado é recusado", () => {
  const g = criarMalha();
  g.bloquearTrecho("AB");
  const r = avaliarDesvioRecomendado(g, "AB", { paresOD: PARES });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /já está bloqueado/i);
});

// Testes Base×Atual / oportunidades de inversão. Rodar:
// node --test tests/motor/impactoInversao.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { avaliar } from "../../js/motor/avaliadorImpacto.js";
import { aplicar } from "../../js/motor/mudanca.js";
import {
  candidatosOportunidade,
  compararBaseAtual,
  grafoSentidosIniciais,
  oportunidadesInversao,
  resumoImpactoRegistro,
  resumoBaseAtual,
} from "../../js/motor/impactoInversao.js";

function criarMalha() {
  const g = new Grafo();
  const ligar = (id, a, b, { nome = id, comprimento = 100 } = {}) => {
    const base = { trechoId: id, comprimento, velocidade: 10, peso: comprimento / 10 };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
    g.adicionarTrecho({
      id,
      arestas: [`${id}>`, `${id}<`],
      meta: { nome },
    });
  };
  ligar("AB", "A", "B", { nome: "Rua AB" });
  ligar("BC", "B", "C", { nome: "Rua BC" });
  ligar("AC", "A", "C", { nome: "Rua AC", comprimento: 300 });
  ligar("AD", "A", "D", { nome: "Rua AD" });
  ligar("DC", "D", "C", { nome: "Rua DC" });
  return g;
}

const PARES = [
  { origem: "A", destino: "C" },
  { origem: "C", destino: "A" },
  { origem: "A", destino: "D" },
  { origem: "D", destino: "A" },
  { origem: "B", destino: "D" },
  { origem: "D", destino: "B" },
];

test("grafoSentidosIniciais restaura sentidos após inversões", () => {
  const g = criarMalha();
  assert.equal(g.sentidoDoTrecho("AB"), 0);
  aplicar(g, { tipo: "inverter", trechoId: "AB" });
  assert.equal(g.sentidoDoTrecho("AB"), 1);

  const limpo = grafoSentidosIniciais(g);
  assert.equal(limpo.sentidoDoTrecho("AB"), 0);
  assert.equal(g.sentidoDoTrecho("AB"), 1);
});

test("compararBaseAtual: sem mudança ⇒ deltas ~0", () => {
  const g = criarMalha();
  const base = grafoSentidosIniciais(g);
  const r = compararBaseAtual(base, g, { demanda: PARES });
  assert.equal(r.ok, true);
  assert.equal(r.resumo.tempoMedioViagem.delta.absoluto, 0);
  assert.equal(r.resumo.kmRodados.delta.absoluto, 0);
  assert.equal(r.resumo.retidos.delta, 0);
  assert.equal(r.resumo.viagensConcluidas.delta, 0);
});

test("compararBaseAtual: inversão produz resumo Base×Atual", () => {
  const g = criarMalha();
  const base = grafoSentidosIniciais(g);
  aplicar(g, { tipo: "inverter", trechoId: "BC" });
  aplicar(g, { tipo: "inverter", trechoId: "BC" });
  const r = compararBaseAtual(base, g, { demanda: PARES });
  assert.equal(r.ok, true);
  const resumo = resumoBaseAtual(r.avaliacao);
  assert.ok(resumo);
  assert.equal(typeof resumo.viagensConcluidas.base, "number");
  assert.equal(typeof resumo.viagensConcluidas.atual, "number");
  assert.ok(r.avaliacao.delta.viagensAfetadas.contagem >= 0);
});

test("resumoImpactoRegistro extrai delta tempo e % viagens", () => {
  const g = criarMalha();
  const avaliacao = avaliar({
    grafo: g,
    paresOD: PARES,
    mudancas: { tipo: "inverter", trechoId: "BC" },
  });
  const resumo = resumoImpactoRegistro(avaliacao);
  assert.ok(resumo);
  assert.equal(typeof resumo.deltaTempo, "number");
  assert.equal(typeof resumo.viagensAfetadasPct, "number");
});

test("candidatosOportunidade limita e é determinístico", () => {
  const g = criarMalha();
  const a = candidatosOportunidade(g, { max: 3, semente: 7 });
  const b = candidatosOportunidade(g, { max: 3, semente: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.length <= 3);
  assert.ok(a.every((id) => g.trechos.has(id)));
});

test("oportunidadesInversao respeita caps e só retorna ganhos", () => {
  const g = criarMalha();
  const r = oportunidadesInversao(g, {
    maxCandidatos: 4,
    maxResultados: 3,
    demanda: PARES,
    semente: 1,
  });
  assert.equal(r.ok, true);
  assert.ok(r.candidatosAvaliados <= 4);
  assert.ok(r.itens.length <= 3);
  for (const item of r.itens) {
    assert.ok(item.ganhoTempo > 0);
    assert.ok(item.deltaTempo < 0);
  }
});

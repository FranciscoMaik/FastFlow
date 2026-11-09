import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  avaliarRobustezRota,
  comporAtraso,
  estimarAtrasoCongestionamentoHeuristico,
  estimarAtrasoDispositivosNaRota,
  planejarRotasNaMalha,
  rotasAlternativas,
} from "../../js/contingenciaAnalise.js";
import { formatarRobustez, classeRobustez } from "../../js/contingenciaMetricas.js";

/** Malha em diamante: A→B→C e A→D→C; BC é ponte crítica se AD/DC sumirem. */
function criarMalha() {
  const g = new Grafo();
  const ligar = (id, a, b, comprimento = 100) => {
    const peso = comprimento / 10;
    const geoIda = {
      pontos: [
        [0, 0],
        [0, 0.001],
      ],
      acumulado: [0, comprimento],
      comprimento,
    };
    const geoVolta = {
      pontos: [
        [0, 0.001],
        [0, 0],
      ],
      acumulado: [0, comprimento],
      comprimento,
    };
    g.adicionarNo(a, { lat: 0, lon: 0 });
    g.adicionarNo(b, { lat: 0, lon: 0.001 });
    g.adicionarAresta({
      id: `${id}>`,
      de: a,
      para: b,
      peso,
      trechoId: id,
      comprimento,
      velocidade: 10,
      geometria: geoIda,
    });
    g.adicionarAresta({
      id: `${id}<`,
      de: b,
      para: a,
      peso,
      trechoId: id,
      comprimento,
      velocidade: 10,
      geometria: geoVolta,
    });
    g.adicionarTrecho({
      id,
      arestas: [`${id}>`, `${id}<`],
      comprimento,
      tipo: "residential",
      pontos: geoIda.pontos,
    });
  };

  g.adicionarNo("A", { lat: -23.35, lon: -46.88 });
  g.adicionarNo("B", { lat: -23.351, lon: -46.88 });
  g.adicionarNo("C", { lat: -23.352, lon: -46.88 });
  g.adicionarNo("D", { lat: -23.351, lon: -46.879 });

  ligar("AB", "A", "B");
  ligar("BC", "B", "C");
  ligar("AD", "A", "D", 120);
  ligar("DC", "D", "C", 120);
  return g;
}

test("avaliarRobustezRota: caminho com alternativa é robusta", () => {
  const g = criarMalha();
  const r = avaliarRobustezRota(g, "A", "C", ["AB>", "BC>"]);
  assert.equal(r.selo, "robusta");
  assert.equal(r.arestasCriticas.length, 0);
});

test("avaliarRobustezRota: ponte única é frágil", () => {
  const g = criarMalha();
  g.bloquearTrecho("AD");
  g.bloquearTrecho("DC");
  const r = avaliarRobustezRota(g, "A", "C", ["AB>", "BC>"]);
  assert.equal(r.selo, "frágil");
  assert.ok(r.arestasCriticas.length >= 1);
});

test("comporAtraso reparte distância, dispositivos e congestão", () => {
  const c = comporAtraso({
    duracaoS: 900,
    duracaoPrincipalS: 600,
    distanciaM: 5000,
    distanciaPrincipalM: 4000,
    atrasoDispositivosS: 60,
    atrasoCongestionamentoS: 90,
  });
  assert.ok(c.totalAtrasoS === 300);
  const soma =
    c.percentuais.extraDistancia + c.percentuais.dispositivos + c.percentuais.congestionamento;
  assert.ok(Math.abs(soma - 100) < 0.01);
  assert.ok(c.percentuais.extraDistancia > 0);
  assert.ok(c.percentuais.dispositivos > 0);
  assert.ok(c.percentuais.congestionamento > 0);
});

test("comporAtraso sem atraso zera a barra", () => {
  const c = comporAtraso({
    duracaoS: 600,
    duracaoPrincipalS: 600,
    distanciaM: 4000,
    distanciaPrincipalM: 4000,
  });
  assert.equal(c.totalAtrasoS, 0);
  assert.equal(c.percentuais.extraDistancia, 0);
});

test("estimarAtrasoCongestionamentoHeuristico é positivo com ocupação", () => {
  const g = criarMalha();
  const atraso = estimarAtrasoCongestionamentoHeuristico(g, ["AB>", "BC>"], { ocupacao: 0.8 });
  assert.ok(atraso > 0);
});

test("estimarAtrasoDispositivosNaRota reage a lombada no trecho", () => {
  const g = criarMalha();
  const sem = estimarAtrasoDispositivosNaRota(g, ["AB>", "BC>"], []);
  assert.equal(sem, 0);
  const com = estimarAtrasoDispositivosNaRota(g, ["AB>", "BC>"], [
    { tipo: "lombada", trechoId: "AB", velocidadeMaxKmh: 10, raioEfeito: 25 },
  ]);
  assert.ok(com > 0);
});

test("rotasAlternativas devolve principal e desvios", () => {
  const g = criarMalha();
  const rotas = rotasAlternativas(g, "A", "C", { k: 2 });
  assert.ok(rotas.length >= 2);
  assert.deepEqual(rotas[0], ["AB>", "BC>"]);
});

test("planejarRotasNaMalha respeita bloqueio F5", () => {
  const g = criarMalha();
  const r = planejarRotasNaMalha(g, "A", "C", {
    mudancas: [{ tipo: "bloquear", trechoId: "AB" }],
    k: 2,
  });
  assert.equal(r.ok, true);
  assert.ok(r.rotas.primary);
  assert.ok(!r.rotas.primary.arestas.includes("AB>"));
  assert.ok(r.rotas.primary.robustez.selo);
  assert.ok(r.rotas.alternative?.composicao || r.rotas.primary.composicao);
});

test("formatarRobustez e classeRobustez", () => {
  assert.equal(formatarRobustez("robusta"), "Robusta");
  assert.equal(formatarRobustez("frágil"), "Frágil");
  assert.equal(formatarRobustez(null), "");
  assert.equal(classeRobustez("robusta"), "tag-robust");
  assert.equal(classeRobustez("frágil"), "tag-fragile");
});

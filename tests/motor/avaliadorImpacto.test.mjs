// Testes do avaliador analítico (F2). Rodar: node --test tests/motor/avaliadorImpacto.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { avaliar, avaliarRede, nosComAcesso } from "../../js/motor/avaliadorImpacto.js";

// Malha de teste (mão dupla, 100 m, 10 m/s → peso 10 s):
//
//   A ─── B ─── C
//   │           │
//   D ───────── E
//               │
//               F
function criarMalha() {
  const g = new Grafo();
  const ligar = (id, a, b, comprimento = 100) => {
    const base = { trechoId: id, comprimento, velocidade: 10, peso: comprimento / 10 };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
    g.adicionarTrecho({ id, arestas: [`${id}>`, `${id}<`] });
  };
  ligar("AB", "A", "B");
  ligar("BC", "B", "C");
  ligar("AD", "A", "D");
  ligar("DE", "D", "E");
  ligar("EC", "E", "C");
  ligar("EF", "E", "F");
  return g;
}

const PARES_FIXOS = [
  { origem: "A", destino: "C" },
  { origem: "A", destino: "F" },
  { origem: "C", destino: "A" },
  { origem: "F", destino: "A" },
  { origem: "B", destino: "D" },
  { origem: "D", destino: "B" },
  { origem: "A", destino: "E" },
  { origem: "C", destino: "F" },
];

test("avaliarRede: rota curta A→C e agregados determinísticos", () => {
  const g = criarMalha();
  const { indicadores, resultados } = avaliarRede(g, [{ origem: "A", destino: "C" }]);
  assert.deepEqual(resultados[0].rota, ["AB>", "BC>"]);
  assert.equal(resultados[0].tempo, 20);
  assert.equal(resultados[0].distancia, 200);
  assert.equal(indicadores.tempoMedioViagem, 20);
  assert.equal(indicadores.distanciaMedia, 200);
  assert.equal(indicadores.kmRodados, 0.2);
  assert.equal(indicadores.retidos, 0);
  assert.equal(indicadores.fluxoPorTrecho.AB, 1);
  assert.equal(indicadores.fluxoPorTrecho.BC, 1);
});

test("noop: sem mudança ⇒ deltas ~0 e viagens afetadas 0%", () => {
  const g = criarMalha();
  const r1 = avaliar({ grafo: g, paresOD: PARES_FIXOS });
  const r2 = avaliar({ grafo: g, paresOD: PARES_FIXOS });

  assert.equal(r1.delta.viagensAfetadas.contagem, 0);
  assert.equal(r1.delta.viagensAfetadas.percentual, 0);
  assert.equal(r1.delta.retidos, 0);
  assert.equal(r1.delta.tempoMedioViagem.absoluto, 0);
  assert.equal(r1.delta.distanciaMedia.absoluto, 0);
  assert.equal(r1.delta.kmRodados.absoluto, 0);
  assert.equal(r1.delta.perdaAcesso.contagem, 0);
  assert.deepEqual(r1.delta.variacaoFluxoPorTrecho, {});
  assert.equal(r1.delta.piorCaso, null);

  // Determinismo: duas avaliações idênticas.
  assert.deepEqual(r1.base, r2.base);
  assert.deepEqual(r1.cenario, r2.cenario);
  assert.deepEqual(r1.delta, r2.delta);
  assert.deepEqual(r1.amostra, r2.amostra);
});

test("bloquear EF via ignorar: aumenta retidos e perdaAcesso", () => {
  const g = criarMalha();
  const ignorar = new Set(g.trechos.get("EF").arestas);
  const r = avaliar({ grafo: g, paresOD: PARES_FIXOS, ignorar });

  assert.ok(r.delta.retidos > 0, "pares envolvendo F ficam sem rota");
  assert.ok(r.cenario.retidos > r.base.retidos);
  assert.ok(r.delta.perdaAcesso.contagem >= 1);
  assert.ok(r.delta.perdaAcesso.nos.includes("F"));
  assert.ok(r.delta.viagensAfetadas.contagem > 0);
  assert.equal(g.trechos.get("EF").bloqueado, false, "avaliar não muta o grafo base");
  assert.ok(Number.isFinite(g.arestas.get("EF>").peso));
});

test("bloquear AB via mudancas leve: desvia A→C e varia fluxo", () => {
  const g = criarMalha();
  const r = avaliar({
    grafo: g,
    paresOD: [
      { origem: "A", destino: "C" },
      { origem: "C", destino: "A" },
    ],
    mudancas: { tipo: "bloquear", arestas: g.trechos.get("AB").arestas },
    trechoAfetado: "AB",
  });

  assert.equal(r.extras.resultadosBase[0].rota.join(","), "AB>,BC>");
  assert.equal(r.extras.resultadosCenario[0].rota.join(","), "AD>,DE>,EC>");
  assert.equal(r.delta.viagensAfetadas.percentual, 100);
  assert.equal(r.delta.retidos, 0);
  assert.ok(r.delta.tempoMedioViagem.absoluto > 0);
  assert.ok(r.delta.distanciaMedia.absoluto > 0);
  assert.ok((r.delta.variacaoFluxoPorTrecho.AB ?? 0) < 0);
  assert.ok((r.delta.variacaoFluxoPorTrecho.AD ?? 0) > 0);
  assert.ok(r.extras.trechosSobrecarregados.length > 0);
  assert.ok(r.extras.desvioMoradores.pares > 0);
  assert.ok(r.extras.desvioMoradores.deltaTempoMedio > 0);
});

test("aplicar(grafoCenario): inversão de sentido piora ou altera rotas de volta", () => {
  const base = criarMalha();
  const cenario = criarMalha();
  cenario.definirSentido("AB", 1); // só A→B

  const r = avaliar({
    grafo: base,
    paresOD: [
      { origem: "B", destino: "A" },
      { origem: "A", destino: "B" },
    ],
    aplicar: () => cenario,
    trechoAfetado: "AB",
  });

  assert.equal(r.extras.resultadosBase[0].rota.join(","), "AB<");
  assert.notEqual(r.extras.resultadosCenario[0].rota?.join(","), "AB<");
  assert.ok(r.delta.viagensAfetadas.contagem >= 1);
  assert.equal(base.sentidoDoTrecho("AB"), 0, "grafo base intacto");
});

test("F3 mudancas inverter via aplicarEmCopia não muta a base", () => {
  const g = criarMalha();
  assert.equal(g.sentidoDoTrecho("AB"), 0);

  const r = avaliar({
    grafo: g,
    paresOD: [
      { origem: "B", destino: "A" },
      { origem: "A", destino: "B" },
    ],
    mudancas: { tipo: "inverter", trechoId: "AB" },
    trechoAfetado: "AB",
  });

  assert.equal(g.sentidoDoTrecho("AB"), 0, "grafo base intacto");
  assert.ok(r.delta.viagensAfetadas.contagem >= 1);
  // 0 → 1 (primeira inversão em mão dupla): B→A deixa de usar AB<
  assert.equal(r.extras.resultadosBase[0].rota.join(","), "AB<");
  assert.notEqual(r.extras.resultadosCenario[0].rota?.join(","), "AB<");
});

test("piorCaso aponta o par com maior aumento de tempo", () => {
  const g = criarMalha();
  const r = avaliar({
    grafo: g,
    paresOD: [
      { origem: "A", destino: "B" }, // curto; ao bloquear AB desvia A-D-E-C-B
      { origem: "D", destino: "E" }, // não usa AB
    ],
    ignorar: new Set(g.trechos.get("AB").arestas),
  });

  assert.equal(r.delta.piorCaso.origem, "A");
  assert.equal(r.delta.piorCaso.destino, "B");
  assert.ok(r.delta.piorCaso.deltaTempo > 0);
});

test("pares no formato [origem, destino] são aceitos", () => {
  const g = criarMalha();
  const r = avaliar({ grafo: g, paresOD: [["A", "C"], ["F", "A"]] });
  assert.equal(r.amostra.tamanho, 2);
  assert.equal(r.base.retidos, 0);
});

test("nosComAcesso encolhe ao isolar F", () => {
  const g = criarMalha();
  const antes = nosComAcesso(g);
  assert.ok(antes.has("F"));
  const depois = nosComAcesso(g, { ignorar: new Set(["EF>", "EF<"]) });
  assert.equal(depois.has("F"), false);
});

test("amostra reporta tamanho e viagens com rota", () => {
  const g = criarMalha();
  const r = avaliar({
    grafo: g,
    paresOD: PARES_FIXOS,
    ignorar: new Set(["EF>", "EF<"]),
  });
  assert.equal(r.amostra.tamanho, PARES_FIXOS.length);
  assert.equal(r.amostra.viagensComRotaBase, PARES_FIXOS.length);
  assert.ok(r.amostra.viagensComRotaCenario < r.amostra.viagensComRotaBase);
});

test("integra F1: demanda { n, semente } gera amostra determinística", () => {
  const g = criarMalha();
  const a = avaliar({ grafo: g, demanda: { n: 40, semente: 9 }, ignorar: new Set(["AB>", "AB<"]) });
  const b = avaliar({ grafo: g, demanda: { n: 40, semente: 9 }, ignorar: new Set(["AB>", "AB<"]) });
  assert.equal(a.amostra.tamanho, 40);
  assert.deepEqual(a.delta, b.delta);
  assert.ok(a.delta.viagensAfetadas.contagem > 0);
});

test("bprAnalitico aplica passagem BPR em cópia e marca extras", () => {
  const g = criarMalha();
  const pesoAntes = g.arestas.get("AB>").peso;
  const livre = avaliar({ grafo: g, paresOD: PARES_FIXOS });
  const cong = avaliar({
    grafo: g,
    paresOD: PARES_FIXOS,
    bprAnalitico: { escalaVolume: 2.5, iteracoes: 1 },
  });
  assert.equal(g.arestas.get("AB>").peso, pesoAntes);
  assert.ok(cong.extras.bprAnalitico?.aplicado);
  assert.equal(cong.extras.bprAnalitico.aproximado, true);
  assert.ok(cong.base.tempoMedioViagem >= livre.base.tempoMedioViagem);
});

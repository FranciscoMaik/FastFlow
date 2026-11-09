import test from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  detectarTransbordo,
  filaNoSemaforo,
  velocidadeMediaNoTrecho,
  aplicarPesoLombadaAnalitico,
  aplicarPesoSemaforoAnalitico,
  prepararGrafoCenarioDispositivo,
  criarAcumuladorMetricasDispositivos,
  DISTANCIA_SEGURANCA_FILA,
} from "../../js/motor/metricasDispositivos.js";
import { avaliar } from "../../js/motor/avaliadorImpacto.js";

function criarMalhaLinear(comprimento = 200) {
  const g = new Grafo();
  const base = { trechoId: "AB", comprimento, velocidade: 10, peso: comprimento / 10 };
  g.adicionarAresta({ ...base, id: "AB>", de: "A", para: "B" });
  g.adicionarAresta({ ...base, id: "AB<", de: "B", para: "A" });
  g.adicionarTrecho({ id: "AB", arestas: ["AB>", "AB<"], nome: "Via AB" });
  return g;
}

test("detectarTransbordo: fila × espaçamento alcança a linha de parada", () => {
  assert.equal(
    detectarTransbordo({
      posParada: 20,
      filaAtual: 3,
      distanciaSeguranca: DISTANCIA_SEGURANCA_FILA,
    }),
    true
  );
  assert.equal(
    detectarTransbordo({
      posParada: 50,
      filaAtual: 2,
      distanciaSeguranca: DISTANCIA_SEGURANCA_FILA,
    }),
    false
  );
  assert.equal(
    detectarTransbordo({
      posParada: 40,
      filaAtual: 2,
      progressoUltimo: 1.5,
    }),
    true
  );
});

test("velocidadeMediaNoTrecho: livre vs média dos veículos no trecho", () => {
  const g = criarMalhaLinear();
  const veiculos = [
    { id: 1, rota: ["AB>"], indice: 0, progresso: 10, velocidade: 5, status: "circulando" },
    { id: 2, rota: ["AB>"], indice: 0, progresso: 40, velocidade: 7, status: "circulando" },
    { id: 3, rota: ["AB<"], indice: 0, progresso: 20, velocidade: 10, status: "retido" },
  ];
  const m = velocidadeMediaNoTrecho(g, veiculos, "AB");
  assert.equal(m.livreMs, 10);
  assert.equal(m.n, 2);
  assert.ok(Math.abs(m.atualMs - 6) < 1e-9);
  assert.ok(Math.abs(m.atualKmh - 21.6) < 1e-9);
});

test("filaNoSemaforo: conta cadeia contígua antes da linha e marca transbordo", () => {
  const g = criarMalhaLinear(60);
  const sem = {
    tipo: "semaforo",
    id: "s1",
    trechoId: "AB",
    distancia: 50,
    sentido: "ambos",
  };
  const veiculos = [
    { id: 1, rota: ["AB>"], indice: 0, progresso: 48, velocidade: 0, status: "circulando" },
    { id: 2, rota: ["AB>"], indice: 0, progresso: 41, velocidade: 0, status: "circulando" },
    { id: 3, rota: ["AB>"], indice: 0, progresso: 34, velocidade: 0, status: "circulando" },
    { id: 4, rota: ["AB>"], indice: 0, progresso: 10, velocidade: 0, status: "circulando" }, // gap grande
  ];
  const fila = filaNoSemaforo(g, veiculos, sem);
  assert.equal(fila.atual, 3);
  assert.equal(fila.transbordo, false);

  // Estende a fila até o início da aresta.
  veiculos[2].progresso = 2;
  const fila2 = filaNoSemaforo(g, [
    veiculos[0],
    { ...veiculos[1], progresso: 41 },
    { id: 3, rota: ["AB>"], indice: 0, progresso: 34, velocidade: 0, status: "circulando" },
    { id: 5, rota: ["AB>"], indice: 0, progresso: 27, velocidade: 0, status: "circulando" },
    { id: 6, rota: ["AB>"], indice: 0, progresso: 20, velocidade: 0, status: "circulando" },
    { id: 7, rota: ["AB>"], indice: 0, progresso: 13, velocidade: 0, status: "circulando" },
    { id: 8, rota: ["AB>"], indice: 0, progresso: 6, velocidade: 0, status: "circulando" },
    { id: 9, rota: ["AB>"], indice: 0, progresso: 1, velocidade: 0, status: "circulando" },
  ], sem);
  assert.ok(fila2.atual >= 7);
  assert.equal(fila2.transbordo, true);
});

test("acumulador: fila máx/média e espera média", () => {
  const acc = criarAcumuladorMetricasDispositivos();
  acc.amostrar(
    [
      {
        id: "s1",
        tipo: "semaforo",
        fila: { atual: 2, transbordo: false, veiculoIds: [1, 2] },
      },
    ],
    1
  );
  acc.amostrar(
    [
      {
        id: "s1",
        tipo: "semaforo",
        fila: { atual: 4, transbordo: true, veiculoIds: [1, 2, 3, 4] },
      },
    ],
    1
  );
  acc.amostrar(
    [
      {
        id: "s1",
        tipo: "semaforo",
        fila: { atual: 0, transbordo: false, veiculoIds: [] },
      },
    ],
    0.5
  );
  const r = acc.ler("s1");
  assert.equal(r.filaMax, 4);
  assert.ok(Math.abs(r.filaMedia - 2) < 1e-9);
  assert.equal(r.transbordo, false);
  assert.ok(r.esperaMedia != null && r.esperaMedia >= 1.5);
});

test("peso analítico de lombada aumenta o tempo de travessia", () => {
  const g = criarMalhaLinear(200);
  const pesoAntes = g.arestas.get("AB>").peso;
  const r = aplicarPesoLombadaAnalitico(g, {
    trechoId: "AB",
    velocidadeMaxKmh: 18,
    raioEfeito: 25,
  });
  assert.equal(r.ok, true);
  assert.ok(g.arestas.get("AB>").peso > pesoAntes);
});

test("prévia analítica F2 de lombada varia tempo médio vs base", () => {
  const g = criarMalhaLinear(200);
  // Malha mínima com alternativa para OD.
  const base = { trechoId: "BC", comprimento: 200, velocidade: 10, peso: 20 };
  g.adicionarAresta({ ...base, id: "BC>", de: "B", para: "C" });
  g.adicionarAresta({ ...base, id: "BC<", de: "C", para: "B" });
  g.adicionarTrecho({ id: "BC", arestas: ["BC>", "BC<"], nome: "Via BC" });

  const prep = prepararGrafoCenarioDispositivo(g, {
    tipo: "lombada",
    trechoId: "AB",
    velocidadeMaxKmh: 20,
    raioEfeito: 30,
  });
  assert.equal(prep.ok, true);

  const avaliacao = avaliar({
    grafo: g,
    paresOD: [
      { origem: "A", destino: "C" },
      { origem: "C", destino: "A" },
    ],
    grafoCenario: prep.grafo,
    trechoAfetado: "AB",
  });
  assert.ok(avaliacao.delta.tempoMedioViagem.absoluto > 0);
});

test("peso analítico de semáforo adiciona espera média de ciclo", () => {
  const g = criarMalhaLinear(100);
  const pesoAntes = g.arestas.get("AB>").peso;
  const r = aplicarPesoSemaforoAnalitico(g, {
    trechoId: "AB",
    tempos: { verde: 10, amarelo: 2, vermelho: 10 },
  });
  assert.equal(r.ok, true);
  assert.ok(r.esperaMedia > 0);
  assert.ok(Math.abs(g.arestas.get("AB>").peso - (pesoAntes + r.esperaMedia)) < 1e-9);
});

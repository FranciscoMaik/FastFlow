// Testes da demanda fixa (F1). Rodar na raiz: node --test tests/motor/demandaFixa.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { Simulacao } from "../../js/motor/simulacao.js";
import {
  criarAleatorio,
  demandaDoPeriodo,
  gerarMatrizDemanda,
  listarPerfisPeriodo,
  obterPerfilPeriodo,
  PERFIS_PERIODO,
  pesosNosDemanda,
  resolverDemanda,
  sortearParDemanda,
} from "../../js/motor/demandaFixa.js";

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

test("mesma semente e mesmos nós produzem a mesma matriz OD", () => {
  const nos = ["A", "B", "C", "D", "E", "F"];
  const a = gerarMatrizDemanda({ nos, n: 40, semente: 42 });
  const b = gerarMatrizDemanda({ nos, n: 40, semente: 42 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 40);
  for (const par of a) {
    assert.notEqual(par.origem, par.destino);
    assert.ok(nos.includes(par.origem));
    assert.ok(nos.includes(par.destino));
  }
});

test("sementes diferentes produzem matrizes diferentes", () => {
  const nos = ["A", "B", "C", "D", "E", "F"];
  const a = gerarMatrizDemanda({ nos, n: 40, semente: 1 });
  const b = gerarMatrizDemanda({ nos, n: 40, semente: 2 });
  assert.notDeepEqual(a, b);
});

test("aleatorio injetável reproduz a matriz gerada por semente equivalente", () => {
  const nos = ["A", "B", "C"];
  const porSemente = gerarMatrizDemanda({ nos, n: 10, semente: 99 });
  const porRng = gerarMatrizDemanda({ nos, n: 10, aleatorio: criarAleatorio(99) });
  assert.deepEqual(porSemente, porRng);
});

test("resolverDemanda: false/null desliga; array e config geram matriz", () => {
  assert.equal(resolverDemanda(false, ["A", "B"]), null);
  assert.equal(resolverDemanda(null, ["A", "B"]), null);

  const dada = resolverDemanda(
    [
      { origem: "A", destino: "B" },
      { origem: "C", destino: "A" },
    ],
    ["A", "B", "C"]
  );
  assert.deepEqual(dada, [
    { origem: "A", destino: "B" },
    { origem: "C", destino: "A" },
  ]);

  const gerada = resolverDemanda({ n: 5, semente: 7 }, ["A", "B", "C"]);
  assert.equal(gerada.length, 5);
  assert.deepEqual(gerada, gerarMatrizDemanda({ nos: ["A", "B", "C"], n: 5, semente: 7 }));
});

test("sortearParDemanda só devolve pares da matriz", () => {
  const matriz = [
    { origem: "A", destino: "B" },
    { origem: "B", destino: "C" },
  ];
  const rng = criarAleatorio(3);
  for (let i = 0; i < 30; i++) {
    const par = sortearParDemanda(matriz, rng);
    assert.ok(matriz.some((p) => p.origem === par.origem && p.destino === par.destino));
  }
});

test("Simulacao com demanda fixa: veículos só usam pares da matriz", () => {
  const g = criarMalha();
  const matriz = [
    { origem: "A", destino: "C" },
    { origem: "C", destino: "A" },
    { origem: "D", destino: "F" },
    { origem: "F", destino: "B" },
    { origem: "B", destino: "E" },
  ];
  const chave = (par) => `${par.origem}->${par.destino}`;
  const permitidos = new Set(matriz.map(chave));

  let semente = 11;
  const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const sim = new Simulacao(g, { aleatorio, demanda: matriz, fatorTempo: 1 });
  assert.deepEqual(sim.demanda, matriz);

  sim.definirQuantidade(20);
  assert.ok(sim.veiculos.length > 0, "deveria criar veículos com a matriz");

  for (const v of sim.veiculos) {
    assert.ok(
      permitidos.has(chave({ origem: v.origem, destino: v.destino })),
      `par fora da matriz: ${v.origem}->${v.destino}`
    );
  }

  for (let i = 0; i < 100; i++) sim.avancar(0.2);
  for (const v of sim.veiculos) {
    assert.ok(
      permitidos.has(chave({ origem: v.origem, destino: v.destino })),
      `par fora da matriz após avanço: ${v.origem}->${v.destino}`
    );
  }
});

test("Simulacao sem demanda (false) mantém destinos livres", () => {
  const g = criarMalha();
  const sim = new Simulacao(g, { demanda: false });
  assert.equal(sim.demanda, null);
  sim.definirQuantidade(5);
  assert.ok(sim.veiculos.length > 0);
  for (const v of sim.veiculos) {
    assert.ok(v.destino);
  }
});

test("Simulacao padrão gera demanda fixa a partir da malha", () => {
  const g = criarMalha();
  const sim = new Simulacao(g);
  assert.ok(Array.isArray(sim.demanda));
  assert.ok(sim.demanda.length > 0);
  sim.definirQuantidade(8);
  assert.ok(sim.veiculos.length > 0);
  for (const v of sim.veiculos) {
    assert.ok(
      sim.demanda.some((p) => p.origem === v.origem && p.destino === v.destino),
      `${v.origem}->${v.destino} deveria estar na demanda gerada`
    );
  }
});

test("perfis pico / fora de pico diferem em N e são determinísticos", () => {
  const g = criarMalha();
  const nos = [...g.nos.keys()];
  assert.equal(listarPerfisPeriodo().length, 2);
  assert.equal(obterPerfilPeriodo("pico").n, PERFIS_PERIODO.pico.n);
  assert.ok(PERFIS_PERIODO.pico.n > PERFIS_PERIODO.foraPico.n);

  const a = demandaDoPeriodo("pico", nos, { grafo: g });
  const b = demandaDoPeriodo("pico", nos, { grafo: g });
  const fora = demandaDoPeriodo("foraPico", nos, { grafo: g });
  assert.equal(a.length, PERFIS_PERIODO.pico.n);
  assert.equal(fora.length, PERFIS_PERIODO.foraPico.n);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.slice(0, fora.length), fora);

  const viaPeriodo = resolverDemanda({ periodo: "foraPico", grafo: g }, nos);
  assert.deepEqual(viaPeriodo, fora);
});

test("concentração no pico favorece nós de maior grau", () => {
  const g = criarMalha();
  // E tem grau alto (DE, EC, EF); F é folha.
  const nos = ["E", "F"];
  const pesosPico = pesosNosDemanda(nos, { grafo: g, concentracao: 2.2 });
  const pesosFora = pesosNosDemanda(nos, { grafo: g, concentracao: 1 });
  assert.ok(pesosPico[0] > pesosPico[1], "E deve pesar mais que F no pico");
  assert.deepEqual(pesosFora, [1, 1]);

  const matriz = gerarMatrizDemanda({
    nos,
    n: 80,
    semente: 3,
    grafo: g,
    concentracao: 2.2,
  });
  const usosE = matriz.filter((p) => p.origem === "E" || p.destino === "E").length;
  assert.ok(usosE > 40, "pico deve concentrar viagens em E");
});

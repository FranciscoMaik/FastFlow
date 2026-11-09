// Testes do comparador Base × A × B e cascata de contribuição.
// Rodar: node --test tests/motor/comparadorCenarios.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  compararCenarios,
  cascataContribuicao,
  escolherMelhores,
  extrairIndicadores,
  montarResumo,
  resumoParaHtml,
  resumoParaJson,
  carregarListaMudancas,
  diferencaVariacaoFluxo,
  trechosParaVariacao,
} from "../../js/motor/comparadorCenarios.js";
import {
  criarApiStub,
  mudancasDoCenario,
  resetarCacheFonteCenarios,
  resolverFonteCenarios,
} from "../../js/adaptador/fonteCenariosComparador.js";

function criarMalha() {
  const g = new Grafo();
  const ligar = (id, a, b, comprimento = 100) => {
    const pontos = [
      [-23.35, -46.88],
      [-23.351, -46.879],
    ];
    const geo = { pontos, acumulado: [0, comprimento], comprimento };
    const geoRev = {
      pontos: [...pontos].reverse(),
      acumulado: [0, comprimento],
      comprimento,
    };
    const base = { trechoId: id, comprimento, velocidade: 10, peso: comprimento / 10 };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b, geometria: geo });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a, geometria: geoRev });
    g.adicionarTrecho({ id, arestas: [`${id}>`, `${id}<`], pontos });
  };
  ligar("AB", "A", "B");
  ligar("BC", "B", "C");
  ligar("AD", "A", "D");
  ligar("DE", "D", "E");
  ligar("EC", "E", "C");
  ligar("EF", "E", "F");
  return g;
}

const PARES = [
  { origem: "A", destino: "C" },
  { origem: "A", destino: "F" },
  { origem: "C", destino: "A" },
  { origem: "F", destino: "A" },
  { origem: "B", destino: "D" },
  { origem: "D", destino: "B" },
  { origem: "A", destino: "E" },
  { origem: "C", destino: "F" },
];

test("escolherMelhores: menorMelhor e empate", () => {
  assert.deepEqual(escolherMelhores({ base: 10, a: 8, b: 12 }, true), ["a"]);
  assert.deepEqual(escolherMelhores({ base: 10, a: 12, b: 8 }, false), ["a"]);
  assert.deepEqual(escolherMelhores({ base: 5, a: 5, b: 7 }, true).sort(), ["a", "base"]);
  assert.deepEqual(escolherMelhores({ base: null, a: null, b: null }, true), []);
});

test("extrairIndicadores: viagensComRota = amostra − retidos", () => {
  const ind = extrairIndicadores(
    {
      tempoMedioViagem: 20,
      distanciaMedia: 200,
      kmRodados: 0.2,
      retidos: 2,
      nosComAcesso: ["A", "B", "C"],
    },
    { tamanho: 10 }
  );
  assert.equal(ind.viagensComRota, 8);
  assert.equal(ind.nosComAcesso, 3);
});

test("compararCenarios: A bloqueia EF (pior em retidos), B noop — Base/B melhores", () => {
  const g = criarMalha();
  const comp = compararCenarios({
    grafo: g,
    paresOD: PARES,
    mudancasA: [{ tipo: "bloquear", trechoId: "EF" }],
    mudancasB: [],
    nomeA: "Bloqueio EF",
    nomeB: "Vazio",
  });

  assert.equal(comp.nomes.a, "Bloqueio EF");
  assert.ok(comp.linhas.length >= 5);

  // Bloquear EF isola F → mais retidos; Base e B empatam no melhor.
  // (tempo médio pode até cair ao excluir viagens retidas da média — por isso
  // o destaque de “melhor” olha cada indicador isoladamente.)
  const retidos = comp.linhas.find((l) => l.chave === "retidos");
  assert.ok(retidos.a > retidos.base);
  assert.equal(retidos.b, retidos.base);
  assert.ok(retidos.melhores.includes("base"));
  assert.ok(retidos.melhores.includes("b"));
  assert.ok(!retidos.melhores.includes("a"));

  const comRota = comp.linhas.find((l) => l.chave === "viagensComRota");
  assert.ok(comRota.a < comRota.base);
  assert.ok(comRota.melhores.includes("base"));
  assert.ok(comRota.melhores.includes("b"));
});

test("compararCenarios: inversão em AD altera indicadores vs base de forma determinística", () => {
  const g = criarMalha();
  const r1 = compararCenarios({
    grafo: g,
    paresOD: PARES,
    mudancasA: [{ tipo: "inverter", trechoId: "AD" }],
    mudancasB: [{ tipo: "bloquear", trechoId: "BC" }],
  });
  const r2 = compararCenarios({
    grafo: g,
    paresOD: PARES,
    mudancasA: [{ tipo: "inverter", trechoId: "AD" }],
    mudancasB: [{ tipo: "bloquear", trechoId: "BC" }],
  });
  assert.deepEqual(r1.indicadores, r2.indicadores);
  assert.deepEqual(
    r1.linhas.map((l) => [l.chave, l.base, l.a, l.b, l.melhores]),
    r2.linhas.map((l) => [l.chave, l.base, l.a, l.b, l.melhores])
  );
});

test("cascataContribuicao: base → bloquear → inverter soma contribuições = total", () => {
  const g = criarMalha();
  const mudancas = [
    { tipo: "bloquear", trechoId: "BC" },
    { tipo: "inverter", trechoId: "AD" },
  ];
  const cascata = cascataContribuicao({
    grafo: g,
    paresOD: PARES,
    mudancas,
    metrica: "tempoMedioViagem",
  });

  assert.equal(cascata.passos.length, 3);
  assert.equal(cascata.passos[0].rotulo, "Base");
  assert.equal(cascata.passos[0].contribuicao, 0);
  assert.match(cascata.passos[1].rotulo, /bloquear/);
  assert.match(cascata.passos[2].rotulo, /inverter/);

  const soma = cascata.passos.slice(1).reduce((acc, p) => {
    if (p.contribuicao == null) return acc;
    return acc + p.contribuicao;
  }, 0);
  if (cascata.total != null) {
    assert.ok(Math.abs(soma - cascata.total) < 1e-9);
  }

  // Valor final = avaliação do cenário completo
  const completo = compararCenarios({
    grafo: g,
    paresOD: PARES,
    mudancasA: mudancas,
    mudancasB: [],
  });
  assert.equal(cascata.passos.at(-1).valor, completo.indicadores.a.tempoMedioViagem);
});

test("cascata: lista vazia = só base e total 0", () => {
  const g = criarMalha();
  const cascata = cascataContribuicao({ grafo: g, paresOD: PARES, mudancas: [] });
  assert.equal(cascata.passos.length, 1);
  assert.equal(cascata.total, 0);
});

test("carregarListaMudancas + resumo HTML/JSON", () => {
  const lista = carregarListaMudancas('[{"tipo":"bloquear","trechoId":"EF"}]');
  assert.equal(lista[0].tipo, "bloquear");

  const g = criarMalha();
  const comp = compararCenarios({
    grafo: g,
    paresOD: PARES,
    mudancasA: lista,
    mudancasB: [],
    nomeA: "A",
    nomeB: "B",
  });
  const cascata = cascataContribuicao({ grafo: g, paresOD: PARES, mudancas: lista });
  const resumo = montarResumo({
    comparacao: comp,
    cascataA: cascata,
    meta: { titulo: "Teste", local: "malha-teste" },
  });
  assert.equal(resumo.tipo, "fastflow.comparador.resumo");
  const json = resumoParaJson(resumo);
  assert.ok(json.includes("tempoMedioViagem") || json.includes("Tempo médio"));
  const html = resumoParaHtml(resumo);
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("cel-melhor") || html.includes('class="melhor"'));
  assert.ok(html.includes("Cascata"));
  assert.ok(html.includes("@page"));
  assert.ok(html.includes("@media print"));
  assert.ok(html.includes("Gerar PDF / Imprimir"));
  assert.ok(html.includes("Mudanças"));
  const htmlPdf = resumoParaHtml(resumo, { autoPrint: true });
  assert.ok(htmlPdf.includes("window.print"));
  assert.ok(htmlPdf.includes("auto-print"));
});

test("diferencaVariacaoFluxo: alvo − referência (A→B = deltaB − deltaA)", () => {
  const deltaA = {
    variacaoFluxoPorTrecho: { AB: 4, BC: -2 },
    variacaoFluxoPorAresta: { "AB>": 3 },
  };
  const deltaB = {
    variacaoFluxoPorTrecho: { AB: 1, BC: 5, CD: 2 },
    variacaoFluxoPorAresta: { "AB>": 1, "BC>": 4 },
  };
  const diff = diferencaVariacaoFluxo(deltaA, deltaB);
  assert.equal(diff.variacaoFluxoPorTrecho.AB, -3);
  assert.equal(diff.variacaoFluxoPorTrecho.BC, 7);
  assert.equal(diff.variacaoFluxoPorTrecho.CD, 2);
  assert.equal(diff.variacaoFluxoPorAresta["AB>"], -2);
  assert.equal(diff.variacaoFluxoPorAresta["BC>"], 4);
});

test("trechosParaVariacao: geometria de aresta a partir do grafo", () => {
  const g = criarMalha();
  const trechos = trechosParaVariacao(g);
  assert.ok(trechos.length >= 1);
  const comAresta = trechos.find((t) => t.direcoesAtivas?.length);
  assert.ok(comAresta);
  assert.ok(comAresta.direcoesAtivas[0].geometria?.pontos?.length >= 2);
});

test("stub fonte: salvar/listar/obter round-trip", async () => {
  resetarCacheFonteCenarios();
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const api = criarApiStub(storage);
  const salvo = api.salvar({
    nome: "Obra teste",
    mudancas: [{ tipo: "bloquear", trechoId: "EF" }],
    semente: 7,
  });
  assert.equal(api.listar().length, 1);
  const obtido = api.obter(salvo.id);
  assert.equal(obtido.nome, "Obra teste");
  assert.deepEqual(mudancasDoCenario(obtido), [{ tipo: "bloquear", trechoId: "EF" }]);

  const viaResolver = await resolverFonteCenarios({ forcarStub: true, storage });
  assert.equal(viaResolver.fonte, "stub");
  assert.equal(viaResolver.listar().length, 1);
  resetarCacheFonteCenarios();
});

test("resolverFonteCenarios detecta F5 (adaptador/cenarios.js) quando presente", async () => {
  resetarCacheFonteCenarios();
  const api = await resolverFonteCenarios();
  assert.equal(api.fonte, "f5");
  assert.equal(typeof api.listar, "function");
  assert.equal(typeof api.obter, "function");
  // Sem localStorage de cenário no Node → lista vazia, mas API responde.
  assert.ok(Array.isArray(api.listar()));
  resetarCacheFonteCenarios();
});

test("ponte F5: exports de cenarios.js batem com o que adaptarModuloF5 espera", async () => {
  resetarCacheFonteCenarios();
  const mod = await import("../../js/adaptador/cenarios.js");
  assert.equal(typeof mod.listarCenarios, "function");
  assert.equal(typeof mod.obterCenario, "function");
  assert.equal(typeof mod.salvarCenario, "function");
  assert.equal(typeof mod.criarESalvar, "function");
  assert.equal(typeof mod.criarCenario, "function");
  assert.equal(typeof mod.removerCenario, "function");
  assert.equal(typeof mod.importarCenariosJson, "function");
  assert.equal(typeof mod.exportarCenarioJson, "function");

  const api = await resolverFonteCenarios();
  assert.equal(api.fonte, "f5");

  // Sem localStorage no Node a persistência é no-op, mas salvar ainda
  // devolve o cenário canônico via criarCenario/criarESalvar.
  const novo = api.salvar({
    nome: "Obra ponte",
    regiaoId: "centro",
    mudancas: [
      {
        tipo: "adicionarLigacao",
        de: "A",
        para: "F",
        comprimento: 80,
        velocidade: 10,
        id: "AF",
      },
    ],
  });
  assert.ok(novo.id);
  assert.equal(novo.origem, "f5");
  assert.equal(novo.regiaoId, "centro");
  assert.equal(mudancasDoCenario(novo)[0].tipo, "adicionarLigacao");

  const atualizado = api.salvar({
    id: novo.id,
    nome: "Obra ponte v2",
    regiaoId: "centro",
    mudancas: [{ tipo: "bloquear", trechoId: "EF" }],
  });
  assert.equal(atualizado.id, novo.id);
  assert.equal(atualizado.nome, "Obra ponte v2");
  assert.equal(mudancasDoCenario(atualizado)[0].tipo, "bloquear");
  resetarCacheFonteCenarios();
});

// F4 — fuga de rota: deslocamento de volume + desviados em vizinhos.
import test from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  arestasDoTrecho,
  arestasVizinhasDoTrecho,
  somarVolumes,
  contarDesviadosEmVizinhos,
  estimarFugaDeRota,
  criarRastreadorFugaRota,
} from "../../js/motor/fugaRota.js";

function criarMalhaEmT() {
  //     C
  //     |
  // A — B — D
  const g = new Grafo();
  const base = { comprimento: 100, velocidade: 10, peso: 10 };
  g.adicionarAresta({ ...base, id: "AB>", de: "A", para: "B", trechoId: "AB" });
  g.adicionarAresta({ ...base, id: "AB<", de: "B", para: "A", trechoId: "AB" });
  g.adicionarTrecho({ id: "AB", arestas: ["AB>", "AB<"], nome: "Via AB" });

  g.adicionarAresta({ ...base, id: "BC>", de: "B", para: "C", trechoId: "BC" });
  g.adicionarAresta({ ...base, id: "BC<", de: "C", para: "B", trechoId: "BC" });
  g.adicionarTrecho({ id: "BC", arestas: ["BC>", "BC<"], nome: "Via BC" });

  g.adicionarAresta({ ...base, id: "BD>", de: "B", para: "D", trechoId: "BD" });
  g.adicionarAresta({ ...base, id: "BD<", de: "D", para: "B", trechoId: "BD" });
  g.adicionarTrecho({ id: "BD", arestas: ["BD>", "BD<"], nome: "Via BD" });
  return g;
}

test("arestasVizinhasDoTrecho: exclui o próprio trecho e inclui adjacentes", () => {
  const g = criarMalhaEmT();
  assert.deepEqual(arestasDoTrecho(g, "AB").sort(), ["AB<", "AB>"]);
  const viz = arestasVizinhasDoTrecho(g, "AB").sort();
  assert.ok(viz.includes("BC>"));
  assert.ok(viz.includes("BD>"));
  assert.equal(viz.includes("AB>"), false);
  assert.equal(viz.includes("AB<"), false);
});

test("somarVolumes: Map e objeto", () => {
  assert.equal(somarVolumes(new Map([["a", 2], ["b", 3]]), ["a", "b"]), 5);
  assert.equal(somarVolumes({ a: 1, b: 4 }, ["a", "b", "c"]), 5);
  assert.equal(somarVolumes(null, ["a"]), 0);
});

test("estimarFugaDeRota: queda no dispositivo + alta nos vizinhos", () => {
  const r = estimarFugaDeRota({
    volumesBaseline: { "AB>": 5, "BC>": 1, "BD>": 1 },
    volumesAtual: { "AB>": 2, "BC>": 3, "BD>": 2 },
    arestasDispositivo: ["AB>"],
    arestasVizinhas: ["BC>", "BD>"],
  });
  assert.equal(r.disponivel, true);
  assert.equal(r.sinal, "fuga");
  assert.equal(r.fugaEstimada, 3); // min(queda 3, alta 3)
  assert.equal(r.volumeDispositivo.delta, -3);
  assert.equal(r.volumeVizinhos.delta, 3);
});

test("estimarFugaDeRota: sem baseline ⇒ aguardando", () => {
  const r = estimarFugaDeRota({
    volumesBaseline: null,
    volumesAtual: { "AB>": 2 },
    arestasDispositivo: ["AB>"],
    arestasVizinhas: ["BC>"],
  });
  assert.equal(r.disponivel, false);
  assert.equal(r.sinal, "aguardando");
});

test("estimarFugaDeRota: queda sem alta clara ⇒ insuficiente", () => {
  const r = estimarFugaDeRota({
    volumesBaseline: { "AB>": 4, "BC>": 2 },
    volumesAtual: { "AB>": 1, "BC>": 2 },
    arestasDispositivo: ["AB>"],
    arestasVizinhas: ["BC>"],
  });
  assert.equal(r.sinal, "insuficiente");
  assert.equal(r.fugaEstimada, 0);
});

test("contarDesviadosEmVizinhos: só desviados em vizinhos sem futuro no dispositivo", () => {
  const n = contarDesviadosEmVizinhos(
    [
      { status: "desviado", rota: ["BC>", "CD>"], indice: 0 },
      { status: "desviado", rota: ["BC>", "AB>"], indice: 0 }, // ainda vai ao dispositivo
      { status: "circulando", rota: ["BD>"], indice: 0 },
      { status: "desviado", rota: ["AB>"], indice: 0 }, // está no dispositivo
    ],
    ["AB>"],
    ["BC>", "BD>"]
  );
  assert.equal(n, 1);
});

test("criarRastreadorFugaRota: baseline na colocação e fuga após deslocamento", () => {
  const g = criarMalhaEmT();
  const rastreador = criarRastreadorFugaRota();
  const dispositivo = { id: "d1", tipo: "lombada", trechoId: "AB" };

  const veiculosAntes = [
    { status: "circulando", rota: ["AB>"], indice: 0 },
    { status: "circulando", rota: ["AB>"], indice: 0 },
    { status: "circulando", rota: ["AB>"], indice: 0 },
    { status: "circulando", rota: ["BC>"], indice: 0 },
  ];
  rastreador.sincronizar([dispositivo], g, veiculosAntes);

  const veiculosDepois = [
    { status: "circulando", rota: ["AB>"], indice: 0 },
    { status: "desviado", rota: ["BC>"], indice: 0 },
    { status: "desviado", rota: ["BD>"], indice: 0 },
    { status: "circulando", rota: ["BC>"], indice: 0 },
  ];
  const fuga = rastreador.avaliar(dispositivo, g, veiculosDepois, { recalculadasBpr: 2 });
  assert.equal(fuga.disponivel, true);
  assert.equal(fuga.sinal, "fuga");
  assert.ok(fuga.fugaEstimada >= 1);
  assert.equal(fuga.volumeDispositivo.delta, -2); // 3 → 1
});

import test from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { snapParaNoMaisProximo, projetarPontoNaMalha } from "../../js/motor/geometriaSnap.js";

function malhaComNos() {
  const g = new Grafo();
  g.adicionarNo("n1", { lat: -23.35, lon: -46.87 });
  g.adicionarNo("n2", { lat: -23.351, lon: -46.871 });
  g.adicionarNo("n3", { lat: -23.352, lon: -46.872 });
  const base = { trechoId: "t1", comprimento: 150, velocidade: 10, peso: 15 };
  g.adicionarAresta({
    ...base,
    id: "t1>",
    de: "n1",
    para: "n2",
    geometria: {
      pontos: [
        [-23.35, -46.87],
        [-23.351, -46.871],
      ],
      acumulado: [0, 150],
      comprimento: 150,
    },
  });
  g.adicionarAresta({
    ...base,
    id: "t1<",
    de: "n2",
    para: "n1",
    geometria: {
      pontos: [
        [-23.351, -46.871],
        [-23.35, -46.87],
      ],
      acumulado: [0, 150],
      comprimento: 150,
    },
  });
  g.adicionarTrecho({
    id: "t1",
    arestas: ["t1>", "t1<"],
    nome: "Rua Teste",
    comprimento: 150,
    pontos: [
      [-23.35, -46.87],
      [-23.351, -46.871],
    ],
    extremidades: ["n1", "n2"],
  });
  return g;
}

test("snap de nó vs snap de segmento: alvos diferentes", () => {
  const g = malhaComNos();
  // Ponto no meio do segmento, mais perto da linha do que de um nó extremo.
  const meio = [-23.3505, -46.8705];
  const no = snapParaNoMaisProximo(meio, g, 80);
  const seg = projetarPontoNaMalha(meio, g, 80);
  assert.equal(no.valido, true);
  assert.equal(seg.valido, true);
  assert.ok(no.noId === "n1" || no.noId === "n2");
  assert.equal(seg.trechoId, "t1");
  assert.ok(seg.fracao > 0 && seg.fracao < 1);
});

test("snap de nó respeita raio máximo", () => {
  const g = malhaComNos();
  const r = snapParaNoMaisProximo([-23.36, -46.88], g, 20);
  assert.equal(r.valido, false);
  assert.match(r.motivo, /interseção/i);
});

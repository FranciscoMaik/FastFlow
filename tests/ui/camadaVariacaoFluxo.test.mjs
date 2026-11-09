// segmentosVariacaoFluxo: aresta preferida, trecho como fallback.
// node --test tests/ui/camadaVariacaoFluxo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentosVariacaoFluxo } from "../../js/ui/camadaVariacaoFluxo.js";

const trechos = [
  {
    id: "AB",
    pontos: [
      [-23.35, -46.88],
      [-23.35, -46.879],
    ],
    direcoesAtivas: [
      {
        id: "AB>",
        geometria: {
          pontos: [
            [-23.35, -46.88],
            [-23.35, -46.879],
          ],
        },
      },
      {
        id: "AB<",
        geometria: {
          pontos: [
            [-23.35, -46.879],
            [-23.35, -46.88],
          ],
        },
      },
    ],
  },
  {
    id: "BC",
    pontos: [
      [-23.35, -46.879],
      [-23.351, -46.878],
    ],
    direcoesAtivas: [],
  },
];

test("prefere aresta e completa com trecho sem geometria de aresta", () => {
  const segs = segmentosVariacaoFluxo(
    {
      variacaoFluxoPorTrecho: { AB: 4, BC: -2 },
      variacaoFluxoPorAresta: { "AB>": 3, "AB<": 1 },
    },
    trechos
  );
  const ids = segs.map((s) => s.id).sort();
  assert.deepEqual(ids, ["AB<", "AB>", "BC"]);
  assert.equal(segs.find((s) => s.id === "BC").delta, -2);
  assert.ok(!segs.some((s) => s.id === "AB"), "trecho AB não deve duplicar arestas");
});

test("delta zerado ou ausente não gera segmento", () => {
  const segs = segmentosVariacaoFluxo(
    { variacaoFluxoPorTrecho: { AB: 0, BC: 5 }, variacaoFluxoPorAresta: {} },
    trechos
  );
  assert.equal(segs.length, 1);
  assert.equal(segs[0].id, "BC");
});

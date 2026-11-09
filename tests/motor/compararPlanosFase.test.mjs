import test from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  compararPlanosFase,
  esperaMediaCiclo,
  metricasAnaliticasPlano,
  normalizarTemposFase,
  taxaChegadaDeMetricas,
  PLANOS_PRESET,
} from "../../js/motor/compararPlanosFase.js";

function criarMalhaLinear(comprimento = 200) {
  const g = new Grafo();
  const base = { trechoId: "AB", comprimento, velocidade: 10, peso: comprimento / 10 };
  g.adicionarAresta({ ...base, id: "AB>", de: "A", para: "B" });
  g.adicionarAresta({ ...base, id: "AB<", de: "B", para: "A" });
  g.adicionarTrecho({ id: "AB", arestas: ["AB>", "AB<"], nome: "Via AB" });
  const bc = { trechoId: "BC", comprimento, velocidade: 10, peso: comprimento / 10 };
  g.adicionarAresta({ ...bc, id: "BC>", de: "B", para: "C" });
  g.adicionarAresta({ ...bc, id: "BC<", de: "C", para: "B" });
  g.adicionarTrecho({ id: "BC", arestas: ["BC>", "BC<"], nome: "Via BC" });
  return g;
}

test("normalizarTemposFase e esperaMediaCiclo: ciclo curto vs longo", () => {
  const curto = normalizarTemposFase({ verde: 12, amarelo: 3, vermelho: 10 });
  const longo = normalizarTemposFase(PLANOS_PRESET[1].tempos);
  assert.equal(curto.verde, 12);
  assert.equal(longo.vermelho, 15);

  const eCurto = esperaMediaCiclo(curto);
  const eLongo = esperaMediaCiclo(longo);
  assert.ok(eCurto > 0);
  assert.ok(eLongo > 0);
  // Mesma razão vermelho/ciclo aproximada, mas valores absolutos diferem.
  assert.notEqual(eCurto, eLongo);
});

test("metricasAnaliticasPlano: fila estimada = taxa × espera", () => {
  const m = metricasAnaliticasPlano({ verde: 10, amarelo: 2, vermelho: 10 }, { taxaChegada: 0.5 });
  assert.equal(m.ciclo, 22);
  assert.ok(m.esperaMedia > 0);
  assert.ok(Math.abs(m.filaEstimada - 0.5 * m.esperaMedia) < 1e-9);
});

test("taxaChegadaDeMetricas: Little a partir de fila/espera ao vivo", () => {
  assert.equal(taxaChegadaDeMetricas({ filaMedia: 2, esperaMedia: 4 }), 0.5);
  assert.equal(taxaChegadaDeMetricas({ filaMedia: 2, esperaMedia: 0 }), null);
  assert.equal(taxaChegadaDeMetricas({}), null);
});

test("compararPlanosFase: exige 2 ou 3 planos", () => {
  assert.equal(compararPlanosFase([]).ok, false);
  assert.equal(compararPlanosFase([{ tempos: { verde: 12, amarelo: 3, vermelho: 10 } }]).ok, false);
  const quatro = [
    { tempos: { verde: 10, amarelo: 3, vermelho: 10 } },
    { tempos: { verde: 12, amarelo: 3, vermelho: 10 } },
    { tempos: { verde: 14, amarelo: 3, vermelho: 10 } },
    { tempos: { verde: 16, amarelo: 3, vermelho: 10 } },
  ];
  assert.equal(compararPlanosFase(quatro).ok, false);
});

test("compararPlanosFase: lado a lado com Δ espera e melhor destaque", () => {
  const r = compararPlanosFase(
    [
      { id: "atual", rotulo: "Atual", tempos: { verde: 8, amarelo: 3, vermelho: 20 } },
      { id: "curto", rotulo: "Curto", tempos: PLANOS_PRESET[0].tempos },
      { id: "longo", rotulo: "Longo", tempos: PLANOS_PRESET[1].tempos },
    ],
    { taxaChegada: 0.4, referencia: 0 }
  );
  assert.equal(r.ok, true);
  assert.equal(r.planos.length, 3);
  assert.equal(r.referenciaId, "atual");
  assert.equal(r.planos[0].deltaEsperaVsRef, 0);
  assert.ok(r.planos[1].deltaEsperaVsRef !== 0 || r.planos[2].deltaEsperaVsRef !== 0);
  assert.ok(r.melhorEsperaId);
  const melhor = r.planos.find((p) => p.id === r.melhorEsperaId);
  for (const p of r.planos) {
    assert.ok(melhor.esperaMedia <= p.esperaMedia);
  }
  assert.ok(r.planos.every((p) => p.filaEstimada != null));
});

test("compararPlanosFase: Δ tempo médio F2 barato ordena planos", () => {
  const g = criarMalhaLinear(180);
  const r = compararPlanosFase(
    [
      { id: "pesado", rotulo: "Pesado", tempos: { verde: 6, amarelo: 3, vermelho: 24 } },
      { id: "leve", rotulo: "Leve", tempos: { verde: 24, amarelo: 3, vermelho: 6 } },
    ],
    {
      grafo: g,
      trechoId: "AB",
      comDeltaF2: true,
      demanda: { n: 24, semente: 11 },
      referencia: 0,
    }
  );
  assert.equal(r.ok, true);
  assert.ok(r.f2);
  assert.equal(r.f2.amostra, 24);
  const leve = r.planos.find((p) => p.id === "leve");
  assert.ok(leve.deltaTempoMedio?.absoluto != null);
  // Mais verde / menos vermelho → menor atraso de ciclo → tempo médio não sobe vs ref.
  assert.ok(leve.deltaTempoMedio.absoluto <= 0);
  assert.equal(r.melhorDeltaId, "leve");
});

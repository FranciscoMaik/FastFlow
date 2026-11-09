// Prévia de bloqueio: aplicarEmCopia(bloquear) + avaliar, espelhando ControleBloqueio.avaliarImpactoBloqueio.
import test from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { avaliar } from "../../js/motor/avaliadorImpacto.js";
import { PERFIS_PERIODO } from "../../js/motor/demandaFixa.js";
import { aplicarEmCopia } from "../../js/motor/mudanca.js";
import { rodapeAmostra } from "../../js/ui/previewImpactoFmt.js";

function criarMalha() {
  const g = new Grafo();
  const ligar = (id, a, b, comprimento = 100) => {
    const base = { trechoId: id, comprimento, velocidade: 10, peso: comprimento / 10 };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
    g.adicionarTrecho({ id, arestas: [`${id}>`, `${id}<`], nome: id });
  };
  ligar("AB", "A", "B");
  ligar("BC", "B", "C");
  ligar("AD", "A", "D");
  ligar("DE", "D", "E");
  ligar("EC", "E", "C");
  ligar("EF", "E", "F");
  return g;
}

/** Mesmo fluxo do adaptador: cópia com bloquear + avaliar(grafoCenario). */
function avaliarBloqueio(grafo, trechoId, { paresOD, demanda, bprAnalitico = false } = {}) {
  const trecho = grafo.trechos.get(trechoId);
  if (!trecho) return null;
  if (trecho.bloqueado) return { ok: false, motivo: "Este trecho já está bloqueado." };

  const copia = aplicarEmCopia(grafo, { tipo: "bloquear", trechoId });
  if (!copia.ok) return { ok: false, motivo: copia.motivo };

  const avaliacao = avaliar({
    grafo,
    paresOD,
    demanda,
    grafoCenario: copia.estado.grafo,
    trechoAfetado: trechoId,
    topN: 3,
    bprAnalitico,
  });
  return { ok: true, trechoId, avaliacao };
}

test("prévia de bloqueio AB: varia tempo médio e não muta a base", () => {
  const g = criarMalha();
  const r = avaliarBloqueio(g, "AB", {
    paresOD: [
      { origem: "A", destino: "C" },
      { origem: "C", destino: "A" },
    ],
  });

  assert.equal(r.ok, true);
  assert.ok(r.avaliacao.delta.tempoMedioViagem.absoluto > 0);
  assert.ok(r.avaliacao.delta.viagensAfetadas.contagem > 0);
  assert.ok(r.avaliacao.extras.trechosSobrecarregados.length > 0);
  assert.equal(g.trechos.get("AB").bloqueado, false);
  assert.ok(Number.isFinite(g.arestas.get("AB>").peso));
});

test("prévia de trecho já bloqueado é recusada", () => {
  const g = criarMalha();
  g.bloquearTrecho("AB");
  const r = avaliarBloqueio(g, "AB", {
    paresOD: [{ origem: "A", destino: "C" }],
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /já está bloqueado/i);
});

test("prévia de EF reporta pior caso / retidos quando isola F", () => {
  const g = criarMalha();
  const r = avaliarBloqueio(g, "EF", {
    paresOD: [
      { origem: "A", destino: "F" },
      { origem: "F", destino: "A" },
      { origem: "A", destino: "C" },
    ],
  });
  assert.equal(r.ok, true);
  assert.ok(r.avaliacao.delta.retidos > 0 || r.avaliacao.delta.piorCaso);
  assert.ok(r.avaliacao.delta.tempoMedioViagem != null);
});

test("períodos pico e fora de pico geram amostras e Δ distintos", () => {
  const g = criarMalha();
  const pico = avaliarBloqueio(g, "BC", {
    demanda: { periodo: "pico", grafo: g },
  });
  const fora = avaliarBloqueio(g, "BC", {
    demanda: { periodo: "foraPico", grafo: g },
  });
  assert.equal(pico.ok, true);
  assert.equal(fora.ok, true);
  assert.equal(pico.avaliacao.amostra.tamanho, PERFIS_PERIODO.pico.n);
  assert.equal(fora.avaliacao.amostra.tamanho, PERFIS_PERIODO.foraPico.n);
  assert.notEqual(
    pico.avaliacao.delta.viagensAfetadas.contagem,
    fora.avaliacao.delta.viagensAfetadas.contagem
  );
});

test("BPR analítico eleva tempos base e marca extras; não muta grafo original", () => {
  const g = criarMalha();
  const pesoAntes = g.arestas.get("AB>").peso;
  const paresOD = [
    { origem: "A", destino: "C" },
    { origem: "A", destino: "C" },
    { origem: "A", destino: "C" },
    { origem: "A", destino: "C" },
    { origem: "C", destino: "A" },
    { origem: "A", destino: "F" },
    { origem: "F", destino: "A" },
    { origem: "B", destino: "E" },
  ];
  const livre = avaliarBloqueio(g, "AB", { paresOD });
  const comBpr = avaliarBloqueio(g, "AB", {
    paresOD,
    bprAnalitico: { escalaVolume: 3, iteracoes: 1 },
  });

  assert.equal(comBpr.ok, true);
  assert.ok(comBpr.avaliacao.extras.bprAnalitico?.aplicado);
  assert.ok(
    comBpr.avaliacao.base.tempoMedioViagem >= livre.avaliacao.base.tempoMedioViagem
  );
  assert.equal(g.arestas.get("AB>").peso, pesoAntes);

  const rodape = rodapeAmostra(8, {
    bprAnalitico: true,
    periodo: "pico",
    bprSimulacao: true,
  });
  assert.match(rodape, /demanda de pico/i);
  assert.match(rodape, /BPR analítico aproximado/i);
  assert.doesNotMatch(rodape, /sem BPR dinâmico/);
});

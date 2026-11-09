// F4 — BPR: fórmula, monotonia, aplicação no grafo e tick intervalado na simulação.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { Simulacao } from "../../js/motor/simulacao.js";
import { menorCaminho, custoRota } from "../../js/motor/roteamento.js";
import { avaliar } from "../../js/motor/avaliadorImpacto.js";
import {
  tempoBpr,
  capacidadeAresta,
  contarVeiculosPorAresta,
  aplicarPesosBpr,
  atualizarCongestionamento,
  volumesDeFluxoOd,
  aplicarBprPorFluxoOd,
  BPR_PADRAO,
} from "../../js/motor/congestionamento.js";

function criarMalha() {
  const g = new Grafo();
  const ligar = (id, a, b, comprimento = 100, tipo = "residential") => {
    const base = {
      trechoId: id,
      comprimento,
      velocidade: 10,
      peso: comprimento / 10,
    };
    g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
    g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
    g.adicionarTrecho({
      id,
      arestas: [`${id}>`, `${id}<`],
      tipo,
      comprimento,
    });
  };
  ligar("AB", "A", "B");
  ligar("BC", "B", "C");
  ligar("AD", "A", "D", 100, "primary");
  ligar("DE", "D", "E");
  ligar("EC", "E", "C");
  return g;
}

test("tempoBpr: free-flow, saturação e sobrecarga clássicos (α=0.15, β=4)", () => {
  assert.equal(tempoBpr(10, 0, 10), 10);
  assert.equal(tempoBpr(10, 10, 10), 10 * (1 + 0.15)); // 11.5
  assert.equal(tempoBpr(10, 20, 10), 10 * (1 + 0.15 * 16)); // 34
});

test("tempoBpr: monotonia — mais volume ⇒ custo ≥", () => {
  const free = 12;
  const cap = 8;
  let anterior = tempoBpr(free, 0, cap);
  for (let v = 1; v <= 40; v++) {
    const t = tempoBpr(free, v, cap);
    assert.ok(t >= anterior, `v=${v}: ${t} < ${anterior}`);
    anterior = t;
  }
});

test("capacidadeAresta escala com comprimento e tipo", () => {
  const arestaCurta = { comprimento: 100 };
  const arestaLonga = { comprimento: 1000 };
  const residencial = { meta: { tipo: "residential" } };
  const primaria = { meta: { tipo: "primary" } };

  const cRes = capacidadeAresta(arestaCurta, residencial);
  const cPri = capacidadeAresta(arestaCurta, primaria);
  const cLonga = capacidadeAresta(arestaLonga, residencial);

  assert.ok(cPri > cRes, "primary tem mais capacidade que residential");
  assert.ok(cLonga > cRes * 5, "1 km >> 100 m");
  assert.equal(cRes, Math.max(1, (BPR_PADRAO.capacidadesVehPorKm.residential * 100) / 1000));
});

test("contarVeiculosPorAresta ignora retidos e agrega por aresta atual", () => {
  const volumes = contarVeiculosPorAresta([
    { rota: ["AB>"], indice: 0, status: "circulando" },
    { rota: ["AB>"], indice: 0, status: "desviado" },
    { rota: ["BC>"], indice: 0, status: "circulando" },
    { rota: ["AB>"], indice: 0, status: "retido" },
    { rota: ["AB>", "BC>"], indice: 1, status: "circulando" },
  ]);
  assert.equal(volumes.get("AB>"), 2);
  assert.equal(volumes.get("BC>"), 2);
  assert.equal(volumes.has("XX"), false);
});

test("aplicarPesosBpr sobe peso com volume e não toca aresta bloqueada", () => {
  const g = criarMalha();
  g.bloquearTrecho("BC");
  const livreAntes = g.arestas.get("AB>").peso;
  const bloqueadoAntes = g.arestas.get("BC>").peso;

  const r = aplicarPesosBpr(g, new Map([["AB>", 20], ["BC>", 20]]));
  assert.ok(r.atualizadas >= 1);
  assert.ok(g.arestas.get("AB>").peso > livreAntes);
  assert.equal(g.arestas.get("AB>").pesoOriginal, livreAntes, "free-flow preservado");
  assert.equal(g.arestas.get("BC>").peso, bloqueadoAntes);
  assert.equal(g.arestas.get("BC>").peso, Infinity);
});

test("F2 avaliar usa pesos congestionados já no grafo", () => {
  const g = criarMalha();
  // Congestiona o caminho curto A→B→C; o desvio A→D→E→C fica relativamente melhor.
  aplicarPesosBpr(
    g,
    new Map([
      ["AB>", 40],
      ["BC>", 40],
    ]),
    { capacidadesVehPorKm: { residential: 10, primary: 10 } }
  );

  const rotaLivreEsperada = ["AB>", "BC>"];
  const rotaCongestionada = menorCaminho(g, "A", "C");
  assert.notDeepEqual(rotaCongestionada, rotaLivreEsperada);

  const aval = avaliar({
    grafo: g,
    paresOD: [{ origem: "A", destino: "C" }],
  });
  // Free-flow A→C = 20 s; com BPR na rota curta o avaliador deve ver custo maior
  // (rota desviada ou mesma rota mais cara).
  assert.ok(aval.base.tempoMedioViagem > 20, "tempo médio reflete pesos BPR no grafo");
  assert.equal(aval.base.retidos, 0);
});

test("Simulacao: tick BPR intervalado atualiza pesos e emite evento", () => {
  const g = criarMalha();
  const sim = new Simulacao(g, {
    demanda: false,
    fatorTempo: 1,
    congestionamento: { intervaloAtualizacao: 2, limiarRelativoRecalculo: 0.01 },
  });
  sim.definirQuantidade(25);

  let eventos = 0;
  sim.on("congestionamentoAtualizado", () => {
    eventos += 1;
  });

  // 1 s simulado: ainda abaixo do intervalo.
  sim.avancar(1);
  assert.equal(eventos, 0);

  // Cruza 2 s: um tick.
  sim.avancar(1.2);
  assert.equal(eventos, 1);
  assert.ok(sim.ultimoCongestionamento);
  assert.equal(sim.estatisticas().congestionamento, true);

  // Desligar restaura free-flow.
  const pesoCong = g.arestas.get("AB>").peso;
  sim.definirCongestionamento(false);
  assert.equal(sim.congestionamentoAtivo, false);
  if (Number.isFinite(pesoCong) && pesoCong !== g.arestas.get("AB>").pesoOriginal) {
    assert.equal(g.arestas.get("AB>").peso, g.arestas.get("AB>").pesoOriginal);
  }
});

test("atualizarCongestionamento + custoRota: monotonia no grafo vivo", () => {
  const g = criarMalha();
  const caminho = ["AB>", "BC>"];
  const c0 = custoRota(g, caminho);

  atualizarCongestionamento(
    g,
    [
      { rota: ["AB>"], indice: 0, status: "circulando" },
      { rota: ["AB>"], indice: 0, status: "circulando" },
      { rota: ["AB>"], indice: 0, status: "circulando" },
      { rota: ["AB>"], indice: 0, status: "circulando" },
      { rota: ["AB>"], indice: 0, status: "circulando" },
      { rota: ["BC>"], indice: 0, status: "circulando" },
    ],
    { capacidadesVehPorKm: { residential: 20 } }
  );
  const c1 = custoRota(g, caminho);
  assert.ok(c1 >= c0);
});

test("volumesDeFluxoOd / aplicarBprPorFluxoOd escalam fluxo OD para BPR", () => {
  const g = criarMalha();
  const livre = g.arestas.get("AB>").peso;
  const vols = volumesDeFluxoOd({ "AB>": 10, "BC>": 4 }, { escala: 1.5 });
  assert.equal(vols.get("AB>"), 15);
  assert.equal(vols.get("BC>"), 6);

  aplicarBprPorFluxoOd(
    g,
    { "AB>": 20 },
    { escala: 1, config: { capacidadesVehPorKm: { residential: 10 } } }
  );
  assert.ok(g.arestas.get("AB>").peso > livre);
  assert.equal(g.arestas.get("AB>").pesoOriginal, livre);
});

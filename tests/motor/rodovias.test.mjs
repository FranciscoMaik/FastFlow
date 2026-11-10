// Testes da circulação em rodovias principais (tráfego de passagem, portões de
// entrada/saída, distribuição proporcional e inserção segura). Rodar com: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { portoesDaMalha } from "../../js/motor/roteamento.js";
import { validarBloqueio } from "../../js/motor/validacao.js";
import { Simulacao } from "../../js/motor/simulacao.js";

const DISTANCIA_MINIMA = 7;

function gerador(semente = 11) {
  return () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
}

function maoDupla(g, id, a, b, { comprimento = 100, velocidade = 10, tipo = "residential" } = {}) {
  const base = { trechoId: id, comprimento, velocidade, peso: comprimento / velocidade };
  g.adicionarAresta({ ...base, id: `${id}>`, de: a, para: b });
  g.adicionarAresta({ ...base, id: `${id}<`, de: b, para: a });
  g.adicionarTrecho({ id, arestas: [`${id}>`, `${id}<`], tipo });
}

function maoUnica(g, id, a, b, { comprimento = 100, velocidade = 10, tipo = "residential" } = {}) {
  g.adicionarAresta({ id: `${id}>`, de: a, para: b, trechoId: id, comprimento, velocidade, peso: comprimento / velocidade });
  g.adicionarTrecho({ id, arestas: [`${id}>`], tipo });
}

// Bairro (quadra A-B-C-D, mão dupla) cortado por uma rodovia de mão única que
// entra pela borda em G1 e sai pela borda em G2, com alça de saída H1→A e de
// entrada B→H2 — como a SP-330 cortada pelo limite da região simulada.
//
//   G1 ══► H1 ══════► H2 ══► G2      (rodovia, 25 m/s)
//          ╲         ╱
//           A ─── B                  (alças de mão única)
//           │     │
//           D ─── C
function malhaComRodovia() {
  const g = new Grafo();
  maoDupla(g, "AB", "A", "B");
  maoDupla(g, "BC", "B", "C");
  maoDupla(g, "CD", "C", "D");
  maoDupla(g, "DA", "D", "A");
  const rodovia = { comprimento: 500, velocidade: 25, tipo: "motorway" };
  maoUnica(g, "R1", "G1", "H1", rodovia);
  maoUnica(g, "R2", "H1", "H2", rodovia);
  maoUnica(g, "R3", "H2", "G2", rodovia);
  maoUnica(g, "L1", "H1", "A", { comprimento: 60, velocidade: 12, tipo: "motorway_link" });
  maoUnica(g, "L2", "B", "H2", { comprimento: 60, velocidade: 12, tipo: "motorway_link" });
  return g;
}

const RODOVIA = new Set(["R1>", "R2>", "R3>"]);

function amostrarDensidade(sim, g, passos, filtro) {
  let naRodovia = 0;
  let amostrasComVeiculo = 0;
  let amostras = 0;
  let total = 0;
  for (let i = 0; i < passos; i++) {
    sim.avancar(0.1);
    if (i % 10 !== 0) continue;
    amostras++;
    const n = sim.veiculos.filter((v) => filtro(v.rota[v.indice])).length;
    naRodovia += n;
    total += sim.veiculos.length;
    if (n > 0) amostrasComVeiculo++;
  }
  return { mediaNaRodovia: naRodovia / amostras, mediaTotal: total / amostras, cobertura: amostrasComVeiculo / amostras };
}

test("portões: pistas cortadas na borda viram entrada e saída da malha", () => {
  const { arestasEntrada, nosSaida } = portoesDaMalha(malhaComRodovia());
  assert.ok(arestasEntrada.some((a) => a.id === "R1>"), "R1 começa numa entrada (G1)");
  assert.ok(nosSaida.includes("G2"), "G2 é uma saída");
  assert.ok(!nosSaida.includes("A"), "cruzamento comum não é portão");
});

test("rodovia cortada pela borda recebe veículos de forma contínua e proporcional", () => {
  const g = malhaComRodovia();
  const sim = new Simulacao(g, { aleatorio: gerador(), fatorTempo: 1 });
  sim.definirQuantidade(30);
  const r = amostrarDensidade(sim, g, 3000, (id) => RODOVIA.has(id));
  // Antes da correção a rodovia ficava sempre vazia (fora da malha principal).
  assert.ok(r.cobertura > 0.9, `rodovia ocupada em ${(r.cobertura * 100).toFixed(0)}% do tempo`);
  const kmRodovia = 1.5;
  const kmTotal = 1.5 + 0.12 + 0.8; // rodovia + alças + quadra (2 sentidos × 400 m)
  const densRodovia = r.mediaNaRodovia / kmRodovia;
  const densMedia = r.mediaTotal / kmTotal;
  assert.ok(densRodovia >= 0.5 * densMedia, `densidade na rodovia ${densRodovia.toFixed(1)} vs média ${densMedia.toFixed(1)} veíc/km`);
});

test("rodovia isolada (sem alça dentro da área) tem tráfego de passagem", () => {
  const g = new Grafo();
  maoDupla(g, "AB", "A", "B");
  maoDupla(g, "BC", "B", "C");
  maoDupla(g, "CA", "C", "A");
  // Pista dupla cortada nas duas pontas, sem ligação com o bairro.
  const rodovia = { comprimento: 800, velocidade: 25, tipo: "motorway" };
  maoUnica(g, "N1", "X1", "X2", rodovia);
  maoUnica(g, "N2", "X2", "X3", rodovia);
  maoUnica(g, "S1", "Y3", "Y2", rodovia);
  maoUnica(g, "S2", "Y2", "Y1", rodovia);
  const sim = new Simulacao(g, { aleatorio: gerador(5), fatorTempo: 1 });
  sim.definirQuantidade(20);
  const viagensAntes = sim.viagensConcluidas;
  const r = amostrarDensidade(sim, g, 3000, (id) => /^[NS]/.test(id));
  assert.ok(r.cobertura > 0.9, `rodovia isolada ocupada em ${(r.cobertura * 100).toFixed(0)}% do tempo`);
  assert.ok(sim.viagensConcluidas > viagensAntes, "veículos atravessam e saem pela outra ponta");
  assert.equal(sim.veiculos.filter((v) => v.status === "retido").length, 0, "ninguém fica retido");
});

function quadraComTrechoLongo(tipo) {
  const g = new Grafo();
  maoDupla(g, "AB", "A", "B", { comprimento: 1000, tipo });
  maoDupla(g, "BC", "B", "C", { tipo });
  maoDupla(g, "CD", "C", "D", { tipo });
  maoDupla(g, "DA", "D", "A", { tipo });
  return g;
}

test("origem dos veículos em vias principais é proporcional à extensão", () => {
  const g = quadraComTrechoLongo("tertiary");
  const sim = new Simulacao(g, { aleatorio: gerador(3) });
  sim.definirQuantidade(40);
  const noLongo = sim.veiculos.filter((v) => v.rota[0].startsWith("AB")).length / sim.veiculos.length;
  // AB tem 1000 de 1300 m (77%). Antes, com sorteio uniforme por aresta, ficava perto de 25%.
  assert.ok(noLongo > 0.6, `${(noLongo * 100).toFixed(0)}% dos veículos nasceram no trecho longo`);
});

test("vias locais mantêm o sorteio de antes (mesma chance por trecho)", () => {
  const g = quadraComTrechoLongo("residential");
  const sim = new Simulacao(g, { aleatorio: gerador(3) });
  sim.definirQuantidade(40);
  const noLongo = sim.veiculos.filter((v) => v.rota[0].startsWith("AB")).length / sim.veiculos.length;
  assert.ok(noLongo > 0.15 && noLongo < 0.35, `${(noLongo * 100).toFixed(0)}% no trecho longo (esperado ~25%)`);
});

test("inserção respeita distância mínima de segurança e velocidade máxima da via", () => {
  const g = malhaComRodovia();
  const sim = new Simulacao(g, { aleatorio: gerador(9) });
  sim.definirQuantidade(80);
  const conferir = (momento) => {
    const porAresta = new Map();
    for (const v of sim.veiculos) {
      const aresta = g.arestas.get(v.rota[v.indice]);
      assert.ok(v.velocidade <= aresta.velocidade + 1e-9, `${momento}: veículo ${v.id} acima da velocidade máxima`);
      if (!porAresta.has(aresta.id)) porAresta.set(aresta.id, []);
      porAresta.get(aresta.id).push(v.progresso);
    }
    for (const [id, lista] of porAresta) {
      lista.sort((a, b) => a - b);
      for (let i = 1; i < lista.length; i++) {
        assert.ok(lista[i] - lista[i - 1] >= DISTANCIA_MINIMA - 1e-9, `${momento}: veículos a ${(lista[i] - lista[i - 1]).toFixed(1)} m em ${id}`);
      }
    }
  };
  conferir("na criação");
  // Novos veículos inseridos durante a simulação também respeitam a distância.
  for (let i = 0; i < 400; i++) {
    const antes = new Set(sim.veiculos.map((v) => v.id));
    sim.avancar(0.05);
    for (const v of sim.veiculos.filter((x) => !antes.has(x.id))) {
      const vizinhos = sim.veiculos.filter((x) => x !== v && x.rota[x.indice] === v.rota[v.indice]);
      for (const x of vizinhos) {
        assert.ok(Math.abs(x.progresso - v.progresso) >= DISTANCIA_MINIMA - 1e-9, "veículo inserido colado em outro");
      }
      assert.ok(v.velocidade <= g.arestas.get(v.rota[v.indice]).velocidade + 1e-9);
    }
  }
});

test("densidade definida no painel é mantida mesmo com veículos saindo pela borda", () => {
  const g = malhaComRodovia();
  const sim = new Simulacao(g, { aleatorio: gerador(21), fatorTempo: 4 });
  sim.definirQuantidade(40);
  const r = amostrarDensidade(sim, g, 3000, () => true);
  assert.ok(r.mediaTotal >= 0.95 * 40, `média de ${r.mediaTotal.toFixed(1)} veículos ativos para 40 configurados`);
});

test("bloqueio em outra parte não retém veículos da rodovia", () => {
  const g = malhaComRodovia();
  const sim = new Simulacao(g, { aleatorio: gerador(4), fatorTempo: 1 });
  sim.definirQuantidade(30);
  for (let i = 0; i < 300; i++) sim.avancar(0.1);
  g.bloquearTrecho("CD");
  for (let i = 0; i < 300; i++) sim.avancar(0.1);
  const retidosNaRodovia = sim.veiculos.filter((v) => v.status === "retido" && RODOVIA.has(v.rota[v.indice]));
  assert.equal(retidosNaRodovia.length, 0);
});

test("validação: tráfego de passagem na rodovia não impede bloqueios", () => {
  const g = malhaComRodovia();
  const naRodovia = [{ id: 1, arestaId: "R2>", no: "H2" }];
  assert.equal(validarBloqueio(g, "AB", naRodovia).permitido, true, "bloqueio no bairro");
  // Interditar a própria rodovia é permitido: quem já passou da alça forma fila.
  assert.equal(validarBloqueio(g, "R3", naRodovia).permitido, true, "bloqueio na rodovia");
});

test("validação: quem está na malha principal continua protegido pela regra", () => {
  const g = malhaComRodovia();
  // Veículo indo de B para a alça L2: o bloqueio de L2 não o prende (ainda tem a quadra).
  assert.equal(validarBloqueio(g, "L2", [{ id: 1, arestaId: "AB>", no: "B" }]).permitido, true);
  // Isolar o nó em que o veículo está (C, sem alça) continua sendo recusado, como antes.
  g.bloquearTrecho("BC");
  const r = validarBloqueio(g, "CD", [{ id: 2, arestaId: "CD<", no: "C" }]);
  assert.equal(r.permitido, false);
  assert.deepEqual(r.veiculosPresos, [2]);
});

test("rodovia bloqueada: fila atrás da interdição e desvio pela alça", () => {
  const g = malhaComRodovia();
  const sim = new Simulacao(g, { aleatorio: gerador(8), fatorTempo: 1 });
  sim.definirQuantidade(30);
  for (let i = 0; i < 600; i++) sim.avancar(0.1);
  g.bloquearTrecho("R3");
  for (let i = 0; i < 1200; i++) sim.avancar(0.1);
  // Ninguém atravessa o trecho bloqueado depois da interdição...
  for (const v of sim.veiculos) {
    for (const id of v.rota.slice(v.indice + 1)) assert.notEqual(id, "R3>", `veículo ${v.id} planeja passar pelo bloqueio`);
  }
  // ...quem entra pela rodovia desvia pela alça H1→A, e a quantidade do painel se mantém.
  assert.ok(sim.veiculos.some((v) => v.rota.includes("L1>")), "desvio pela alça de saída");
  assert.ok(sim.veiculos.length >= 28, `${sim.veiculos.length} veículos ativos`);
  g.desbloquearTrecho("R3");
  for (let i = 0; i < 600; i++) sim.avancar(0.1);
  assert.equal(sim.veiculos.filter((v) => v.status === "retido").length, 0, "fila se desfaz após liberar");
});

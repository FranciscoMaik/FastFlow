// Testes do motor de simulação. Rodar na raiz do projeto com: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { menorCaminho, maiorComponenteForte } from "../../js/motor/roteamento.js";
import { analisarElegibilidade, validarBloqueio } from "../../js/motor/validacao.js";
import { construirGrafo } from "../../js/adaptador/carregarMalha.js";
import { Simulacao } from "../../js/motor/simulacao.js";

// Malha de teste (todas as vias de mão dupla, 100 m, 10 m/s):
//
//   A ─── B ─── C        ← caminho curto A→C passa por B (trecho AB e BC)
//   │           │
//   D ───────── E        ← desvio A→D→E→C
//               │
//               F        ← beco sem saída: o trecho EF é a única ligação de F
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

test("bloquear coloca peso infinito nas arestas do trecho e desbloquear restaura", () => {
  const g = criarMalha();
  assert.equal(g.bloquearTrecho("AB"), true);
  assert.equal(g.arestas.get("AB>").peso, Infinity);
  assert.equal(g.arestas.get("AB<").peso, Infinity);
  assert.deepEqual(g.trechosBloqueados(), ["AB"]);

  assert.equal(g.desbloquearTrecho("AB"), true);
  assert.equal(g.arestas.get("AB>").peso, 10);
  assert.deepEqual(g.trechosBloqueados(), []);
});

test("bloqueio emite evento imediatamente", () => {
  const g = criarMalha();
  const eventos = [];
  g.on("bloqueioAlterado", (e) => eventos.push(e));
  g.bloquearTrecho("BC");
  g.desbloquearTrecho("BC");
  assert.deepEqual(eventos, [
    { trechoId: "BC", bloqueado: true },
    { trechoId: "BC", bloqueado: false },
  ]);
});

test("rota evita o trecho bloqueado", () => {
  const g = criarMalha();
  assert.deepEqual(menorCaminho(g, "A", "C"), ["AB>", "BC>"]);
  g.bloquearTrecho("AB");
  assert.deepEqual(menorCaminho(g, "A", "C"), ["AD>", "DE>", "EC>"]);
});

test("sem caminho possível retorna null", () => {
  const g = criarMalha();
  g.bloquearTrecho("EF");
  assert.equal(menorCaminho(g, "A", "F"), null);
});

test("malha principal encolhe quando um nó fica isolado", () => {
  const g = criarMalha();
  assert.equal(maiorComponenteForte(g).size, 6);
  g.bloquearTrecho("EF");
  assert.equal(maiorComponenteForte(g).has("F"), false);
});

test("validação recusa bloqueio que prende veículo no beco sem saída", () => {
  const g = criarMalha();
  // Veículo indo de E para F: depois do bloqueio ele chegaria em F sem saída.
  const resultado = validarBloqueio(g, "EF", [{ id: 1, arestaId: "EF>", no: "F" }]);
  assert.equal(resultado.permitido, false);
  assert.match(resultado.motivo, /sem rota de escape/);
  assert.deepEqual(resultado.veiculosPresos, [1]);
  assert.equal(g.trechos.get("EF").bloqueado, false, "validação não pode alterar o grafo");
});

test("validação recusa trecho terminal mesmo quando o veículo presente tem saída", () => {
  const g = criarMalha();
  // Veículo saindo de F em direção a E: ao chegar em E ainda tem a malha toda.
  const resultado = validarBloqueio(g, "EF", [{ id: 1, arestaId: "EF<", no: "E" }]);
  assert.equal(resultado.permitido, false);
  assert.match(resultado.motivo, /sem rota de escape/);
});

test("validação recusa trecho já bloqueado ou inexistente", () => {
  const g = criarMalha();
  g.bloquearTrecho("AB");
  assert.equal(validarBloqueio(g, "AB", []).permitido, false);
  assert.equal(validarBloqueio(g, "XX", []).permitido, false);
});

test("elegibilidade topológica recusa becos sem saída e aceita trechos com desvio", () => {
  const g = criarMalha();
  const elegibilidade = analisarElegibilidade(g);
  assert.equal(elegibilidade.get("AB").permitido, true);
  assert.equal(elegibilidade.get("EF").permitido, false);
  assert.match(elegibilidade.get("EF").motivo, /sem rota de escape/);
  assert.equal(validarBloqueio(g, "EF", [], elegibilidade).permitido, false);
});

test("vias locais e marcadas como inoperantes não podem ser bloqueadas", () => {
  const g = criarMalha();
  g.trechos.get("AB").meta.tipo = "residential";
  g.trechos.get("BC").meta.operacional = false;
  const elegibilidade = analisarElegibilidade(g);
  assert.match(elegibilidade.get("AB").motivo, /Via local/);
  assert.match(elegibilidade.get("BC").motivo, /inoperante/);
});

test("via de mão única exige rota alternativa no sentido operacional", () => {
  const g = new Grafo();
  const adicionar = (id, de, para) => {
    g.adicionarAresta({ id: `${id}>`, de, para, peso: 1, trechoId: id });
    g.adicionarTrecho({ id, arestas: [`${id}>`], tipo: "primary" });
  };
  adicionar("direta", "A", "B");
  adicionar("desvio1", "A", "C");
  adicionar("desvio2", "C", "B");
  assert.equal(analisarElegibilidade(g).get("direta").permitido, true);

  const terminal = new Grafo();
  terminal.adicionarAresta({ id: "XY>", de: "X", para: "Y", peso: 1, trechoId: "XY" });
  terminal.adicionarTrecho({ id: "XY", arestas: ["XY>"], tipo: "primary" });
  assert.equal(analisarElegibilidade(terminal).get("XY").permitido, false);
});

test("bloqueio existente remove o desvio e invalida elegibilidade em tempo de operação", () => {
  const g = criarMalha();
  assert.equal(analisarElegibilidade(g).get("AB").permitido, true);
  g.bloquearTrecho("DE");
  assert.equal(analisarElegibilidade(g).get("AB").permitido, false);
});

test("malha marca como inoperante segmento desativado recebido no GeoJSON", () => {
  const g = construirGrafo({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { nome: "Via fechada", tipo: "primary", sentidoUnico: 0, velocidade: 30, ativo: false },
        geometry: { type: "LineString", coordinates: [[-46.8, -23.3], [-46.81, -23.31]] },
      },
      {
        type: "Feature",
        properties: { nome: "Via em obras", tipo: "primary", sentidoUnico: 0, velocidade: 30, status: "construction" },
        geometry: { type: "LineString", coordinates: [[-46.9, -23.4], [-46.91, -23.41]] },
      },
    ],
  });
  const trechos = [...g.trechos.values()];
  assert.deepEqual(trechos.map((trecho) => trecho.meta.operacional), [false, false]);
  assert.ok(trechos.every((trecho) => trecho.arestas.every((id) => !g.estaAcessivel(id))));
  assert.ok(trechos.every((trecho) => /inoperante/.test(analisarElegibilidade(g).get(trecho.id).motivo)));
});

test("inverter sentido em mão dupla cicla 0→1→-1→0 e emite evento", () => {
  const g = criarMalha();
  const eventos = [];
  g.on("sentidoAlterado", (e) => eventos.push(e.sentido));
  assert.equal(g.sentidoDoTrecho("AB"), 0);
  g.inverterSentido("AB");
  assert.equal(g.sentidoDoTrecho("AB"), 1);
  assert.equal(g.estaAcessivel("AB>"), true);
  assert.equal(g.estaAcessivel("AB<"), false);
  g.inverterSentido("AB");
  assert.equal(g.sentidoDoTrecho("AB"), -1);
  assert.equal(g.estaAcessivel("AB>"), false);
  assert.equal(g.estaAcessivel("AB<"), true);
  g.inverterSentido("AB");
  assert.equal(g.sentidoDoTrecho("AB"), 0);
  assert.deepEqual(eventos, [1, -1, 0]);
});

test("inverter sentido em mão única cria aresta oposta e alterna 1↔-1", () => {
  const g = new Grafo();
  g.adicionarAresta({
    id: "X>",
    de: "A",
    para: "B",
    peso: 10,
    trechoId: "X",
    comprimento: 100,
    velocidade: 10,
    geometria: {
      pontos: [
        [0, 0],
        [0, 0.001],
      ],
      acumulado: [0, 100],
      comprimento: 100,
    },
  });
  g.adicionarTrecho({ id: "X", arestas: ["X>"], permiteDuplo: false, sentido: 1 });
  assert.equal(g.inverterSentido("X"), true);
  assert.equal(g.sentidoDoTrecho("X"), -1);
  assert.ok(g.arestas.has("X<"));
  assert.equal(g.estaAcessivel("X>"), false);
  assert.equal(g.estaAcessivel("X<"), true);
});

test("política complete: veículo na via invertida evacua e conclui a travessia", () => {
  const g = criarMalha();
  let semente = 3;
  const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const sim = new Simulacao(g, { politicaSentido: "complete", aleatorio });
  sim.definirQuantidade(5);
  assert.ok(sim.veiculos.length > 0);
  const v = sim.veiculos[0];
  Object.assign(v, {
    rota: ["AB>"],
    indice: 0,
    progresso: 40,
    destino: "C",
    status: "circulando",
    evacuando: false,
  });
  g.inverterSentido("AB"); // 0 → 1, AB> ainda acessível
  g.inverterSentido("AB"); // 1 → -1, fecha AB>
  assert.equal(v.evacuando, true);
  assert.equal(g.estaAcessivel("AB>"), false);
  for (let i = 0; i < 80; i++) sim.avancar(0.2);
  assert.equal(v.evacuando, false);
});

test("simulação recalcula a rota de quem passaria pelo trecho bloqueado", () => {
  const g = criarMalha();
  // Gerador previsível para não depender do acaso.
  let semente = 7;
  const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const sim = new Simulacao(g, { aleatorio });
  sim.definirQuantidade(30);

  const usamAB = () =>
    sim.veiculos.filter((v) => v.rota.slice(v.indice + 1).some((id) => id.startsWith("AB"))).length;
  const antes = usamAB();
  assert.ok(antes > 0, "alguma rota deveria usar AB antes do bloqueio");

  let recalculadas = null;
  sim.on("rotasRecalculadas", (e) => (recalculadas = e.quantidade));
  g.bloquearTrecho("AB");
  assert.equal(usamAB(), 0, "nenhuma rota futura pode usar o trecho bloqueado");
  assert.equal(recalculadas, antes);

  for (let i = 0; i < 200; i++) sim.avancar(0.1);
  for (const v of sim.veiculos) {
    for (const id of v.rota.slice(v.indice + 1)) {
      assert.ok(g.estaAcessivel(id), `veículo ${v.id} com rota passando por ${id}`);
    }
  }
});

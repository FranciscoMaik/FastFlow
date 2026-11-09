// Testes do custo acumulado dos bloqueios (Fase 2).
// Rodar: node --test tests/motor/custoBloqueios.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  avaliarCustoBloqueios,
  chaveCustoBloqueios,
  criarCacheCustoBloqueios,
  grafoSemBloqueios,
} from "../../js/motor/custoBloqueios.js";

//   A ─── B ─── C
//   │           │
//   D ───────── E
//               │
//               F
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

const PARES = [
  { origem: "A", destino: "C" },
  { origem: "A", destino: "F" },
  { origem: "C", destino: "A" },
  { origem: "F", destino: "A" },
  { origem: "B", destino: "D" },
  { origem: "D", destino: "B" },
];

test("grafoSemBloqueios restaura pesos e não muta o original", () => {
  const g = criarMalha();
  g.bloquearTrecho("EF");
  g.bloquearTrecho("AB");
  assert.equal(g.trechos.get("EF").bloqueado, true);

  const base = grafoSemBloqueios(g);
  assert.equal(base.trechos.get("EF").bloqueado, false);
  assert.equal(base.trechos.get("AB").bloqueado, false);
  assert.ok(Number.isFinite(base.arestas.get("EF>").peso));
  assert.equal(g.trechos.get("EF").bloqueado, true, "original intacto");
});

test("lista vazia ⇒ ok sem total", () => {
  const g = criarMalha();
  const r = avaliarCustoBloqueios(g, [], { paresOD: PARES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, []);
  assert.equal(r.total, null);
  assert.deepEqual(r.itens, []);
});

test("item isolado + total com um bloqueio coincidem", () => {
  const g = criarMalha();
  g.bloquearTrecho("EF");

  const r = avaliarCustoBloqueios(g, ["EF"], { paresOD: PARES });
  assert.equal(r.ok, true);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].trechoId, "EF");
  assert.ok(r.itens[0].impacto.viagensAfetadas.contagem > 0);
  assert.ok(r.total.retidos > 0);
  assert.equal(
    r.itens[0].impacto.viagensAfetadas.contagem,
    r.total.viagensAfetadas.contagem
  );
  assert.equal(g.trechos.get("EF").bloqueado, true, "não muta grafo vivo");
});

test("dois bloqueios: total ≥ variação isolada de cada um (viagens afetadas)", () => {
  const g = criarMalha();
  g.bloquearTrecho("AB");
  g.bloquearTrecho("EF");

  const r = avaliarCustoBloqueios(g, ["AB", "EF"], { paresOD: PARES });
  assert.equal(r.ok, true);
  assert.equal(r.itens.length, 2);

  const isoladoAB = r.itens.find((i) => i.trechoId === "AB").impacto;
  const isoladoEF = r.itens.find((i) => i.trechoId === "EF").impacto;

  assert.ok(isoladoAB.viagensAfetadas.contagem > 0);
  assert.ok(isoladoEF.viagensAfetadas.contagem > 0);
  // Combinados afetam pelo menos tanto quanto o pior isolado.
  assert.ok(
    r.total.viagensAfetadas.contagem >=
      Math.max(isoladoAB.viagensAfetadas.contagem, isoladoEF.viagensAfetadas.contagem)
  );
  // Soma linear dos isolados pode diferir do total (efeitos não aditivos) — só checa presença.
  assert.ok(r.total.tempoMedioViagem.absoluto != null || r.total.retidos > 0);
});

test("demanda F1 {n,semente} é determinística", () => {
  const g = criarMalha();
  g.bloquearTrecho("AB");
  const a = avaliarCustoBloqueios(g, ["AB"], { demanda: { n: 30, semente: 7 } });
  const b = avaliarCustoBloqueios(g, ["AB"], { demanda: { n: 30, semente: 7 } });
  assert.equal(a.ok, true);
  assert.deepEqual(a.total, b.total);
  assert.equal(a.amostra.tamanho, 30);
});

test("chave e cache: mesmo conjunto reutiliza resultado", () => {
  assert.equal(
    chaveCustoBloqueios(["EF", "AB"], { n: 200, semente: 1 }),
    chaveCustoBloqueios(["AB", "EF"], { n: 200, semente: 1 })
  );

  const cache = criarCacheCustoBloqueios();
  const g = criarMalha();
  g.bloquearTrecho("AB");
  const chave = chaveCustoBloqueios(["AB"], { n: 20, semente: 1 });
  const r1 = avaliarCustoBloqueios(g, ["AB"], { demanda: { n: 20, semente: 1 } });
  cache.guardar(chave, r1);
  assert.equal(cache.obter(chave), r1);
  assert.equal(cache.obter("outra"), null);
  cache.limpar();
  assert.equal(cache.obter(chave), null);
});

test("ordem dos ids na entrada não altera o total", () => {
  const g = criarMalha();
  g.bloquearTrecho("AB");
  g.bloquearTrecho("EF");
  const a = avaliarCustoBloqueios(g, ["AB", "EF"], { paresOD: PARES });
  const b = avaliarCustoBloqueios(g, ["EF", "AB"], { paresOD: PARES });
  assert.deepEqual(a.total, b.total);
  assert.equal(a.chave, b.chave);
});

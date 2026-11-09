// Testes do modelo de mudança (F3). Rodar: node --test tests/motor/mudanca.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import { GerenciadorDispositivos } from "../../js/motor/dispositivos.js";
import { menorCaminho } from "../../js/motor/roteamento.js";
import {
  TIPOS_MUDANCA,
  clonarGrafo,
  clonarEstado,
  aplicar,
  reverter,
  aplicarLista,
  reverterLista,
  aplicarEmCopia,
  serializarMudanca,
  desserializarMudanca,
  serializarLista,
  desserializarLista,
  normalizarMudanca,
} from "../../js/motor/mudanca.js";

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

function snapshotConectividade(grafo) {
  const pesos = {};
  for (const [id, a] of grafo.arestas) pesos[id] = a.peso;
  const sentidos = {};
  const bloqueados = {};
  for (const [id, t] of grafo.trechos) {
    sentidos[id] = t.sentido;
    bloqueados[id] = t.bloqueado;
  }
  return {
    pesos,
    sentidos,
    bloqueados,
    trechos: [...grafo.trechos.keys()].sort(),
    arestas: [...grafo.arestas.keys()].sort(),
  };
}

test("TIPOS_MUDANCA cobre o domínio do plano", () => {
  assert.deepEqual([...TIPOS_MUDANCA].sort(), [
    "adicionarLigacao",
    "bloquear",
    "inverter",
    "lombada",
    "semaforo",
  ]);
});

test("clonarGrafo isola mutações do original", () => {
  const g = criarMalha();
  const c = clonarGrafo(g);
  c.bloquearTrecho("AB");
  assert.equal(g.trechos.get("AB").bloqueado, false);
  assert.equal(c.trechos.get("AB").bloqueado, true);
  assert.equal(g.arestas.get("AB>").peso, 10);
  assert.equal(c.arestas.get("AB>").peso, Infinity);
});

test("bloquear aplicar+reverter restaura pesos e conectividade", () => {
  const g = criarMalha();
  const antes = snapshotConectividade(g);
  assert.deepEqual(menorCaminho(g, "A", "C"), ["AB>", "BC>"]);

  const r = aplicar(g, { tipo: "bloquear", trechoId: "AB" });
  assert.equal(r.ok, true);
  assert.deepEqual(menorCaminho(g, "A", "C"), ["AD>", "DE>", "EC>"]);
  assert.equal(g.arestas.get("AB>").peso, Infinity);

  assert.equal(reverter(g, r.undo).ok, true);
  assert.deepEqual(snapshotConectividade(g), antes);
  assert.deepEqual(menorCaminho(g, "A", "C"), ["AB>", "BC>"]);
});

test("inverter aplicar+reverter restaura sentido e acessibilidade", () => {
  const g = criarMalha();
  const antes = snapshotConectividade(g);
  assert.equal(g.sentidoDoTrecho("AB"), 0);

  const r = aplicar(g, { tipo: "inverter", trechoId: "AB" });
  assert.equal(r.ok, true);
  assert.equal(g.sentidoDoTrecho("AB"), 1);
  assert.equal(g.estaAcessivel("AB>"), true);
  assert.equal(g.estaAcessivel("AB<"), false);

  assert.equal(reverter(g, r.undo).ok, true);
  assert.equal(g.sentidoDoTrecho("AB"), 0);
  assert.deepEqual(snapshotConectividade(g), antes);
});

test("inverter com sentido absoluto usa definirSentido", () => {
  const g = criarMalha();
  const r = aplicar(g, { tipo: "inverter", trechoId: "AB", sentido: -1 });
  assert.equal(r.ok, true);
  assert.equal(g.sentidoDoTrecho("AB"), -1);
  assert.equal(reverter(g, r.undo).ok, true);
  assert.equal(g.sentidoDoTrecho("AB"), 0);
});

test("adicionarLigacao cria trecho e reverter remove", () => {
  const g = criarMalha();
  const antes = snapshotConectividade(g);
  // Sem caminho curto A→F direto; ligamos A–F.
  const r = aplicar(g, {
    tipo: "adicionarLigacao",
    id: "AF",
    de: "A",
    para: "F",
    comprimento: 50,
    velocidade: 10,
    sentido: 0,
  });
  assert.equal(r.ok, true);
  assert.ok(g.trechos.has("AF"));
  assert.ok(g.arestas.has("AF>"));
  assert.ok(g.arestas.has("AF<"));
  assert.deepEqual(menorCaminho(g, "A", "F"), ["AF>"]);

  assert.equal(reverter(g, r.undo).ok, true);
  assert.equal(g.trechos.has("AF"), false);
  assert.equal(g.arestas.has("AF>"), false);
  assert.deepEqual(snapshotConectividade(g), antes);
});

test("lombada e semaforo empilham e revertem no gerenciador", () => {
  const g = criarMalha();
  const dispositivos = new GerenciadorDispositivos();
  const estado = { grafo: g, dispositivos };

  const r1 = aplicar(estado, {
    tipo: "lombada",
    id: "l1",
    trechoId: "AB",
    distancia: 40,
    coordenadas: [0, 0],
  });
  const r2 = aplicar(estado, {
    tipo: "semaforo",
    id: "s1",
    trechoId: "BC",
    distancia: 20,
    tempos: { verde: 15, amarelo: 3, vermelho: 12 },
  });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(dispositivos.listarLombadas().length, 1);
  assert.equal(dispositivos.listarSemaforos().length, 1);
  assert.equal(dispositivos.obter("s1").tempos.verde, 15);

  assert.equal(reverter(estado, r2.undo).ok, true);
  assert.equal(dispositivos.listarSemaforos().length, 0);
  assert.equal(reverter(estado, r1.undo).ok, true);
  assert.equal(dispositivos.listarTodos().length, 0);
});

test("múltiplas mudanças empilham e reverterLista restaura tudo", () => {
  const g = criarMalha();
  const dispositivos = new GerenciadorDispositivos();
  const estado = { grafo: g, dispositivos };
  const antesGrafo = snapshotConectividade(g);

  const r = aplicarLista(estado, [
    { tipo: "bloquear", trechoId: "AB" },
    { tipo: "inverter", trechoId: "BC" },
    { tipo: "adicionarLigacao", id: "AF", de: "A", para: "F", comprimento: 80, velocidade: 10 },
    { tipo: "lombada", id: "l-ab", trechoId: "AD", distancia: 10 },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.aplicadas.length, 4);
  assert.equal(g.trechos.get("AB").bloqueado, true);
  assert.equal(g.sentidoDoTrecho("BC"), 1);
  assert.ok(g.trechos.has("AF"));
  assert.equal(dispositivos.listarLombadas().length, 1);

  assert.equal(reverterLista(estado, r.undos).ok, true);
  assert.deepEqual(snapshotConectividade(g), antesGrafo);
  assert.equal(dispositivos.listarTodos().length, 0);
});

test("aplicarEmCopia não altera o original", () => {
  const g = criarMalha();
  const antes = snapshotConectividade(g);
  const r = aplicarEmCopia(g, [
    { tipo: "bloquear", trechoId: "EF" },
    { tipo: "inverter", trechoId: "AB", sentido: 1 },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.estado.grafo.trechos.get("EF").bloqueado, true);
  assert.equal(r.estado.grafo.sentidoDoTrecho("AB"), 1);
  assert.deepEqual(snapshotConectividade(g), antes);
});

test("mudança inválida é rejeitada sem alterar o grafo", () => {
  const g = criarMalha();
  const antes = snapshotConectividade(g);

  assert.equal(aplicar(g, { tipo: "bloquear", trechoId: "ZZ" }).ok, false);
  assert.equal(aplicar(g, { tipo: "xyz", trechoId: "AB" }).ok, false);
  assert.equal(aplicar(g, { tipo: "bloquear" }).ok, false);
  assert.equal(aplicar(g, { tipo: "adicionarLigacao", de: "A", para: "B" }).ok, false);

  g.bloquearTrecho("AB");
  const pesosBloqueado = snapshotConectividade(g);
  assert.equal(aplicar(g, { tipo: "bloquear", trechoId: "AB" }).ok, false);
  assert.equal(aplicar(g, { tipo: "inverter", trechoId: "AB" }).ok, false);
  assert.deepEqual(snapshotConectividade(g), pesosBloqueado);

  g.desbloquearTrecho("AB");
  assert.deepEqual(snapshotConectividade(g).pesos, antes.pesos);
});

test("aplicarLista falha no meio e desfaz o prefixo", () => {
  const g = criarMalha();
  const antes = snapshotConectividade(g);
  const r = aplicarLista(g, [
    { tipo: "bloquear", trechoId: "AB" },
    { tipo: "bloquear", trechoId: "ZZ" },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.indice, 1);
  assert.deepEqual(snapshotConectividade(g), antes);
});

test("lombada sem dispositivos falha limpo", () => {
  const g = criarMalha();
  const r = aplicar(g, { tipo: "lombada", trechoId: "AB", distancia: 1 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /dispositivos/);
});

test("serializar/desserializar round-trip JSON", () => {
  const lista = [
    { tipo: "bloquear", trechoId: "AB" },
    { tipo: "inverter", trechoId: "BC", sentido: 1 },
    {
      tipo: "adicionarLigacao",
      id: "XY",
      de: "X",
      para: "Y",
      comprimento: 120,
      velocidade: 12.5,
      sentido: -1,
      nome: "Ponte",
    },
    { tipo: "lombada", id: "l1", trechoId: "AB", distancia: 33, velocidadeMaxKmh: 20 },
    {
      tipo: "semaforo",
      id: "s1",
      trechoId: "AB",
      distancia: 90,
      tempos: { verde: 20, amarelo: 3, vermelho: 15 },
      estadoInicial: "vermelho",
    },
  ];
  const json = JSON.stringify(serializarLista(lista));
  const volta = desserializarLista(json);
  assert.deepEqual(volta, JSON.parse(json));

  const uma = serializarMudanca({ tipo: "bloquear", trechoId: "AB", lixo: true });
  assert.deepEqual(uma, { tipo: "bloquear", trechoId: "AB" });
  assert.deepEqual(desserializarMudanca(JSON.stringify(uma)), uma);
});

test("normalizarMudanca rejeita tipo e campos ruins", () => {
  assert.equal(normalizarMudanca(null).ok, false);
  assert.equal(normalizarMudanca({ tipo: "inverter", trechoId: "AB", sentido: 2 }).ok, false);
  assert.equal(
    normalizarMudanca({ tipo: "adicionarLigacao", de: "A", para: "B", comprimento: -1 }).ok,
    false
  );
});

test("clonarEstado inclui dispositivos", () => {
  const g = criarMalha();
  const dispositivos = new GerenciadorDispositivos();
  dispositivos.adicionarLombada({ id: "l1", trechoId: "AB", distancia: 5 });
  const clone = clonarEstado({ grafo: g, dispositivos });
  clone.dispositivos.removerDispositivo("l1");
  assert.ok(dispositivos.obter("l1"));
  assert.equal(clone.dispositivos.obter("l1"), null);
  clone.grafo.bloquearTrecho("AB");
  assert.equal(g.trechos.get("AB").bloqueado, false);
});

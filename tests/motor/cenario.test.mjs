// Testes F5 — cenário salvo. Rodar: node --test tests/motor/cenario.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grafo } from "../../js/motor/grafo.js";
import {
  acrescentarMudanca,
  aplicarCenario,
  avaliarCenario,
  criarCenario,
  desserializarCenario,
  duplicarCenario,
  fmtDeltaTempoResumo,
  removerUltimaMudanca,
  rotuloResumoCenario,
  serializarCenario,
} from "../../js/motor/cenario.js";
import {
  CHAVE_CENARIO_ATIVO,
  CHAVE_CENARIOS,
  aplicarCenarioNaSessao,
  criarCenario as criarCenarioAdaptador,
  criarESalvar,
  definirCenarioAtivo,
  duplicarCenarioSalvo,
  exportarCenarioJson,
  garantirCenarioAtivoParaRegiao,
  importarCenariosJson,
  listarCenarios,
  obterCenarioAtivo,
  registrarMudancaNoAtivo,
} from "../../js/adaptador/cenarios.js";

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

function storageMemoria(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    removeItem: (chave) => dados.delete(chave),
  };
}

test("serializar/desserializar cenário é round-trip estável", () => {
  const original = criarCenario({
    nome: "Obra Av. Abdalla",
    regiaoId: "centro",
    semente: 7,
    demandaN: 40,
    mudancas: [
      { tipo: "bloquear", trechoId: "EF" },
      { tipo: "inverter", trechoId: "BC" },
      {
        tipo: "lombada",
        trechoId: "AB",
        distancia: 12,
        fracao: 0.3,
        coordenadas: [-23.35, -46.87],
        velocidadeMaxKmh: 20,
      },
    ],
  });
  const json = JSON.stringify(serializarCenario(original));
  const volta = desserializarCenario(json);
  assert.equal(volta.nome, original.nome);
  assert.equal(volta.regiaoId, "centro");
  assert.equal(volta.semente, 7);
  assert.equal(volta.demandaN, 40);
  assert.deepEqual(volta.mudancas, original.mudancas);
  assert.equal(volta.id, original.id);
});

test("aplicarCenario é determinístico e isola o grafo base", () => {
  const base = criarMalha();
  const cenario = criarCenario({
    nome: "Corte EF",
    regiaoId: "centro",
    mudancas: [{ tipo: "bloquear", trechoId: "EF" }],
  });

  const r1 = aplicarCenario(base, cenario);
  const r2 = aplicarCenario(base, cenario);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(base.trechos.get("EF").bloqueado, false);
  assert.equal(r1.estado.grafo.trechos.get("EF").bloqueado, true);
  assert.equal(r2.estado.grafo.trechos.get("EF").bloqueado, true);
  assert.deepEqual(r1.aplicadas, r2.aplicadas);
});

test("avaliarCenario: mesma semente ⇒ mesmo Δ; semente diferente pode mudar amostra", () => {
  const g = criarMalha();
  const cenario = criarCenario({
    nome: "Bloqueio EF",
    regiaoId: "centro",
    semente: 1,
    demandaN: 30,
    mudancas: [{ tipo: "bloquear", trechoId: "EF" }],
  });

  const a = avaliarCenario(g, cenario);
  const b = avaliarCenario(g, cenario);
  assert.deepEqual(a.delta, b.delta);
  assert.deepEqual(a.base, b.base);
  assert.deepEqual(a.cenario, b.cenario);
  assert.equal(a.amostra.tamanho, 30);
  assert.ok(a.delta.tempoMedioViagem.absoluto !== 0 || a.delta.retidos !== 0);

  const outraSemente = { ...cenario, semente: 99 };
  const c = avaliarCenario(g, outraSemente);
  assert.equal(c.amostra.tamanho, 30);
  // Determinismo interno da outra semente.
  assert.deepEqual(c.delta, avaliarCenario(g, outraSemente).delta);
});

test("acrescentar/remover mudança e rótulo da barra", () => {
  let c = criarCenario({ nome: "Obra Av. Abdalla", regiaoId: "centro" });
  c = acrescentarMudanca(c, { tipo: "bloquear", trechoId: "EF" });
  c = acrescentarMudanca(c, { tipo: "inverter", trechoId: "BC" });
  c = acrescentarMudanca(c, { tipo: "bloquear", trechoId: "AD" });
  assert.equal(c.mudancas.length, 3);
  c = removerUltimaMudanca(c, { tipo: "bloquear", trechoId: "EF" });
  assert.equal(c.mudancas.length, 2);
  assert.deepEqual(
    c.mudancas.map((m) => `${m.tipo}:${m.trechoId}`),
    ["inverter:BC", "bloquear:AD"]
  );

  assert.equal(fmtDeltaTempoResumo(52), "+52 s");
  assert.equal(
    rotuloResumoCenario({
      nome: "Obra Av. Abdalla",
      mudancas: c.mudancas,
      deltaTempoMedio: 52,
    }),
    "Obra Av. Abdalla · 2 mudanças · +52 s"
  );
});

test("duplicarCenario gera novo id preservando mudanças", () => {
  const origem = criarCenario({
    nome: "Base",
    regiaoId: "polvilho",
    mudancas: [{ tipo: "inverter", trechoId: "AB" }],
  });
  const copia = duplicarCenario(origem, { nome: "Base 2" });
  assert.notEqual(copia.id, origem.id);
  assert.equal(copia.nome, "Base 2");
  assert.deepEqual(copia.mudancas, origem.mudancas);
});

test("adaptador: persistência, ativo, export/import e registrar mudança", () => {
  const storage = storageMemoria();
  const criado = criarESalvar(
    { nome: "Obra Av. Abdalla", regiaoId: "centro", mudancas: [] },
    storage
  );
  assert.equal(obterCenarioAtivo(storage).id, criado.id);
  assert.equal(storage.getItem(CHAVE_CENARIO_ATIVO), criado.id);
  assert.ok(storage.getItem(CHAVE_CENARIOS));

  const reg = registrarMudancaNoAtivo(
    { tipo: "bloquear", trechoId: "EF" },
    { regiaoId: "centro", storage }
  );
  assert.equal(reg.ok, true);
  assert.equal(obterCenarioAtivo(storage).mudancas.length, 1);

  const json = exportarCenarioJson(criado.id, storage);
  const storage2 = storageMemoria();
  const imp = importarCenariosJson(json, storage2);
  assert.equal(imp.ok, true);
  assert.equal(imp.importados.length, 1);
  assert.equal(imp.ativo.nome, "Obra Av. Abdalla");
  assert.equal(imp.ativo.mudancas[0].trechoId, "EF");

  const dup = duplicarCenarioSalvo(imp.ativo.id, { nome: "Cópia" }, storage2);
  assert.equal(dup.ok, true);
  assert.equal(listarCenarios({ storage: storage2 }).length, 2);

  definirCenarioAtivo(null, storage2);
  const garantido = garantirCenarioAtivoParaRegiao("centro", {
    nomeRegiao: "Centro",
    storage: storage2,
  });
  assert.equal(garantido.regiaoId, "centro");
  assert.ok(obterCenarioAtivo(storage2));
});

test("adaptador reexporta criarCenario (ponte do comparador)", () => {
  assert.equal(typeof criarCenarioAdaptador, "function");
  const c = criarCenarioAdaptador({ nome: "X", regiaoId: "r" });
  assert.equal(c.regiaoId, "r");
});

test("aplicarCenarioNaSessao restaura adicionarLigacao no controle vivo", () => {
  const ligacoes = [];
  const controle = {
    forcarBloqueioCenario(id) {
      return { permitido: Boolean(id) };
    },
    adicionarLigacao(mudanca) {
      ligacoes.push(mudanca);
      return { permitido: true, trechoId: mudanca.id ?? "AF" };
    },
  };
  const cenario = criarCenario({
    nome: "Nova via A–F",
    regiaoId: "centro",
    mudancas: [
      { tipo: "bloquear", trechoId: "EF" },
      {
        tipo: "adicionarLigacao",
        de: "A",
        para: "F",
        comprimento: 80,
        velocidade: 10,
        id: "AF",
      },
    ],
  });

  const semLigacao = aplicarCenarioNaSessao(controle, cenario, {
    tiposPermitidos: ["bloquear", "inverter", "lombada", "semaforo"],
  });
  assert.equal(semLigacao.aplicadas, 1);
  assert.equal(semLigacao.puladas.length, 1);
  assert.equal(semLigacao.puladas[0].mudanca.tipo, "adicionarLigacao");
  assert.equal(ligacoes.length, 0);

  const comLigacao = aplicarCenarioNaSessao(controle, cenario, {
    tiposPermitidos: ["bloquear", "inverter", "lombada", "semaforo", "adicionarLigacao"],
  });
  assert.equal(comLigacao.ok, true);
  assert.equal(comLigacao.aplicadas, 2);
  assert.equal(ligacoes.length, 1);
  assert.equal(ligacoes[0].tipo, "adicionarLigacao");
  assert.equal(ligacoes[0].de, "A");
  assert.equal(ligacoes[0].para, "F");
  assert.equal(ligacoes[0].id, "AF");
});

function geojsonDuasRuas() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          nome: "Rua A",
          tipo: "residential",
          sentidoUnico: 0,
          velocidade: 30,
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.87, -23.35],
            [-46.871, -23.351],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          nome: "Rua B",
          tipo: "residential",
          sentidoUnico: 0,
          velocidade: 30,
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.871, -23.351],
            [-46.872, -23.352],
          ],
        },
      },
    ],
  };
}

test("forcarBloqueioCenario preenche mudancasDoCenario na restauração F5", async () => {
  const { ControleBloqueio } = await import("../../js/adaptador/controleBloqueio.js");
  const controle = new ControleBloqueio(geojsonDuasRuas(), {
    quantidadeVeiculos: 0,
    congestionamento: false,
  });
  const trechoId = controle.trechos()[0]?.id;
  assert.ok(trechoId);

  assert.deepEqual(controle.mudancasDoCenario(), []);

  const cenario = criarCenario({
    nome: "Obra",
    regiaoId: "centro",
    mudancas: [{ tipo: "bloquear", trechoId }],
  });
  const r = aplicarCenarioNaSessao(controle, cenario, {
    tiposPermitidos: ["bloquear"],
  });
  assert.equal(r.ok, true);
  assert.equal(r.aplicadas, 1);
  assert.equal(controle.bloqueios().some((b) => b.id === trechoId), true);
  assert.deepEqual(controle.mudancasDoCenario(), [
    { tipo: "bloquear", trechoId },
  ]);

  // Idempotente: segundo restore não duplica o histórico live.
  aplicarCenarioNaSessao(controle, cenario, { tiposPermitidos: ["bloquear"] });
  assert.deepEqual(controle.mudancasDoCenario(), [
    { tipo: "bloquear", trechoId },
  ]);

  controle.removerBloqueio(trechoId);
  assert.deepEqual(controle.mudancasDoCenario(), []);
  controle.encerrar();
});

test("solicitarBloqueio live preenche mudancasDoCenario", async () => {
  const { ControleBloqueio } = await import("../../js/adaptador/controleBloqueio.js");
  const controle = new ControleBloqueio(geojsonDuasRuas(), {
    quantidadeVeiculos: 0,
    congestionamento: false,
  });
  const trechoId = controle.trechos()[0]?.id;
  assert.ok(trechoId);

  const r = controle.solicitarBloqueio(trechoId);
  assert.equal(r.permitido, true);
  assert.deepEqual(controle.mudancasDoCenario(), [
    { tipo: "bloquear", trechoId },
  ]);

  controle.removerBloqueio(trechoId);
  assert.deepEqual(controle.mudancasDoCenario(), []);
  controle.encerrar();
});

test("restore F5 de inversão e dispositivos preenche mudancasDoCenario", async () => {
  const { ControleBloqueio } = await import("../../js/adaptador/controleBloqueio.js");
  const controle = new ControleBloqueio(geojsonDuasRuas(), {
    quantidadeVeiculos: 0,
    congestionamento: false,
  });
  const trechos = controle.trechos();
  const trechoInvertir = trechos[0]?.id;
  const trechoDisp = trechos[1]?.id ?? trechos[0]?.id;
  assert.ok(trechoInvertir);
  assert.ok(trechoDisp);

  const meio = controle.trecho(trechoDisp)?.meio;
  assert.ok(meio);

  const cenario = criarCenario({
    nome: "Mitigações",
    regiaoId: "centro",
    mudancas: [
      { tipo: "inverter", trechoId: trechoInvertir },
      {
        tipo: "lombada",
        trechoId: trechoDisp,
        distancia: 5,
        fracao: 0.4,
        coordenadas: meio,
        velocidadeMaxKmh: 20,
        raioEfeito: 25,
        id: "lombada-restore-1",
      },
      {
        tipo: "semaforo",
        trechoId: trechoDisp,
        distancia: 12,
        fracao: 0.7,
        coordenadas: meio,
        estadoInicial: "verde",
        sentido: "ambos",
        id: "semaforo-restore-1",
      },
    ],
  });

  const r = aplicarCenarioNaSessao(controle, cenario, {
    tiposPermitidos: ["inverter", "lombada", "semaforo"],
  });
  assert.equal(r.ok, true);
  assert.equal(r.aplicadas, 3);

  const hist = controle.mudancasDoCenario();
  assert.equal(hist.length, 3);
  assert.deepEqual(hist[0], { tipo: "inverter", trechoId: trechoInvertir });
  assert.equal(hist[1].tipo, "lombada");
  assert.equal(hist[1].id, "lombada-restore-1");
  assert.equal(hist[1].trechoId, trechoDisp);
  assert.equal(hist[2].tipo, "semaforo");
  assert.equal(hist[2].id, "semaforo-restore-1");

  const sentidoAposPrimeiro = controle.trecho(trechoInvertir)?.sentido;

  // Idempotente: reaplicar não duplica histórico nem reinverte.
  aplicarCenarioNaSessao(controle, cenario, {
    tiposPermitidos: ["inverter", "lombada", "semaforo"],
  });
  assert.equal(controle.mudancasDoCenario().length, 3);
  assert.equal(controle.trecho(trechoInvertir)?.sentido, sentidoAposPrimeiro);
  assert.equal(controle.dispositivos().length, 2);

  controle.removerDispositivo("lombada-restore-1");
  assert.equal(
    controle.mudancasDoCenario().some((m) => m.id === "lombada-restore-1"),
    false
  );
  controle.encerrar();
});

test("adicionarLombada/Semaforo live preenche mudancasDoCenario", async () => {
  const { ControleBloqueio } = await import("../../js/adaptador/controleBloqueio.js");
  const controle = new ControleBloqueio(geojsonDuasRuas(), {
    quantidadeVeiculos: 0,
    congestionamento: false,
  });
  const trechoId = controle.trechos()[0]?.id;
  const meio = controle.trecho(trechoId)?.meio;
  assert.ok(meio);

  const lombada = controle.adicionarLombada({
    lat: meio[0],
    lon: meio[1],
    trechoId,
  });
  assert.equal(lombada.permitido, true);
  assert.equal(controle.mudancasDoCenario()[0]?.tipo, "lombada");
  assert.equal(controle.mudancasDoCenario()[0]?.id, lombada.dispositivo.id);

  const semaforo = controle.adicionarSemaforo({
    lat: meio[0],
    lon: meio[1],
    trechoId,
  });
  assert.equal(semaforo.permitido, true);
  assert.equal(controle.mudancasDoCenario().length, 2);
  assert.equal(controle.mudancasDoCenario()[1]?.tipo, "semaforo");

  controle.removerTodosDispositivos();
  assert.deepEqual(controle.mudancasDoCenario(), []);
  controle.encerrar();
});

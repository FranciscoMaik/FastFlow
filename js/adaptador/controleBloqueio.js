// Única porta de entrada da interface para o motor. A UI chama estes métodos e
// escuta os eventos daqui; ela nunca mexe no grafo ou na simulação diretamente.
import { Emissor } from "../motor/eventos.js";
import { Simulacao } from "../motor/simulacao.js";
import { validarBloqueio } from "../motor/validacao.js";
import { avaliar } from "../motor/avaliadorImpacto.js";
import {
  avaliarCustoBloqueios,
  chaveCustoBloqueios,
  criarCacheCustoBloqueios,
  DEMANDA_CUSTO_BLOQUEIOS,
} from "../motor/custoBloqueios.js";
import {
  avaliarDesvioRecomendado,
  DEMANDA_DESVIO,
  MAX_CANDIDATOS,
} from "../motor/desvioRecomendado.js";
import {
  obterPerfilPeriodo,
  PERFIS_PERIODO,
} from "../motor/demandaFixa.js";
import {
  oportunidadesLigacao as ranquearOportunidadesLigacao,
  oportunidadesLigacaoAsync as ranquearOportunidadesLigacaoAsync,
  DEMANDA_ONDE_CONSTRUIR,
  MAX_CANDIDATOS_AVALIAR,
  MAX_PARES_ESPACIAIS,
  TOP_ONDE_CONSTRUIR,
  DIST_MAX_M,
  DIST_MIN_M,
} from "../motor/oportunidadesLigacao.js";
import {
  aplicar,
  aplicarEmCopia,
  reverter,
  serializarMudanca,
  serializarLista,
} from "../motor/mudanca.js";
import {
  snapshotMetricasDispositivos,
  criarAcumuladorMetricasDispositivos,
  prepararGrafoCenarioDispositivo,
} from "../motor/metricasDispositivos.js";
import {
  compararPlanosFase,
  DEMANDA_COMPARAR_PLANOS,
  PLANOS_PRESET,
  taxaChegadaDeMetricas,
} from "../motor/compararPlanosFase.js";
import { criarRastreadorFugaRota } from "../motor/fugaRota.js";
import { construirGrafo, pontoNaGeometria, distanciaMetros } from "./carregarMalha.js";
import { projetarPontoNaMalha, snapParaNoMaisProximo } from "../motor/geometriaSnap.js";

/** Amostra fixa da prévia de bloqueio (determinística, <1 s na malha típica). */
const DEMANDA_PREVIEW = Object.freeze({ n: 200, semente: 1 });
/** Prévia de dispositivo: amostra menor (ajuste analítico de peso; sem BPR dinâmico). */
const DEMANDA_PREVIEW_DISPOSITIVO = Object.freeze({ n: 120, semente: 3 });
/** Prévia de ligação: amostra intermediária (F2 OD + F3 adicionarLigacao; sem BPR dinâmico). */
const DEMANDA_PREVIEW_LIGACAO = Object.freeze({ n: 160, semente: 5 });

/** Período padrão da prévia de bloqueio (impacto de obra em pico). */
export const PERIODO_PREVIEW_PADRAO = "pico";

/**
 * Monta opções de demanda + BPR analítico para a prévia de bloqueio.
 * @param {import("../motor/grafo.js").Grafo} grafo
 * @param {{
 *   demanda?: object,
 *   periodo?: string,
 *   bprAnalitico?: boolean,
 * }} [opcoes]
 */
function opcoesPreviewBloqueio(
  grafo,
  { demanda, periodo = PERIODO_PREVIEW_PADRAO, bprAnalitico = false } = {}
) {
  const perfil = obterPerfilPeriodo(periodo) ?? PERFIS_PERIODO.pico;
  const demandaResolvida =
    demanda ??
    ({
      periodo: perfil.id,
      grafo,
      n: perfil.n,
      semente: perfil.semente,
      concentracao: perfil.concentracao,
    });
  return {
    perfil,
    demanda: demandaResolvida,
    bprAnalitico: bprAnalitico
      ? { escalaVolume: perfil.escalaVolumeBpr, iteracoes: 1 }
      : false,
  };
}

function trechoEntreNos(grafo, de, para) {
  for (const t of grafo.trechos.values()) {
    const ext = t.meta?.extremidades;
    if (!ext || ext.length < 2) continue;
    if ((ext[0] === de && ext[1] === para) || (ext[0] === para && ext[1] === de)) {
      return t.id;
    }
  }
  return null;
}

export async function carregarControle(urlMalha, opcoes) {
  const resposta = await fetch(urlMalha);
  if (!resposta.ok) throw new Error(`Não foi possível carregar a malha (${resposta.status}).`);
  return new ControleBloqueio(await resposta.json(), opcoes);
}

export class ControleBloqueio extends Emissor {
  #grafo;
  #simulacao;
  #bloqueios = new Map(); // trechoId -> { horario, rotasRecalculadas }
  #ultimoRecalculo = 0;
  #cacheCusto = criarCacheCustoBloqueios();
  #acumuladorMetricas = criarAcumuladorMetricasDispositivos();
  #rastreadorFuga = criarRastreadorFugaRota();
  #dispositivoFocado = null;
  /** Mudanças F3 aplicadas ao vivo (gancho F5 / comparador). */
  #mudancasCenario = [];
  /** @type {null | ((mudanca: object, contexto: object) => void | Promise<void>)} */
  #ganchoAnexarCenario = null;
  /** undos das ligações aplicadas nesta sessão (trechoId → undo). */
  #undosLigacao = new Map();
  selecionado = null;

  constructor(
    geojson,
    {
      quantidadeVeiculos = 60,
      fatorTempo = 4,
      aleatorio,
      intervaloSpawn = 0.2,
      congestionamento = true,
    } = {}
  ) {
    super();
    this.#grafo = construirGrafo(geojson);
    this.#simulacao = new Simulacao(this.#grafo, {
      fatorTempo,
      aleatorio,
      intervaloSpawn,
      congestionamento,
    });
    this.#simulacao.definirQuantidade(quantidadeVeiculos);

    this.#simulacao.on("rotasRecalculadas", (e) => {
      this.#ultimoRecalculo = e.quantidade;
      this.emitir("rotasRecalculadas", e);
    });
    this.#simulacao.on("congestionamentoAtualizado", (e) =>
      this.emitir("congestionamentoAtualizado", e)
    );
    this.#grafo.on("bloqueioAlterado", (e) => this.emitir("bloqueioAlterado", e));

    this.#simulacao.dispositivos.on("faseAlterada", (s) => this.emitir("faseSemafóricaAlterada", s));
    this.#simulacao.dispositivos.on("dispositivoAdicionado", () => this.emitir("dispositivosAlterados", this.dispositivos()));
    this.#simulacao.dispositivos.on("dispositivoRemovido", () => this.emitir("dispositivosAlterados", this.dispositivos()));
    this.#simulacao.dispositivos.on("dispositivoAtualizado", () => this.emitir("dispositivosAlterados", this.dispositivos()));
  }

  // ---------- Consulta ----------

  trecho(id) {
    const t = this.#grafo.trechos.get(id);
    if (!t) return null;
    const veiculosNoTrecho = this.#simulacao
      .posicoesDeSaida()
      .filter((p) => this.#grafo.arestas.get(p.arestaId).trechoId === id).length;
    return {
      id: t.id,
      nome: t.meta.nome ?? "Via sem nome",
      temNome: Boolean(t.meta.nome),
      referencia: t.meta.referencia,
      tipo: t.meta.tipo,
      sentidoUnico: t.meta.sentidoUnico,
      comprimento: t.meta.comprimento,
      pontos: t.meta.pontos,
      meio: t.meta.meio,
      bloqueado: t.bloqueado,
      veiculosNoTrecho,
    };
  }

  trechos() {
    return [...this.#grafo.trechos.keys()].map((id) => this.trecho(id));
  }

  // Logradouros com nome, em ordem alfabética, e os trechos de cada um.
  logradouros() {
    const mapa = new Map();
    for (const t of this.#grafo.trechos.values()) {
      if (!t.meta.nome) continue;
      if (!mapa.has(t.meta.nome)) mapa.set(t.meta.nome, []);
      mapa.get(t.meta.nome).push(t.id);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([nome, trechos]) => ({ nome, trechos }));
  }

  bloqueios() {
    return [...this.#bloqueios.entries()].map(([id, info]) => ({ ...this.trecho(id), ...info }));
  }

  veiculos() {
    return this.#simulacao.veiculos.map((v) => {
      const aresta = this.#grafo.arestas.get(v.rota[v.indice]);
      const [lat, lon] = pontoNaGeometria(aresta.geometria, v.progresso);
      return { id: v.id, arestaId: aresta.id, lat, lon, status: v.status, velocidade: v.velocidade };
    });
  }

  /** Simulação ao vivo com F4 (BPR) ligado. */
  get congestionamentoAtivo() {
    return Boolean(this.#simulacao.congestionamentoAtivo);
  }

  estatisticas() {
    const listaDispositivos = this.#simulacao.dispositivos.listarTodos();
    return {
      ...this.#simulacao.estatisticas(),
      bloqueios: this.#bloqueios.size,
      lombadas: this.#simulacao.dispositivos.listarLombadas().length,
      semaforos: this.#simulacao.dispositivos.listarSemaforos().length,
      dispositivos: listaDispositivos.length,
    };
  }

  // ---------- Dispositivos de Tráfego (Lombadas e Semáforos) ----------

  projetarPonto(lat, lon, raioMaxMetros = 50, trechoIdPreferido = null) {
    return projetarPontoNaMalha([lat, lon], this.#grafo, raioMaxMetros, trechoIdPreferido);
  }

  /**
   * Snap magnético ao cruzamento mais próximo (ferramenta Nova ligação).
   * @param {number} lat
   * @param {number} lon
   * @param {number} [raioMaxMetros=40]
   */
  snapParaNo(lat, lon, raioMaxMetros = 40) {
    return snapParaNoMaisProximo([lat, lon], this.#grafo, raioMaxMetros);
  }

  /**
   * Coordenadas `[lat, lon]` de um cruzamento (nó), ou `null`.
   * @param {string} noId
   * @returns {[number, number] | null}
   */
  coordenadasNo(noId) {
    const n = this.#grafo.nos.get(noId);
    if (!n || n.lat == null || n.lon == null) return null;
    return [n.lat, n.lon];
  }

  /**
   * Comprimento geodésico entre dois nós existentes (metros).
   * @param {string} de
   * @param {string} para
   */
  comprimentoEntreNos(de, para) {
    const a = this.#grafo.nos.get(de);
    const b = this.#grafo.nos.get(para);
    if (!a || !b || a.lat == null || b.lat == null) return null;
    return distanciaMetros([a.lat, a.lon], [b.lat, b.lon]);
  }

  /**
   * “Onde construir?” — top ligações curtas (&lt;300 m) por ganho de tempo F2.
   * Caps: grade espacial → ≤12 pares mais curtos → ≤10 avaliações OD=60.
   * Preferir `oportunidadesLigacaoAsync` na UI (progresso + yield por frame).
   *
   * @param {{
   *   maxDist?: number,
   *   maxParesEspaciais?: number,
   *   maxCandidatos?: number,
   *   maxResultados?: number,
   *   demanda?: { n?: number, semente?: number },
   * }} [opcoes]
   */
  oportunidadesLigacao(opcoes = {}) {
    try {
      return ranquearOportunidadesLigacao(this.#grafo, {
        maxDist: DIST_MAX_M,
        minDist: DIST_MIN_M,
        maxParesEspaciais: MAX_PARES_ESPACIAIS,
        maxCandidatos: MAX_CANDIDATOS_AVALIAR,
        maxResultados: TOP_ONDE_CONSTRUIR,
        demanda: DEMANDA_ONDE_CONSTRUIR,
        ...opcoes,
      });
    } catch (err) {
      return {
        ok: false,
        motivo: err?.message || "Falha ao buscar oportunidades de ligação.",
        itens: [],
      };
    }
  }

  /**
   * Variante assíncrona de `oportunidadesLigacao` com `onProgress` / `AbortSignal`.
   * @param {Parameters<ControleBloqueio["oportunidadesLigacao"]>[0]} [opcoes]
   * @param {{ onProgress?: Function, signal?: AbortSignal }} [ctrl]
   */
  oportunidadesLigacaoAsync(opcoes = {}, ctrl = {}) {
    return ranquearOportunidadesLigacaoAsync(
      this.#grafo,
      {
        maxDist: DIST_MAX_M,
        minDist: DIST_MIN_M,
        maxParesEspaciais: MAX_PARES_ESPACIAIS,
        maxCandidatos: MAX_CANDIDATOS_AVALIAR,
        maxResultados: TOP_ONDE_CONSTRUIR,
        demanda: DEMANDA_ONDE_CONSTRUIR,
        ...opcoes,
      },
      ctrl
    );
  }

  /**
   * Prévia F2 de `{ tipo:'adicionarLigacao', ... }` (sem mutar a simulação).
   *
   * @param {{ de: string, para: string, comprimento?: number, velocidade?: number, velocidadeKmh?: number, sentido?: 0|1|-1, id?: string, nome?: string }} entrada
   * @param {{ demanda?: { n?: number, semente?: number } }} [opcoes]
   */
  avaliarImpactoLigacao(entrada, { demanda = DEMANDA_PREVIEW_LIGACAO } = {}) {
    if (!entrada?.de || !entrada?.para) {
      return { ok: false, motivo: "Informe as duas interseções (de e para)." };
    }
    if (!this.#grafo.nos.has(entrada.de) || !this.#grafo.nos.has(entrada.para)) {
      return { ok: false, motivo: "Interseção inexistente na malha." };
    }
    if (entrada.de === entrada.para) {
      return { ok: false, motivo: "As interseções de origem e destino devem ser distintas." };
    }
    const existente = trechoEntreNos(this.#grafo, entrada.de, entrada.para);
    if (existente) {
      return { ok: false, motivo: `Já existe ligação direta entre esses cruzamentos (${existente}).` };
    }

    const comprimento =
      entrada.comprimento ?? this.comprimentoEntreNos(entrada.de, entrada.para);
    if (!(comprimento > 0)) {
      return { ok: false, motivo: "Não foi possível estimar o comprimento da ligação." };
    }

    const velocidade =
      entrada.velocidade ??
      (entrada.velocidadeKmh != null ? Number(entrada.velocidadeKmh) / 3.6 : 40 / 3.6);
    const sentido = entrada.sentido === undefined || entrada.sentido === null ? 0 : Number(entrada.sentido);
    const mudanca = {
      tipo: "adicionarLigacao",
      de: String(entrada.de),
      para: String(entrada.para),
      comprimento,
      velocidade,
      sentido,
      ...(entrada.id ? { id: String(entrada.id) } : {}),
      ...(entrada.nome ? { nome: String(entrada.nome) } : { nome: "Nova ligação" }),
    };

    const copia = aplicarEmCopia(this.#grafo, mudanca);
    if (!copia.ok) {
      return { ok: false, motivo: copia.motivo || "Não foi possível simular a ligação." };
    }
    const trechoId = copia.resultados?.[0]?.trechoId;
    if (!trechoId) {
      return { ok: false, motivo: "Falha ao obter id do trecho simulado." };
    }

    const avaliacao = avaliar({
      grafo: this.#grafo,
      demanda,
      grafoCenario: copia.estado.grafo,
      trechoAfetado: { nos: [mudanca.de, mudanca.para], id: trechoId },
      topN: 3,
    });

    return {
      ok: true,
      mudanca: { ...mudanca, id: trechoId },
      trechoId,
      nome: mudanca.nome,
      avaliacao,
      bprSimulacao: this.congestionamentoAtivo,
      aviso: this.congestionamentoAtivo
        ? "Prévia analítica F2: sem BPR dinâmico nesta estimativa (paradoxo de Braess não modelado aqui). Na simulação ao vivo, congestionamento BPR está ativo."
        : "Prévia analítica F2: sem congestionamento dinâmico (paradoxo de Braess não modelado aqui).",
    };
  }

  /**
   * Aplica `{ tipo:'adicionarLigacao' }` na malha viva (F3) e registra gancho F5.
   * @param {{ de: string, para: string, comprimento?: number, velocidade?: number, velocidadeKmh?: number, sentido?: 0|1|-1, id?: string, nome?: string }} entrada
   */
  adicionarLigacao(entrada) {
    if (!entrada?.de || !entrada?.para) {
      return { permitido: false, motivo: "Informe as duas interseções (de e para)." };
    }
    if (!this.#grafo.nos.has(entrada.de) || !this.#grafo.nos.has(entrada.para)) {
      return { permitido: false, motivo: "Interseção inexistente na malha." };
    }
    if (entrada.de === entrada.para) {
      return { permitido: false, motivo: "As interseções de origem e destino devem ser distintas." };
    }
    const existente = trechoEntreNos(this.#grafo, entrada.de, entrada.para);
    if (existente) {
      return { permitido: false, motivo: `Já existe ligação direta entre esses cruzamentos (${existente}).` };
    }

    const comprimento =
      entrada.comprimento ?? this.comprimentoEntreNos(entrada.de, entrada.para);
    if (!(comprimento > 0)) {
      return { permitido: false, motivo: "Não foi possível estimar o comprimento da ligação." };
    }
    const velocidade =
      entrada.velocidade ??
      (entrada.velocidadeKmh != null ? Number(entrada.velocidadeKmh) / 3.6 : 40 / 3.6);
    const sentido = entrada.sentido === undefined || entrada.sentido === null ? 0 : Number(entrada.sentido);
    const mudanca = {
      tipo: "adicionarLigacao",
      de: String(entrada.de),
      para: String(entrada.para),
      comprimento,
      velocidade,
      sentido,
      ...(entrada.id ? { id: String(entrada.id) } : {}),
      ...(entrada.nome ? { nome: String(entrada.nome) } : { nome: "Nova ligação" }),
    };

    const r = aplicar(this.#grafo, mudanca);
    if (!r.ok) return { permitido: false, motivo: r.motivo };

    const trechoId = r.resultado?.trechoId;
    if (trechoId && r.undo) this.#undosLigacao.set(trechoId, r.undo);

    this.#registrarMudancaCenario(r.mudanca, { trechoId, undo: r.undo });
    this.emitir("ligacoesAlteradas", { trechoId, acao: "adicionar", trecho: this.trecho(trechoId) });

    return {
      permitido: true,
      trechoId,
      trecho: this.trecho(trechoId),
      mudanca: r.mudanca,
      undo: r.undo,
    };
  }

  /**
   * Remove uma ligação criada nesta sessão (via token undo F3).
   * @param {string} trechoId
   */
  removerLigacao(trechoId) {
    const undo = this.#undosLigacao.get(trechoId);
    if (!undo) {
      return { removido: false, motivo: "Ligação não pode ser desfeita (fora desta sessão)." };
    }
    const r = reverter(this.#grafo, undo);
    if (!r.ok) return { removido: false, motivo: r.motivo };
    this.#undosLigacao.delete(trechoId);
    this.#mudancasCenario = this.#mudancasCenario.filter((m) => m.id !== trechoId);
    this.emitir("ligacoesAlteradas", { trechoId, acao: "remover" });
    return { removido: true, trechoId };
  }

  /** Lista serializada das mudanças F3 aplicadas ao vivo (gancho F5). */
  mudancasDoCenario() {
    return serializarLista(this.#mudancasCenario);
  }

  /**
   * Gancho F5: se o agente de cenários existir, a UI/adaptador pode registrar
   * um callback para anexar cada mudança ao cenário ativo.
   * @param {null | ((mudanca: object, contexto: object) => void | Promise<void>)} fn
   */
  definirGanchoCenario(fn) {
    this.#ganchoAnexarCenario = typeof fn === "function" ? fn : null;
  }

  #registrarMudancaCenario(mudanca, contexto = {}) {
    try {
      const canonica = serializarMudanca(mudanca);
      this.#mudancasCenario.push(canonica);
      const gancho = this.#ganchoAnexarCenario;
      if (gancho) {
        Promise.resolve(gancho(canonica, contexto)).catch(() => {
          /* best-effort — F5 opcional */
        });
      }
      this.emitir("mudancaRegistrada", { mudanca: canonica, ...contexto });
    } catch {
      /* serialização falhou — não bloqueia a aplicação live */
    }
  }

  /** Serializa dispositivo vivo no formato F5 (`registrarMudancaNoAtivo`). */
  #mudancaDeDispositivo(d) {
    if (!d) return null;
    if (d.tipo === "lombada") {
      return {
        tipo: "lombada",
        trechoId: d.trechoId,
        distancia: d.distancia,
        fracao: d.fracao,
        coordenadas: d.coordenadas,
        velocidadeMaxKmh: d.velocidadeMaxKmh,
        raioEfeito: d.raioEfeito,
        id: d.id,
      };
    }
    return {
      tipo: "semaforo",
      trechoId: d.trechoId,
      distancia: d.distancia,
      fracao: d.fracao,
      coordenadas: d.coordenadas,
      tempos: d.tempos,
      estadoInicial: d.estado,
      sentido: d.sentido,
      id: d.id,
    };
  }

  #registrarDispositivoNoCenario(dispositivo, contexto = {}) {
    const mudanca = this.#mudancaDeDispositivo(dispositivo);
    if (!mudanca) return;
    const jaNoHistorico =
      mudanca.id && this.#mudancasCenario.some((m) => m.id === mudanca.id);
    if (!jaNoHistorico) {
      this.#registrarMudancaCenario(mudanca, contexto);
    }
  }

  adicionarLombada({
    lat,
    lon,
    trechoId = null,
    velocidadeMaxKmh = 20,
    raioEfeito = 25,
    id = null,
  }) {
    if (id && this.#simulacao.dispositivos.obter(id)) {
      const dispositivo = this.dispositivo(id);
      this.#registrarDispositivoNoCenario(dispositivo, { restaurado: true });
      return { permitido: true, dispositivo, jaExistente: true };
    }
    const snap = this.projetarPonto(lat, lon, 50, trechoId);
    if (!snap.valido) {
      return { permitido: false, motivo: snap.motivo };
    }
    const lombada = this.#simulacao.dispositivos.adicionarLombada({
      ...(id ? { id } : {}),
      trechoId: snap.trechoId,
      distancia: snap.distancia,
      fracao: snap.fracao,
      coordenadas: snap.coordenadas,
      velocidadeMaxKmh,
      raioEfeito,
    });
    const dispositivo = this.dispositivo(lombada.id);
    this.#registrarDispositivoNoCenario(dispositivo);
    return { permitido: true, dispositivo };
  }

  adicionarSemaforo({
    lat,
    lon,
    trechoId = null,
    tempos,
    estadoInicial = "verde",
    sentido = "ambos",
    id = null,
  }) {
    if (id && this.#simulacao.dispositivos.obter(id)) {
      const dispositivo = this.dispositivo(id);
      this.#registrarDispositivoNoCenario(dispositivo, { restaurado: true });
      return { permitido: true, dispositivo, jaExistente: true };
    }
    const snap = this.projetarPonto(lat, lon, 50, trechoId);
    if (!snap.valido) {
      return { permitido: false, motivo: snap.motivo };
    }
    const semaforo = this.#simulacao.dispositivos.adicionarSemaforo({
      ...(id ? { id } : {}),
      trechoId: snap.trechoId,
      distancia: snap.distancia,
      fracao: snap.fracao,
      coordenadas: snap.coordenadas,
      estadoInicial,
      tempos,
      sentido,
    });
    const dispositivo = this.dispositivo(semaforo.id);
    this.#registrarDispositivoNoCenario(dispositivo);
    return { permitido: true, dispositivo };
  }

  removerDispositivo(id) {
    const ok = this.#simulacao.dispositivos.removerDispositivo(id);
    if (ok) {
      this.#rastreadorFuga.remover(id);
      this.#mudancasCenario = this.#mudancasCenario.filter((m) => m.id !== id);
    }
    return { removido: ok };
  }

  removerTodosDispositivos() {
    const qtd = this.#simulacao.dispositivos.removerTodos();
    this.#rastreadorFuga.limpar();
    this.#mudancasCenario = this.#mudancasCenario.filter(
      (m) => m.tipo !== "lombada" && m.tipo !== "semaforo"
    );
    return { removidos: qtd };
  }

  reposicionarDispositivo(id, { lat, lon }) {
    const snap = this.projetarPonto(lat, lon);
    if (!snap.valido) {
      return { permitido: false, motivo: snap.motivo };
    }
    const ok = this.#simulacao.dispositivos.reposicionar(id, {
      trechoId: snap.trechoId,
      distancia: snap.distancia,
      fracao: snap.fracao,
      coordenadas: snap.coordenadas,
    });
    return { permitido: ok, dispositivo: this.dispositivo(id) };
  }

  configurarSemaforo(id, { verde, amarelo, vermelho }) {
    const ok = this.#simulacao.dispositivos.configurarSemaforo(id, { verde, amarelo, vermelho });
    return { configurado: ok, dispositivo: this.dispositivo(id) };
  }

  alternarSemaforo(id) {
    const novoEstado = this.#simulacao.dispositivos.alternarSemaforo(id);
    return { alternado: Boolean(novoEstado), estado: novoEstado };
  }

  dispositivo(id) {
    const d = this.#simulacao.dispositivos.obter(id);
    if (!d) return null;
    const trecho = this.trecho(d.trechoId);
    return {
      ...d,
      nomeTrecho: trecho?.nome ?? "Via sem nome",
      referenciaTrecho: trecho?.referencia ?? null,
    };
  }

  dispositivos() {
    return this.#simulacao.dispositivos.listarTodos().map((d) => this.dispositivo(d.id));
  }

  lombadas() {
    return this.#simulacao.dispositivos.listarLombadas().map((d) => this.dispositivo(d.id));
  }

  semaforos() {
    return this.#simulacao.dispositivos.listarSemaforos().map((d) => this.dispositivo(d.id));
  }

  focarDispositivo(id) {
    this.#dispositivoFocado = id && this.#simulacao.dispositivos.obter(id) ? id : null;
    this.emitir("dispositivoFocado", this.#dispositivoFocado);
    return this.#dispositivoFocado;
  }

  get dispositivoFocado() {
    return this.#dispositivoFocado;
  }

  /**
   * Métricas ao vivo por dispositivo (velocidade, fila/espera/transbordo, fuga de rota F4).
   * Acumula fila máx/média e espera entre chamadas de `avancar`.
   * Baseline de fuga: volume BPR no instante da colocação/reposicionamento.
   */
  metricasDispositivos() {
    const dispositivos = this.#simulacao.dispositivos.listarTodos();
    this.#rastreadorFuga.sincronizar(
      dispositivos,
      this.#grafo,
      this.#simulacao.veiculos
    );
    const snapshot = snapshotMetricasDispositivos(
      this.#grafo,
      this.#simulacao.veiculos,
      dispositivos
    );
    const recalculadasBpr =
      this.#simulacao.ultimoCongestionamento?.recalculadas ?? 0;
    /** @type {Record<string, object>} */
    const porId = {};
    for (const item of snapshot) {
      const acum = item.tipo === "semaforo" ? this.#acumuladorMetricas.ler(item.id) : null;
      const dispositivo = dispositivos.find((d) => d.id === item.id);
      const fuga = dispositivo
        ? this.#rastreadorFuga.avaliar(dispositivo, this.#grafo, this.#simulacao.veiculos, {
            recalculadasBpr,
          })
        : null;
      porId[item.id] = {
        ...item,
        filaMax: acum?.filaMax ?? item.fila?.atual ?? 0,
        filaMedia: acum?.filaMedia ?? item.fila?.atual ?? null,
        esperaMedia: acum?.esperaMedia ?? null,
        transbordo: acum?.transbordo ?? item.fila?.transbordo ?? false,
        fuga,
      };
    }
    return { porId, lista: Object.values(porId) };
  }

  /**
   * Compara 2–3 planos de fase (V/A/Vm) do semáforo: espera/fila analíticas + Δ F2 barato.
   * @param {string} id
   * @param {Array<{ id?: string, rotulo?: string, tempos: object }>} planos
   * @param {{ comDeltaF2?: boolean, demanda?: object, referencia?: number }} [opcoes]
   */
  compararPlanosFaseSemaforo(
    id,
    planos,
    {
      comDeltaF2 = true,
      demanda = DEMANDA_COMPARAR_PLANOS,
      referencia = 0,
    } = {}
  ) {
    const d = this.#simulacao.dispositivos.obter(id);
    if (!d || d.tipo !== "semaforo") {
      return { ok: false, motivo: "Semáforo não encontrado." };
    }
    if (!Array.isArray(planos) || planos.length < 2) {
      return { ok: false, motivo: "Informe 2 ou 3 planos de fase." };
    }

    const met = this.metricasDispositivos()?.porId?.[id];
    const taxaChegada = taxaChegadaDeMetricas({
      filaMedia: met?.filaMedia,
      esperaMedia: met?.esperaMedia,
    });

    return compararPlanosFase(planos, {
      taxaChegada,
      referencia,
      grafo: this.#grafo,
      trechoId: d.trechoId,
      demanda,
      comDeltaF2,
    });
  }

  /** Presets Curto (12/3/10) e Longo (20/3/15) para o popup. */
  presetsPlanosFaseSemaforo() {
    return PLANOS_PRESET.map((p) => ({
      id: p.id,
      rotulo: p.rotulo,
      tempos: { ...p.tempos },
    }));
  }

  /**
   * Prévia analítica F2 de colocar lombada/semáforo (ajuste de peso; sem BPR dinâmico).
   * Aceita um dispositivo existente ou uma mudança `{ tipo, trechoId, ... }`.
   */
  avaliarImpactoDispositivo(entrada, { demanda = DEMANDA_PREVIEW_DISPOSITIVO } = {}) {
    let mudanca = entrada;
    if (typeof entrada === "string") {
      const d = this.#simulacao.dispositivos.obter(entrada);
      if (!d) return null;
      mudanca =
        d.tipo === "lombada"
          ? {
              tipo: "lombada",
              trechoId: d.trechoId,
              distancia: d.distancia,
              fracao: d.fracao,
              coordenadas: d.coordenadas,
              velocidadeMaxKmh: d.velocidadeMaxKmh,
              raioEfeito: d.raioEfeito,
            }
          : {
              tipo: "semaforo",
              trechoId: d.trechoId,
              distancia: d.distancia,
              fracao: d.fracao,
              coordenadas: d.coordenadas,
              tempos: { ...d.tempos },
              sentido: d.sentido,
            };
    }
    if (!mudanca?.tipo || !mudanca.trechoId || !this.#grafo.trechos.has(mudanca.trechoId)) {
      return null;
    }

    const prep = prepararGrafoCenarioDispositivo(this.#grafo, mudanca);
    if (!prep.ok) return { ok: false, motivo: prep.motivo };

    const trecho = this.#grafo.trechos.get(mudanca.trechoId);
    // Pesos analíticos já embutidos em grafoCenario (F3 lombada/semaforo sozinho
    // não altera peso de aresta — F2 OD ignoraria o dispositivo).
    const avaliacao = avaliar({
      grafo: this.#grafo,
      demanda,
      grafoCenario: prep.grafo,
      trechoAfetado: mudanca.trechoId,
      topN: 3,
    });

    return {
      ok: true,
      tipo: mudanca.tipo,
      trechoId: mudanca.trechoId,
      nome: trecho.meta.nome ?? "Via sem nome",
      avaliacao,
      analitico: true,
      bprSimulacao: this.congestionamentoAtivo,
      aviso: this.congestionamentoAtivo
        ? "Estimativa analítica (ajuste de tempo de travessia). Prévia sem BPR dinâmico — na simulação ao vivo, congestionamento BPR e fuga de rota estão ativos."
        : "Estimativa analítica (ajuste de tempo de travessia). Sem congestionamento dinâmico da simulação (prévia F2).",
    };
  }

  // ---------- Ações de Bloqueio ----------

  selecionar(id) {
    this.selecionado = id && this.#grafo.trechos.has(id) ? id : null;
    this.emitir("selecaoAlterada", this.selecionado);
  }

  /**
   * Prévia analítica de bloquear o trecho (sem mutar a simulação).
   * Determinística para a mesma malha + demanda + estado atual dos bloqueios.
   * @param {string} [trechoId]
   * @param {{
   *   demanda?: { n?: number, semente?: number, periodo?: string },
   *   periodo?: string,
   *   bprAnalitico?: boolean,
   * }} [opcoes]
   * @returns {null | { ok: false, motivo: string } | { ok: true, trechoId: string, nome: string, avaliacao: ReturnType<typeof avaliar> }}
   */
  avaliarImpactoBloqueio(
    trechoId = this.selecionado,
    { demanda, periodo = PERIODO_PREVIEW_PADRAO, bprAnalitico = false } = {}
  ) {
    if (!trechoId || !this.#grafo.trechos.has(trechoId)) return null;
    const trecho = this.#grafo.trechos.get(trechoId);
    if (trecho.bloqueado) {
      return { ok: false, motivo: "Este trecho já está bloqueado." };
    }

    const copia = aplicarEmCopia(this.#grafo, { tipo: "bloquear", trechoId });
    if (!copia.ok) {
      return { ok: false, motivo: copia.motivo || "Não foi possível simular o bloqueio." };
    }

    const opts = opcoesPreviewBloqueio(this.#grafo, { demanda, periodo, bprAnalitico });
    const avaliacao = avaliar({
      grafo: this.#grafo,
      demanda: opts.demanda,
      grafoCenario: copia.estado.grafo,
      trechoAfetado: trechoId,
      topN: 3,
      bprAnalitico: opts.bprAnalitico,
    });

    return {
      ok: true,
      trechoId,
      nome: trecho.meta.nome ?? "Via sem nome",
      avaliacao,
      periodo: opts.perfil.id,
      periodoRotulo: opts.perfil.rotulo,
      bprAnalitico: Boolean(bprAnalitico),
      bprSimulacao: this.congestionamentoAtivo,
    };
  }

  /**
   * Sugere inversão próxima que mais reduz o custo do bloqueio pendente (Fase 2).
   * Busca limitada (~15 candidatos) com amostra OD própria — não muta a simulação.
   * @param {string} [trechoId]
   * @param {{ demanda?: { n?: number, semente?: number }, maxCandidatos?: number }} [opcoes]
   */
  recomendarDesvioBloqueio(
    trechoId = this.selecionado,
    { demanda = DEMANDA_DESVIO, maxCandidatos = MAX_CANDIDATOS } = {}
  ) {
    if (!trechoId || !this.#grafo.trechos.has(trechoId)) return null;
    const trecho = this.#grafo.trechos.get(trechoId);
    if (trecho.bloqueado) {
      return { ok: false, motivo: "Este trecho já está bloqueado." };
    }

    const resultado = avaliarDesvioRecomendado(this.#grafo, trechoId, {
      demanda,
      maxCandidatos,
    });

    if (!resultado.ok) return resultado;

    const nomeCand = resultado.recomendacao
      ? this.trecho(resultado.recomendacao.trechoId)?.nome ??
        resultado.recomendacao.trechoId
      : null;

    return {
      ...resultado,
      nome: trecho.meta.nome ?? "Via sem nome",
      nomeMitigacao: nomeCand,
    };
  }

  /**
   * Prévia combinada bloqueio + mitigação F3 (ex.: inverter trecho vizinho).
   * @param {string} trechoId
   * @param {{ tipo: string, trechoId: string }} mudancaMitigacao
   * @param {{
   *   demanda?: { n?: number, semente?: number, periodo?: string },
   *   periodo?: string,
   *   bprAnalitico?: boolean,
   * }} [opcoes]
   */
  avaliarImpactoBloqueioComMitigacao(
    trechoId,
    mudancaMitigacao,
    { demanda, periodo = PERIODO_PREVIEW_PADRAO, bprAnalitico = false } = {}
  ) {
    if (!trechoId || !this.#grafo.trechos.has(trechoId)) return null;
    const trecho = this.#grafo.trechos.get(trechoId);
    if (trecho.bloqueado) {
      return { ok: false, motivo: "Este trecho já está bloqueado." };
    }
    if (!mudancaMitigacao?.tipo || !mudancaMitigacao?.trechoId) {
      return { ok: false, motivo: "Mitigação inválida." };
    }

    const opts = opcoesPreviewBloqueio(this.#grafo, { demanda, periodo, bprAnalitico });
    const avaliacao = avaliar({
      grafo: this.#grafo,
      demanda: opts.demanda,
      mudancas: [{ tipo: "bloquear", trechoId }, mudancaMitigacao],
      trechoAfetado: trechoId,
      topN: 3,
      bprAnalitico: opts.bprAnalitico,
    });

    return {
      ok: true,
      trechoId,
      nome: trecho.meta.nome ?? "Via sem nome",
      mitigacao: mudancaMitigacao,
      nomeMitigacao: this.trecho(mudancaMitigacao.trechoId)?.nome ?? mudancaMitigacao.trechoId,
      avaliacao,
      periodo: opts.perfil.id,
      periodoRotulo: opts.perfil.rotulo,
      bprAnalitico: Boolean(bprAnalitico),
      bprSimulacao: this.congestionamentoAtivo,
    };
  }

  /**
   * Aplica a mitigação sugerida na malha viva (ex.: inverter sentido).
   * Usado pelo botão “Testar” — não aplica o bloqueio pendente.
   * @param {{ tipo: string, trechoId: string }} mudanca
   */
  aplicarMitigacao(mudanca) {
    if (!mudanca?.tipo || !mudanca?.trechoId) {
      return { ok: false, motivo: "Mitigação inválida." };
    }
    if (mudanca.tipo === "inverter") {
      const t = this.#grafo.trechos.get(mudanca.trechoId);
      if (!t) return { ok: false, motivo: "Trecho da mitigação inexistente." };
      if (t.bloqueado) {
        return { ok: false, motivo: "Não é possível inverter trecho bloqueado." };
      }
      const jaNoHistorico = this.#mudancasCenario.some(
        (m) => m.tipo === "inverter" && m.trechoId === mudanca.trechoId
      );
      // Restore F5 / reaplicar: não reinverte (ciclo de sentido) nem duplica histórico.
      if (jaNoHistorico) {
        return { ok: true, trechoId: mudanca.trechoId, sentido: t.sentido, jaAplicada: true };
      }
      const ok = this.#grafo.inverterSentido(mudanca.trechoId);
      if (!ok) return { ok: false, motivo: "Falha ao inverter o trecho sugerido." };
      this.#registrarMudancaCenario(
        { tipo: "inverter", trechoId: mudanca.trechoId },
        { mitigacao: true }
      );
      this.emitir("mitigacaoAplicada", {
        tipo: "inverter",
        trechoId: mudanca.trechoId,
        sentido: t.sentido,
      });
      return { ok: true, trechoId: mudanca.trechoId, sentido: t.sentido };
    }
    return { ok: false, motivo: `Tipo de mitigação não suportado: ${mudanca.tipo}` };
  }

  /**
   * Custo acumulado dos bloqueios ativos vs base sem bloqueios (Fase 2).
   * Por item: só aquele bloqueio; total: todos via F3 `bloquear` + `aplicarEmCopia`.
   * Cacheia pelo conjunto de ids + demanda F1.
   * @param {{ demanda?: { n?: number, semente?: number } }} [opcoes]
   */
  avaliarCustoAcumuladoBloqueios({ demanda = DEMANDA_CUSTO_BLOQUEIOS } = {}) {
    const ids = [...this.#bloqueios.keys()];
    const chave = chaveCustoBloqueios(ids, demanda);
    const cached = this.#cacheCusto.obter(chave);
    if (cached) return cached;

    const resultado = avaliarCustoBloqueios(this.#grafo, ids, { demanda });
    return this.#cacheCusto.guardar(chave, resultado);
  }

  solicitarBloqueio(id) {
    const resultado = validarBloqueio(this.#grafo, id, this.#simulacao.posicoesDeSaida());
    if (!resultado.permitido) return resultado;

    this.#ultimoRecalculo = 0;
    this.#grafo.bloquearTrecho(id); // dispara o recálculo síncrono das rotas
    this.#bloqueios.set(id, { horario: new Date(), rotasRecalculadas: this.#ultimoRecalculo });
    const jaNoHistorico = this.#mudancasCenario.some(
      (m) => m.tipo === "bloquear" && m.trechoId === id
    );
    if (!jaNoHistorico) {
      this.#registrarMudancaCenario({ tipo: "bloquear", trechoId: id });
    }
    this.emitir("bloqueiosAlterados", this.bloqueios());
    return { permitido: true, rotasRecalculadas: this.#ultimoRecalculo, veiculosNoTrecho: resultado.veiculosNoTrecho };
  }

  /**
   * Restaura bloqueio de um cenário salvo (F5) sem a validação de veículos presos —
   * usada só na reidratação após reload/troca de local/cenário.
   * Também preenche `#mudancasCenario` para o histórico live / comparador.
   */
  forcarBloqueioCenario(id) {
    if (!id || !this.#grafo.trechos.has(id)) {
      return { permitido: false, motivo: "Trecho inexistente." };
    }
    const jaNoHistorico = this.#mudancasCenario.some(
      (m) => m.tipo === "bloquear" && m.trechoId === id
    );
    if (this.#grafo.trechos.get(id).bloqueado) {
      if (!jaNoHistorico) {
        this.#registrarMudancaCenario({ tipo: "bloquear", trechoId: id }, { restaurado: true });
      }
      return { permitido: true, jaBloqueado: true, rotasRecalculadas: 0 };
    }
    this.#ultimoRecalculo = 0;
    this.#grafo.bloquearTrecho(id);
    this.#bloqueios.set(id, { horario: new Date(), rotasRecalculadas: this.#ultimoRecalculo });
    if (!jaNoHistorico) {
      this.#registrarMudancaCenario({ tipo: "bloquear", trechoId: id }, { restaurado: true });
    }
    this.emitir("bloqueiosAlterados", this.bloqueios());
    return { permitido: true, rotasRecalculadas: this.#ultimoRecalculo };
  }

  removerBloqueio(id) {
    if (!this.#grafo.trechos.get(id)?.bloqueado) return { removido: false };
    this.#ultimoRecalculo = 0;
    this.#grafo.desbloquearTrecho(id);
    this.#bloqueios.delete(id);
    this.#mudancasCenario = this.#mudancasCenario.filter(
      (m) => !(m.tipo === "bloquear" && m.trechoId === id)
    );
    this.emitir("bloqueiosAlterados", this.bloqueios());
    return { removido: true, rotasRecalculadas: this.#ultimoRecalculo };
  }

  // ---------- Simulação ----------

  avancar(dtSegundos) {
    this.#simulacao.avancar(dtSegundos);
    const snapshot = snapshotMetricasDispositivos(
      this.#grafo,
      this.#simulacao.veiculos,
      this.#simulacao.dispositivos.listarTodos()
    );
    this.#acumuladorMetricas.amostrar(snapshot, dtSegundos * (this.#simulacao.fatorTempo || 1));
  }

  definirQuantidadeVeiculos(n) {
    this.#simulacao.definirQuantidade(n);
  }

  definirFatorTempo(fator) {
    this.#simulacao.fatorTempo = fator;
  }

  encerrar() {
    this.#simulacao.encerrar();
    this.#bloqueios.clear();
    this.#cacheCusto.limpar();
    this.#acumuladorMetricas.limpar();
    this.#rastreadorFuga.limpar();
    this.#dispositivoFocado = null;
    this.#mudancasCenario = [];
    this.#undosLigacao.clear();
    this.selecionado = null;
  }
}

// Porta de entrada da tela de simulação de trânsito. A UI não acessa o motor direto.
import { Emissor } from "../motor/eventos.js";
import { Simulacao } from "../motor/simulacao.js";
import { maiorComponenteForte } from "../motor/roteamento.js";
import { avaliar } from "../motor/avaliadorImpacto.js";
import { aplicar, reverter, clonarGrafo } from "../motor/mudanca.js";
import {
  compararBaseAtual,
  DEMANDA_IMPACTO,
  oportunidadesInversao,
  resumoImpactoRegistro,
} from "../motor/impactoInversao.js";
import { construirGrafo, pontoNaGeometria } from "./carregarMalha.js";

/** Amostra fixa da prévia de inversão (determinística, <1 s na malha típica). */
const DEMANDA_PREVIEW = DEMANDA_IMPACTO;

export async function carregarControleSentido(urlMalha, opcoes) {
  const resposta = await fetch(urlMalha);
  if (!resposta.ok) throw new Error(`Não foi possível carregar a malha (${resposta.status}).`);
  return new ControleSentido(await resposta.json(), opcoes);
}

const ROTULO_SENTIDO = {
  0: "Mão dupla",
  1: "Sentido da geometria (→)",
  [-1]: "Sentido contrário (←)",
};

let proximoRegistroId = 1;

export class ControleSentido extends Emissor {
  #grafo;
  /** Snapshot limpo (sentidos iniciais) para Base × Atual. */
  #grafoBase;
  #simulacao;
  #registro = [];
  /** Impacto F2 + undo F3 pendentes até o evento sentidoReagido. */
  #pendente = null;
  /** Evita nova linha no registro ao desfazer via F3. */
  #silenciarRegistro = false;
  selecionado = null;

  constructor(
    geojson,
    {
      quantidadeVeiculos = 50,
      fatorTempo = 1,
      aleatorio,
      politicaSentido = "complete",
      intervaloSpawn = 0.2,
      congestionamento = true,
    } = {}
  ) {
    super();
    this.#grafo = construirGrafo(geojson);
    this.#grafoBase = clonarGrafo(this.#grafo);
    this.#simulacao = new Simulacao(this.#grafo, {
      fatorTempo,
      aleatorio,
      politicaSentido,
      intervaloSpawn,
      congestionamento,
    });
    this.#simulacao.definirQuantidade(quantidadeVeiculos);

    this.#simulacao.on("sentidoReagido", (e) => {
      this.#registrar(e);
      this.emitir("sentidoReagido", e);
    });
    this.#simulacao.on("congestionamentoAtualizado", (e) =>
      this.emitir("congestionamentoAtualizado", e)
    );
    this.#grafo.on("sentidoAlterado", (e) => this.emitir("sentidoAlterado", e));
  }

  /** Grafo vivo (F5 / testes). */
  get grafo() {
    return this.#grafo;
  }

  trecho(id) {
    const t = this.#grafo.trechos.get(id);
    if (!t) return null;
    const veiculosNoTrecho = this.#simulacao.veiculos.filter(
      (v) => this.#grafo.arestas.get(v.rota[v.indice]).trechoId === id
    ).length;
    return {
      id: t.id,
      nome: t.meta.nome ?? "Via sem nome",
      temNome: Boolean(t.meta.nome),
      referencia: t.meta.referencia,
      tipo: t.meta.tipo,
      sentidoUnico: t.meta.sentidoUnico,
      permiteDuplo: t.permiteDuplo,
      sentido: t.sentido,
      sentidoInicial: t.sentidoInicial,
      alterado: t.sentido !== t.sentidoInicial,
      sentidoRotulo: ROTULO_SENTIDO[t.sentido],
      comprimento: t.meta.comprimento,
      pontos: t.meta.pontos,
      meio: t.meta.meio,
      extremidades: t.meta.extremidades,
      veiculosNoTrecho,
      direcoesAtivas: this.#direcoesAtivas(t),
    };
  }

  #direcoesAtivas(trecho) {
    return trecho.arestas
      .filter((id) => this.#grafo.estaAcessivel(id))
      .map((id) => {
        const a = this.#grafo.arestas.get(id);
        return { id, de: a.de, para: a.para, geometria: a.geometria };
      });
  }

  trechos() {
    return [...this.#grafo.trechos.keys()].map((id) => this.trecho(id));
  }

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

  veiculos() {
    return this.#simulacao.veiculos.map((v) => {
      const aresta = this.#grafo.arestas.get(v.rota[v.indice]);
      const [lat, lon] = pontoNaGeometria(aresta.geometria, v.progresso);
      return {
        id: v.id,
        arestaId: aresta.id,
        lat,
        lon,
        status: v.evacuando ? "evacuando" : v.status,
      };
    });
  }

  estatisticas() {
    const principal = maiorComponenteForte(this.#grafo);
    const totalNos = this.#grafo.nos.size;
    return {
      ...this.#simulacao.estatisticas(),
      malhaConectada: principal.size === totalNos,
      nosNaMalha: principal.size,
      nosTotal: totalNos,
    };
  }

  registro() {
    return this.#registro.map((item) => ({
      ...item,
      podeDesfazer: this.#podeDesfazer(item),
    }));
  }

  selecionar(id) {
    this.selecionado = id && this.#grafo.trechos.has(id) ? id : null;
    this.emitir("selecaoAlterada", this.selecionado);
  }

  /**
   * Inverte o trecho selecionado via F3 `aplicar` (gera token undo).
   * @param {{ semPrevia?: boolean }} [opcoes] — `semPrevia` pula F2 (reaplicação de cenário).
   */
  inverterSelecionado({ semPrevia = false } = {}) {
    if (!this.selecionado) return { ok: false, motivo: "Nenhuma via selecionada." };
    const trechoId = this.selecionado;

    let impacto = null;
    if (!semPrevia) {
      try {
        const previa = this.avaliarImpactoInversao(trechoId);
        if (previa?.ok) impacto = resumoImpactoRegistro(previa.avaliacao);
      } catch {
        impacto = null;
      }
    }

    // Pendente antes de `aplicar`: sentidoReagido (síncrono) consome no #registrar.
    const registroId = `reg-${proximoRegistroId++}`;
    this.#pendente = {
      id: registroId,
      undo: null,
      impacto,
      trechoId,
    };

    const r = aplicar(this.#grafo, { tipo: "inverter", trechoId });
    if (!r.ok) {
      this.#pendente = null;
      return { ok: false, motivo: r.motivo || "Não foi possível inverter (via bloqueada?)." };
    }

    // Se o registro já consumiu o pendente, anexa o undo na linha criada.
    const criado = this.#registro.find((i) => i.id === registroId);
    if (criado) criado.undo = r.undo;
    else if (this.#pendente?.id === registroId) this.#pendente.undo = r.undo;

    return { ok: true, trecho: this.trecho(trechoId), undo: r.undo, impacto };
  }

  /**
   * Desfaz uma linha do registro via F3 `reverter`, se o sentido ainda bater.
   * @param {string} registroId
   */
  desfazerRegistro(registroId) {
    const idx = this.#registro.findIndex((i) => i.id === registroId);
    if (idx < 0) return { ok: false, motivo: "Registro não encontrado." };
    const item = this.#registro[idx];
    if (!this.#podeDesfazer(item)) {
      return { ok: false, motivo: "Não é possível desfazer esta inversão agora." };
    }
    this.#silenciarRegistro = true;
    let r;
    try {
      r = reverter(this.#grafo, item.undo);
    } finally {
      this.#silenciarRegistro = false;
    }
    if (!r.ok) return { ok: false, motivo: r.motivo || "Falha ao reverter." };

    item.desfeito = true;
    item.undo = null;
    this.emitir("sentidoDesfeito", { trechoId: item.trechoId, registroId });
    return { ok: true, trechoId: item.trechoId, trecho: this.trecho(item.trechoId) };
  }

  #podeDesfazer(item) {
    if (!item || item.desfeito || !item.undo) return false;
    const t = this.#grafo.trechos.get(item.undo.trechoId);
    if (!t) return false;
    // Sentido atual ainda é o pós-inversão registrado.
    return t.sentido === item.sentido;
  }

  /**
   * Prévia analítica do próximo `inverterSentido` no trecho (sem mutar a simulação).
   * Determinística para a mesma malha + demanda + estado atual do sentido.
   * @param {string} [trechoId]
   * @param {{ demanda?: { n?: number, semente?: number } }} [opcoes]
   */
  avaliarImpactoInversao(trechoId = this.selecionado, { demanda = DEMANDA_PREVIEW } = {}) {
    if (!trechoId || !this.#grafo.trechos.has(trechoId)) return null;
    const trecho = this.#grafo.trechos.get(trechoId);
    if (trecho.bloqueado) {
      return { ok: false, motivo: "Não é possível inverter trecho bloqueado." };
    }

    const sentidoAtual = trecho.sentido;
    const avaliacao = avaliar({
      grafo: this.#grafo,
      demanda,
      mudancas: { tipo: "inverter", trechoId },
      trechoAfetado: trechoId,
      topN: 3,
    });

    const sentidoProximo = (() => {
      if (trecho.permiteDuplo) {
        if (sentidoAtual === 0) return 1;
        if (sentidoAtual === 1) return -1;
        return 0;
      }
      return sentidoAtual === 1 ? -1 : 1;
    })();

    return {
      ok: true,
      trechoId,
      sentidoAtual,
      sentidoProximo,
      avaliacao,
      bprSimulacao: Boolean(this.#simulacao.congestionamentoAtivo),
    };
  }

  /**
   * Painel Base × Atual: F2 limpo (snapshot) vs grafo vivo.
   * @param {{ demanda?: { n?: number, semente?: number } }} [opcoes]
   */
  compararComBase({ demanda = DEMANDA_PREVIEW } = {}) {
    try {
      return compararBaseAtual(this.#grafoBase, this.#grafo, { demanda });
    } catch (err) {
      return { ok: false, motivo: err?.message || "Falha ao comparar base × atual." };
    }
  }

  /**
   * Top oportunidades de inversão por ganho de tempo (batch F2, cap apertado).
   * @param {{ maxResultados?: number, maxCandidatos?: number }} [opcoes]
   */
  oportunidades(opcoes = {}) {
    try {
      return oportunidadesInversao(this.#grafo, opcoes);
    } catch (err) {
      return { ok: false, motivo: err?.message || "Falha ao buscar oportunidades.", itens: [] };
    }
  }

  get congestionamentoAtivo() {
    return Boolean(this.#simulacao.congestionamentoAtivo);
  }

  definirPolitica(politica) {
    this.#simulacao.politicaSentido = politica === "uturn" ? "uturn" : "complete";
  }

  avancar(dtSegundos) {
    this.#simulacao.avancar(dtSegundos);
  }

  definirQuantidadeVeiculos(n) {
    this.#simulacao.definirQuantidade(n);
  }

  definirFatorTempo(fator) {
    this.#simulacao.fatorTempo = fator;
  }

  encerrar() {
    this.#simulacao.encerrar();
    this.#registro = [];
    this.#pendente = null;
    this.selecionado = null;
  }

  #registrar(e) {
    if (this.#silenciarRegistro) {
      this.#pendente = null;
      return;
    }
    const trecho = this.trecho(e.trechoId);
    const partes = [];
    if (e.evacuando) partes.push(`${e.evacuando} concluindo a travessia`);
    if (e.retornos) partes.push(`${e.retornos} retornaram`);
    if (e.recalculadas) {
      partes.push(
        e.recalculadas === 1
          ? "1 veículo redirecionado"
          : `${e.recalculadas} veículos redirecionados`
      );
    }

    const pendente =
      this.#pendente && this.#pendente.trechoId === e.trechoId ? this.#pendente : null;
    this.#pendente = null;

    this.#registro.unshift({
      id: pendente?.id ?? `reg-${proximoRegistroId++}`,
      trechoId: e.trechoId,
      nome: trecho?.nome ?? e.trechoId,
      sentido: e.sentido,
      texto:
        `${trecho?.nome ?? e.trechoId} → ${ROTULO_SENTIDO[e.sentido]}` +
        (partes.length ? ` — ${partes.join(", ")}` : ""),
      horario: new Date(),
      impacto: pendente?.impacto ?? null,
      undo: pendente?.undo ?? null,
      desfeito: false,
    });
    if (this.#registro.length > 40) this.#registro.length = 40;
  }
}

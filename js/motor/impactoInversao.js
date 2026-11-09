// Fase 1 — comparativo Base×Atual e ranking leve de oportunidades de inversão (F2).
import { avaliar } from "./avaliadorImpacto.js";
import { clonarGrafo } from "./mudanca.js";

/** Demanda F1 da prévia / painel Base×Atual (alinhada à prévia de sentido). */
export const DEMANDA_IMPACTO = Object.freeze({ n: 200, semente: 1 });

/** Amostra menor para batch de oportunidades (perf). */
export const DEMANDA_OPORTUNIDADES = Object.freeze({ n: 80, semente: 3 });

/** Cap apertado de candidatos avaliados no batch. */
export const MAX_CANDIDATOS_OPORTUNIDADE = 10;

/** Top-N exibido no painel. */
export const TOP_OPORTUNIDADES = 5;

/**
 * Cópia do grafo com todos os sentidos restaurados ao `sentidoInicial`.
 * @param {import("./grafo.js").Grafo} grafo
 */
export function grafoSentidosIniciais(grafo) {
  const g = clonarGrafo(grafo);
  for (const t of g.trechos.values()) {
    const alvo = t.sentidoInicial ?? t.sentido;
    if (t.sentido !== alvo) {
      try {
        g.definirSentido(t.id, alvo);
      } catch {
        /* trecho inconsistente — segue */
      }
    }
  }
  return g;
}

/**
 * Compara malha limpa (base) vs estado atual via F2 `avaliar` + `grafoCenario`.
 * @param {import("./grafo.js").Grafo} grafoBase
 * @param {import("./grafo.js").Grafo} grafoAtual
 * @param {{ demanda?: { n?: number, semente?: number } }} [opcoes]
 */
export function compararBaseAtual(
  grafoBase,
  grafoAtual,
  { demanda = DEMANDA_IMPACTO } = {}
) {
  if (!grafoBase || !grafoAtual) {
    throw new TypeError("compararBaseAtual: grafoBase e grafoAtual são obrigatórios");
  }
  const avaliacao = avaliar({
    grafo: grafoBase,
    grafoCenario: grafoAtual,
    demanda,
    topN: 3,
  });
  return {
    ok: true,
    avaliacao,
    resumo: resumoBaseAtual(avaliacao),
  };
}

/**
 * Extrai as 4 métricas do painel Base × Atual.
 * @param {ReturnType<typeof avaliar>} avaliacao
 */
export function resumoBaseAtual(avaliacao) {
  if (!avaliacao?.base || !avaliacao?.cenario) return null;
  const { base, cenario, delta, amostra } = avaliacao;
  return {
    tempoMedioViagem: {
      base: base.tempoMedioViagem,
      atual: cenario.tempoMedioViagem,
      delta: delta.tempoMedioViagem,
    },
    kmRodados: {
      base: base.kmRodados,
      atual: cenario.kmRodados,
      delta: delta.kmRodados,
    },
    retidos: {
      base: base.retidos,
      atual: cenario.retidos,
      delta: delta.retidos,
    },
    viagensConcluidas: {
      base: amostra.viagensComRotaBase,
      atual: amostra.viagensComRotaCenario,
      delta: amostra.viagensComRotaCenario - amostra.viagensComRotaBase,
    },
    amostra: { tamanho: amostra.tamanho },
  };
}

/**
 * Resumo curto para linha de registro (+38 s, 12% viagens).
 * @param {ReturnType<typeof avaliar>} avaliacao
 */
export function resumoImpactoRegistro(avaliacao) {
  if (!avaliacao?.delta) return null;
  const { delta } = avaliacao;
  return {
    deltaTempo: delta.tempoMedioViagem?.absoluto ?? null,
    deltaTempoPct: delta.tempoMedioViagem?.percentual ?? null,
    viagensAfetadasPct: delta.viagensAfetadas?.percentual ?? null,
    viagensAfetadasContagem: delta.viagensAfetadas?.contagem ?? null,
    deltaRetidos: delta.retidos ?? null,
    deltaKm: delta.kmRodados?.absoluto ?? null,
  };
}

/**
 * Candidatos nomeados, embaralhados de forma determinística, com teto apertado.
 * @param {import("./grafo.js").Grafo} grafo
 * @param {{ max?: number, semente?: number }} [opcoes]
 * @returns {string[]}
 */
export function candidatosOportunidade(
  grafo,
  { max = MAX_CANDIDATOS_OPORTUNIDADE, semente = 7 } = {}
) {
  const ids = [];
  for (const t of grafo.trechos.values()) {
    if (t.bloqueado) continue;
    if (!t.meta?.nome) continue;
    ids.push(t.id);
  }
  let s = semente >>> 0;
  for (let i = ids.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  return ids.slice(0, Math.max(0, max));
}

/**
 * Avalia até `maxCandidatos` inversões e devolve as top por ganho de tempo (Δt < 0).
 * @param {import("./grafo.js").Grafo} grafo
 * @param {{
 *   maxResultados?: number,
 *   maxCandidatos?: number,
 *   demanda?: { n?: number, semente?: number },
 *   semente?: number,
 * }} [opcoes]
 */
export function oportunidadesInversao(
  grafo,
  {
    maxResultados = TOP_OPORTUNIDADES,
    maxCandidatos = MAX_CANDIDATOS_OPORTUNIDADE,
    demanda = DEMANDA_OPORTUNIDADES,
    semente = 7,
  } = {}
) {
  if (!grafo) throw new TypeError("oportunidadesInversao: `grafo` é obrigatório");

  const candidatos = candidatosOportunidade(grafo, { max: maxCandidatos, semente });
  const ranqueados = [];

  for (const trechoId of candidatos) {
    let avaliacao;
    try {
      avaliacao = avaliar({
        grafo,
        demanda,
        mudancas: { tipo: "inverter", trechoId },
        trechoAfetado: trechoId,
        topN: 1,
      });
    } catch {
      continue;
    }
    const deltaT = avaliacao.delta?.tempoMedioViagem?.absoluto;
    if (deltaT == null || Number.isNaN(deltaT) || deltaT >= 0) continue;
    const trecho = grafo.trechos.get(trechoId);
    ranqueados.push({
      trechoId,
      nome: trecho?.meta?.nome ?? trechoId,
      ganhoTempo: -deltaT,
      deltaTempo: deltaT,
      viagensAfetadasPct: avaliacao.delta.viagensAfetadas?.percentual ?? null,
      avaliacao,
    });
  }

  ranqueados.sort((a, b) => b.ganhoTempo - a.ganhoTempo);
  return {
    ok: true,
    candidatosAvaliados: candidatos.length,
    itens: ranqueados.slice(0, maxResultados),
  };
}

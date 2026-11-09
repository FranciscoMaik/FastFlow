// Fase 2 — desvio recomendado para um bloqueio pendente.
// Busca limitada de inversões vizinhas (corredor / proximidade) e escolhe a que
// mais reduz o custo do bloqueio via F2 `avaliar` + F3 `bloquear`/`inverter`.
import { distanciaMetros } from "../adaptador/carregarMalha.js";
import { avaliar } from "./avaliadorImpacto.js";
import { resolverDemanda } from "./demandaFixa.js";

/** Amostra OD da busca (menor que a prévia completa para manter a UI responsiva). */
export const DEMANDA_DESVIO = Object.freeze({ n: 150, semente: 1 });

/** Máximo de candidatos avaliados (vizinhos + corredor + próximos). */
export const MAX_CANDIDATOS = 15;

function nosDoTrecho(grafo, trechoId) {
  const nos = new Set();
  const trecho = grafo.trechos.get(trechoId);
  if (!trecho) return nos;
  for (const aid of trecho.arestas) {
    const a = grafo.arestas.get(aid);
    if (!a) continue;
    nos.add(a.de);
    nos.add(a.para);
  }
  return nos;
}

function meioDoTrecho(grafo, trechoId) {
  const trecho = grafo.trechos.get(trechoId);
  const meio = trecho?.meta?.meio;
  if (Array.isArray(meio) && meio.length >= 2) return meio;
  return null;
}

function deltaTempoAbs(avaliacao) {
  const d = avaliacao?.delta?.tempoMedioViagem?.absoluto;
  return d == null || Number.isNaN(d) ? null : d;
}

/**
 * Candidatos a inverter perto do trecho a bloquear.
 * Prioridade: mesmo nome (corredor) → compartilham nó → mais próximos por `meta.meio`.
 * Exclui o próprio trecho e trechos já bloqueados.
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {string} trechoId
 * @param {{ max?: number }} [opcoes]
 * @returns {{ trechoId: string, motivo: string, distanciaM: number|null }[]}
 */
export function candidatosDesvio(grafo, trechoId, { max = MAX_CANDIDATOS } = {}) {
  if (!grafo?.trechos?.has(trechoId)) return [];
  const alvo = grafo.trechos.get(trechoId);
  const nomeAlvo = alvo.meta?.nome ?? null;
  const nosAlvo = nosDoTrecho(grafo, trechoId);
  const meioAlvo = meioDoTrecho(grafo, trechoId);

  /** @type {Map<string, { trechoId: string, motivo: string, distanciaM: number|null, prioridade: number }>} */
  const mapa = new Map();

  function registrar(id, motivo, prioridade, distanciaM = null) {
    if (id === trechoId) return;
    const t = grafo.trechos.get(id);
    if (!t || t.bloqueado) return;
    const atual = mapa.get(id);
    if (!atual || prioridade < atual.prioridade) {
      mapa.set(id, { trechoId: id, motivo, distanciaM, prioridade });
    } else if (atual && distanciaM != null && (atual.distanciaM == null || distanciaM < atual.distanciaM)) {
      atual.distanciaM = distanciaM;
    }
  }

  // 1) Corredor de mesmo nome.
  if (nomeAlvo) {
    for (const t of grafo.trechos.values()) {
      if (t.meta?.nome === nomeAlvo) registrar(t.id, "corredor", 0);
    }
  }

  // 2) Vizinhos topológicos (compartilham cruzamento).
  for (const t of grafo.trechos.values()) {
    if (t.id === trechoId || t.bloqueado) continue;
    for (const aid of t.arestas) {
      const a = grafo.arestas.get(aid);
      if (a && (nosAlvo.has(a.de) || nosAlvo.has(a.para))) {
        registrar(t.id, "vizinho", 1);
        break;
      }
    }
  }

  // 3) Mais próximos por geometria (meio).
  if (meioAlvo) {
    const porDist = [];
    for (const t of grafo.trechos.values()) {
      if (t.id === trechoId || t.bloqueado) continue;
      const meio = meioDoTrecho(grafo, t.id);
      if (!meio) continue;
      porDist.push({ id: t.id, d: distanciaMetros(meioAlvo, meio) });
    }
    porDist.sort((a, b) => a.d - b.d);
    for (const item of porDist.slice(0, Math.max(max, 20))) {
      registrar(item.id, "proximo", 2, item.d);
    }
  }

  // Completa distância para quem já entrou por corredor/vizinho.
  if (meioAlvo) {
    for (const c of mapa.values()) {
      if (c.distanciaM != null) continue;
      const meio = meioDoTrecho(grafo, c.trechoId);
      if (meio) c.distanciaM = distanciaMetros(meioAlvo, meio);
    }
  }

  return [...mapa.values()]
    .sort((a, b) => {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
      const da = a.distanciaM ?? Infinity;
      const db = b.distanciaM ?? Infinity;
      if (da !== db) return da - db;
      return a.trechoId.localeCompare(b.trechoId);
    })
    .slice(0, max)
    .map(({ trechoId: id, motivo, distanciaM }) => ({
      trechoId: id,
      motivo,
      distanciaM,
    }));
}

/**
 * Avalia o bloqueio sozinho e com cada inversão candidata; devolve a melhor mitigação.
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {string} trechoId — trecho a bloquear (ainda não bloqueado)
 * @param {{
 *   demanda?: { n?: number, semente?: number },
 *   paresOD?: Array<{origem:string,destino:string}|[string,string]>,
 *   maxCandidatos?: number,
 *   avaliacaoBloqueio?: ReturnType<typeof avaliar>,
 * }} [opcoes]
 */
export function avaliarDesvioRecomendado(
  grafo,
  trechoId,
  {
    demanda = DEMANDA_DESVIO,
    paresOD,
    maxCandidatos = MAX_CANDIDATOS,
    avaliacaoBloqueio,
  } = {}
) {
  if (!grafo) throw new TypeError("avaliarDesvioRecomendado: `grafo` é obrigatório");
  if (!trechoId || !grafo.trechos.has(trechoId)) {
    return { ok: false, motivo: "Trecho inexistente." };
  }
  if (grafo.trechos.get(trechoId).bloqueado) {
    return { ok: false, motivo: "Este trecho já está bloqueado." };
  }

  const candidatos = candidatosDesvio(grafo, trechoId, { max: maxCandidatos });
  if (candidatos.length === 0) {
    return {
      ok: true,
      trechoId,
      recomendacao: null,
      motivo: "Nenhum candidato próximo para inverter.",
      candidatosAvaliados: 0,
      amostra: null,
      bloqueio: avaliacaoBloqueio ?? null,
    };
  }

  let pares = paresOD;
  if (pares == null) {
    pares = resolverDemanda(demanda, grafo.nos.keys());
  }

  const bloqueio =
    avaliacaoBloqueio ??
    avaliar({
      grafo,
      paresOD: pares,
      mudancas: { tipo: "bloquear", trechoId },
      trechoAfetado: trechoId,
      topN: 3,
    });

  const tempoBloqueio = deltaTempoAbs(bloqueio);
  const avalicoes = [];

  for (const cand of candidatos) {
    let avaliacao;
    try {
      avaliacao = avaliar({
        grafo,
        paresOD: pares,
        mudancas: [
          { tipo: "bloquear", trechoId },
          { tipo: "inverter", trechoId: cand.trechoId },
        ],
        trechoAfetado: trechoId,
        topN: 3,
      });
    } catch {
      continue;
    }

    const tempoMitigado = deltaTempoAbs(avaliacao);
    const melhoria =
      tempoBloqueio != null && tempoMitigado != null
        ? tempoBloqueio - tempoMitigado
        : null;

    avalicoes.push({
      ...cand,
      mudanca: { tipo: "inverter", trechoId: cand.trechoId },
      avaliacao,
      tempoBloqueio,
      tempoMitigado,
      melhoria,
    });
  }

  // Melhor = maior melhoria (redução do Δ tempo); empate: menor tempo mitigado, depois id.
  avalicoes.sort((a, b) => {
    const ma = a.melhoria ?? -Infinity;
    const mb = b.melhoria ?? -Infinity;
    if (mb !== ma) return mb - ma;
    const ta = a.tempoMitigado ?? Infinity;
    const tb = b.tempoMitigado ?? Infinity;
    if (ta !== tb) return ta - tb;
    return a.trechoId.localeCompare(b.trechoId);
  });

  const melhor = avalicoes[0] ?? null;
  const recomenda =
    melhor && melhor.melhoria != null && melhor.melhoria > 1e-6 ? melhor : null;

  return {
    ok: true,
    trechoId,
    bloqueio,
    recomendacao: recomenda
      ? {
          trechoId: recomenda.trechoId,
          motivo: recomenda.motivo,
          distanciaM: recomenda.distanciaM,
          mudanca: recomenda.mudanca,
          melhoria: recomenda.melhoria,
          tempoBloqueio: recomenda.tempoBloqueio,
          tempoMitigado: recomenda.tempoMitigado,
          avaliacao: recomenda.avaliacao,
        }
      : null,
    motivo: recomenda
      ? null
      : avalicoes.length
        ? "Nenhuma inversão próxima reduz o custo do bloqueio."
        : "Não foi possível avaliar os candidatos.",
    candidatosAvaliados: avalicoes.length,
    amostra: {
      tamanho: pares.length,
      candidatos: candidatos.length,
    },
  };
}

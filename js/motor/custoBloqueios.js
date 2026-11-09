// Fase 2 — custo acumulado dos bloqueios ativos.
// Base = malha sem bloqueios (demais intervenções preservadas); cada item = só
// aquele bloqueio; total = todos via F3 `bloquear` + `aplicarEmCopia`.
import { avaliar } from "./avaliadorImpacto.js";
import { resolverDemanda } from "./demandaFixa.js";
import { aplicarEmCopia, clonarGrafo } from "./mudanca.js";

/** Demanda F1 padrão da prévia (mesma semente da inversão / “Se bloquear…”). */
export const DEMANDA_CUSTO_BLOQUEIOS = Object.freeze({ n: 200, semente: 1 });

/**
 * Cópia do grafo com todos os trechos desbloqueados.
 * Preserva sentido e demais propriedades; só remove o efeito dos bloqueios.
 */
export function grafoSemBloqueios(grafo) {
  const g = clonarGrafo(grafo);
  for (const id of g.trechosBloqueados()) {
    g.desbloquearTrecho(id);
  }
  return g;
}

/** Chave estável para cache (ordem dos ids não importa). */
export function chaveCustoBloqueios(trechoIds, demanda = DEMANDA_CUSTO_BLOQUEIOS) {
  const ids = [...new Set((trechoIds ?? []).map(String))].sort();
  const n = demanda?.n ?? DEMANDA_CUSTO_BLOQUEIOS.n;
  const semente = demanda?.semente ?? DEMANDA_CUSTO_BLOQUEIOS.semente;
  if (Array.isArray(demanda)) {
    return `${ids.join("|")}::pares:${demanda.length}`;
  }
  return `${ids.join("|")}::${n}:${semente}`;
}

function resumoImpacto(avaliacao) {
  if (!avaliacao?.delta) return null;
  const { delta, amostra } = avaliacao;
  return {
    tempoMedioViagem: delta.tempoMedioViagem,
    viagensAfetadas: delta.viagensAfetadas,
    retidos: delta.retidos,
    perdaAcesso: delta.perdaAcesso?.contagem ?? 0,
    amostra: {
      tamanho: amostra.tamanho,
      viagensComRotaBase: amostra.viagensComRotaBase,
      viagensComRotaCenario: amostra.viagensComRotaCenario,
    },
    base: {
      tempoMedioViagem: avaliacao.base.tempoMedioViagem,
    },
    cenario: {
      tempoMedioViagem: avaliacao.cenario.tempoMedioViagem,
    },
  };
}

/**
 * Avalia o impacto isolado de cada bloqueio ativo e o custo combinado vs base sem bloqueios.
 *
 * @param {import("./grafo.js").Grafo} grafo — estado atual (pode já ter bloqueios)
 * @param {Iterable<string>} trechoIds — ids dos bloqueios ativos
 * @param {{
 *   demanda?: { n?: number, semente?: number } | Array<{origem:string,destino:string}>,
 *   paresOD?: Array<{origem:string,destino:string}|[string,string]>,
 *   topN?: number,
 * }} [opcoes]
 */
export function avaliarCustoBloqueios(
  grafo,
  trechoIds,
  { demanda = DEMANDA_CUSTO_BLOQUEIOS, paresOD, topN = 3 } = {}
) {
  if (!grafo) throw new TypeError("avaliarCustoBloqueios: `grafo` é obrigatório");

  const ids = [...new Set([...trechoIds].map(String))];
  const chave = chaveCustoBloqueios(ids, Array.isArray(demanda) ? demanda : demanda);

  if (ids.length === 0) {
    return { ok: true, chave, ids, itens: [], total: null, amostra: null };
  }

  const base = grafoSemBloqueios(grafo);
  for (const id of ids) {
    if (!base.trechos.has(id)) {
      return { ok: false, motivo: `Trecho inexistente: ${id}`, chave, ids };
    }
  }

  let pares = paresOD;
  if (pares == null) {
    pares = resolverDemanda(
      Array.isArray(demanda) ? demanda : demanda === undefined ? DEMANDA_CUSTO_BLOQUEIOS : demanda,
      base.nos.keys()
    );
  }

  const mudancasTodas = ids.map((trechoId) => ({ tipo: "bloquear", trechoId }));

  // Garante que a lista F3 aplica sem mutar a base (e falha cedo se algo estiver inconsistente).
  const prova = aplicarEmCopia(base, mudancasTodas);
  if (!prova.ok) {
    return { ok: false, motivo: prova.motivo ?? "Falha ao aplicar bloqueios na cópia", chave, ids };
  }

  const itens = ids.map((trechoId) => {
    const avaliacao = avaliar({
      grafo: base,
      paresOD: pares,
      mudancas: { tipo: "bloquear", trechoId },
      trechoAfetado: trechoId,
      topN,
    });
    return {
      trechoId,
      impacto: resumoImpacto(avaliacao),
      avaliacao,
    };
  });

  const avaliacaoTotal = avaliar({
    grafo: base,
    paresOD: pares,
    mudancas: mudancasTodas,
    topN,
  });

  return {
    ok: true,
    chave,
    ids,
    itens,
    total: resumoImpacto(avaliacaoTotal),
    avaliacaoTotal,
    amostra: {
      tamanho: pares.length,
      viagensComRotaBase: avaliacaoTotal.amostra.viagensComRotaBase,
      viagensComRotaCenario: avaliacaoTotal.amostra.viagensComRotaCenario,
    },
  };
}

/** Cache em memória por chave (ids + demanda). */
export function criarCacheCustoBloqueios() {
  let chave = null;
  let resultado = null;

  return {
    obter(novaChave) {
      if (chave != null && chave === novaChave) return resultado;
      return null;
    },
    guardar(novaChave, valor) {
      chave = novaChave;
      resultado = valor;
      return valor;
    },
    limpar() {
      chave = null;
      resultado = null;
    },
  };
}

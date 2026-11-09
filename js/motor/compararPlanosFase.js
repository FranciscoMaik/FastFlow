// Compara 2–3 planos de fase de semáforo (V/A/Vm) com métricas baratas.
// Espera e fila estimada são analíticas (ciclo). Δ tempo médio opcional via F2
// com amostra pequena, usando o plano de referência como grafo-base.
import { avaliar } from "./avaliadorImpacto.js";
import {
  aplicarPesoSemaforoAnalitico,
  esperaMediaCiclo,
  normalizarTemposFase,
  prepararGrafoCenarioDispositivo,
} from "./metricasDispositivos.js";
import { clonarGrafo } from "./mudanca.js";

export { esperaMediaCiclo, normalizarTemposFase };

/** Demanda F1 enxuta para Δ entre planos (popup deve responder rápido). */
export const DEMANDA_COMPARAR_PLANOS = Object.freeze({ n: 48, semente: 7 });

export const PLANOS_PRESET = Object.freeze([
  Object.freeze({
    id: "curto",
    rotulo: "Curto",
    tempos: Object.freeze({ verde: 12, amarelo: 3, vermelho: 10 }),
  }),
  Object.freeze({
    id: "longo",
    rotulo: "Longo",
    tempos: Object.freeze({ verde: 20, amarelo: 3, vermelho: 15 }),
  }),
]);

/**
 * Métricas analíticas de um plano (sem F2).
 * `taxaChegada` em veíc./s — se omitida, `filaEstimada` fica null.
 */
export function metricasAnaliticasPlano(tempos, { taxaChegada = null } = {}) {
  const t = normalizarTemposFase(tempos);
  const ciclo = t.verde + t.amarelo + t.vermelho;
  const esperaMedia = esperaMediaCiclo(t);
  const fracaoVerde = ciclo > 0 ? t.verde / ciclo : 0;
  const taxa = Number(taxaChegada);
  const filaEstimada =
    Number.isFinite(taxa) && taxa > 0 ? taxa * esperaMedia : null;
  return {
    tempos: t,
    ciclo,
    esperaMedia,
    fracaoVerde,
    filaEstimada,
  };
}

/**
 * Infere taxa de chegada (veíc./s) a partir de fila e espera ao vivo (Little).
 */
export function taxaChegadaDeMetricas({ filaMedia, esperaMedia } = {}) {
  if (!(Number.isFinite(filaMedia) && filaMedia >= 0)) return null;
  if (!(Number.isFinite(esperaMedia) && esperaMedia > 0.05)) return null;
  return filaMedia / esperaMedia;
}

function rotuloTempos(t) {
  return `${t.verde}/${t.amarelo}/${t.vermelho}`;
}

/**
 * Compara 2 ou 3 planos lado a lado (métricas de ciclo + opcional Δ F2).
 *
 * @param {Array<{ id?: string, rotulo?: string, tempos: object }>} planos
 * @param {{
 *   taxaChegada?: number|null,
 *   referencia?: number,
 *   grafo?: import("./grafo.js").Grafo,
 *   trechoId?: string,
 *   demanda?: { n?: number, semente?: number },
 *   paresOD?: Array,
 *   comDeltaF2?: boolean,
 * }} [opcoes]
 */
export function compararPlanosFase(planos, {
  taxaChegada = null,
  referencia = 0,
  grafo = null,
  trechoId = null,
  demanda = DEMANDA_COMPARAR_PLANOS,
  paresOD = null,
  comDeltaF2 = false,
} = {}) {
  if (!Array.isArray(planos) || planos.length < 2 || planos.length > 3) {
    return { ok: false, motivo: "Informe 2 ou 3 planos de fase para comparar." };
  }

  const refIdx = Math.max(0, Math.min(planos.length - 1, Number(referencia) || 0));
  const itens = planos.map((p, i) => {
    const metricas = metricasAnaliticasPlano(p.tempos, { taxaChegada });
    const rotulo =
      (p.rotulo && String(p.rotulo).trim()) ||
      (p.id && String(p.id)) ||
      `Plano ${i + 1}`;
    return {
      id: p.id ?? `plano-${i + 1}`,
      rotulo,
      rotuloTempos: rotuloTempos(metricas.tempos),
      ...metricas,
      referencia: i === refIdx,
      deltaEsperaVsRef: null,
      deltaFilaVsRef: null,
      deltaTempoMedio: null,
      tempoMedioViagem: null,
    };
  });

  const ref = itens[refIdx];
  for (const item of itens) {
    item.deltaEsperaVsRef = item.esperaMedia - ref.esperaMedia;
    if (item.filaEstimada != null && ref.filaEstimada != null) {
      item.deltaFilaVsRef = item.filaEstimada - ref.filaEstimada;
    }
  }

  let f2 = null;
  const querF2 = Boolean(comDeltaF2 && grafo && trechoId);
  if (querF2) {
    if (!grafo.trechos?.has(trechoId)) {
      return { ok: false, motivo: `Trecho inexistente: ${trechoId}` };
    }
    const prepRef = prepararGrafoCenarioDispositivo(grafo, {
      tipo: "semaforo",
      trechoId,
      tempos: ref.tempos,
    });
    if (!prepRef.ok) return { ok: false, motivo: prepRef.motivo };

    f2 = { amostra: null, referenciaId: ref.id };
    for (let i = 0; i < itens.length; i++) {
      if (i === refIdx) {
        itens[i].deltaTempoMedio = {
          absoluto: 0,
          percentual: 0,
        };
        itens[i].tempoMedioViagem = null;
        continue;
      }
      const prep = prepararGrafoCenarioDispositivo(grafo, {
        tipo: "semaforo",
        trechoId,
        tempos: itens[i].tempos,
      });
      if (!prep.ok) return { ok: false, motivo: prep.motivo };

      const avaliacao = avaliar({
        grafo: prepRef.grafo,
        grafoCenario: prep.grafo,
        demanda: paresOD ? undefined : demanda,
        paresOD: paresOD ?? undefined,
        trechoAfetado: trechoId,
        topN: 0,
      });
      f2.amostra = avaliacao.amostra?.tamanho ?? f2.amostra;
      itens[i].deltaTempoMedio = avaliacao.delta.tempoMedioViagem;
      itens[i].tempoMedioViagem = avaliacao.cenario.tempoMedioViagem;
      if (itens[refIdx].tempoMedioViagem == null) {
        itens[refIdx].tempoMedioViagem = avaliacao.base.tempoMedioViagem;
      }
    }
  }

  let melhorEsperaId = itens[0].id;
  let melhorEspera = itens[0].esperaMedia;
  for (const item of itens) {
    if (item.esperaMedia < melhorEspera) {
      melhorEspera = item.esperaMedia;
      melhorEsperaId = item.id;
    }
  }

  let melhorDeltaId = null;
  if (f2) {
    let melhorAbs = Infinity;
    for (const item of itens) {
      const abs = item.deltaTempoMedio?.absoluto;
      if (abs == null || Number.isNaN(abs)) continue;
      if (abs < melhorAbs) {
        melhorAbs = abs;
        melhorDeltaId = item.id;
      }
    }
  }

  return {
    ok: true,
    referenciaId: ref.id,
    melhorEsperaId,
    melhorDeltaId,
    planos: itens,
    f2,
    taxaChegada: Number.isFinite(Number(taxaChegada)) ? Number(taxaChegada) : null,
  };
}

/**
 * Aplica o peso analítico de um plano num clone (útil em testes / F3 preview).
 */
export function grafoComPlanoFase(grafo, trechoId, tempos) {
  const g = clonarGrafo(grafo);
  const r = aplicarPesoSemaforoAnalitico(g, { trechoId, tempos });
  if (!r.ok) return r;
  return { ok: true, grafo: g, esperaMedia: r.esperaMedia };
}

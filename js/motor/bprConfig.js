// Parâmetros BPR (Bureau of Public Roads) e capacidades por tipo de via (OSM highway).
// Capacidade = ocupação de saturação estimada (veículos/km na aresta).
// volume/capacity usa a contagem instantânea de veículos na aresta.

/** @typedef {{
 *   alpha: number,
 *   beta: number,
 *   intervaloAtualizacao: number,
 *   limiarRelativoRecalculo: number,
 *   recalcularRotas: boolean,
 *   capacidadePadraoVehPorKm: number,
 *   capacidadesVehPorKm: Record<string, number>,
 * }} BprConfig */

/** @type {Readonly<BprConfig>} */
export const BPR_PADRAO = Object.freeze({
  // t = t0 × (1 + α × (v/c)^β) — valores clássicos do BPR.
  alpha: 0.15,
  beta: 4,
  // Tempo simulado (s) entre recomputar pesos e, se necessário, rerrotear.
  intervaloAtualizacao: 5,
  // Só dispara rerroteamento se alguma aresta mudar |Δpeso|/peso ≥ este limiar.
  limiarRelativoRecalculo: 0.05,
  recalcularRotas: true,
  // Fallback quando o tipo OSM não está mapeado.
  capacidadePadraoVehPorKm: 40,
  // Ocupação de saturação aproximada (veíc./km). Calibrável por região.
  capacidadesVehPorKm: Object.freeze({
    trunk: 90,
    primary: 80,
    primary_link: 70,
    secondary: 60,
    secondary_link: 50,
    tertiary: 50,
    tertiary_link: 45,
    unclassified: 45,
    residential: 35,
    living_street: 25,
    service: 25,
  }),
});

/**
 * Mescla overrides parciais sobre o padrão (cópias rasas dos mapas).
 * @param {Partial<BprConfig>} [overrides]
 * @returns {BprConfig}
 */
export function resolverBprConfig(overrides = {}) {
  const base = BPR_PADRAO;
  return {
    alpha: overrides.alpha ?? base.alpha,
    beta: overrides.beta ?? base.beta,
    intervaloAtualizacao: overrides.intervaloAtualizacao ?? base.intervaloAtualizacao,
    limiarRelativoRecalculo:
      overrides.limiarRelativoRecalculo ?? base.limiarRelativoRecalculo,
    recalcularRotas: overrides.recalcularRotas ?? base.recalcularRotas,
    capacidadePadraoVehPorKm:
      overrides.capacidadePadraoVehPorKm ?? base.capacidadePadraoVehPorKm,
    capacidadesVehPorKm: {
      ...base.capacidadesVehPorKm,
      ...(overrides.capacidadesVehPorKm ?? {}),
    },
  };
}

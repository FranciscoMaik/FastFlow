// F4 — Congestionamento (BPR): custo da aresta cresce com a ocupação.
// t = t0 × (1 + α × (volume/capacidade)^β). Reusa `peso`/`pesoOriginal` do grafo
// e a contagem de veículos por aresta. A prévia F2 (`avaliar`) já lê `aresta.peso`;
// se o grafo tiver pesos congestionados, a avaliação os usa automaticamente.
import { BPR_PADRAO, resolverBprConfig } from "./bprConfig.js";

export { BPR_PADRAO, resolverBprConfig };

/**
 * Fórmula BPR clássica.
 * @param {number} freeFlow tempo livre (s), tipicamente `aresta.pesoOriginal`
 * @param {number} volume contagem (veículos na aresta)
 * @param {number} capacity capacidade de saturação (mesma unidade do volume)
 * @param {{ alpha?: number, beta?: number }} [params]
 * @returns {number}
 */
export function tempoBpr(freeFlow, volume, capacity, { alpha = BPR_PADRAO.alpha, beta = BPR_PADRAO.beta } = {}) {
  if (!Number.isFinite(freeFlow) || freeFlow < 0) {
    throw new RangeError("tempoBpr: freeFlow deve ser um número ≥ 0 finito");
  }
  if (!Number.isFinite(volume) || volume < 0) {
    throw new RangeError("tempoBpr: volume deve ser um número ≥ 0 finito");
  }
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new RangeError("tempoBpr: capacity deve ser um número positivo finito");
  }
  if (!Number.isFinite(alpha) || alpha < 0) {
    throw new RangeError("tempoBpr: alpha deve ser um número ≥ 0 finito");
  }
  if (!Number.isFinite(beta) || beta <= 0) {
    throw new RangeError("tempoBpr: beta deve ser um número positivo finito");
  }
  if (freeFlow === 0) return 0;
  if (volume === 0) return freeFlow;
  const razao = volume / capacity;
  return freeFlow * (1 + alpha * razao ** beta);
}

/**
 * Capacidade da aresta em veículos (ocupação de saturação).
 * Escala `capacidadesVehPorKm[tipo]` pelo comprimento.
 * @param {{ comprimento?: number }} aresta
 * @param {{ meta?: { tipo?: string }, tipo?: string } | null | undefined} trecho
 * @param {import("./bprConfig.js").BprConfig | Partial<import("./bprConfig.js").BprConfig>} [config]
 * @returns {number}
 */
export function capacidadeAresta(aresta, trecho, config = BPR_PADRAO) {
  const cfg = resolverBprConfig(config);
  const comprimento = Number(aresta?.comprimento);
  const tipo = trecho?.meta?.tipo ?? trecho?.tipo ?? null;
  const vehPorKm =
    (tipo != null && cfg.capacidadesVehPorKm[tipo]) || cfg.capacidadePadraoVehPorKm;
  if (!Number.isFinite(comprimento) || comprimento <= 0) {
    // Sem geometria: usa 100 m implícitos para não zerar a capacidade.
    return Math.max(1, vehPorKm * 0.1);
  }
  return Math.max(1, (vehPorKm * comprimento) / 1000);
}

/**
 * Conta veículos ativos por aresta atual (`rota[indice]`).
 * @param {Iterable<{ rota?: string[], indice?: number, status?: string }>} veiculos
 * @returns {Map<string, number>}
 */
export function contarVeiculosPorAresta(veiculos) {
  const volumes = new Map();
  for (const v of veiculos) {
    if (!v || v.status === "retido") continue;
    const arestaId = v.rota?.[v.indice ?? 0];
    if (!arestaId) continue;
    volumes.set(arestaId, (volumes.get(arestaId) ?? 0) + 1);
  }
  return volumes;
}

/**
 * Aplica pesos BPR nas arestas acessíveis. Bloqueadas (peso ∞) ficam intactas.
 * `pesoOriginal` permanece o free-flow; só `peso` é atualizado.
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {Map<string, number> | Record<string, number>} volumesPorAresta
 * @param {Partial<import("./bprConfig.js").BprConfig>} [config]
 * @returns {{
 *   atualizadas: number,
 *   significativas: number,
 *   maxMudancaRelativa: number,
 *   volumes: Map<string, number>,
 *   mudancas: { arestaId: string, pesoAntes: number, pesoDepois: number, volume: number, capacidade: number }[],
 * }}
 */
export function aplicarPesosBpr(grafo, volumesPorAresta, config = {}) {
  if (!grafo) throw new TypeError("aplicarPesosBpr: `grafo` é obrigatório");
  const cfg = resolverBprConfig(config);
  const volumes =
    volumesPorAresta instanceof Map
      ? volumesPorAresta
      : new Map(Object.entries(volumesPorAresta ?? {}));

  let atualizadas = 0;
  let significativas = 0;
  let maxMudancaRelativa = 0;
  const mudancas = [];

  for (const aresta of grafo.arestas.values()) {
    const freeFlow = aresta.pesoOriginal;
    if (!Number.isFinite(freeFlow)) continue;
    // Aresta bloqueada / sentido fechado: peso já é Infinity.
    if (!Number.isFinite(aresta.peso)) continue;

    const trecho = grafo.trechos.get(aresta.trechoId);
    const volume = volumes.get(aresta.id) ?? 0;
    const capacidade = capacidadeAresta(aresta, trecho, cfg);
    const pesoAntes = aresta.peso;
    const pesoDepois = tempoBpr(freeFlow, volume, capacidade, {
      alpha: cfg.alpha,
      beta: cfg.beta,
    });

    if (pesoAntes !== pesoDepois) {
      aresta.peso = pesoDepois;
      atualizadas += 1;
    }

    const base = pesoAntes > 0 ? pesoAntes : freeFlow > 0 ? freeFlow : 1;
    const rel = Math.abs(pesoDepois - pesoAntes) / base;
    if (rel > maxMudancaRelativa) maxMudancaRelativa = rel;
    if (rel >= cfg.limiarRelativoRecalculo) {
      significativas += 1;
      mudancas.push({
        arestaId: aresta.id,
        pesoAntes,
        pesoDepois,
        volume,
        capacidade,
      });
    }
  }

  return {
    atualizadas,
    significativas,
    maxMudancaRelativa,
    volumes,
    mudancas,
  };
}

/**
 * Restaura `peso = pesoOriginal` em arestas acessíveis (útil em testes / desligar F4).
 * @param {import("./grafo.js").Grafo} grafo
 * @returns {number} quantas arestas restauradas
 */
export function restaurarPesosLivres(grafo) {
  let n = 0;
  for (const aresta of grafo.arestas.values()) {
    if (!Number.isFinite(aresta.pesoOriginal)) continue;
    if (!Number.isFinite(aresta.peso)) continue; // mantém bloqueios
    if (aresta.peso !== aresta.pesoOriginal) {
      aresta.peso = aresta.pesoOriginal;
      n += 1;
    }
  }
  return n;
}

/**
 * Conta veículos, aplica BPR e devolve o relatório (mutação in-place do grafo).
 * Com pesos já no grafo, `avaliar({ grafo })` usa o custo congestionado.
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {Iterable<object>} veiculos
 * @param {Partial<import("./bprConfig.js").BprConfig>} [config]
 */
export function atualizarCongestionamento(grafo, veiculos, config) {
  const volumes = contarVeiculosPorAresta(veiculos);
  return aplicarPesosBpr(grafo, volumes, config);
}

/**
 * Converte fluxo OD agregado (`fluxoPorAresta` do F2) em volumes BPR.
 * `escala` calibra a amostra (pico costuma > 1; fora de pico < 1).
 *
 * @param {Record<string, number> | Map<string, number> | null | undefined} fluxoPorAresta
 * @param {{ escala?: number }} [opcoes]
 * @returns {Map<string, number>}
 */
export function volumesDeFluxoOd(fluxoPorAresta, { escala = 1 } = {}) {
  const volumes = new Map();
  const fator = Number.isFinite(escala) && escala > 0 ? escala : 1;
  const entradas =
    fluxoPorAresta instanceof Map
      ? fluxoPorAresta.entries()
      : Object.entries(fluxoPorAresta ?? {});
  for (const [id, fluxo] of entradas) {
    const v = Number(fluxo) * fator;
    if (Number.isFinite(v) && v > 0) volumes.set(id, v);
  }
  return volumes;
}

/**
 * Uma passagem BPR a partir de fluxo OD (ou ocupação heurística equivalente).
 * Mutação in-place — use em cópia do grafo nas prévias analíticas.
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {Record<string, number> | Map<string, number>} fluxoPorAresta
 * @param {{ escala?: number, config?: Partial<import("./bprConfig.js").BprConfig> }} [opcoes]
 */
export function aplicarBprPorFluxoOd(grafo, fluxoPorAresta, { escala = 1, config } = {}) {
  return aplicarPesosBpr(grafo, volumesDeFluxoOd(fluxoPorAresta, { escala }), config);
}

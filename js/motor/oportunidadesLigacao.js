// “Onde construir?” — candidatos a nova ligação (<300 m) ranqueados por ganho F2.
// Caps apertados: grade espacial → top pares mais curtos → amostra OD pequena → top-N.
import { distanciaMetros } from "../adaptador/carregarMalha.js";
import { avaliar } from "./avaliadorImpacto.js";
import { aplicarEmCopia } from "./mudanca.js";

/** Distância máxima entre cruzamentos (metros). */
export const DIST_MAX_M = 300;

/**
 * Distância mínima — evita nós quase-duplicados OSM (&lt;40 m) que dominam o
 * shortlist sem valor de projeto.
 */
export const DIST_MIN_M = 40;

/** Pares espaciais retidos antes da avaliação F2 (mais curtos primeiro). */
export const MAX_PARES_ESPACIAIS = 12;

/** Avaliações F2 efetivas (≤ MAX_PARES_ESPACIAIS). */
export const MAX_CANDIDATOS_AVALIAR = 10;

/** Itens exibidos no painel. */
export const TOP_ONDE_CONSTRUIR = 5;

/** Amostra OD enxuta para o batch (UI responsiva). */
export const DEMANDA_ONDE_CONSTRUIR = Object.freeze({ n: 60, semente: 11 });

/** Velocidade padrão da ligação hipotética (40 km/h → m/s), mão dupla. */
export const VELOCIDADE_PADRAO_MS = 40 / 3.6;

/** Célula da grade ≈ 150 m (metade do raio) em graus de latitude. */
const CELULA_GRAUS = 150 / 111_320;

/**
 * Índice O(1) de ligações diretas já existentes (extremidades, ordem canônica).
 * @param {import("./grafo.js").Grafo} grafo
 * @returns {Set<string>}
 */
export function indiceLigacoesExistentes(grafo) {
  const set = new Set();
  for (const t of grafo.trechos.values()) {
    const ext = t.meta?.extremidades;
    if (!ext || ext.length < 2) continue;
    const [a, b] = ext[0] < ext[1] ? [ext[0], ext[1]] : [ext[1], ext[0]];
    set.add(`${a}|${b}`);
  }
  return set;
}

function chavePar(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Pares de nós sem ligação direta, `minDist` ≤ d &lt; `maxDist`,
 * ordenados do mais curto ao mais longo, com teto `maxPares`.
 * Usa grade espacial (~150 m) — O(n · k) em vez de O(n²).
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {{ maxDist?: number, minDist?: number, maxPares?: number }} [opcoes]
 * @returns {{ de: string, para: string, comprimento: number }[]}
 */
export function paresProximos(
  grafo,
  { maxDist = DIST_MAX_M, minDist = DIST_MIN_M, maxPares = MAX_PARES_ESPACIAIS } = {}
) {
  if (!grafo?.nos) return [];
  const existentes = indiceLigacoesExistentes(grafo);
  const nos = [];
  for (const n of grafo.nos.values()) {
    if (n.lat == null || n.lon == null) continue;
    nos.push(n);
  }
  if (nos.length < 2 || maxPares <= 0) return [];

  /** @type {Map<string, typeof nos>} */
  const grade = new Map();
  for (const n of nos) {
    const kx = Math.floor(n.lon / CELULA_GRAUS);
    const ky = Math.floor(n.lat / CELULA_GRAUS);
    const key = `${kx},${ky}`;
    let bucket = grade.get(key);
    if (!bucket) {
      bucket = [];
      grade.set(key, bucket);
    }
    bucket.push(n);
  }

  /** @type {{ de: string, para: string, comprimento: number }[]} */
  const candidatos = [];
  const vistos = new Set();

  for (const n of nos) {
    const kx = Math.floor(n.lon / CELULA_GRAUS);
    const ky = Math.floor(n.lat / CELULA_GRAUS);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grade.get(`${kx + dx},${ky + dy}`);
        if (!bucket) continue;
        for (const m of bucket) {
          if (m.id <= n.id) continue;
          const chave = chavePar(n.id, m.id);
          if (vistos.has(chave) || existentes.has(chave)) continue;
          vistos.add(chave);
          const d = distanciaMetros([n.lat, n.lon], [m.lat, m.lon]);
          if (!(d > 0) || d < minDist || d >= maxDist) continue;
          candidatos.push({ de: n.id, para: m.id, comprimento: d });
        }
      }
    }
  }

  candidatos.sort((a, b) => {
    if (a.comprimento !== b.comprimento) return a.comprimento - b.comprimento;
    return chavePar(a.de, a.para).localeCompare(chavePar(b.de, b.para));
  });
  return shortlistEstratificado(candidatos, maxPares);
}

/**
 * Mistura bandas 40–80 / 80–150 / 150–300 m para não avaliar só micro-lacunas.
 * @param {{ de: string, para: string, comprimento: number }[]} ordenados
 * @param {number} maxPares
 */
function shortlistEstratificado(ordenados, maxPares) {
  if (maxPares <= 0) return [];
  if (ordenados.length <= maxPares) return ordenados;

  const bandas = [
    ordenados.filter((p) => p.comprimento < 80),
    ordenados.filter((p) => p.comprimento >= 80 && p.comprimento < 150),
    ordenados.filter((p) => p.comprimento >= 150),
  ];
  const porBanda = Math.max(1, Math.ceil(maxPares / bandas.length));
  /** @type {typeof ordenados} */
  const out = [];
  const visto = new Set();

  function tentar(par) {
    const k = chavePar(par.de, par.para);
    if (visto.has(k)) return;
    visto.add(k);
    out.push(par);
  }

  for (const banda of bandas) {
    for (const p of banda.slice(0, porBanda)) {
      tentar(p);
      if (out.length >= maxPares) return out;
    }
  }
  for (const p of ordenados) {
    tentar(p);
    if (out.length >= maxPares) break;
  }
  return out;
}

/**
 * Avalia um único par com F3 `adicionarLigacao` em cópia + F2 `avaliar`.
 * @param {import("./grafo.js").Grafo} grafo
 * @param {{ de: string, para: string, comprimento: number }} par
 * @param {{
 *   demanda?: { n?: number, semente?: number },
 *   velocidade?: number,
 *   sentido?: 0|1|-1,
 * }} [opcoes]
 */
export function avaliarCandidatoLigacao(
  grafo,
  par,
  {
    demanda = DEMANDA_ONDE_CONSTRUIR,
    velocidade = VELOCIDADE_PADRAO_MS,
    sentido = 0,
  } = {}
) {
  const mudanca = {
    tipo: "adicionarLigacao",
    de: String(par.de),
    para: String(par.para),
    comprimento: par.comprimento,
    velocidade,
    sentido,
    nome: "Sugestão de ligação",
  };
  const copia = aplicarEmCopia(grafo, mudanca);
  if (!copia.ok) return { ok: false, motivo: copia.motivo || "Falha ao simular ligação." };

  const trechoId = copia.resultados?.[0]?.trechoId;
  if (!trechoId) return { ok: false, motivo: "Falha ao obter id do trecho simulado." };

  let avaliacao;
  try {
    avaliacao = avaliar({
      grafo,
      demanda,
      grafoCenario: copia.estado.grafo,
      trechoAfetado: { nos: [mudanca.de, mudanca.para], id: trechoId },
      topN: 1,
    });
  } catch (err) {
    return { ok: false, motivo: err?.message || "Falha na avaliação F2." };
  }

  const deltaT = avaliacao.delta?.tempoMedioViagem?.absoluto;
  if (deltaT == null || Number.isNaN(deltaT) || deltaT >= 0) {
    return {
      ok: true,
      ganho: false,
      de: mudanca.de,
      para: mudanca.para,
      comprimento: mudanca.comprimento,
      trechoId,
      deltaTempo: deltaT,
      ganhoTempo: deltaT == null || Number.isNaN(deltaT) ? null : -deltaT,
      avaliacao,
      mudanca: { ...mudanca, id: trechoId },
    };
  }

  return {
    ok: true,
    ganho: true,
    de: mudanca.de,
    para: mudanca.para,
    comprimento: mudanca.comprimento,
    trechoId,
    deltaTempo: deltaT,
    ganhoTempo: -deltaT,
    viagensAfetadasPct: avaliacao.delta.viagensAfetadas?.percentual ?? null,
    viagensNaLigacao: avaliacao.extras?.viagensNaLigacao ?? null,
    avaliacao,
    mudanca: { ...mudanca, id: trechoId },
  };
}

/**
 * Batch síncrono: top pares curtos → F2 → top por ganho de tempo.
 * Preferir `oportunidadesLigacaoAsync` na UI (progresso + yield).
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {{
 *   maxDist?: number,
 *   minDist?: number,
 *   maxParesEspaciais?: number,
 *   maxCandidatos?: number,
 *   maxResultados?: number,
 *   demanda?: { n?: number, semente?: number },
 *   velocidade?: number,
 *   sentido?: 0|1|-1,
 * }} [opcoes]
 */
export function oportunidadesLigacao(
  grafo,
  {
    maxDist = DIST_MAX_M,
    minDist = DIST_MIN_M,
    maxParesEspaciais = MAX_PARES_ESPACIAIS,
    maxCandidatos = MAX_CANDIDATOS_AVALIAR,
    maxResultados = TOP_ONDE_CONSTRUIR,
    demanda = DEMANDA_ONDE_CONSTRUIR,
    velocidade = VELOCIDADE_PADRAO_MS,
    sentido = 0,
  } = {}
) {
  if (!grafo) throw new TypeError("oportunidadesLigacao: `grafo` é obrigatório");

  const pares = paresProximos(grafo, {
    maxDist,
    minDist,
    maxPares: Math.min(maxParesEspaciais, maxCandidatos),
  });
  const ranqueados = [];

  for (const par of pares) {
    const r = avaliarCandidatoLigacao(grafo, par, { demanda, velocidade, sentido });
    if (!r.ok || !r.ganho) continue;
    ranqueados.push({
      de: r.de,
      para: r.para,
      comprimento: r.comprimento,
      ganhoTempo: r.ganhoTempo,
      deltaTempo: r.deltaTempo,
      viagensAfetadasPct: r.viagensAfetadasPct,
      viagensNaLigacao: r.viagensNaLigacao,
      mudanca: r.mudanca,
      avaliacao: r.avaliacao,
      rotulo: `${r.de} ↔ ${r.para}`,
    });
  }

  ranqueados.sort((a, b) => b.ganhoTempo - a.ganhoTempo);
  return {
    ok: true,
    paresEspaciais: pares.length,
    candidatosAvaliados: pares.length,
    maxDist,
    itens: ranqueados.slice(0, maxResultados),
  };
}

function yieldTick() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Variante assíncrona com progresso (1 candidato por frame) — mantém a UI viva.
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {Parameters<typeof oportunidadesLigacao>[1]} [opcoes]
 * @param {{
 *   onProgress?: (p: { atual: number, total: number, fase: string }) => void,
 *   signal?: AbortSignal,
 * }} [ctrl]
 */
export async function oportunidadesLigacaoAsync(grafo, opcoes = {}, ctrl = {}) {
  if (!grafo) throw new TypeError("oportunidadesLigacaoAsync: `grafo` é obrigatório");
  const {
    maxDist = DIST_MAX_M,
    minDist = DIST_MIN_M,
    maxParesEspaciais = MAX_PARES_ESPACIAIS,
    maxCandidatos = MAX_CANDIDATOS_AVALIAR,
    maxResultados = TOP_ONDE_CONSTRUIR,
    demanda = DEMANDA_ONDE_CONSTRUIR,
    velocidade = VELOCIDADE_PADRAO_MS,
    sentido = 0,
  } = opcoes;
  const { onProgress, signal } = ctrl;

  if (signal?.aborted) {
    return { ok: false, motivo: "Busca cancelada.", itens: [], cancelado: true };
  }

  onProgress?.({ atual: 0, total: 0, fase: "pares" });
  await yieldTick();

  const pares = paresProximos(grafo, {
    maxDist,
    minDist,
    maxPares: Math.min(maxParesEspaciais, maxCandidatos),
  });
  const total = pares.length;
  onProgress?.({ atual: 0, total, fase: "avaliar" });

  const ranqueados = [];
  for (let i = 0; i < pares.length; i++) {
    if (signal?.aborted) {
      return { ok: false, motivo: "Busca cancelada.", itens: [], cancelado: true };
    }
    const r = avaliarCandidatoLigacao(grafo, pares[i], { demanda, velocidade, sentido });
    if (r.ok && r.ganho) {
      ranqueados.push({
        de: r.de,
        para: r.para,
        comprimento: r.comprimento,
        ganhoTempo: r.ganhoTempo,
        deltaTempo: r.deltaTempo,
        viagensAfetadasPct: r.viagensAfetadasPct,
        viagensNaLigacao: r.viagensNaLigacao,
        mudanca: r.mudanca,
        avaliacao: r.avaliacao,
        rotulo: `${r.de} ↔ ${r.para}`,
      });
    }
    onProgress?.({ atual: i + 1, total, fase: "avaliar" });
    await yieldTick();
  }

  ranqueados.sort((a, b) => b.ganhoTempo - a.ganhoTempo);
  return {
    ok: true,
    paresEspaciais: pares.length,
    candidatosAvaliados: pares.length,
    maxDist,
    itens: ranqueados.slice(0, maxResultados),
  };
}

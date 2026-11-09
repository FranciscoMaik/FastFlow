// Métricas ao vivo e estimativas analíticas de impacto de lombadas/semáforos (Fase 2).
// Fila/velocidade vêm da física já modelada. A prévia F2 ajusta pesos de aresta
// (zona da lombada / ciclo do semáforo) — ainda sem BPR dinâmico na prévia.
// Fuga de rota (F4) vive em `fugaRota.js` e entra via `metricasDispositivos()` no adaptador.
import { clonarGrafo } from "./mudanca.js";

export const DISTANCIA_SEGURANCA_FILA = 7.0; // m — espelha js/motor/simulacao.js
export const MARGEM_PARADA_SEMAFORO = 2.0; // m

export function msParaKmh(ms) {
  if (ms == null || Number.isNaN(ms)) return null;
  return ms * 3.6;
}

export function kmhParaMs(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return null;
  return kmh / 3.6;
}

/** Velocidade livre (m/s) típica das arestas do trecho. */
export function velocidadeLivreTrecho(grafo, trechoId) {
  const trecho = grafo?.trechos?.get(trechoId);
  if (!trecho) return null;
  let soma = 0;
  let n = 0;
  for (const id of trecho.arestas) {
    const a = grafo.arestas.get(id);
    if (a && Number.isFinite(a.velocidade) && a.velocidade > 0) {
      soma += a.velocidade;
      n += 1;
    }
  }
  return n > 0 ? soma / n : null;
}

/**
 * Velocidade média dos veículos no trecho vs livre.
 * @returns {{ livreMs: number|null, livreKmh: number|null, atualMs: number|null, atualKmh: number|null, n: number }}
 */
export function velocidadeMediaNoTrecho(grafo, veiculos, trechoId) {
  const livreMs = velocidadeLivreTrecho(grafo, trechoId);
  let soma = 0;
  let n = 0;
  for (const v of veiculos ?? []) {
    if (v.status === "retido") continue;
    const arestaId = v.rota?.[v.indice];
    const aresta = arestaId != null ? grafo.arestas.get(arestaId) : null;
    if (!aresta || aresta.trechoId !== trechoId) continue;
    const vel = v.velocidade == null ? aresta.velocidade : v.velocidade;
    if (!Number.isFinite(vel)) continue;
    soma += vel;
    n += 1;
  }
  const atualMs = n > 0 ? soma / n : null;
  return {
    livreMs,
    livreKmh: msParaKmh(livreMs),
    atualMs,
    atualKmh: msParaKmh(atualMs),
    n,
  };
}

function posicaoSemaforoNaAresta(aresta, semaforo) {
  const sentidoInverso = aresta.id.endsWith("<");
  if (semaforo.sentido !== "ambos") {
    const ok = sentidoInverso ? semaforo.sentido === "<" : semaforo.sentido === ">";
    if (!ok) return null;
  }
  return sentidoInverso
    ? aresta.comprimento - semaforo.distancia
    : semaforo.distancia;
}

/**
 * Veículos na fila de um semáforo: mesma aresta, antes da linha de parada,
 * formando cadeia contígua a partir do sinal (gaps ≈ DISTANCIA_SEGURANCA_FILA).
 */
export function filaNoSemaforo(grafo, veiculos, semaforo, {
  distanciaSeguranca = DISTANCIA_SEGURANCA_FILA,
  margemParada = MARGEM_PARADA_SEMAFORO,
} = {}) {
  const trecho = grafo.trechos.get(semaforo.trechoId);
  if (!trecho) {
    return {
      atual: 0,
      comprimentoM: 0,
      posParada: null,
      comprimentoAresta: null,
      arestaId: null,
      transbordo: false,
      veiculoIds: [],
    };
  }

  let melhor = null;

  for (const arestaId of trecho.arestas) {
    const aresta = grafo.arestas.get(arestaId);
    if (!aresta) continue;
    const posSem = posicaoSemaforoNaAresta(aresta, semaforo);
    if (posSem == null || posSem <= 0) continue;

    const posParada = Math.max(0, posSem - margemParada);
    const candidatos = [];
    for (const v of veiculos ?? []) {
      if (v.status === "retido") continue;
      if (v.rota?.[v.indice] !== arestaId) continue;
      if (v.progresso > posParada + 0.5) continue;
      candidatos.push(v);
    }
    candidatos.sort((a, b) => b.progresso - a.progresso);

    const naFila = [];
    let frenteEsperada = posParada;
    for (const v of candidatos) {
      const gap = frenteEsperada - v.progresso;
      // Aceita um pouco de folga além do espaçamento nominal.
      if (gap > distanciaSeguranca * 1.75 && naFila.length > 0) break;
      // Só conta quem está efetivamente parado/lento ou é o primeiro da cadeia.
      if (naFila.length > 0 && (v.velocidade ?? 0) > 2.5 && gap > distanciaSeguranca * 1.1) {
        break;
      }
      naFila.push(v);
      frenteEsperada = v.progresso - distanciaSeguranca;
    }

    const atual = naFila.length;
    const rearmost = naFila.length ? naFila[naFila.length - 1].progresso : null;
    const comprimentoM = atual > 0 ? Math.max(0, posParada - (rearmost ?? posParada)) + distanciaSeguranca : 0;
    const transbordo = detectarTransbordo({
      posParada,
      filaAtual: atual,
      distanciaSeguranca,
      progressoUltimo: rearmost,
    });

    const candidato = {
      atual,
      comprimentoM,
      posParada,
      comprimentoAresta: aresta.comprimento,
      arestaId,
      transbordo,
      veiculoIds: naFila.map((v) => v.id),
    };
    if (!melhor || candidato.atual > melhor.atual) melhor = candidato;
  }

  return (
    melhor ?? {
      atual: 0,
      comprimentoM: 0,
      posParada: null,
      comprimentoAresta: null,
      arestaId: null,
      transbordo: false,
      veiculoIds: [],
    }
  );
}

/**
 * Transbordo: a fila alcança o cruzamento anterior (início da aresta).
 * Critérios: progresso do último ≈ 0, ou fila × espaçamento ≥ distância até a linha.
 */
export function detectarTransbordo({
  posParada,
  filaAtual,
  distanciaSeguranca = DISTANCIA_SEGURANCA_FILA,
  progressoUltimo = null,
  toleranciaInicio = 3,
} = {}) {
  if (!(posParada > 0) || !(filaAtual > 0)) return false;
  if (progressoUltimo != null && progressoUltimo <= toleranciaInicio) return true;
  return filaAtual * distanciaSeguranca >= posParada - toleranciaInicio;
}

/**
 * Snapshot por dispositivo (sem acumulados históricos).
 */
export function snapshotMetricasDispositivos(grafo, veiculos, dispositivos) {
  const lista = [];
  for (const d of dispositivos ?? []) {
    const vel = velocidadeMediaNoTrecho(grafo, veiculos, d.trechoId);
    if (d.tipo === "lombada") {
      lista.push({
        id: d.id,
        tipo: "lombada",
        trechoId: d.trechoId,
        velocidade: vel,
      });
      continue;
    }
    if (d.tipo === "semaforo") {
      const fila = filaNoSemaforo(grafo, veiculos, d);
      lista.push({
        id: d.id,
        tipo: "semaforo",
        trechoId: d.trechoId,
        velocidade: vel,
        fila,
      });
    }
  }
  return lista;
}

/**
 * Acumula fila máx/média e tempo médio de espera por semáforo entre amostras.
 */
export function criarAcumuladorMetricasDispositivos() {
  /** @type {Map<string, { filaMax: number, somaFila: number, nFila: number, esperaAtiva: Map<any, number>, esperas: number[], transbordo: boolean }>} */
  const porId = new Map();

  function estadoDe(id) {
    let e = porId.get(id);
    if (!e) {
      e = {
        filaMax: 0,
        somaFila: 0,
        nFila: 0,
        esperaAtiva: new Map(),
        esperas: [],
        transbordo: false,
      };
      porId.set(id, e);
    }
    return e;
  }

  function amostrar(snapshot, dt = 0) {
    const vistos = new Set();
    for (const item of snapshot ?? []) {
      vistos.add(item.id);
      if (item.tipo !== "semaforo") continue;
      const e = estadoDe(item.id);
      const atual = item.fila?.atual ?? 0;
      e.filaMax = Math.max(e.filaMax, atual);
      e.somaFila += atual;
      e.nFila += 1;
      e.transbordo = Boolean(item.fila?.transbordo);

      if (dt > 0) {
        const ativos = new Set(item.fila?.veiculoIds ?? []);
        for (const idV of ativos) {
          e.esperaAtiva.set(idV, (e.esperaAtiva.get(idV) ?? 0) + dt);
        }
        for (const [idV, tempo] of [...e.esperaAtiva.entries()]) {
          if (!ativos.has(idV)) {
            if (tempo > 0.4) e.esperas.push(tempo);
            e.esperaAtiva.delete(idV);
            if (e.esperas.length > 40) e.esperas.shift();
          }
        }
      }
    }
    for (const id of [...porId.keys()]) {
      if (!vistos.has(id)) porId.delete(id);
    }
  }

  function ler(id) {
    const e = porId.get(id);
    if (!e) {
      return {
        filaMax: 0,
        filaMedia: null,
        esperaMedia: null,
        transbordo: false,
      };
    }
    const esperaAtivaVals = [...e.esperaAtiva.values()];
    const amostrasEspera = e.esperas.length
      ? e.esperas
      : esperaAtivaVals.filter((t) => t > 0.4);
    const esperaMedia = amostrasEspera.length
      ? amostrasEspera.reduce((a, b) => a + b, 0) / amostrasEspera.length
      : null;
    return {
      filaMax: e.filaMax,
      filaMedia: e.nFila > 0 ? e.somaFila / e.nFila : null,
      esperaMedia,
      transbordo: e.transbordo,
    };
  }

  function limpar() {
    porId.clear();
  }

  return { amostrar, ler, limpar };
}

/**
 * Estima pesos de aresta após lombada: zona de efeito a velocidade reduzida.
 * Mutação in-place no grafo (use cópia).
 */
export function aplicarPesoLombadaAnalitico(grafo, {
  trechoId,
  velocidadeMaxKmh = 20,
  raioEfeito = 25,
} = {}) {
  const trecho = grafo.trechos.get(trechoId);
  if (!trecho) return { ok: false, motivo: `Trecho inexistente: ${trechoId}` };
  const vLomb = kmhParaMs(velocidadeMaxKmh);
  if (!(vLomb > 0)) return { ok: false, motivo: "Velocidade da lombada inválida" };

  for (const id of trecho.arestas) {
    const a = grafo.arestas.get(id);
    if (!a || !Number.isFinite(a.peso) || !(a.velocidade > 0)) continue;
    const L = a.comprimento ?? 0;
    const zona = Math.min(L, Math.max(0, 2 * raioEfeito));
    const resto = Math.max(0, L - zona);
    a.peso = resto / a.velocidade + zona / Math.min(a.velocidade, vLomb);
  }
  return { ok: true };
}

/**
 * @param {{ verde?: number, amarelo?: number, vermelho?: number } | null | undefined} tempos
 * @returns {{ verde: number, amarelo: number, vermelho: number }}
 */
export function normalizarTemposFase(tempos) {
  return {
    verde: Math.max(1, Number(tempos?.verde) || 12),
    amarelo: Math.max(0, Number(tempos?.amarelo) || 0),
    vermelho: Math.max(0, Number(tempos?.vermelho) || 10),
  };
}

/**
 * Espera média uniforme no ciclo (chegada aleatória no vermelho + meia amarelo).
 */
export function esperaMediaCiclo(tempos) {
  const t = normalizarTemposFase(tempos);
  const ciclo = t.verde + t.amarelo + t.vermelho;
  if (!(ciclo > 0)) return 0;
  const tempoNaoVerde = t.vermelho + t.amarelo * 0.5;
  return (tempoNaoVerde * tempoNaoVerde) / (2 * ciclo);
}

/**
 * Estima atraso médio de ciclo de semáforo (espera uniforme no ciclo) e soma ao peso.
 * Mutação in-place no grafo (use cópia).
 */
export function aplicarPesoSemaforoAnalitico(grafo, {
  trechoId,
  tempos = { verde: 12, amarelo: 3, vermelho: 10 },
} = {}) {
  const trecho = grafo.trechos.get(trechoId);
  if (!trecho) return { ok: false, motivo: `Trecho inexistente: ${trechoId}` };
  const esperaMedia = esperaMediaCiclo(tempos);

  for (const id of trecho.arestas) {
    const a = grafo.arestas.get(id);
    if (!a || !Number.isFinite(a.peso)) continue;
    a.peso += esperaMedia;
  }
  return { ok: true, esperaMedia };
}

/**
 * Monta grafo de cenário com pesos analíticos do dispositivo (para F2 `avaliar`).
 * Não depende de `dispositivos` no avaliador (que ignora física).
 */
export function prepararGrafoCenarioDispositivo(grafoBase, mudanca) {
  const g = clonarGrafo(grafoBase);
  if (mudanca?.tipo === "lombada") {
    const r = aplicarPesoLombadaAnalitico(g, mudanca);
    if (!r.ok) return r;
    return { ok: true, grafo: g };
  }
  if (mudanca?.tipo === "semaforo") {
    const r = aplicarPesoSemaforoAnalitico(g, mudanca);
    if (!r.ok) return r;
    return { ok: true, grafo: g, esperaMedia: r.esperaMedia };
  }
  return { ok: false, motivo: "Tipo de dispositivo não suportado na prévia" };
}

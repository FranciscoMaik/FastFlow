// Avaliador analítico (F2): compara rotas OD na base e em um cenário hipotético
// e devolve o vocabulário comum de indicadores (base → cenário → delta).
// Não anima, não altera a simulação; é determinístico para o mesmo grafo + OD + mudança.
// Com `bprAnalitico`, aplica uma passagem BPR (F4) a partir do fluxo da amostra OD
// em cópias do grafo — Δ passa a refletir congestionamento aproximado.
import { resolverDemanda } from "./demandaFixa.js";
import { aplicarBprPorFluxoOd, restaurarPesosLivres } from "./congestionamento.js";
import { aplicarEmCopia, clonarGrafo, TIPOS_MUDANCA } from "./mudanca.js";
import { alcancaveis, custoRota, maiorComponenteForte, menorCaminho } from "./roteamento.js";

const TIPOS_F3 = new Set(TIPOS_MUDANCA);

/** F3 tipada (`trechoId` etc.) vs forma leve pré-F3 (`bloquear` + `arestas`/`ignorar`). */
function ehMudancaF3(m) {
  if (!m || typeof m !== "object" || typeof m.aplicarEm === "function") return false;
  if (!TIPOS_F3.has(m.tipo)) return false;
  if (m.tipo === "bloquear" && m.trechoId == null && (m.arestas || m.ignorar)) return false;
  return true;
}

/**
 * @typedef {{ origem: string, destino: string }} ParOD
 * @typedef {{
 *   tempo: number|null,
 *   distancia: number|null,
 *   rota: string[]|null,
 *   retido: boolean,
 *   origem: string,
 *   destino: string,
 * }} ResultadoPar
 * @typedef {{
 *   tempoMedioViagem: number|null,
 *   distanciaMedia: number|null,
 *   kmRodados: number,
 *   retidos: number,
 *   fluxoPorAresta: Record<string, number>,
 *   fluxoPorTrecho: Record<string, number>,
 *   nosComAcesso: string[],
 * }} Indicadores
 */

function normalizarPar(par) {
  if (Array.isArray(par)) return { origem: par[0], destino: par[1] };
  return { origem: par.origem, destino: par.destino };
}

function distanciaRota(grafo, rota) {
  let total = 0;
  for (const id of rota) {
    total += grafo.arestas.get(id).comprimento ?? 0;
  }
  return total;
}

function agregarFluxo(grafo, rota, porAresta, porTrecho) {
  for (const id of rota) {
    porAresta.set(id, (porAresta.get(id) ?? 0) + 1);
    const trechoId = grafo.arestas.get(id).trechoId;
    if (trechoId != null) {
      porTrecho.set(trechoId, (porTrecho.get(trechoId) ?? 0) + 1);
    }
  }
}

/** Nós que alcançam a malha principal ou são alcançados por ela. */
export function nosComAcesso(grafo, { ignorar } = {}) {
  const principal = maiorComponenteForte(grafo, { ignorar });
  if (principal.size === 0) return new Set();
  const alcançam = alcancaveis(grafo, principal, { ignorar, reverso: true });
  const alcançados = alcancaveis(grafo, principal, { ignorar, reverso: false });
  const acesso = new Set(alcançam);
  for (const no of alcançados) acesso.add(no);
  return acesso;
}

/**
 * Roteia cada par OD sobre um grafo (opcionalmente com `ignorar`) e agrega indicadores.
 * @param {import("./grafo.js").Grafo} grafo
 * @param {Array<ParOD|[string,string]>} paresOD
 * @param {{ ignorar?: Set<string> }} [opcoes]
 */
export function avaliarRede(grafo, paresOD, { ignorar } = {}) {
  const porAresta = new Map();
  const porTrecho = new Map();
  const resultados = [];
  let somaTempo = 0;
  let somaDist = 0;
  let nOk = 0;
  let retidos = 0;

  for (const bruto of paresOD) {
    const { origem, destino } = normalizarPar(bruto);
    const rota = menorCaminho(grafo, origem, destino, { ignorar });
    if (rota == null) {
      retidos += 1;
      resultados.push({ origem, destino, rota: null, tempo: null, distancia: null, retido: true });
      continue;
    }
    const tempo = custoRota(grafo, rota);
    const distancia = distanciaRota(grafo, rota);
    somaTempo += tempo;
    somaDist += distancia;
    nOk += 1;
    agregarFluxo(grafo, rota, porAresta, porTrecho);
    resultados.push({ origem, destino, rota, tempo, distancia, retido: false });
  }

  const acesso = nosComAcesso(grafo, { ignorar });

  /** @type {Indicadores} */
  const indicadores = {
    tempoMedioViagem: nOk > 0 ? somaTempo / nOk : null,
    distanciaMedia: nOk > 0 ? somaDist / nOk : null,
    kmRodados: somaDist / 1000,
    retidos,
    fluxoPorAresta: Object.fromEntries(porAresta),
    fluxoPorTrecho: Object.fromEntries(porTrecho),
    nosComAcesso: [...acesso].sort(),
  };

  return { indicadores, resultados };
}

function rotasIguais(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function deltaNumerico(base, cenario) {
  if (base == null && cenario == null) return { absoluto: 0, percentual: null };
  if (base == null) return { absoluto: cenario, percentual: null };
  if (cenario == null) return { absoluto: null, percentual: null };
  const absoluto = cenario - base;
  const percentual = base !== 0 ? (absoluto / base) * 100 : absoluto === 0 ? 0 : null;
  return { absoluto, percentual };
}

function variacaoMapa(baseMap, cenarioMap) {
  const chaves = new Set([...Object.keys(baseMap), ...Object.keys(cenarioMap)]);
  const out = {};
  for (const k of chaves) {
    const delta = (cenarioMap[k] ?? 0) - (baseMap[k] ?? 0);
    if (delta !== 0) out[k] = delta;
  }
  return out;
}

function perdaAcesso(nosBase, nosCenario) {
  const cenario = new Set(nosCenario);
  const perdidos = nosBase.filter((no) => !cenario.has(no));
  return { contagem: perdidos.length, nos: perdidos };
}

function ganhoAcesso(nosBase, nosCenario) {
  const base = new Set(nosBase);
  const ganhos = nosCenario.filter((no) => !base.has(no));
  return { contagem: ganhos.length, nos: ganhos };
}

function topAliviados(variacaoFluxoPorTrecho, fluxoBase, { topN = 5 } = {}) {
  return Object.entries(variacaoFluxoPorTrecho)
    .filter(([, delta]) => delta < 0)
    .map(([trechoId, delta]) => {
      const base = fluxoBase[trechoId] ?? 0;
      return {
        trechoId,
        delta,
        base,
        percentual: base > 0 ? (delta / base) * 100 : null,
      };
    })
    .sort((a, b) => a.delta - b.delta || a.trechoId.localeCompare(b.trechoId))
    .slice(0, topN);
}

/** Conta viagens da amostra cuja rota de cenário usa arestas do trecho. */
export function viagensQueUsamTrecho(resultados, grafo, trechoId) {
  if (!trechoId || !Array.isArray(resultados)) return { contagem: 0, percentual: 0 };
  const trecho = grafo?.trechos?.get(trechoId);
  const arestas = new Set(trecho?.arestas ?? []);
  if (arestas.size === 0) {
    // Fallback: ids com prefixo do trecho (AF>, AF<).
    for (const r of resultados) {
      for (const id of r.rota ?? []) {
        if (id === `${trechoId}>` || id === `${trechoId}<` || id.startsWith(`${trechoId}`)) {
          arestas.add(id);
        }
      }
    }
  }
  let contagem = 0;
  for (const r of resultados) {
    if (!r.rota) continue;
    if (r.rota.some((id) => arestas.has(id) || grafo?.arestas?.get(id)?.trechoId === trechoId)) {
      contagem += 1;
    }
  }
  const total = resultados.length;
  return {
    contagem,
    percentual: total > 0 ? (contagem / total) * 100 : 0,
  };
}

function piorCasoEntre(resultadosBase, resultadosCenario) {
  let pior = null;
  for (let i = 0; i < resultadosBase.length; i++) {
    const b = resultadosBase[i];
    const c = resultadosCenario[i];
    if (b.retido && c.retido) continue;
    let deltaTempo;
    if (!b.retido && c.retido) {
      deltaTempo = Infinity;
    } else if (b.retido && !c.retido) {
      continue; // reconexão: melhora; não é "pior caso"
    } else {
      deltaTempo = c.tempo - b.tempo;
    }
    // Só reporta aumento (ou retenção). Noop / melhoria ⇒ null.
    if (!(deltaTempo > 0)) continue;
    if (
      !pior ||
      deltaTempo > pior.deltaTempo ||
      (deltaTempo === pior.deltaTempo &&
        `${b.origem}>${b.destino}` < `${pior.origem}>${pior.destino}`)
    ) {
      pior = {
        origem: b.origem,
        destino: b.destino,
        tempoBase: b.tempo,
        tempoCenario: c.retido ? null : c.tempo,
        deltaTempo,
        retidoNoCenario: c.retido,
      };
    }
  }
  return pior;
}

function desvioMoradores(resultadosBase, resultadosCenario, nosAfetados) {
  if (!nosAfetados || nosAfetados.size === 0) {
    return { pares: 0, deltaTempoMedio: null, deltaDistanciaMedia: null };
  }
  let n = 0;
  let somaT = 0;
  let somaD = 0;
  for (let i = 0; i < resultadosBase.length; i++) {
    const b = resultadosBase[i];
    const c = resultadosCenario[i];
    if (!nosAfetados.has(b.origem) && !nosAfetados.has(b.destino)) continue;
    if (b.retido || c.retido) continue;
    n += 1;
    somaT += c.tempo - b.tempo;
    somaD += c.distancia - b.distancia;
  }
  return {
    pares: n,
    deltaTempoMedio: n > 0 ? somaT / n : null,
    deltaDistanciaMedia: n > 0 ? somaD / n : null,
  };
}

function nosDoTrechoAfetado(grafo, trechoAfetado) {
  if (!trechoAfetado) return null;
  const nos = new Set();
  if (typeof trechoAfetado === "string") {
    const trecho = grafo.trechos.get(trechoAfetado);
    if (!trecho) return nos;
    for (const id of trecho.arestas) {
      const a = grafo.arestas.get(id);
      if (a) {
        nos.add(a.de);
        nos.add(a.para);
      }
    }
    return nos;
  }
  if (Array.isArray(trechoAfetado.arestas)) {
    for (const id of trechoAfetado.arestas) {
      const a = grafo.arestas.get(id);
      if (a) {
        nos.add(a.de);
        nos.add(a.para);
      }
    }
  }
  if (Array.isArray(trechoAfetado.nos)) {
    for (const no of trechoAfetado.nos) nos.add(no);
  }
  return nos;
}

function topSobrecarregados(variacaoFluxoPorTrecho, fluxoBase, { topN = 5 } = {}) {
  return Object.entries(variacaoFluxoPorTrecho)
    .filter(([, delta]) => delta > 0)
    .map(([trechoId, delta]) => {
      const base = fluxoBase[trechoId] ?? 0;
      return {
        trechoId,
        delta,
        base,
        percentual: base > 0 ? (delta / base) * 100 : null,
      };
    })
    .sort((a, b) => b.delta - a.delta || a.trechoId.localeCompare(b.trechoId))
    .slice(0, topN);
}

/**
 * Resolve o grafo/opções do cenário a partir das formas aceitas (F1/F3-friendly).
 *
 * Preferência:
 * 1. `grafoCenario` — grafo já preparado
 * 2. `ignorar` — Set de arestas hipoteticamente bloqueadas (mesmo padrão de `validarBloqueio`)
 * 3. `aplicar(grafo)` — callback que devolve um grafo de cenário (ou muta uma cópia e a devolve)
 * 4. `mudancas` — F3 tipadas via `aplicarEmCopia` (`{ tipo:'inverter'|'bloquear'|..., trechoId }`);
 *    ainda aceita objeto legado com `aplicarEm(grafo)` e a forma leve `{ tipo:'bloquear', arestas }`
 * 5. sem mudança — cenário = base (noop)
 */
export function resolverCenario({ grafo, grafoCenario, ignorar, aplicar, mudancas }) {
  if (grafoCenario) return { grafo: grafoCenario, ignorar: undefined };
  if (ignorar) return { grafo, ignorar };
  if (typeof aplicar === "function") {
    const resultado = aplicar(grafo);
    return { grafo: resultado ?? grafo, ignorar: undefined };
  }
  if (mudancas != null) {
    const lista = Array.isArray(mudancas) ? mudancas : [mudancas];
    const comAplicar = lista.find((m) => m && typeof m.aplicarEm === "function");
    if (comAplicar) {
      return { grafo: comAplicar.aplicarEm(grafo), ignorar: undefined };
    }
    if (lista.length > 0 && lista.every(ehMudancaF3)) {
      const r = aplicarEmCopia(grafo, lista);
      if (!r.ok) {
        throw new Error(r.motivo ?? "Falha ao aplicar mudanças F3 no cenário");
      }
      return { grafo: r.estado.grafo, ignorar: undefined };
    }
    // Forma leve pré-F3: { tipo: "bloquear", arestas: string[] } ou { ignorar: Set|string[] }
    const bloqueio = lista.find(
      (m) => m && (m.ignorar || m.tipo === "bloquear" || m.arestas)
    );
    if (bloqueio) {
      const ids = bloqueio.ignorar ?? bloqueio.arestas ?? [];
      return { grafo, ignorar: ids instanceof Set ? ids : new Set(ids) };
    }
  }
  return { grafo, ignorar: undefined };
}

/**
 * Cópia do grafo com pesos BPR a partir do fluxo OD (passagem analítica).
 * Não muta o grafo original. `iteracoes` > 1 reatribui rotas com os pesos novos.
 *
 * @param {import("./grafo.js").Grafo} grafo
 * @param {Array<ParOD|[string,string]>} paresOD
 * @param {{
 *   escalaVolume?: number,
 *   iteracoes?: number,
 *   ignorar?: Set<string>,
 *   bprConfig?: object,
 * }} [opcoes]
 */
export function grafoComBprAnalitico(
  grafo,
  paresOD,
  { escalaVolume = 1, iteracoes = 1, ignorar, bprConfig } = {}
) {
  const g = clonarGrafo(grafo);
  restaurarPesosLivres(g);
  const n = Math.max(1, Math.trunc(iteracoes) || 1);
  let ultimo = null;
  for (let i = 0; i < n; i++) {
    const { indicadores } = avaliarRede(g, paresOD, { ignorar });
    ultimo = aplicarBprPorFluxoOd(g, indicadores.fluxoPorAresta, {
      escala: escalaVolume,
      config: bprConfig,
    });
  }
  return { grafo: g, bpr: ultimo };
}

/**
 * Avalia o impacto de uma mudança hipotética sobre uma amostra fixa de pares OD.
 * Usa `aresta.peso` (Dijkstra). Com F4, se o grafo já tiver pesos BPR aplicados,
 * a avaliação reflete o custo congestionado.
 *
 * Com `bprAnalitico: true` (ou opções), aplica passagem BPR em cópias a partir do
 * fluxo da amostra OD — Δ aproxima congestionamento sem o tick ao vivo da simulação.
 *
 * Amostra: passe `paresOD` pronto (F1) ou `demanda` no formato de `resolverDemanda`
 * (`{ n, semente }`, array, etc.). Sem os dois, gera 200 pares a partir dos nós do grafo.
 *
 * @param {{
 *   grafo: import("./grafo.js").Grafo,
 *   paresOD?: Array<ParOD|[string,string]>,
 *   demanda?: false|null|Array<ParOD>|{ n?: number, semente?: number, nos?: Iterable<string>, periodo?: string, grafo?: object, concentracao?: number },
 *   grafoCenario?: import("./grafo.js").Grafo,
 *   ignorar?: Set<string>,
 *   aplicar?: (grafo: import("./grafo.js").Grafo) => import("./grafo.js").Grafo,
 *   mudancas?: object|object[],
 *   trechoAfetado?: string|{ arestas?: string[], nos?: string[] },
 *   topN?: number,
 *   bprAnalitico?: boolean|{ escalaVolume?: number, iteracoes?: number, bprConfig?: object },
 * }} args
 * @returns {{
 *   base: Indicadores,
 *   cenario: Indicadores,
 *   delta: object,
 *   amostra: { tamanho: number, viagensComRotaBase: number, viagensComRotaCenario: number },
 *   extras: object,
 * }}
 */
export function avaliar({
  grafo,
  paresOD,
  demanda,
  grafoCenario,
  ignorar,
  aplicar,
  mudancas,
  trechoAfetado,
  topN = 5,
  bprAnalitico = false,
} = {}) {
  if (!grafo) throw new TypeError("avaliar: `grafo` é obrigatório");

  let pares = paresOD;
  if (pares == null) {
    const demandaOpts =
      demanda === undefined
        ? { n: 200, semente: 1 }
        : demanda && typeof demanda === "object" && !Array.isArray(demanda)
          ? { ...demanda, grafo: demanda.grafo ?? grafo }
          : demanda;
    const gerados = resolverDemanda(demandaOpts, grafo.nos.keys());
    if (!gerados) throw new TypeError("avaliar: informe `paresOD` ou uma `demanda` utilizável");
    pares = gerados;
  }
  if (!Array.isArray(pares)) throw new TypeError("avaliar: `paresOD` deve ser um array");

  const cenarioResolvido = resolverCenario({ grafo, grafoCenario, ignorar, aplicar, mudancas });
  const usarBpr = Boolean(bprAnalitico);
  const bprOpts =
    bprAnalitico && typeof bprAnalitico === "object" ? bprAnalitico : {};

  let grafoBase = grafo;
  let grafoCen = cenarioResolvido.grafo;
  /** @type {null | { aplicado: true, aproximado: true, escalaVolume: number, iteracoes: number }} */
  let metaBpr = null;

  if (usarBpr) {
    const escalaVolume = bprOpts.escalaVolume ?? 1;
    const iteracoes = bprOpts.iteracoes ?? 1;
    const prepBase = grafoComBprAnalitico(grafo, pares, {
      escalaVolume,
      iteracoes,
      bprConfig: bprOpts.bprConfig,
    });
    const prepCen = grafoComBprAnalitico(cenarioResolvido.grafo, pares, {
      escalaVolume,
      iteracoes,
      ignorar: cenarioResolvido.ignorar,
      bprConfig: bprOpts.bprConfig,
    });
    grafoBase = prepBase.grafo;
    grafoCen = prepCen.grafo;
    metaBpr = { aplicado: true, aproximado: true, escalaVolume, iteracoes };
  }

  const base = avaliarRede(grafoBase, pares);
  const cenario = avaliarRede(grafoCen, pares, {
    ignorar: cenarioResolvido.ignorar,
  });

  let afetadas = 0;
  for (let i = 0; i < base.resultados.length; i++) {
    if (!rotasIguais(base.resultados[i].rota, cenario.resultados[i].rota)) afetadas += 1;
  }
  const viagensAfetadas = pares.length > 0 ? (afetadas / pares.length) * 100 : 0;

  const variacaoFluxoPorTrecho = variacaoMapa(
    base.indicadores.fluxoPorTrecho,
    cenario.indicadores.fluxoPorTrecho
  );
  const variacaoFluxoPorAresta = variacaoMapa(
    base.indicadores.fluxoPorAresta,
    cenario.indicadores.fluxoPorAresta
  );
  const acesso = perdaAcesso(base.indicadores.nosComAcesso, cenario.indicadores.nosComAcesso);
  const acessoGanho = ganhoAcesso(base.indicadores.nosComAcesso, cenario.indicadores.nosComAcesso);
  const tempo = deltaNumerico(
    base.indicadores.tempoMedioViagem,
    cenario.indicadores.tempoMedioViagem
  );
  const distancia = deltaNumerico(
    base.indicadores.distanciaMedia,
    cenario.indicadores.distanciaMedia
  );
  const km = deltaNumerico(base.indicadores.kmRodados, cenario.indicadores.kmRodados);

  const nosAfetados = nosDoTrechoAfetado(grafo, trechoAfetado);
  const trechoIdNovo =
    typeof trechoAfetado === "string"
      ? trechoAfetado
      : trechoAfetado?.id ?? trechoAfetado?.trechoId ?? null;

  return {
    base: base.indicadores,
    cenario: cenario.indicadores,
    delta: {
      tempoMedioViagem: tempo,
      distanciaMedia: distancia,
      kmRodados: km,
      retidos: cenario.indicadores.retidos - base.indicadores.retidos,
      viagensAfetadas: { percentual: viagensAfetadas, contagem: afetadas },
      piorCaso: piorCasoEntre(base.resultados, cenario.resultados),
      perdaAcesso: acesso,
      ganhoAcesso: acessoGanho,
      variacaoFluxoPorTrecho,
      variacaoFluxoPorAresta,
    },
    amostra: {
      tamanho: pares.length,
      viagensComRotaBase: pares.length - base.indicadores.retidos,
      viagensComRotaCenario: pares.length - cenario.indicadores.retidos,
    },
    // Extras úteis à prévia de Inversão / Bloqueio / Ligação (não fazem parte do vocabulário mínimo).
    extras: {
      desvioMoradores: desvioMoradores(base.resultados, cenario.resultados, nosAfetados),
      trechosSobrecarregados: topSobrecarregados(
        variacaoFluxoPorTrecho,
        base.indicadores.fluxoPorTrecho,
        { topN }
      ),
      trechosAliviados: topAliviados(
        variacaoFluxoPorTrecho,
        base.indicadores.fluxoPorTrecho,
        { topN }
      ),
      viagensNaLigacao: trechoIdNovo
        ? viagensQueUsamTrecho(cenario.resultados, grafoCen, trechoIdNovo)
        : null,
      bprAnalitico: metaBpr,
      resultadosBase: base.resultados,
      resultadosCenario: cenario.resultados,
    },
  };
}

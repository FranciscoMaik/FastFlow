// Análise da página de contingência: robustez (F2), composição de atraso e
// planejamento de rotas na malha local com bloqueios do cenário F5.
import { distanciaMetros } from "./adaptador/carregarMalha.js";
import { projetarPontoEmSegmento, snapParaNoMaisProximo } from "./motor/geometriaSnap.js";
import { clonarGrafo, aplicarEmCopia } from "./motor/mudanca.js";
import { menorCaminho, custoRota } from "./motor/roteamento.js";
import {
  aplicarPesoLombadaAnalitico,
  aplicarPesoSemaforoAnalitico,
} from "./motor/metricasDispositivos.js";
import { tempoBpr, capacidadeAresta, BPR_PADRAO } from "./motor/congestionamento.js";

const OCUPACAO_HEURISTICA = 0.45;

function somaPesosRota(grafo, arestas, { usarOriginal = false } = {}) {
  let total = 0;
  for (const id of arestas) {
    const a = grafo.arestas.get(id);
    if (!a) continue;
    const peso = usarOriginal ? a.pesoOriginal : a.peso;
    if (!Number.isFinite(peso)) return Infinity;
    total += peso;
  }
  return total;
}

function distanciaRota(grafo, arestas) {
  let total = 0;
  for (const id of arestas) {
    total += grafo.arestas.get(id)?.comprimento ?? 0;
  }
  return total;
}

/** Aresta mais próxima de um ponto (por geometria), ou null fora do raio. */
export function arestaMaisProxima(grafo, ponto, raioMaxMetros = 45) {
  let melhor = null;
  let menor = Infinity;
  for (const aresta of grafo.arestas.values()) {
    const pts = aresta.geometria?.pontos;
    if (!pts || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const proj = projetarPontoEmSegmento(ponto, pts[i], pts[i + 1]);
      const d = distanciaMetros(ponto, proj.ponto);
      if (d < menor) {
        menor = d;
        melhor = aresta.id;
      }
    }
  }
  return menor <= raioMaxMetros ? melhor : null;
}

/**
 * Aproxima a polilinha (OSRM / mapa) a uma sequência de arestas da malha local.
 * Amostragem a cada `passo` pontos para não explodir em traçados densos.
 */
export function mapearPolilinhaParaArestas(grafo, pontos, { raioMaxMetros = 45, passo = 4 } = {}) {
  if (!grafo || !Array.isArray(pontos) || pontos.length === 0) return [];
  const ids = [];
  const visto = new Set();
  const registrar = (ponto) => {
    const id = arestaMaisProxima(grafo, ponto, raioMaxMetros);
    if (id && !visto.has(id)) {
      visto.add(id);
      ids.push(id);
    }
  };
  for (let i = 0; i < pontos.length; i += Math.max(1, passo)) {
    registrar(pontos[i]);
  }
  registrar(pontos[pontos.length - 1]);
  return ids;
}

/**
 * Selo de robustez: a rota é frágil se bloquear qualquer aresta do trajeto
 * deixa origem→destino sem caminho (F2 `menorCaminho` com `ignorar`).
 */
export function avaliarRobustezRota(grafo, origem, destino, arestasRota) {
  if (!grafo || origem == null || destino == null) {
    return { selo: null, arestasCriticas: [], totalArestas: 0 };
  }
  if (origem === destino) {
    return { selo: "robusta", arestasCriticas: [], totalArestas: 0 };
  }
  const arestas = Array.isArray(arestasRota) ? arestasRota.filter((id) => grafo.arestas.has(id)) : [];
  if (arestas.length === 0) {
    return { selo: null, arestasCriticas: [], totalArestas: 0 };
  }
  // Confirma que a rota atual ainda conecta (pode já estar interrompida).
  const base = menorCaminho(grafo, origem, destino);
  if (base == null) {
    return { selo: "frágil", arestasCriticas: [...arestas], totalArestas: arestas.length };
  }

  const criticas = [];
  for (const arestaId of arestas) {
    const alt = menorCaminho(grafo, origem, destino, { ignorar: new Set([arestaId]) });
    if (alt == null) criticas.push(arestaId);
  }
  return {
    selo: criticas.length > 0 ? "frágil" : "robusta",
    arestasCriticas: criticas,
    totalArestas: arestas.length,
  };
}

/**
 * Atraso analítico de lombadas/semáforos do cenário F5 sobre as arestas da rota.
 */
export function estimarAtrasoDispositivosNaRota(grafo, arestasRota, mudancas = []) {
  if (!grafo || !arestasRota?.length) return 0;
  const dispositivos = (mudancas || []).filter(
    (m) => m && (m.tipo === "lombada" || m.tipo === "semaforo")
  );
  if (dispositivos.length === 0) return 0;

  const g = clonarGrafo(grafo);
  for (const a of g.arestas.values()) {
    if (Number.isFinite(a.pesoOriginal)) a.peso = a.pesoOriginal;
  }
  const antes = somaPesosRota(g, arestasRota);
  if (!Number.isFinite(antes)) return 0;

  for (const m of dispositivos) {
    if (m.tipo === "lombada") aplicarPesoLombadaAnalitico(g, m);
    else if (m.tipo === "semaforo") aplicarPesoSemaforoAnalitico(g, m);
  }
  const depois = somaPesosRota(g, arestasRota);
  if (!Number.isFinite(depois)) return 0;
  return Math.max(0, depois - antes);
}

/**
 * Congestionamento heurístico (F4 BPR) sem volumes ao vivo:
 * ocupa cada aresta a `ocupacao` × capacidade e mede o Δ vs free-flow.
 */
export function estimarAtrasoCongestionamentoHeuristico(
  grafo,
  arestasRota,
  { ocupacao = OCUPACAO_HEURISTICA, config = BPR_PADRAO } = {}
) {
  if (!grafo || !arestasRota?.length) return 0;
  let livre = 0;
  let congest = 0;
  for (const id of arestasRota) {
    const a = grafo.arestas.get(id);
    if (!a || !Number.isFinite(a.pesoOriginal)) continue;
    livre += a.pesoOriginal;
    const trecho = grafo.trechos.get(a.trechoId);
    const cap = capacidadeAresta(a, trecho, config);
    const volume = Math.max(0, ocupacao) * cap;
    congest += tempoBpr(a.pesoOriginal, volume, cap, {
      alpha: config.alpha,
      beta: config.beta,
    });
  }
  return Math.max(0, congest - livre);
}

/**
 * Decompõe o atraso vs rota principal em: distância extra × dispositivos × congestionamento.
 * Sem estimativa de congestão explícita, o residual do atraso total vira congestão.
 */
export function comporAtraso({
  duracaoS,
  duracaoPrincipalS,
  distanciaM,
  distanciaPrincipalM,
  atrasoDispositivosS = 0,
  atrasoCongestionamentoS = null,
} = {}) {
  const totalAtrasoS =
    typeof duracaoS === "number" &&
    typeof duracaoPrincipalS === "number" &&
    Number.isFinite(duracaoS) &&
    Number.isFinite(duracaoPrincipalS)
      ? Math.max(0, duracaoS - duracaoPrincipalS)
      : 0;

  let extraDistanciaS = 0;
  if (
    typeof distanciaM === "number" &&
    typeof distanciaPrincipalM === "number" &&
    Number.isFinite(distanciaM) &&
    Number.isFinite(distanciaPrincipalM) &&
    Number.isFinite(duracaoPrincipalS) &&
    distanciaPrincipalM > 0 &&
    duracaoPrincipalS > 0
  ) {
    const velocidade = distanciaPrincipalM / duracaoPrincipalS;
    extraDistanciaS = Math.max(0, (distanciaM - distanciaPrincipalM) / velocidade);
  }

  const dispositivosS = Math.max(0, Number(atrasoDispositivosS) || 0);
  let congestionamentoS =
    atrasoCongestionamentoS == null
      ? Math.max(0, totalAtrasoS - extraDistanciaS - dispositivosS)
      : Math.max(0, Number(atrasoCongestionamentoS) || 0);

  let segmentos = {
    extraDistanciaS,
    dispositivosS,
    congestionamentoS,
  };
  const somaBruta =
    segmentos.extraDistanciaS + segmentos.dispositivosS + segmentos.congestionamentoS;

  if (totalAtrasoS > 0 && somaBruta > 0) {
    const escala = totalAtrasoS / somaBruta;
    segmentos = {
      extraDistanciaS: segmentos.extraDistanciaS * escala,
      dispositivosS: segmentos.dispositivosS * escala,
      congestionamentoS: segmentos.congestionamentoS * escala,
    };
  } else if (totalAtrasoS === 0 && atrasoCongestionamentoS == null) {
    segmentos = { extraDistanciaS: 0, dispositivosS: 0, congestionamentoS: 0 };
  }

  const total =
    segmentos.extraDistanciaS + segmentos.dispositivosS + segmentos.congestionamentoS;
  const pct = (v) => (total > 0 ? (100 * v) / total : 0);

  return {
    totalAtrasoS: totalAtrasoS > 0 ? totalAtrasoS : total,
    segmentos,
    percentuais: {
      extraDistancia: pct(segmentos.extraDistanciaS),
      dispositivos: pct(segmentos.dispositivosS),
      congestionamento: pct(segmentos.congestionamentoS),
    },
  };
}

/** Polilinha [lat,lon] a partir dos ids de aresta (geometria concatenada). */
export function polilinhaDasArestas(grafo, arestas) {
  const pontos = [];
  for (const id of arestas) {
    const geo = grafo.arestas.get(id)?.geometria?.pontos;
    if (!geo?.length) continue;
    for (const p of geo) {
      const prev = pontos[pontos.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) {
        pontos.push([p[0], p[1]]);
      }
    }
  }
  return pontos;
}

/**
 * Até `k` rotas OD: principal + alternativas por exclusão de arestas (estilo Yen leve).
 * `ignorarBase` = arestas já vedadas (ex.: bloqueios já aplicados no grafo).
 */
export function rotasAlternativas(grafo, origem, destino, { k = 3, ignorarBase = null } = {}) {
  if (!grafo || origem == null || destino == null) return [];
  const ignorar = new Set(ignorarBase || []);
  const principal = menorCaminho(grafo, origem, destino, { ignorar });
  if (principal == null) return [];
  if (origem === destino) return [[]];

  const rotas = [principal];
  const candidatosArestas = new Set(principal);

  while (rotas.length < k) {
    let melhor = null;
    let melhorCusto = Infinity;
    const chaves = new Set(rotas.map((r) => r.join("\0")));

    for (const arestaId of candidatosArestas) {
      const tentativa = new Set(ignorar);
      tentativa.add(arestaId);
      const cand = menorCaminho(grafo, origem, destino, { ignorar: tentativa });
      if (!cand) continue;
      const chave = cand.join("\0");
      if (chaves.has(chave)) continue;
      const custo = custoRota(grafo, cand);
      if (custo < melhorCusto) {
        melhorCusto = custo;
        melhor = cand;
      }
    }
    if (!melhor) break;
    rotas.push(melhor);
    for (const id of melhor) candidatosArestas.add(id);
  }
  return rotas;
}

/**
 * Planeja rotas na malha local aplicando mudanças do cenário F5 (bloqueios etc.).
 * Origem/destino são ids de nó do grafo.
 */
export function planejarRotasNaMalha(grafoBase, origem, destino, {
  mudancas = [],
  k = 3,
  ocupacaoCongestionamento = OCUPACAO_HEURISTICA,
} = {}) {
  if (!grafoBase) {
    return { ok: false, motivo: "Malha local indisponível." };
  }
  if (origem == null || destino == null) {
    return { ok: false, motivo: "Origem e destino são obrigatórios." };
  }

  let grafo = grafoBase;
  if (mudancas?.length) {
    const aplicado = aplicarEmCopia(grafoBase, mudancas);
    if (!aplicado.ok) {
      return { ok: false, motivo: aplicado.motivo || "Não foi possível aplicar o cenário F5." };
    }
    grafo = aplicado.estado.grafo;
    // Pesos analíticos de dispositivos (F3 só registra o objeto; a rota usa o Δ de peso).
    for (const m of mudancas) {
      if (m?.tipo === "lombada") aplicarPesoLombadaAnalitico(grafo, m);
      else if (m?.tipo === "semaforo") aplicarPesoSemaforoAnalitico(grafo, m);
    }
  }

  const listas = rotasAlternativas(grafo, origem, destino, { k });
  if (listas.length === 0) {
    return {
      ok: false,
      motivo: "Não há caminho entre origem e destino com o cenário ativo.",
      grafo,
    };
  }

  const chaves = ["primary", "alternative", "alternative-two"];
  const rotas = {};
  for (let i = 0; i < chaves.length; i++) {
    const chave = chaves[i];
    const arestas = listas[i] || null;
    if (!arestas) {
      rotas[chave] = null;
      continue;
    }
    const pontos = polilinhaDasArestas(grafo, arestas);
    const duracaoS = custoRota(grafo, arestas);
    const distanciaM = distanciaRota(grafo, arestas);
    const robustez = avaliarRobustezRota(grafo, origem, destino, arestas);
    const atrasoDispositivosS = estimarAtrasoDispositivosNaRota(grafoBase, arestas, mudancas);
    const atrasoCongestionamentoS = estimarAtrasoCongestionamentoHeuristico(grafoBase, arestas, {
      ocupacao: ocupacaoCongestionamento,
    });
    rotas[chave] = {
      arestas,
      pontos,
      distanciaM,
      duracaoS,
      robustez,
      atrasoDispositivosS,
      atrasoCongestionamentoS,
    };
  }

  const principal = rotas.primary;
  for (const chave of chaves) {
    const r = rotas[chave];
    if (!r || !principal) continue;
    r.composicao = comporAtraso({
      duracaoS: r.duracaoS,
      duracaoPrincipalS: principal.duracaoS,
      distanciaM: r.distanciaM,
      distanciaPrincipalM: principal.distanciaM,
      atrasoDispositivosS: r.atrasoDispositivosS,
      atrasoCongestionamentoS: r.atrasoCongestionamentoS,
    });
  }

  return { ok: true, grafo, origem, destino, rotas };
}

/** Snap de clique do mapa a um nó da malha (raio mais folgado na contingência). */
export function snapOrigemDestino(ponto, grafo, raioMaxMetros = 80) {
  return snapParaNoMaisProximo(ponto, grafo, raioMaxMetros);
}

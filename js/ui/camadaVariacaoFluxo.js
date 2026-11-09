// Camada Leaflet: variação de fluxo F2 (prévia “Se inverter…”).
// Vermelho = recebe mais fluxo; verde = aliviada. Preferência: aresta, senão trecho.
/* global L */

const COR_MAIS = { r: 220, g: 38, b: 38 }; // #dc2626
const COR_MENOS = { r: 22, g: 163, b: 74 }; // #16a34a

function rgba({ r, g, b }, alpha) {
  return `rgba(${r},${g},${b},${alpha})`;
}

function estiloPara(delta, maxAbs) {
  const mag = Math.abs(delta);
  const t = maxAbs > 0 ? Math.min(1, mag / maxAbs) : 0;
  const alpha = 0.35 + 0.55 * t;
  const weight = 5 + Math.round(5 * t);
  const base = delta > 0 ? COR_MAIS : COR_MENOS;
  return {
    color: rgba(base, alpha),
    weight,
    opacity: 1,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
    className: delta > 0 ? "via-variacao via-variacao-mais" : "via-variacao via-variacao-menos",
  };
}

/**
 * Resolve geometrias para pintar. Prefere `variacaoFluxoPorAresta`; completa com trecho.
 * @param {{ variacaoFluxoPorTrecho?: Record<string, number>, variacaoFluxoPorAresta?: Record<string, number> }} delta
 * @param {Array<{ id: string, pontos?: number[][], direcoesAtivas?: Array<{ id: string, geometria?: { pontos?: number[][] } }> }>} trechos
 */
export function segmentosVariacaoFluxo(delta, trechos = []) {
  const porAresta = delta?.variacaoFluxoPorAresta ?? {};
  const porTrecho = delta?.variacaoFluxoPorTrecho ?? {};
  const lista = Array.isArray(trechos) ? trechos : [];
  const porId = new Map(lista.map((t) => [t.id, t]));
  const segs = [];
  const trechosComAresta = new Set();

  for (const [arestaId, d] of Object.entries(porAresta)) {
    if (!d) continue;
    let pontos = null;
    for (const t of lista) {
      const dir = t.direcoesAtivas?.find((x) => x.id === arestaId);
      if (dir?.geometria?.pontos?.length >= 2) {
        pontos = dir.geometria.pontos;
        trechosComAresta.add(t.id);
        break;
      }
    }
    if (!pontos) continue;
    segs.push({ id: arestaId, pontos, delta: d });
  }

  for (const [trechoId, d] of Object.entries(porTrecho)) {
    if (!d) continue;
    if (trechosComAresta.has(trechoId)) continue;
    const t = porId.get(trechoId);
    if (!t?.pontos || t.pontos.length < 2) continue;
    segs.push({ id: trechoId, pontos: t.pontos, delta: d });
  }

  return segs;
}

/**
 * @param {import("leaflet").Map} mapa
 */
export function criarCamadaVariacaoFluxo(mapa) {
  const grupo = L.layerGroup();
  let visivel = true;
  /** @type {Array<{ id: string, pontos: number[][], delta: number }> | null} */
  let segmentos = null;
  let noMapa = false;

  function garantirNoMapa() {
    if (!noMapa) {
      grupo.addTo(mapa);
      noMapa = true;
    }
  }

  function tirarDoMapa() {
    if (noMapa) {
      mapa.removeLayer(grupo);
      noMapa = false;
    }
  }

  function redesenhar() {
    grupo.clearLayers();
    if (!visivel || !segmentos?.length) {
      tirarDoMapa();
      return;
    }
    garantirNoMapa();
    const maxAbs = Math.max(...segmentos.map((s) => Math.abs(s.delta)), 1);
    for (const seg of segmentos) {
      L.polyline(seg.pontos, estiloPara(seg.delta, maxAbs)).addTo(grupo);
    }
  }

  return {
    /**
     * Atualiza a pintura a partir do `delta` de `avaliar` e geometria viva dos trechos.
     * Guarda os pontos resolvidos para sobreviver a inversão (sentido muda, geometria base permanece).
     */
    atualizar(delta, trechos) {
      const segs = segmentosVariacaoFluxo(delta, trechos);
      segmentos = segs.length ? segs : null;
      redesenhar();
      return Boolean(segmentos);
    },

    /** Reaplica segmentos já resolvidos (ex.: fixar após inverter). */
    restaurar(segs) {
      segmentos = Array.isArray(segs) && segs.length ? segs.map((s) => ({ ...s })) : null;
      redesenhar();
      return Boolean(segmentos);
    },

    obterSegmentos() {
      return segmentos ? segmentos.map((s) => ({ ...s })) : null;
    },

    limpar() {
      segmentos = null;
      grupo.clearLayers();
      tirarDoMapa();
    },

    definirVisivel(ligado) {
      visivel = Boolean(ligado);
      redesenhar();
    },

    estaVisivel() {
      return visivel;
    },

    temDados() {
      return Boolean(segmentos?.length);
    },

    remover() {
      grupo.clearLayers();
      tirarDoMapa();
      segmentos = null;
    },
  };
}

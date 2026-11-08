// Setas de sentido no estilo do mapa de referência:
// - azul = sentido mantido; vermelho = sentido alterado (após inversão)
// - forma clássica (haste + ponta), sem borda
// - mão dupla: par lado a lado (cada fluxo à sua direita)
/* global L */

const COR_MANTIDO = "#2563eb";
const COR_ALTERADO = "#dc2626";

function anguloGraus(de, para) {
  const [lat1, lon1] = de;
  const [lat2, lon2] = para;
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function metrosPorPixel(mapa, latlng) {
  const p = mapa.latLngToContainerPoint(latlng);
  const vizinho = mapa.containerPointToLatLng(L.point(p.x + 1, p.y));
  return L.latLng(latlng).distanceTo(vizinho);
}

function deslocar(mapa, latlng, rumoGraus, pixels) {
  const metros = metrosPorPixel(mapa, latlng) * pixels;
  const rad = (rumoGraus * Math.PI) / 180;
  const [lat, lon] = latlng;
  const dLat = (metros / 111320) * Math.cos(rad);
  const dLon = (metros / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))) * Math.sin(rad);
  return [lat + dLat, lon + dLon];
}

function pontosAoLongo(pontos, quantidade) {
  if (pontos.length < 2 || quantidade <= 0) return [];
  let total = 0;
  const segs = [];
  for (let i = 1; i < pontos.length; i++) {
    const d = L.latLng(pontos[i - 1]).distanceTo(pontos[i]);
    segs.push(d);
    total += d;
  }
  if (total === 0) return [];

  const resultado = [];
  for (let k = 0; k < quantidade; k++) {
    const dist = ((k + 0.5) / quantidade) * total;
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= dist) {
        const t = segs[i] === 0 ? 0 : (dist - acc) / segs[i];
        const a = pontos[i];
        const b = pontos[i + 1];
        resultado.push({
          latlng: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          angulo: anguloGraus(a, b),
        });
        break;
      }
      acc += segs[i];
    }
  }
  return resultado;
}

/** Seta clássica (apontando para cima / norte); a rotação aplica o rumo da via. */
function svgSeta(angulo, { alterado, tamanho }) {
  const fill = alterado ? COR_ALTERADO : COR_MANTIDO;
  return `
    <svg class="seta-svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24"
         style="transform:rotate(${angulo}deg)" aria-hidden="true">
      <path fill="${fill}"
            d="M12 2.2 L19.2 12.2 L14.6 12.2 L14.6 21.8 L9.4 21.8 L9.4 12.2 L4.8 12.2 Z"/>
    </svg>`;
}

export function criarCamadaSetas(mapa) {
  const grupo = L.layerGroup().addTo(mapa);
  let ultimo = { trechos: [], selecionado: null };

  function parametrosZoom() {
    const z = mapa.getZoom();
    // offset maior na mão dupla para o par ficar lado a lado como na referência
    if (z >= 18) return { tamanho: 16, offsetPx: 5, espacamento: 160, global: true };
    if (z >= 16) return { tamanho: 16, offsetPx: 4.5, espacamento: 200, global: true };
    return { tamanho: 16, offsetPx: 4, espacamento: 9999, global: false };
  }

  function redesenhar(trechos, selecionado) {
    grupo.clearLayers();
    const { tamanho, offsetPx, espacamento, global } = parametrosZoom();
    const lista = global ? trechos : trechos.filter((t) => t.id === selecionado);
    if (!lista.length) return;

    for (const trecho of lista) {
      const dirs = trecho.direcoesAtivas;
      if (!dirs.length) continue;
      const maoDupla = dirs.length > 1;
      const alterado = Boolean(trecho.alterado);
      const selecionada = trecho.id === selecionado;
      const qtd = Math.max(1, Math.min(2, Math.round(trecho.comprimento / espacamento)));

      for (const dir of dirs) {
        // Mesma posição longitudinal nos dois sentidos → pares lado a lado.
        for (const p of pontosAoLongo(dir.geometria.pontos, qtd)) {
          const lateral = maoDupla
            ? deslocar(mapa, p.latlng, p.angulo + 90, offsetPx)
            : p.latlng;
          const classes = [
            "seta-sentido",
            alterado ? "alterado" : "mantido",
            maoDupla ? "mao-dupla" : "mao-unica",
            selecionada ? "selecionada" : "",
          ]
            .filter(Boolean)
            .join(" ");

          L.marker(lateral, {
            interactive: false,
            keyboard: false,
            zIndexOffset: selecionada ? 700 : 400,
            icon: L.divIcon({
              className: classes,
              html: svgSeta(p.angulo, { alterado, tamanho }),
              iconSize: [tamanho, tamanho],
              iconAnchor: [tamanho / 2, tamanho / 2],
            }),
          }).addTo(grupo);
        }
      }
    }
  }

  function aoZoom() {
    if (ultimo.trechos.length) redesenhar(ultimo.trechos, ultimo.selecionado);
  }
  mapa.on("zoomend", aoZoom);

  return {
    atualizar(trechos, { selecionado = null } = {}) {
      ultimo = { trechos, selecionado };
      redesenhar(trechos, selecionado);
    },

    // Solta o evento de zoom (senão ele seguraria os trechos do local anterior).
    remover() {
      mapa.off("zoomend", aoZoom);
      mapa.removeLayer(grupo);
      ultimo = { trechos: [], selecionado: null };
    },
  };
}

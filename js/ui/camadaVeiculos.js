// Veículos no mapa com detalhe progressivo:
// zoom afastado → bolinha; zoom próximo → silhueta (carro/moto/caminhão).
/* global L */

const ZOOM_DETALHE = 16;

const SVGS = {
  carro: `
    <svg viewBox="0 0 24 40" width="14" height="24" aria-hidden="true">
      <rect class="chassi" x="4" y="2" width="16" height="36" rx="4"/>
      <rect class="cabine" x="6" y="8" width="12" height="10" rx="2"/>
      <rect class="farol" x="6" y="2.5" width="4" height="2" rx="1"/>
      <rect class="farol" x="14" y="2.5" width="4" height="2" rx="1"/>
    </svg>
  `,
  moto: `
    <svg viewBox="0 0 18 34" width="10" height="20" aria-hidden="true">
      <rect class="chassi" x="5" y="2" width="8" height="30" rx="3"/>
      <rect class="cabine" x="6" y="8" width="6" height="8" rx="1.5"/>
      <circle class="roda" cx="9" cy="5" r="2.2"/>
      <circle class="roda" cx="9" cy="29" r="2.2"/>
    </svg>
  `,
  caminhao: `
    <svg viewBox="0 0 26 48" width="16" height="30" aria-hidden="true">
      <rect class="chassi" x="4" y="14" width="18" height="32" rx="2"/>
      <rect class="cabine" x="5" y="2" width="16" height="14" rx="3"/>
      <rect class="farol" x="6" y="2.5" width="4" height="2" rx="1"/>
      <rect class="farol" x="16" y="2.5" width="4" height="2" rx="1"/>
    </svg>
  `,
};

const ICON_SIZE = {
  carro: [14, 24],
  moto: [10, 20],
  caminhao: [16, 30],
};

function tipoVisual(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ["carro", "moto", "caminhao"][hash % 3];
}

function rumoGraus(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δλ = (lon2 - lon1) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function criarIconeSilhueta(tipo, status, rumo) {
  const [w, h] = ICON_SIZE[tipo] ?? ICON_SIZE.carro;
  return L.divIcon({
    className: `marcador-veiculo marcador-veiculo-${tipo} status-${status ?? "circulando"}`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    html: `<div class="icone-veiculo" style="transform:rotate(${rumo ?? 0}deg)">${SVGS[tipo] ?? SVGS.carro}</div>`,
  });
}

export function criarCamadaVeiculos(mapa) {
  const grupo = L.layerGroup().addTo(mapa);
  const marcadores = new Map(); // id -> { layer, modo, tipo, status, rumo, lat, lon }
  let modoDetalhe = mapa.getZoom() >= ZOOM_DETALHE;
  /** @type {Set<string|number>} */
  let idsDestaque = new Set();

  function limparMarcadores() {
    for (const item of marcadores.values()) grupo.removeLayer(item.layer);
    marcadores.clear();
  }

  function aplicarDestaque(item, id) {
    item.layer.getElement()?.classList.toggle("preso-alerta", idsDestaque.has(id));
  }

  function sincronizarModo() {
    const novo = mapa.getZoom() >= ZOOM_DETALHE;
    if (novo === modoDetalhe) return;
    modoDetalhe = novo;
    limparMarcadores();
  }

  mapa.on("zoomend", sincronizarModo);

  return {
    atualizar(veiculos) {
      sincronizarModo();
      const vistos = new Set();
      const limites = mapa.getBounds();

      for (const v of veiculos) {
        if (!limites.contains([v.lat, v.lon])) continue;
        vistos.add(v.id);

        let item = marcadores.get(v.id);
        const tipo = item?.tipo ?? tipoVisual(v.id);
        let rumo = item?.rumo ?? 0;
        if (item && (Math.abs(v.lat - item.lat) > 1e-8 || Math.abs(v.lon - item.lon) > 1e-8)) {
          rumo = rumoGraus(item.lat, item.lon, v.lat, v.lon);
        }

        if (!item || item.modo !== (modoDetalhe ? "silhueta" : "ponto")) {
          if (item) grupo.removeLayer(item.layer);

          let layer;
          if (modoDetalhe) {
            layer = L.marker([v.lat, v.lon], {
              icon: criarIconeSilhueta(tipo, v.status, rumo),
              interactive: false,
              keyboard: false,
              zIndexOffset: 400,
            }).addTo(grupo);
          } else {
            layer = L.circleMarker([v.lat, v.lon], {
              radius: 5,
              className: "veiculo",
              interactive: false,
            }).addTo(grupo);
          }

          item = {
            layer,
            modo: modoDetalhe ? "silhueta" : "ponto",
            tipo,
            status: modoDetalhe ? v.status : undefined,
            rumo,
            rumoAplicado: rumo,
            lat: v.lat,
            lon: v.lon,
          };
          marcadores.set(v.id, item);
        } else {
          item.layer.setLatLng([v.lat, v.lon]);
          item.lat = v.lat;
          item.lon = v.lon;
          item.rumo = rumo;
        }

        if (modoDetalhe) {
          if (item.status !== v.status) {
            item.layer.setIcon(criarIconeSilhueta(tipo, v.status, rumo));
            item.status = v.status;
            item.rumo = rumo;
          } else if (Math.abs((item.rumoAplicado ?? rumo) - rumo) > 2) {
            const icone = item.layer.getElement()?.querySelector(".icone-veiculo");
            if (icone) icone.style.transform = `rotate(${rumo}deg)`;
            item.rumoAplicado = rumo;
          }
        } else if (item.status !== v.status) {
          const el = item.layer.getElement();
          el?.classList.toggle("desviado", v.status === "desviado");
          el?.classList.toggle("retido", v.status === "retido");
          el?.classList.toggle("evacuando", v.status === "evacuando");
          item.status = v.status;
        }

        aplicarDestaque(item, v.id);
      }

      for (const [id, item] of marcadores) {
        if (!vistos.has(id)) {
          grupo.removeLayer(item.layer);
          marcadores.delete(id);
        }
      }
    },

    /**
     * Destaca veículos (ex.: sem rota de escape se o bloqueio fosse aplicado).
     * @param {Iterable<string|number>|null|undefined} ids
     */
    destacar(ids) {
      idsDestaque = new Set(ids ?? []);
      for (const [id, item] of marcadores) aplicarDestaque(item, id);
    },

    remover() {
      mapa.off("zoomend", sincronizarModo);
      mapa.removeLayer(grupo);
      marcadores.clear();
      idsDestaque = new Set();
    },
  };
}

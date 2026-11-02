// Desenha os veículos da simulação como pontos coloridos pelo status.
/* global L */

export function criarCamadaVeiculos(mapa) {
  const grupo = L.layerGroup().addTo(mapa);
  const marcadores = new Map();

  return {
    atualizar(veiculos) {
      const vistos = new Set();
      for (const v of veiculos) {
        vistos.add(v.id);
        let marcador = marcadores.get(v.id);
        if (!marcador) {
          marcador = L.circleMarker([v.lat, v.lon], {
            radius: 5,
            className: "veiculo",
            interactive: false,
          }).addTo(grupo);
          marcadores.set(v.id, marcador);
        } else {
          marcador.setLatLng([v.lat, v.lon]);
        }
        if (marcador.status !== v.status) {
          const el = marcador.getElement();
          el?.classList.toggle("desviado", v.status === "desviado");
          el?.classList.toggle("retido", v.status === "retido");
          marcador.status = v.status;
        }
      }
      for (const [id, marcador] of marcadores) {
        if (!vistos.has(id)) {
          grupo.removeLayer(marcador);
          marcadores.delete(id);
        }
      }
    },
  };
}

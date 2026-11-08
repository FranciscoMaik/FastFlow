// Desenha os trechos de via no Leaflet e devolve cliques. Não conhece o motor:
// recebe dados prontos e um callback.
/* global L */

export function criarCamadaVias(mapa, trechos, { aoClicar }) {
  const grupo = L.featureGroup().addTo(mapa);
  const destaques = L.layerGroup().addTo(mapa);
  const linhas = new Map();
  const sinalizacoes = new Map(); // trechoId -> { contorno, icone }

  for (const trecho of trechos) {
    const linha = L.polyline(trecho.pontos, {
      className: "via",
      weight: 6,
      bubblingMouseEvents: false,
    });
    linha.bindTooltip(rotulo(trecho), { sticky: true, direction: "top", opacity: 0.95 });
    linha.on("click", (e) => aoClicar(trecho.id, e?.latlng));
    linha.addTo(grupo);
    linhas.set(trecho.id, linha);
  }

  function classe(id, nome, ligar) {
    const elemento = linhas.get(id)?.getElement();
    elemento?.classList.toggle(nome, ligar);
  }

  return {
    limites: () => grupo.getBounds(),

    atualizar({ selecionados = [], bloqueados = [] }) {
      const sel = new Set(selecionados);
      const bloq = new Map(bloqueados.map((t) => [t.id, t]));

      for (const [id, linha] of linhas) {
        classe(id, "selecionada", sel.has(id));
        classe(id, "bloqueada", bloq.has(id));
        if (sel.has(id) || bloq.has(id)) linha.bringToFront();
      }

      // Remove sinalizações de trechos liberados.
      for (const [id, s] of sinalizacoes) {
        if (!bloq.has(id)) {
          destaques.removeLayer(s.contorno);
          destaques.removeLayer(s.icone);
          sinalizacoes.delete(id);
        }
      }
      // Adiciona halo e ícone de interdição nos novos bloqueios.
      for (const [id, trecho] of bloq) {
        if (sinalizacoes.has(id)) continue;
        const contorno = L.polyline(trecho.pontos, {
          className: "via-contorno",
          interactive: false,
        }).addTo(destaques);
        contorno.bringToBack();
        const icone = L.marker(trecho.meio, {
          icon: L.divIcon({ className: "icone-bloqueio", iconSize: [26, 26] }),
          title: `Bloqueado: ${rotulo(trecho)}`,
          keyboard: false,
          zIndexOffset: 1000,
        })
          .on("click", (e) => aoClicar(id, e?.latlng))
          .addTo(destaques);
        sinalizacoes.set(id, { contorno, icone });
      }
      // Linhas bloqueadas sempre por cima do restante.
      for (const id of bloq.keys()) linhas.get(id).bringToFront();
      for (const id of sel) linhas.get(id)?.bringToFront();
    },

    focar(ids) {
      const camadas = ids.map((id) => linhas.get(id)).filter(Boolean);
      if (camadas.length === 0) return;
      const limites = L.featureGroup(camadas).getBounds();
      mapa.flyToBounds(limites, { maxZoom: 18, padding: [60, 60], duration: 0.6 });
    },
  };
}

export function rotulo(trecho) {
  return trecho.referencia ? `${trecho.nome} (${trecho.referencia})` : trecho.nome;
}

// Camada Leaflet de lombadas e semáforos (arraste com snap e popups de configuração).
/* global L */

export function criarCamadaDispositivos(mapa, { aoReposicionar, aoRemover, aoConfigurarSemaforo, aoAlternarSemaforo, aoNotificar }) {
  const grupo = L.layerGroup().addTo(mapa);
  const marcadores = new Map(); // id -> { marcador, dados }

  function criarIconeLombada() {
    return L.divIcon({
      className: "marcador-dispositivo marcador-lombada",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14],
      html: `
        <div class="icone-lombada" title="Lombada (Redutor de velocidade - 20 km/h)">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M 2 15 Q 7 15 9 10 Q 12 6 15 10 Q 17 15 22 15" fill="none" stroke="#1e293b" stroke-width="2.8" stroke-linecap="round"/>
          </svg>
        </div>
      `,
    });
  }

  function criarIconeSemaforo(estado = "verde") {
    return L.divIcon({
      className: `marcador-dispositivo marcador-semaforo fase-${estado}`,
      iconSize: [20, 38],
      iconAnchor: [10, 19],
      popupAnchor: [0, -20],
      html: `
        <div class="icone-semaforo" title="Semáforo (${estado})">
          <div class="luz luz-vermelha ${estado === "vermelho" ? "ativa" : ""}"></div>
          <div class="luz luz-amarela ${estado === "amarelo" ? "ativa" : ""}"></div>
          <div class="luz luz-verde ${estado === "verde" ? "ativa" : ""}"></div>
        </div>
      `,
    });
  }

  function montarPopupLombada(d) {
    const div = document.createElement("div");
    div.className = "popup-dispositivo popup-lombada";
    div.innerHTML = `
      <header class="popup-cabecalho">
        <strong>Lombada</strong>
        <span class="badge badge-lombada">Redutor de velocidade</span>
      </header>
      <div class="popup-corpo">
        <p class="popup-trecho"><strong>Via:</strong> ${d.nomeTrecho}</p>
        <p class="popup-detalhe">Velocidade máxima na transposição: <strong>${d.velocidadeMaxKmh} km/h</strong></p>
        <p class="popup-dica">Arraste o ícone no mapa para reposicionar.</p>
      </div>
      <footer class="popup-acoes">
        <button type="button" class="botao botao-secundario botao-pequeno btn-remover-dispositivo">Remover lombada</button>
      </footer>
    `;

    div.querySelector(".btn-remover-dispositivo").addEventListener("click", () => {
      mapa.closePopup();
      aoRemover(d.id);
    });

    return div;
  }

  function montarPopupSemaforo(d) {
    const div = document.createElement("div");
    div.className = "popup-dispositivo popup-semaforo";
    div.innerHTML = `
      <header class="popup-cabecalho">
        <strong>Semáforo de Tráfego</strong>
        <span class="badge badge-semaforo badge-${d.estado}">Sinal ${d.estado}</span>
      </header>
      <div class="popup-corpo">
        <p class="popup-trecho"><strong>Via:</strong> ${d.nomeTrecho}</p>
        <div class="campos-tempos">
          <label><span>Verde (s)</span><input type="number" class="ipt-verde" min="2" max="60" value="${d.tempos.verde}"></label>
          <label><span>Amarelo (s)</span><input type="number" class="ipt-amarelo" min="1" max="10" value="${d.tempos.amarelo}"></label>
          <label><span>Vermelho (s)</span><input type="number" class="ipt-vermelho" min="2" max="60" value="${d.tempos.vermelho}"></label>
        </div>
      </div>
      <footer class="popup-acoes">
        <button type="button" class="botao botao-secundario botao-pequeno btn-alternar-fase">Avançar fase</button>
        <button type="button" class="botao botao-secundario botao-pequeno btn-salvar-tempos">Salvar tempos</button>
        <button type="button" class="botao botao-bloquear botao-pequeno btn-remover-dispositivo">Remover</button>
      </footer>
    `;

    const btnAlternar = div.querySelector(".btn-alternar-fase");
    const btnSalvar = div.querySelector(".btn-salvar-tempos");
    const btnRemover = div.querySelector(".btn-remover-dispositivo");

    btnAlternar.addEventListener("click", () => {
      const novoEstado = aoAlternarSemaforo(d.id);
      const badge = div.querySelector(".badge-semaforo");
      if (badge && novoEstado) {
        badge.className = `badge badge-semaforo badge-${novoEstado}`;
        badge.textContent = `Sinal ${novoEstado}`;
      }
    });

    btnSalvar.addEventListener("click", () => {
      const verde = Number(div.querySelector(".ipt-verde").value) || d.tempos.verde;
      const amarelo = Number(div.querySelector(".ipt-amarelo").value) || d.tempos.amarelo;
      const vermelho = Number(div.querySelector(".ipt-vermelho").value) || d.tempos.vermelho;
      aoConfigurarSemaforo(d.id, { verde, amarelo, vermelho });
      if (aoNotificar) aoNotificar("Tempos do semáforo atualizados com sucesso.", "sucesso");
    });

    btnRemover.addEventListener("click", () => {
      mapa.closePopup();
      aoRemover(d.id);
    });

    return div;
  }

  return {
    atualizar(dispositivos) {
      const vistos = new Set();

      for (const d of dispositivos) {
        vistos.add(d.id);
        let item = marcadores.get(d.id);

        if (!item) {
          const icone = d.tipo === "lombada" ? criarIconeLombada() : criarIconeSemaforo(d.estado);
          const marcador = L.marker(d.coordenadas, {
            icon: icone,
            draggable: true,
            zIndexOffset: d.tipo === "semaforo" ? 850 : 800,
          }).addTo(grupo);

          let posAnterior = d.coordenadas;

          marcador.on("dragstart", () => {
            posAnterior = marcador.getLatLng();
          });

          marcador.on("dragend", () => {
            const novaPos = marcador.getLatLng();
            const resultado = aoReposicionar(d.id, [novaPos.lat, novaPos.lng]);

            if (resultado && resultado.permitido && resultado.dispositivo) {
              marcador.setLatLng(resultado.dispositivo.coordenadas);
              posAnterior = resultado.dispositivo.coordenadas;
              if (aoNotificar) {
                aoNotificar(`${d.tipo === "lombada" ? "Lombada" : "Semáforo"} reposicionado(a) na via.`, "sucesso");
              }
            } else {
              marcador.setLatLng(posAnterior);
              if (aoNotificar) {
                aoNotificar(resultado?.motivo ?? "Posição fora da malha viária permitida.", "erro");
              }
            }
          });

          marcador.bindPopup(() => (d.tipo === "lombada" ? montarPopupLombada(d) : montarPopupSemaforo(d)), {
            maxWidth: 320,
            className: "leaflet-popup-fastflow",
          });

          item = { marcador, dados: d, estado: d.estado };
          marcadores.set(d.id, item);
        } else {
          item.dados = d;

          const atualPos = item.marcador.getLatLng();
          if (Math.abs(atualPos.lat - d.coordenadas[0]) > 1e-6 || Math.abs(atualPos.lng - d.coordenadas[1]) > 1e-6) {
            item.marcador.setLatLng(d.coordenadas);
          }

          if (d.tipo === "semaforo" && item.estado !== d.estado) {
            item.estado = d.estado;
            const el = item.marcador.getElement();
            if (el) {
              el.classList.remove("fase-verde", "fase-amarelo", "fase-vermelho");
              el.classList.add(`fase-${d.estado}`);

              const luzes = el.querySelectorAll(".luz");
              if (luzes.length === 3) {
                luzes[0].classList.toggle("ativa", d.estado === "vermelho");
                luzes[1].classList.toggle("ativa", d.estado === "amarelo");
                luzes[2].classList.toggle("ativa", d.estado === "verde");
              }
            }
          }
        }
      }

      for (const [id, item] of marcadores.entries()) {
        if (!vistos.has(id)) {
          grupo.removeLayer(item.marcador);
          marcadores.delete(id);
        }
      }
    },

    focar(id) {
      const item = marcadores.get(id);
      if (!item) return;
      mapa.flyTo(item.marcador.getLatLng(), Math.max(mapa.getZoom(), 17), { duration: 0.6 });
      item.marcador.openPopup();
    },

    limpar() {
      grupo.clearLayers();
      marcadores.clear();
    },
  };
}

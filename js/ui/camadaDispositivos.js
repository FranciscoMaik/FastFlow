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
        <p class="popup-status-tempos" role="status" aria-live="polite" data-estado="salvo">Tempos salvos</p>
      </div>
      <footer class="popup-acoes">
        <button type="button" class="botao botao-secundario botao-pequeno btn-alternar-fase">Avançar fase</button>
        <button type="button" class="botao botao-secundario botao-pequeno btn-salvar-tempos" disabled>Salvar tempos</button>
        <button type="button" class="botao botao-bloquear botao-pequeno btn-remover-dispositivo">Remover</button>
      </footer>
    `;

    const btnAlternar = div.querySelector(".btn-alternar-fase");
    const btnSalvar = div.querySelector(".btn-salvar-tempos");
    const btnRemover = div.querySelector(".btn-remover-dispositivo");
    const statusTempos = div.querySelector(".popup-status-tempos");
    const inputs = [
      div.querySelector(".ipt-verde"),
      div.querySelector(".ipt-amarelo"),
      div.querySelector(".ipt-vermelho"),
    ];

    let salvos = {
      verde: Number(d.tempos.verde),
      amarelo: Number(d.tempos.amarelo),
      vermelho: Number(d.tempos.vermelho),
    };

    function lerTempos() {
      return {
        verde: Number(inputs[0].value) || salvos.verde,
        amarelo: Number(inputs[1].value) || salvos.amarelo,
        vermelho: Number(inputs[2].value) || salvos.vermelho,
      };
    }

    function temAlteracoes() {
      const atuais = lerTempos();
      return (
        atuais.verde !== salvos.verde ||
        atuais.amarelo !== salvos.amarelo ||
        atuais.vermelho !== salvos.vermelho
      );
    }

    function atualizarEstadoSalvar() {
      const sujo = temAlteracoes();
      btnSalvar.disabled = !sujo;
      btnSalvar.classList.toggle("botao-primario", sujo);
      btnSalvar.classList.toggle("botao-secundario", !sujo);
      btnSalvar.textContent = sujo ? "Salvar tempos" : "Salvo";
      statusTempos.dataset.estado = sujo ? "pendente" : "salvo";
      statusTempos.textContent = sujo ? "Alterações não salvas" : "Tempos salvos";
    }

    for (const input of inputs) {
      input.addEventListener("input", atualizarEstadoSalvar);
      input.addEventListener("change", atualizarEstadoSalvar);
    }

    btnAlternar.addEventListener("click", () => {
      const novoEstado = aoAlternarSemaforo(d.id);
      const badge = div.querySelector(".badge-semaforo");
      if (badge && novoEstado) {
        badge.className = `badge badge-semaforo badge-${novoEstado}`;
        badge.textContent = `Sinal ${novoEstado}`;
      }
    });

    btnSalvar.addEventListener("click", () => {
      if (!temAlteracoes()) return;
      const tempos = lerTempos();
      inputs[0].value = String(tempos.verde);
      inputs[1].value = String(tempos.amarelo);
      inputs[2].value = String(tempos.vermelho);
      aoConfigurarSemaforo(d.id, tempos);
      salvos = { ...tempos };
      atualizarEstadoSalvar();
      statusTempos.dataset.estado = "sucesso";
      statusTempos.textContent = "Tempos salvos com sucesso";
      btnSalvar.textContent = "Salvo";
      if (aoNotificar) aoNotificar("Tempos do semáforo atualizados com sucesso.", "sucesso");
    });

    btnRemover.addEventListener("click", () => {
      mapa.closePopup();
      aoRemover(d.id);
    });

    atualizarEstadoSalvar();
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

          const idDispositivo = d.id;
          marcador.bindPopup(() => {
            const dados = marcadores.get(idDispositivo)?.dados ?? d;
            return dados.tipo === "lombada" ? montarPopupLombada(dados) : montarPopupSemaforo(dados);
          }, {
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

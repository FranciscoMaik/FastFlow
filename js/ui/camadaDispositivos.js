// Camada Leaflet de lombadas e semáforos (arraste com snap e popups de configuração).
/* global L */
import {
  textoVelocidadeTrecho,
  textoFilaSemaforo,
  textoTransbordo,
  textoFugaDeRota,
} from "./metricasDispositivoFmt.js";
import { htmlTabelaPlanosFase } from "./compararPlanosFaseFmt.js";
import { PLANOS_PRESET } from "../motor/compararPlanosFase.js";

export function criarCamadaDispositivos(
  mapa,
  {
    aoReposicionar,
    aoRemover,
    aoConfigurarSemaforo,
    aoAlternarSemaforo,
    aoCompararPlanosFase,
    aoNotificar,
    aoFocar,
  }
) {
  const grupo = L.layerGroup().addTo(mapa);
  const marcadores = new Map(); // id -> { marcador, dados, metricas }

  function criarIconeLombada({ transbordo = false } = {}) {
    return L.divIcon({
      className: `marcador-dispositivo marcador-lombada${transbordo ? " com-transbordo" : ""}`,
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

  function criarIconeSemaforo(estado = "verde", { transbordo = false } = {}) {
    return L.divIcon({
      className: `marcador-dispositivo marcador-semaforo fase-${estado}${transbordo ? " com-transbordo" : ""}`,
      iconSize: [20, 38],
      iconAnchor: [10, 19],
      popupAnchor: [0, -20],
      html: `
        <div class="icone-semaforo${transbordo ? " alerta-transbordo-mapa" : ""}" title="${
          transbordo ? "Semáforo com transbordo de fila" : `Semáforo (${estado})`
        }">
          <div class="luz luz-vermelha ${estado === "vermelho" ? "ativa" : ""}"></div>
          <div class="luz luz-amarela ${estado === "amarelo" ? "ativa" : ""}"></div>
          <div class="luz luz-verde ${estado === "verde" ? "ativa" : ""}"></div>
        </div>
      `,
    });
  }

  function blocoMetricasHtml(d, met) {
    if (!met) return "";
    const linhas = [`<p class="popup-metrica">${textoVelocidadeTrecho(met.velocidade)}</p>`];
    if (d.tipo === "semaforo") {
      linhas.push(
        `<p class="popup-metrica">${textoFilaSemaforo({
          filaAtual: met.fila?.atual,
          filaMax: met.filaMax,
          filaMedia: met.filaMedia,
          esperaMedia: met.esperaMedia,
        })}</p>`
      );
      const alerta = textoTransbordo(met.transbordo);
      if (alerta) {
        linhas.push(`<p class="popup-alerta-transbordo" role="alert">${alerta}</p>`);
      }
    }
    if (met.fuga) {
      linhas.push(
        `<p class="popup-metrica popup-metrica-fuga">${textoFugaDeRota(met.fuga)}</p>`
      );
    }
    return `<div class="popup-metricas">${linhas.join("")}</div>`;
  }

  function montarPopupLombada(d, met) {
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
        ${blocoMetricasHtml(d, met)}
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

  function montarPopupSemaforo(d, met, { comparacao = null, selecaoPlanos = null } = {}) {
    const div = document.createElement("div");
    div.className = "popup-dispositivo popup-semaforo";
    const presets = PLANOS_PRESET;
    const sel = selecaoPlanos ?? { atual: true, curto: true, longo: true };
    div.innerHTML = `
      <header class="popup-cabecalho">
        <strong>Semáforo de Tráfego</strong>
        <span class="badge badge-semaforo badge-${d.estado}">Sinal ${d.estado}</span>
      </header>
      <div class="popup-corpo">
        <p class="popup-trecho"><strong>Via:</strong> ${d.nomeTrecho}</p>
        ${blocoMetricasHtml(d, met)}
        <div class="campos-tempos">
          <label><span>Verde (s)</span><input type="number" class="ipt-verde" min="2" max="60" value="${d.tempos.verde}"></label>
          <label><span>Amarelo (s)</span><input type="number" class="ipt-amarelo" min="1" max="10" value="${d.tempos.amarelo}"></label>
          <label><span>Vermelho (s)</span><input type="number" class="ipt-vermelho" min="2" max="60" value="${d.tempos.vermelho}"></label>
        </div>
        <p class="popup-status-tempos" role="status" aria-live="polite" data-estado="salvo">Tempos salvos</p>
        <section class="popup-planos-fase" aria-label="Comparar planos de fase">
          <p class="popup-planos-titulo">Comparar planos de fase</p>
          <div class="popup-planos-checks">
            <label><input type="checkbox" class="chk-plano" data-plano="atual" ${sel.atual ? "checked" : ""}> Atual</label>
            <label><input type="checkbox" class="chk-plano" data-plano="curto" ${sel.curto ? "checked" : ""}> Curto (12/3/10)</label>
            <label><input type="checkbox" class="chk-plano" data-plano="longo" ${sel.longo ? "checked" : ""}> Longo (20/3/15)</label>
          </div>
          <button type="button" class="botao botao-secundario botao-pequeno btn-comparar-planos">Comparar</button>
          <div class="popup-planos-resultado" role="status" aria-live="polite"></div>
        </section>
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
    const btnComparar = div.querySelector(".btn-comparar-planos");
    const painelResultado = div.querySelector(".popup-planos-resultado");
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

    function lerSelecaoPlanos() {
      const checks = div.querySelectorAll(".chk-plano");
      const out = { atual: false, curto: false, longo: false };
      for (const chk of checks) {
        out[chk.dataset.plano] = chk.checked;
      }
      return out;
    }

    function persistirEstadoPopup(extra = {}) {
      const item = marcadores.get(d.id);
      if (!item) return;
      item.selecaoPlanos = lerSelecaoPlanos();
      if ("comparacao" in extra) item.comparacao = extra.comparacao;
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

    function aplicarTemposNosInputs(tempos) {
      inputs[0].value = String(tempos.verde);
      inputs[1].value = String(tempos.amarelo);
      inputs[2].value = String(tempos.vermelho);
      atualizarEstadoSalvar();
    }

    function ligarBotoesUsarPlano() {
      for (const btn of painelResultado.querySelectorAll(".btn-usar-plano")) {
        btn.addEventListener("click", () => {
          aplicarTemposNosInputs({
            verde: Number(btn.dataset.verde),
            amarelo: Number(btn.dataset.amarelo),
            vermelho: Number(btn.dataset.vermelho),
          });
          statusTempos.dataset.estado = "pendente";
          statusTempos.textContent = "Plano aplicado aos campos — salve para confirmar";
          if (aoNotificar) {
            aoNotificar("Tempos do plano copiados. Clique em Salvar tempos para aplicar.", "sucesso");
          }
        });
      }
    }

    function renderComparacao(resultado) {
      painelResultado.innerHTML = htmlTabelaPlanosFase(resultado);
      ligarBotoesUsarPlano();
    }

    function montarListaPlanos() {
      const escolha = lerSelecaoPlanos();
      const lista = [];
      if (escolha.atual) {
        lista.push({ id: "atual", rotulo: "Atual", tempos: lerTempos() });
      }
      for (const preset of presets) {
        if (escolha[preset.id]) {
          lista.push({
            id: preset.id,
            rotulo: preset.rotulo,
            tempos: { ...preset.tempos },
          });
        }
      }
      return lista;
    }

    for (const input of inputs) {
      input.addEventListener("input", atualizarEstadoSalvar);
      input.addEventListener("change", atualizarEstadoSalvar);
    }

    for (const chk of div.querySelectorAll(".chk-plano")) {
      chk.addEventListener("change", () => persistirEstadoPopup());
    }

    btnComparar.addEventListener("click", () => {
      const planos = montarListaPlanos();
      if (planos.length < 2 || planos.length > 3) {
        painelResultado.innerHTML =
          `<p class="popup-planos-erro">Selecione 2 ou 3 planos (Atual, Curto e/ou Longo).</p>`;
        persistirEstadoPopup({ comparacao: { ok: false, motivo: "Selecione 2 ou 3 planos." } });
        return;
      }
      if (typeof aoCompararPlanosFase !== "function") {
        painelResultado.innerHTML =
          `<p class="popup-planos-erro">Comparação indisponível nesta tela.</p>`;
        return;
      }
      btnComparar.disabled = true;
      btnComparar.textContent = "Comparando…";
      let resultado;
      try {
        resultado = aoCompararPlanosFase(d.id, planos);
      } catch (err) {
        resultado = { ok: false, motivo: err?.message || "Falha ao comparar planos." };
      }
      btnComparar.disabled = false;
      btnComparar.textContent = "Comparar";
      renderComparacao(resultado);
      persistirEstadoPopup({ comparacao: resultado });
    });

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
      aplicarTemposNosInputs(tempos);
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
    if (comparacao) renderComparacao(comparacao);
    return div;
  }

  function sincronizarAlertaMarcador(item, transbordo) {
    const el = item.marcador.getElement();
    if (!el) return;
    el.classList.toggle("com-transbordo", Boolean(transbordo));
    const icone = el.querySelector(".icone-semaforo, .icone-lombada");
    if (icone) icone.classList.toggle("alerta-transbordo-mapa", Boolean(transbordo));
  }

  return {
    /**
     * @param {object[]} dispositivos
     * @param {Record<string, object>|null} [metricasPorId]
     */
    atualizar(dispositivos, metricasPorId = null) {
      const vistos = new Set();

      for (const d of dispositivos) {
        vistos.add(d.id);
        const met = metricasPorId?.[d.id] ?? null;
        let item = marcadores.get(d.id);

        if (!item) {
          const transbordo = Boolean(met?.transbordo);
          const icone =
            d.tipo === "lombada"
              ? criarIconeLombada({ transbordo })
              : criarIconeSemaforo(d.estado, { transbordo });
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
            const atual = marcadores.get(idDispositivo);
            const dados = atual?.dados ?? d;
            const m = atual?.metricas ?? null;
            return dados.tipo === "lombada"
              ? montarPopupLombada(dados, m)
              : montarPopupSemaforo(dados, m, {
                  comparacao: atual?.comparacao ?? null,
                  selecaoPlanos: atual?.selecaoPlanos ?? null,
                });
          }, {
            maxWidth: 420,
            className: "leaflet-popup-fastflow",
          });

          marcador.on("popupopen", () => {
            if (typeof aoFocar === "function") aoFocar(idDispositivo);
          });

          item = {
            marcador,
            dados: d,
            metricas: met,
            estado: d.estado,
            transbordo,
            comparacao: null,
            selecaoPlanos: { atual: true, curto: true, longo: true },
          };
          marcadores.set(d.id, item);
        } else {
          item.dados = d;
          item.metricas = met;

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

          const transbordo = Boolean(met?.transbordo);
          if (item.transbordo !== transbordo) {
            item.transbordo = transbordo;
            sincronizarAlertaMarcador(item, transbordo);
          }

          // Atualiza métricas no popup aberto sem fechar (preserva comparação).
          if (item.marcador.isPopupOpen()) {
            const conteudo =
              d.tipo === "lombada"
                ? montarPopupLombada(d, met)
                : montarPopupSemaforo(d, met, {
                    comparacao: item.comparacao,
                    selecaoPlanos: item.selecaoPlanos,
                  });
            item.marcador.setPopupContent(conteudo);
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
      if (typeof aoFocar === "function") aoFocar(id);
      mapa.flyTo(item.marcador.getLatLng(), Math.max(mapa.getZoom(), 17), { duration: 0.6 });
      item.marcador.openPopup();
    },

    limpar() {
      grupo.clearLayers();
      marcadores.clear();
    },
  };
}

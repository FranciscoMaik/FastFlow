import {
  carregarLocais,
  carregarMalhaDoLocal,
  lerLocalId,
  salvarLocalId,
} from "./adaptador/locais.js";
import { construirGrafo } from "./adaptador/carregarMalha.js";
import { obterCenarioAtivo } from "./adaptador/cenarios.js";
import {
  avaliarRobustezRota,
  comporAtraso,
  estimarAtrasoCongestionamentoHeuristico,
  estimarAtrasoDispositivosNaRota,
  mapearPolilinhaParaArestas,
  planejarRotasNaMalha,
  snapOrigemDestino,
} from "./contingenciaAnalise.js";
import {
  classeRobustez,
  formatarAtraso,
  formatarDistancia,
  formatarDuracao,
  formatarRobustez,
} from "./contingenciaMetricas.js";
import {
  abrirResumoContingenciaParaPdf,
  montarResumoContingencia,
  resumoContingenciaParaHtml,
} from "./contingenciaResumo.js";
import { iniciarBarraCenario } from "./ui/barraCenario.js";

(function () {
  // Com malha local carregada, a barra F5 passa a avaliar Δ (F2) na região ativa.
  const barraCenario = iniciarBarraCenario();
  let grafoLocal = null;
  let locaisCadastro = [];
  let localAtual = null;
  let modoRotas = "demo"; // "demo" | "planejado"
  let definindoNoMapa = null; // null | "origem" | "destino"
  let planejamento = { origemNo: null, destinoNo: null };
  const cenarios = {
    "cajamar-centro": {
      origem: "Centro de Cajamar",
      destino: "Jordanésia",
      regioes: ["centro", "jordanesia"],
      ocorrencia: "Bloqueio viário",
      localOcorrencia: "Av. Dr. Antônio João Abdalla · Cajamar",
      bloqueio: [-23.356, -46.875],
      rotas: {
        primary: {
          pontos: [
            [-23.365, -46.883], [-23.360, -46.879], [-23.356, -46.875],
            [-23.353, -46.872], [-23.350, -46.869]
          ],
          descricao: "Segue pela Av. Dr. Antônio João Abdalla e passa pelo bloqueio."
        },
        alternative: {
          pontos: [
            [-23.365, -46.883], [-23.361, -46.887], [-23.355, -46.886],
            [-23.350, -46.880], [-23.350, -46.869]
          ],
          descricao: "Desvio pela região central de Cajamar · evita o bloqueio."
        },
        "alternative-two": {
          pontos: [
            [-23.365, -46.883], [-23.369, -46.876], [-23.365, -46.868],
            [-23.358, -46.864], [-23.350, -46.869]
          ],
          descricao: "Desvio ampliado por vias locais de Cajamar."
        }
      }
    },
    "polvilho-distrito": {
      origem: "Polvilho, Cajamar",
      destino: "Distrito Industrial de Cajamar",
      regioes: ["polvilho"],
      ocorrencia: "Interdição simulada",
      localOcorrencia: "Estrada de Cajamar · acesso ao Distrito Industrial",
      bloqueio: [-23.397, -46.872],
      rotas: {
        primary: {
          pontos: [
            [-23.421, -46.855], [-23.414, -46.860], [-23.407, -46.866],
            [-23.397, -46.872], [-23.380, -46.884]
          ],
          descricao: "Segue pela Estrada de Cajamar e passa pela interdição."
        },
        alternative: {
          pontos: [
            [-23.421, -46.855], [-23.414, -46.848], [-23.405, -46.850],
            [-23.391, -46.860], [-23.380, -46.884]
          ],
          descricao: "Desvio por vias locais de Polvilho · evita a interdição."
        },
        "alternative-two": {
          pontos: [
            [-23.421, -46.855], [-23.429, -46.864], [-23.420, -46.878],
            [-23.404, -46.883], [-23.380, -46.884]
          ],
          descricao: "Desvio ampliado pelo entorno de Polvilho e Cajamar."
        }
      }
    },
    "ponunduva-cajamar": {
      origem: "Ponunduva, Cajamar",
      destino: "Centro de Cajamar",
      regioes: ["ponunduva", "centro"],
      ocorrencia: "Obra simulada",
      localOcorrencia: "Estrada de Ponunduva · Cajamar",
      bloqueio: [-23.344, -46.913],
      rotas: {
        primary: {
          pontos: [
            [-23.337, -46.929], [-23.341, -46.921], [-23.344, -46.913],
            [-23.348, -46.900], [-23.357, -46.879]
          ],
          descricao: "Segue pela Estrada de Ponunduva e passa pela obra simulada."
        },
        alternative: {
          pontos: [
            [-23.337, -46.929], [-23.331, -46.918], [-23.334, -46.902],
            [-23.342, -46.890], [-23.357, -46.879]
          ],
          descricao: "Desvio por vias alternativas da região de Ponunduva."
        },
        "alternative-two": {
          pontos: [
            [-23.337, -46.929], [-23.347, -46.935], [-23.357, -46.925],
            [-23.363, -46.906], [-23.357, -46.879]
          ],
          descricao: "Desvio ampliado pelo entorno rural de Cajamar."
        }
      }
    },
    "jordanesia-polvilho": {
      origem: "Jordanésia, Cajamar",
      destino: "Polvilho, Cajamar",
      regioes: ["jordanesia", "polvilho"],
      ocorrencia: "Bloqueio simulado",
      localOcorrencia: "Av. Tenente Marques · Cajamar",
      bloqueio: [-23.389, -46.861],
      rotas: {
        primary: {
          pontos: [
            [-23.350, -46.869], [-23.362, -46.866], [-23.376, -46.863],
            [-23.389, -46.861], [-23.421, -46.855]
          ],
          descricao: "Passa pelo bloqueio simulado na Av. Tenente Marques."
        },
        alternative: {
          pontos: [
            [-23.350, -46.869], [-23.357, -46.878], [-23.373, -46.880],
            [-23.394, -46.875], [-23.421, -46.855]
          ],
          descricao: "Desvio por vias de Jordanésia · evita o bloqueio."
        },
        "alternative-two": {
          pontos: [
            [-23.350, -46.869], [-23.343, -46.861], [-23.353, -46.848],
            [-23.374, -46.847], [-23.398, -46.850], [-23.421, -46.855]
          ],
          descricao: "Desvio ampliado pelo entorno de Cajamar."
        }
      }
    },
    "centro-parque": {
      origem: "Centro de Cajamar",
      destino: "Parque Maria Aparecida, Cajamar",
      regioes: ["centro"],
      ocorrencia: "Bloqueio simulado",
      localOcorrencia: "Av. Professor Walter Ribas de Andrade · Cajamar",
      bloqueio: [-23.354, -46.879],
      rotas: {
        primary: {
          pontos: [
            [-23.357, -46.879], [-23.354, -46.879], [-23.350, -46.878],
            [-23.346, -46.875], [-23.342, -46.871]
          ],
          descricao: "Passa pelo bloqueio simulado na Av. Professor Walter Ribas de Andrade."
        },
        alternative: {
          pontos: [
            [-23.357, -46.879], [-23.360, -46.874], [-23.354, -46.868],
            [-23.346, -46.867], [-23.342, -46.871]
          ],
          descricao: "Desvio por vias locais do centro de Cajamar."
        },
        "alternative-two": {
          pontos: [
            [-23.357, -46.879], [-23.363, -46.880], [-23.362, -46.869],
            [-23.352, -46.863], [-23.342, -46.871]
          ],
          descricao: "Desvio ampliado pelo entorno do Parque Maria Aparecida."
        }
      }
    },
    "jordanesia-empresarial": {
      origem: "Jordanésia, Cajamar",
      destino: "Parque Empresarial de Cajamar",
      regioes: ["jordanesia"],
      ocorrencia: "Obra simulada",
      localOcorrencia: "Estrada de Jordanésia · acesso empresarial",
      bloqueio: [-23.368, -46.858],
      rotas: {
        primary: {
          pontos: [
            [-23.350, -46.869], [-23.357, -46.865], [-23.368, -46.858],
            [-23.378, -46.850], [-23.387, -46.842]
          ],
          descricao: "Passa pela obra simulada no acesso ao parque empresarial."
        },
        alternative: {
          pontos: [
            [-23.350, -46.869], [-23.353, -46.859], [-23.361, -46.850],
            [-23.375, -46.844], [-23.387, -46.842]
          ],
          descricao: "Desvio por vias locais de Jordanésia."
        },
        "alternative-two": {
          pontos: [
            [-23.350, -46.869], [-23.343, -46.860], [-23.350, -46.847],
            [-23.366, -46.839], [-23.387, -46.842]
          ],
          descricao: "Desvio ampliado pelo entorno de Jordanésia."
        }
      }
    },
    "polvilho-centro": {
      origem: "Polvilho, Cajamar",
      destino: "Centro de Cajamar",
      regioes: ["polvilho", "centro"],
      ocorrencia: "Interdição simulada",
      localOcorrencia: "Av. Tenente Marques · região de Polvilho",
      bloqueio: [-23.405, -46.866],
      rotas: {
        primary: {
          pontos: [
            [-23.421, -46.855], [-23.414, -46.860], [-23.405, -46.866],
            [-23.391, -46.873], [-23.357, -46.879]
          ],
          descricao: "Segue pela Av. Tenente Marques e passa pela interdição simulada."
        },
        alternative: {
          pontos: [
            [-23.421, -46.855], [-23.419, -46.866], [-23.407, -46.878],
            [-23.385, -46.884], [-23.357, -46.879]
          ],
          descricao: "Desvio por vias locais de Polvilho · evita a interdição."
        },
        "alternative-two": {
          pontos: [
            [-23.421, -46.855], [-23.430, -46.850], [-23.431, -46.870],
            [-23.411, -46.890], [-23.383, -46.888], [-23.357, -46.879]
          ],
          descricao: "Desvio ampliado pelo entorno de Cajamar."
        }
      }
    },
    "ponunduva-jordanesia": {
      origem: "Ponunduva, Cajamar",
      destino: "Jordanésia, Cajamar",
      regioes: ["ponunduva", "jordanesia"],
      ocorrencia: "Bloqueio viário simulado",
      localOcorrencia: "Estrada de Ponunduva · acesso a Jordanésia",
      bloqueio: [-23.351, -46.900],
      rotas: {
        primary: {
          pontos: [
            [-23.337, -46.929], [-23.342, -46.916], [-23.351, -46.900],
            [-23.350, -46.885], [-23.350, -46.869]
          ],
          descricao: "Passa pelo bloqueio simulado na Estrada de Ponunduva."
        },
        alternative: {
          pontos: [
            [-23.337, -46.929], [-23.330, -46.914], [-23.336, -46.896],
            [-23.342, -46.880], [-23.350, -46.869]
          ],
          descricao: "Desvio por vias locais de Ponunduva."
        },
        "alternative-two": {
          pontos: [
            [-23.337, -46.929], [-23.348, -46.937], [-23.360, -46.918],
            [-23.365, -46.895], [-23.359, -46.878], [-23.350, -46.869]
          ],
          descricao: "Desvio ampliado pelo entorno rural de Cajamar."
        }
      }
    }
  };

  // Traçados que seguem as ruas, gerados por scripts/gerar-rotas-contingencia.mjs.
  // Se o arquivo não carregar, a página usa as linhas retas de `cenarios`.
  let tracados = {};

  function pontosDaRota(id, tipo) {
    const tracado = tracados[id] && tracados[id].rotas[tipo];
    return tracado ? tracado.pontos : cenarios[id].rotas[tipo].pontos;
  }

  function metricasDaRota(id, tipo) {
    const tracado = tracados[id] && tracados[id].rotas[tipo];
    return tracado || {};
  }

  // Sem setView inicial o Leaflet não carrega tiles até o primeiro fitBounds
  // bem-sucedido — e o fitBounds assíncrono (após carregar a malha) pode
  // rodar com o container ainda sem tamanho, deixando o mapa cinza.
  const mapa = L.map("mapa", {
    zoomControl: false,
    scrollWheelZoom: false
  }).setView([-23.356, -46.876], 12);

  // Tiles do OpenStreetMap. A política de uso exige um Referer válido; forçar a
  // política aqui evita que extensões/configurações de privacidade o removam.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapa);

  L.control.zoom({ position: "bottomright" }).addTo(mapa);

  const estilos = {
    primary: { color: "#4778e8", weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" },
    alternative: { color: "#17a88b", weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" },
    "alternative-two": { color: "#a56add", weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" }
  };
  const classesRota = {
    primary: "rota-contingencia rota-contingencia-primary",
    alternative: "rota-contingencia rota-contingencia-alternative",
    "alternative-two": "rota-contingencia rota-contingencia-alternative-two"
  };
  const nomesRotas = {
    primary: "rota principal",
    alternative: "desvio sugerido",
    "alternative-two": "alternativa 2"
  };
  const linhas = {
    primary: L.polyline([], Object.assign({}, estilos.primary, { className: classesRota.primary })).addTo(mapa),
    alternative: L.polyline([], Object.assign({}, estilos.alternative, { className: classesRota.alternative })).addTo(mapa),
    "alternative-two": L.polyline([], Object.assign({}, estilos["alternative-two"], {
      className: classesRota["alternative-two"]
    })).addTo(mapa)
  };
  const limites = L.featureGroup(Object.keys(linhas).map(function (chave) {
    return linhas[chave];
  }));

  const marcadorBloqueio = L.marker([0, 0], {
    icon: L.divIcon({
      className: "",
      html: '<span class="incident-map-icon" aria-hidden="true">!</span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    })
  }).addTo(mapa);
  const marcadorOrigem = L.circleMarker([0, 0], {
    radius: 7, color: "#fff", weight: 3, fillColor: "#4778e8", fillOpacity: 1
  }).addTo(mapa);
  const marcadorDestino = L.circleMarker([0, 0], {
    radius: 7, color: "#fff", weight: 3, fillColor: "#172338", fillOpacity: 1
  }).addTo(mapa);

  const seletorCenario = document.getElementById("scenario-select");
  const entradaOrigem = document.getElementById("origin");
  const entradaDestino = document.getElementById("destination");
  const tituloRota = document.getElementById("map-route-title");
  const feedbackFormulario = document.getElementById("form-feedback");
  const tituloOcorrencia = document.getElementById("incident-title");
  const localOcorrencia = document.querySelector(".incident-card > p");
  const botoesRota = document.querySelectorAll(".route-option");
  const tituloDirecionamento = document.getElementById("dispatch-title");
  const descricaoDirecionamento = document.getElementById("dispatch-description");
  const botaoDirecionamento = document.getElementById("dispatch-button");
  const feedbackDirecionamento = document.getElementById("dispatch-feedback");
  const botaoDefinirMapa = document.getElementById("btn-definir-mapa");
  const botaoCalcular = document.getElementById("btn-calcular-rotas");
  const elMapa = document.getElementById("mapa");
  let rotaSelecionada = "alternative";
  let direcionamentoAtivo = false;
  /** Snapshot das rotas exibidas — base do «Gerar resumo» / PDF. */
  let snapshotResumo = null;
  const feedbackResumo = document.getElementById("dispatch-feedback");

  function baixarArquivo(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  function registrarSnapshotResumo(parcial) {
    const mudancas = mudancasDoCenarioAtivo();
    snapshotResumo = {
      origem: entradaOrigem.value,
      destino: entradaDestino.value,
      local: localAtual
        ? { id: localAtual.id, nome: localAtual.nome }
        : null,
      modo: modoRotas,
      ocorrencia: {
        titulo: tituloOcorrencia.textContent,
        local: localOcorrencia.textContent,
      },
      bloqueio: parcial.bloqueio ?? snapshotResumo?.bloqueio ?? null,
      rotaSelecionada,
      mudancas,
      rotas: (parcial.rotas ?? []).map(function (r) {
        return Object.assign({}, r, {
          selecionada: r.id === rotaSelecionada,
        });
      }),
    };
  }

  function sincronizarSelecaoNoSnapshot() {
    if (!snapshotResumo?.rotas) return;
    snapshotResumo.rotaSelecionada = rotaSelecionada;
    snapshotResumo.rotas = snapshotResumo.rotas.map(function (r) {
      return Object.assign({}, r, { selecionada: r.id === rotaSelecionada });
    });
  }

  function gerarResumoContingencia(formato) {
    if (!snapshotResumo?.rotas?.length) {
      feedbackResumo.textContent =
        "Carregue um cenário ou calcule rotas antes de gerar o resumo.";
      return;
    }
    const resumo = montarResumoContingencia(
      Object.assign({}, snapshotResumo, {
        titulo:
          "Contingência — " +
          (snapshotResumo.origem || "?") +
          " → " +
          (snapshotResumo.destino || "?"),
      })
    );
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (formato === "pdf") {
      const html = resumoContingenciaParaHtml(resumo, { autoPrint: true });
      const aberto = abrirResumoContingenciaParaPdf(html);
      feedbackResumo.textContent = aberto.ok
        ? "Relatório aberto — escolha «Salvar como PDF» no diálogo de impressão."
        : aberto.motivo;
      return;
    }
    baixarArquivo(
      "fastflow-contingencia-" + carimbo + ".html",
      resumoContingenciaParaHtml(resumo),
      "text/html;charset=utf-8"
    );
    feedbackResumo.textContent =
      "Resumo HTML baixado. Abra o arquivo e use Imprimir → PDF, ou o botão Gerar PDF.";
  }

  function mudancasDoCenarioAtivo() {
    const ativo = obterCenarioAtivo();
    if (!ativo || !localAtual || ativo.regiaoId !== localAtual.id) return [];
    return Array.isArray(ativo.mudancas) ? ativo.mudancas : [];
  }

  function pintarRobustez(cartao, selo) {
    const el = cartao.querySelector("[data-route-robustez]");
    if (!el) return;
    const texto = formatarRobustez(selo);
    if (!texto) {
      el.hidden = true;
      el.textContent = "";
      el.className = "route-tag tag-neutral";
      return;
    }
    el.hidden = false;
    el.textContent = texto;
    el.className = "route-tag " + classeRobustez(selo);
  }

  function pintarComposicao(cartao, composicao) {
    const barra = cartao.querySelector("[data-route-atraso-barra]");
    const legenda = cartao.querySelector("[data-route-atraso-legenda]");
    if (!barra) return;
    const pct = composicao?.percentuais;
    const total = composicao?.totalAtrasoS ?? 0;
    if (!pct || !(total > 0)) {
      barra.hidden = true;
      if (legenda) legenda.hidden = true;
      return;
    }
    barra.hidden = false;
    if (legenda) legenda.hidden = false;
    const dist = barra.querySelector("[data-atraso-distancia]");
    const disp = barra.querySelector("[data-atraso-dispositivos]");
    const cong = barra.querySelector("[data-atraso-congestao]");
    if (dist) dist.style.width = Math.max(0, pct.extraDistancia).toFixed(2) + "%";
    if (disp) disp.style.width = Math.max(0, pct.dispositivos).toFixed(2) + "%";
    if (cong) cong.style.width = Math.max(0, pct.congestionamento).toFixed(2) + "%";
    barra.title =
      "Composição do atraso: distância " +
      Math.round(pct.extraDistancia) +
      "% · dispositivos " +
      Math.round(pct.dispositivos) +
      "% · congestão " +
      Math.round(pct.congestionamento) +
      "%";
  }

  function analisarRotaDemo(pontos, metricas, metricasPrincipal, mudancas) {
    if (!grafoLocal || !pontos?.length) {
      return {
        robustez: { selo: null },
        composicao: comporAtraso({
          duracaoS: metricas.duracaoS,
          duracaoPrincipalS: metricasPrincipal.duracaoS,
          distanciaM: metricas.distanciaM,
          distanciaPrincipalM: metricasPrincipal.distanciaM,
        }),
      };
    }
    const arestas = mapearPolilinhaParaArestas(grafoLocal, pontos);
    const snapO = snapOrigemDestino(pontos[0], grafoLocal, 120);
    const snapD = snapOrigemDestino(pontos[pontos.length - 1], grafoLocal, 120);
    const origem = snapO.valido ? snapO.noId : null;
    const destino = snapD.valido ? snapD.noId : null;
    const robustez = avaliarRobustezRota(grafoLocal, origem, destino, arestas);
    const atrasoDispositivosS = estimarAtrasoDispositivosNaRota(grafoLocal, arestas, mudancas);
    const atrasoCongestionamentoS = estimarAtrasoCongestionamentoHeuristico(grafoLocal, arestas);
    return {
      robustez,
      composicao: comporAtraso({
        duracaoS: metricas.duracaoS,
        duracaoPrincipalS: metricasPrincipal.duracaoS,
        distanciaM: metricas.distanciaM,
        distanciaPrincipalM: metricasPrincipal.distanciaM,
        atrasoDispositivosS,
        atrasoCongestionamentoS,
      }),
    };
  }

  async function carregarGrafoDoLocal(local) {
    if (!local?.arquivo) {
      grafoLocal = null;
      return null;
    }
    try {
      const geojson = await carregarMalhaDoLocal(local);
      grafoLocal = construirGrafo(geojson);
      barraCenario.aoTrocarLocal(local, grafoLocal);
      return grafoLocal;
    } catch (erro) {
      grafoLocal = null;
      barraCenario.aoTrocarLocal(local, null);
      feedbackFormulario.textContent =
        "Malha local indisponível para análise F2: " + (erro.message || "erro");
      return null;
    }
  }

  function encerrarDefinicaoMapa() {
    definindoNoMapa = null;
    elMapa.classList.remove("mapa-definindo");
    if (botaoDefinirMapa) {
      botaoDefinirMapa.setAttribute("aria-pressed", "false");
      botaoDefinirMapa.textContent = "Definir no mapa";
    }
  }

  function aplicarRotasPlanejadas(resultado) {
    const rotas = resultado.rotas;
    const principal = rotas.primary;
    const tagsPadrao = {
      primary: { texto: "Principal", classe: "tag-neutral" },
      alternative: { texto: "Recomendada", classe: "tag-recommended" },
      "alternative-two": { texto: "Alternativa", classe: "tag-neutral" },
    };

    Object.keys(linhas).forEach(function (chave) {
      const rota = rotas[chave];
      const cartao = document.querySelector('.route-option[data-route="' + chave + '"]');
      if (!rota) {
        linhas[chave].setLatLngs([]);
        cartao.querySelector("[data-route-time]").textContent = "—";
        cartao.querySelector("[data-route-distance]").textContent = "—";
        cartao.querySelector("[data-route-delay]").textContent = "";
        cartao.querySelector("[data-route-description]").textContent =
          "Sem caminho com o cenário F5 ativo.";
        pintarRobustez(cartao, null);
        pintarComposicao(cartao, null);
        const tag = cartao.querySelector("[data-route-tag]");
        tag.textContent = "Indisponível";
        tag.className = "route-tag tag-neutral";
        return;
      }

      linhas[chave].setLatLngs(rota.pontos);
      cartao.querySelector("[data-route-time]").textContent = formatarDuracao(rota.duracaoS);
      cartao.querySelector("[data-route-distance]").textContent = formatarDistancia(rota.distanciaM);
      cartao.querySelector("[data-route-delay]").textContent =
        chave === "primary"
          ? ""
          : formatarAtraso(rota.duracaoS, principal?.duracaoS);
      const tag = cartao.querySelector("[data-route-tag]");
      const padrao = tagsPadrao[chave];
      tag.textContent = padrao.texto;
      tag.className = "route-tag " + padrao.classe;
      cartao.querySelector("[data-route-description]").textContent =
        "Calculada na malha local · " +
        (rota.arestas?.length || 0) +
        " arestas · cenário F5 aplicado.";
      pintarRobustez(cartao, rota.robustez?.selo);
      pintarComposicao(cartao, chave === "primary" ? null : rota.composicao);
    });

    if (principal?.pontos?.length) {
      marcadorOrigem.setLatLng(principal.pontos[0]).bindPopup("Origem planejada");
      marcadorDestino
        .setLatLng(principal.pontos[principal.pontos.length - 1])
        .bindPopup("Destino planejado");
    }
    marcadorBloqueio.setOpacity(0.35);

    const nBloqueios = mudancasDoCenarioAtivo().filter(function (m) {
      return m.tipo === "bloquear";
    }).length;
    tituloOcorrencia.textContent =
      nBloqueios > 0 ? "Cenário F5 com bloqueios" : "Cenário F5 sem bloqueios";
    localOcorrencia.textContent =
      (localAtual?.nome || "Local") +
      " · " +
      nBloqueios +
      " bloqueio(s) · rotas recalculadas (F2)";
    tituloRota.textContent = entradaOrigem.value + " → " + entradaDestino.value;

    const nomesPlanejados = {
      primary: "Rota principal",
      alternative: "Desvio sugerido",
      "alternative-two": "Alternativa 2",
    };
    registrarSnapshotResumo({
      bloqueio: marcadorBloqueio.getLatLng
        ? [marcadorBloqueio.getLatLng().lat, marcadorBloqueio.getLatLng().lng]
        : null,
      rotas: Object.keys(linhas).map(function (chave) {
        const rota = rotas[chave];
        const padrao = tagsPadrao[chave];
        return {
          id: chave,
          nome: nomesPlanejados[chave],
          tag: rota ? padrao.texto : "Indisponível",
          duracaoS: rota?.duracaoS ?? null,
          distanciaM: rota?.distanciaM ?? null,
          atrasoTexto:
            chave === "primary" || !rota || !principal
              ? ""
              : formatarAtraso(rota.duracaoS, principal.duracaoS),
          robustez: rota?.robustez?.selo ?? null,
          composicao: chave === "primary" ? null : rota?.composicao ?? null,
          descricao: rota
            ? "Calculada na malha local · " +
              (rota.arestas?.length || 0) +
              " arestas · cenário F5 aplicado."
            : "Sem caminho com o cenário F5 ativo.",
          pontos: rota?.pontos ?? [],
          disponivel: Boolean(rota?.pontos?.length),
        };
      }),
    });

    selecionarRota(rotas.alternative ? "alternative" : "primary");
    sincronizarSelecaoNoSnapshot();
    definirDirecionamentoAtivo(false, { silencioso: true });
    enquadrarRotas();
  }

  function calcularRotasPlanejadas() {
    if (!grafoLocal) {
      feedbackFormulario.textContent =
        "Carregue um local com malha antes de calcular na malha.";
      return;
    }
    if (!planejamento.origemNo || !planejamento.destinoNo) {
      feedbackFormulario.textContent =
        "Defina origem e destino no mapa (botão «Definir no mapa») e calcule de novo.";
      return;
    }
    if (botaoCalcular) botaoCalcular.disabled = true;
    feedbackFormulario.textContent = "Calculando rotas na malha…";
    const mudancas = mudancasDoCenarioAtivo();
    const resultado = planejarRotasNaMalha(
      grafoLocal,
      planejamento.origemNo,
      planejamento.destinoNo,
      { mudancas, k: 3 }
    );
    if (botaoCalcular) botaoCalcular.disabled = false;
    if (!resultado.ok) {
      feedbackFormulario.textContent = resultado.motivo || "Falha ao planejar rotas.";
      return;
    }
    modoRotas = "planejado";
    aplicarRotasPlanejadas(resultado);
    feedbackFormulario.textContent =
      "Rotas recalculadas com " +
      mudancas.length +
      " mudança(s) do cenário F5 ativo.";
  }

  function atualizarRotuloDirecionamento() {
    if (rotaSelecionada === "primary") {
      tituloDirecionamento.textContent = "Rota principal selecionada";
      descricaoDirecionamento.textContent = "A rota passa pela ocorrência deste cenário simulado.";
    } else if (rotaSelecionada === "alternative") {
      tituloDirecionamento.textContent = "Desvio selecionado";
      descricaoDirecionamento.textContent = "A equipe seguirá pela rota de contingência sugerida.";
    } else {
      tituloDirecionamento.textContent = "Alternativa 2 selecionada";
      descricaoDirecionamento.textContent = "A equipe seguirá pelo desvio ampliado de contingência.";
    }
  }

  function definirDirecionamentoAtivo(ativo, { silencioso = false } = {}) {
    direcionamentoAtivo = ativo;
    botaoDirecionamento.disabled = false;
    botaoDirecionamento.setAttribute("aria-pressed", String(ativo));
    if (ativo) {
      botaoDirecionamento.textContent = "Cancelar direcionamento";
      tituloDirecionamento.textContent = "Direcionamento ativado";
      descricaoDirecionamento.textContent =
        "Cenário demonstrativo · " + nomesRotas[rotaSelecionada] + ".";
      if (!silencioso) {
        feedbackDirecionamento.textContent =
          "Simulação local: nenhuma equipe real foi notificada.";
      }
      return;
    }

    botaoDirecionamento.textContent = "Ativar direcionamento";
    atualizarRotuloDirecionamento();
    if (!silencioso) {
      feedbackDirecionamento.textContent = "Direcionamento cancelado.";
    } else {
      feedbackDirecionamento.textContent = "";
    }
  }

  function idsCenariosDaRegiao(idRegiao) {
    return Object.keys(cenarios).filter(function (id) {
      return (cenarios[id].regioes || []).includes(idRegiao);
    });
  }

  function popularCenarios(idRegiao, preferido) {
    const ids = idsCenariosDaRegiao(idRegiao);
    seletorCenario.innerHTML = "";
    ids.forEach(function (id) {
      const cenario = cenarios[id];
      const option = document.createElement("option");
      option.value = id;
      option.textContent = cenario.origem + " → " + cenario.destino;
      seletorCenario.appendChild(option);
    });
    const escolhido = ids.includes(preferido) ? preferido : ids[0];
    if (escolhido) {
      seletorCenario.value = escolhido;
    }
    return escolhido;
  }

  function enquadrarRotas() {
    const bounds = limites.getBounds();
    if (!bounds.isValid()) return;
    mapa.invalidateSize();
    mapa.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
  }

  function refrescarMapa() {
    // Duas frames + timeout curto: a barra F5 e o layout ainda podem
    // estar estabilizando quando a malha termina de carregar.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        enquadrarRotas();
        window.setTimeout(enquadrarRotas, 120);
      });
    });
  }

  function atualizarAnimacaoRotas(tipoAtivo) {
    Object.keys(linhas).forEach(function (chave) {
      const elemento = linhas[chave].getElement();
      if (!elemento) {
        return;
      }
      elemento.classList.toggle("rota-contingencia-ativa", chave === tipoAtivo);
    });
    linhas[tipoAtivo].bringToFront();
  }

  function selecionarRota(tipo) {
    if (!linhas[tipo]) {
      return;
    }

    rotaSelecionada = tipo;
    sincronizarSelecaoNoSnapshot();
    botoesRota.forEach(function (botao) {
      const selecionado = botao.dataset.route === tipo;
      botao.classList.toggle("selected", selecionado);
      botao.setAttribute("aria-pressed", String(selecionado));
    });

    Object.keys(linhas).forEach(function (chave) {
      linhas[chave].setStyle(estilos[chave]);
    });
    atualizarAnimacaoRotas(tipo);

    if (direcionamentoAtivo) {
      definirDirecionamentoAtivo(false, { silencioso: true });
    } else {
      atualizarRotuloDirecionamento();
      botaoDirecionamento.disabled = false;
      botaoDirecionamento.textContent = "Ativar direcionamento";
      botaoDirecionamento.setAttribute("aria-pressed", "false");
      feedbackDirecionamento.textContent = "";
    }
  }

  function atualizarCenario(id) {
    const cenario = cenarios[id];
    if (!cenario) {
      return;
    }

    modoRotas = "demo";
    planejamento = { origemNo: null, destinoNo: null };
    encerrarDefinicaoMapa();
    marcadorBloqueio.setOpacity(1);

    entradaOrigem.value = cenario.origem;
    entradaDestino.value = cenario.destino;
    tituloRota.textContent = cenario.origem + " → " + cenario.destino;
    tituloOcorrencia.textContent = cenario.ocorrencia;
    localOcorrencia.textContent = cenario.localOcorrencia;
    feedbackFormulario.textContent = grafoLocal
      ? "Cenário demonstrativo · robustez e composição usam a malha local quando possível."
      : "Cenário demonstrativo carregado.";
    elMapa.setAttribute(
      "aria-label",
      "Mapa demonstrativo do trajeto entre " + cenario.origem + " e " + cenario.destino
    );

    const metricasPrincipal = metricasDaRota(id, "primary");
    const mudancas = mudancasDoCenarioAtivo();
    const rotasSnapshot = [];
    Object.keys(linhas).forEach(function (chave) {
      const rota = cenario.rotas[chave];
      const metricas = metricasDaRota(id, chave);
      const pontos = pontosDaRota(id, chave);
      linhas[chave].setLatLngs(pontos);

      const cartao = document.querySelector('.route-option[data-route="' + chave + '"]');
      cartao.querySelector("[data-route-time]").textContent = formatarDuracao(metricas.duracaoS);
      cartao.querySelector("[data-route-distance]").textContent = formatarDistancia(metricas.distanciaM);
      cartao.querySelector("[data-route-delay]").textContent =
        chave === "primary" ? "" : formatarAtraso(metricas.duracaoS, metricasPrincipal.duracaoS);
      cartao.querySelector("[data-route-description]").textContent = rota.descricao;

      const analise = analisarRotaDemo(pontos, metricas, metricasPrincipal, mudancas);
      pintarRobustez(cartao, analise.robustez?.selo);
      pintarComposicao(cartao, chave === "primary" ? null : analise.composicao);

      const tag = cartao.querySelector("[data-route-tag]");
      let tagTexto;
      if (chave === "primary") {
        tagTexto = "Interrompida";
        tag.textContent = tagTexto;
        tag.className = "route-tag tag-neutral";
      } else if (chave === "alternative") {
        tagTexto = "Recomendada";
        tag.textContent = tagTexto;
        tag.className = "route-tag tag-recommended";
      } else {
        tagTexto = "Mais distante";
        tag.textContent = tagTexto;
        tag.className = "route-tag tag-neutral";
      }

      rotasSnapshot.push({
        id: chave,
        nome:
          chave === "primary"
            ? "Rota principal"
            : chave === "alternative"
              ? "Desvio sugerido"
              : "Alternativa 2",
        tag: tagTexto,
        duracaoS: metricas.duracaoS ?? null,
        distanciaM: metricas.distanciaM ?? null,
        atrasoTexto:
          chave === "primary"
            ? ""
            : formatarAtraso(metricas.duracaoS, metricasPrincipal.duracaoS),
        robustez: analise.robustez?.selo ?? null,
        composicao: chave === "primary" ? null : analise.composicao,
        descricao: rota.descricao,
        pontos,
        disponivel: pontos.length > 0,
      });
    });

    const pontoBloqueio = tracados[id] ? tracados[id].bloqueio : cenario.bloqueio;
    marcadorBloqueio.setLatLng(pontoBloqueio);
    marcadorBloqueio.setPopupContent(
      "<strong>" + cenario.ocorrencia + "</strong><br>" + cenario.localOcorrencia
    );
    const pontosPrincipal = pontosDaRota(id, "primary");
    marcadorOrigem.setLatLng(pontosPrincipal[0])
      .bindPopup("Ponto de partida: " + cenario.origem);
    marcadorDestino.setLatLng(pontosPrincipal[pontosPrincipal.length - 1])
      .bindPopup("Destino: " + cenario.destino);

    registrarSnapshotResumo({
      bloqueio: pontoBloqueio,
      rotas: rotasSnapshot,
    });

    selecionarRota("alternative");
    sincronizarSelecaoNoSnapshot();
    definirDirecionamentoAtivo(false, { silencioso: true });
    enquadrarRotas();
  }

  seletorCenario.addEventListener("change", function () {
    atualizarCenario(seletorCenario.value);
  });

  const seletorLocal = document.getElementById("selLocal");
  const urlLocais = seletorLocal.dataset.locais || "data/locais.json";

  seletorLocal.addEventListener("change", async function () {
    const idLocal = seletorLocal.value;
    if (!idLocal) return;
    salvarLocalId(idLocal);
    const local = locaisCadastro.find(function (item) {
      return item.id === idLocal;
    });
    localAtual = local || { id: idLocal, nome: seletorLocal.selectedOptions[0]?.textContent };
    planejamento = { origemNo: null, destinoNo: null };
    encerrarDefinicaoMapa();
    feedbackFormulario.textContent = "Carregando malha local…";
    await carregarGrafoDoLocal(localAtual);
    const id = popularCenarios(idLocal, seletorCenario.value);
    if (id) {
      atualizarCenario(id);
    }
    refrescarMapa();
  });

  botoesRota.forEach(function (botao) {
    botao.addEventListener("click", function () {
      selecionarRota(botao.dataset.route);
    });
  });

  async function iniciarComLocal(idLocal) {
    const local = locaisCadastro.find(function (item) {
      return item.id === idLocal;
    });
    localAtual = local || null;
    if (localAtual) {
      await carregarGrafoDoLocal(localAtual);
    }
    const id = popularCenarios(idLocal, seletorCenario.value);
    if (id) {
      atualizarCenario(id);
    }
    refrescarMapa();
  }

  Promise.all([
    carregarLocais(urlLocais).catch(function () {
      return { locais: [], padrao: "centro" };
    }),
    fetch("data/rotas-contingencia.json")
      .then(function (resposta) {
        return resposta.ok ? resposta.json() : {};
      })
      .catch(function () {
        return {};
      }),
  ]).then(function (resultado) {
    const cadastro = resultado[0];
    tracados = resultado[1];

    locaisCadastro = cadastro.locais || [];
    if (locaisCadastro.length === 0) {
      seletorLocal.replaceChildren(new Option("Locais indisponíveis", ""));
      seletorLocal.disabled = true;
      return;
    }

    const ids = locaisCadastro.map(function (local) {
      return local.id;
    });
    const idInicial = lerLocalId(ids, cadastro.padrao);
    seletorLocal.replaceChildren(
      ...locaisCadastro.map(function (local) {
        return new Option(local.nome, local.id);
      })
    );
    seletorLocal.value = idInicial;
    seletorLocal.disabled = false;
    salvarLocalId(idInicial);
    iniciarComLocal(idInicial);
  });

  function sincronizarPausaAnimacoes() {
    document.body.classList.toggle("animacoes-pausadas", document.hidden);
  }

  document.addEventListener("visibilitychange", sincronizarPausaAnimacoes);
  sincronizarPausaAnimacoes();

  document.getElementById("fit-map").addEventListener("click", enquadrarRotas);

  if (botaoDefinirMapa) {
    botaoDefinirMapa.addEventListener("click", function () {
      if (!grafoLocal) {
        feedbackFormulario.textContent = "Malha local ainda não carregou.";
        return;
      }
      if (definindoNoMapa) {
        encerrarDefinicaoMapa();
        feedbackFormulario.textContent = "Definição no mapa cancelada.";
        return;
      }
      definindoNoMapa = "origem";
      planejamento = { origemNo: null, destinoNo: null };
      elMapa.classList.add("mapa-definindo");
      botaoDefinirMapa.setAttribute("aria-pressed", "true");
      botaoDefinirMapa.textContent = "Cancelar definição";
      feedbackFormulario.textContent = "Clique no mapa para a origem.";
    });
  }

  mapa.on("click", function (evento) {
    if (!definindoNoMapa || !grafoLocal) return;
    const ponto = [evento.latlng.lat, evento.latlng.lng];
    const snap = snapOrigemDestino(ponto, grafoLocal, 80);
    if (!snap.valido) {
      feedbackFormulario.textContent = snap.motivo || "Clique mais perto de um cruzamento.";
      return;
    }
    const rotulo =
      "Nó " + snap.noId + " (" + snap.coordenadas[0].toFixed(5) + ", " + snap.coordenadas[1].toFixed(5) + ")";
    if (definindoNoMapa === "origem") {
      planejamento.origemNo = snap.noId;
      entradaOrigem.value = rotulo;
      marcadorOrigem.setLatLng(snap.coordenadas).bindPopup("Origem: " + snap.noId);
      definindoNoMapa = "destino";
      feedbackFormulario.textContent = "Origem definida. Clique no mapa para o destino.";
      return;
    }
    planejamento.destinoNo = snap.noId;
    entradaDestino.value = rotulo;
    marcadorDestino.setLatLng(snap.coordenadas).bindPopup("Destino: " + snap.noId);
    encerrarDefinicaoMapa();
    feedbackFormulario.textContent =
      "Origem e destino definidos. Use «Calcular na malha» (cenário F5 ativo).";
  });

  barraCenario.definirAoTrocarCenario(function () {
    if (modoRotas === "planejado" && planejamento.origemNo && planejamento.destinoNo) {
      calcularRotasPlanejadas();
      return;
    }
    if (modoRotas === "demo" && seletorCenario.value) {
      atualizarCenario(seletorCenario.value);
    }
  });

  document.getElementById("route-form").addEventListener("submit", function (evento) {
    evento.preventDefault();
    calcularRotasPlanejadas();
  });

  botaoDirecionamento.addEventListener("click", function () {
    definirDirecionamentoAtivo(!direcionamentoAtivo);
  });

  document
    .getElementById("btnResumoContingenciaHtml")
    ?.addEventListener("click", function () {
      gerarResumoContingencia("html");
    });
  document
    .getElementById("btnResumoContingenciaPdf")
    ?.addEventListener("click", function () {
      gerarResumoContingencia("pdf");
    });
})();

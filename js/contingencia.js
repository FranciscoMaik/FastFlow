/* global L */
import { carregarLocais } from "./adaptador/locais.js";

const URL_LOCAIS = "data/locais.json";

const cenarios = {
    "cajamar-centro": {
      origem: "Centro de Cajamar",
      destino: "Jordanésia",
      locais: ["centro", "jordanesia"],
      ocorrencia: "Bloqueio viário",
      localOcorrencia: "Av. Dr. Antônio João Abdalla · Cajamar",
      bloqueio: [-23.356, -46.875],
      rotas: {
        primary: {
          pontos: [
            [-23.365, -46.883], [-23.360, -46.879], [-23.356, -46.875],
            [-23.353, -46.872], [-23.350, -46.869]
          ],
          tempo: "12 min", distancia: "4,2 km", atraso: "",
          descricao: "Segue pela Av. Dr. Antônio João Abdalla e passa pelo bloqueio."
        },
        alternative: {
          pontos: [
            [-23.365, -46.883], [-23.361, -46.887], [-23.355, -46.886],
            [-23.350, -46.880], [-23.350, -46.869]
          ],
          tempo: "16 min", distancia: "5,8 km", atraso: "+4 min",
          descricao: "Desvio pela região central de Cajamar · evita o bloqueio."
        },
        "alternative-two": {
          pontos: [
            [-23.365, -46.883], [-23.369, -46.876], [-23.365, -46.868],
            [-23.358, -46.864], [-23.350, -46.869]
          ],
          tempo: "19 min", distancia: "7,1 km", atraso: "+7 min",
          descricao: "Desvio ampliado por vias locais de Cajamar."
        }
      }
    },
    "polvilho-distrito": {
      origem: "Polvilho, Cajamar",
      destino: "Distrito Industrial de Cajamar",
      locais: ["polvilho"],
      ocorrencia: "Interdição simulada",
      localOcorrencia: "Estrada de Cajamar · acesso ao Distrito Industrial",
      bloqueio: [-23.397, -46.872],
      rotas: {
        primary: {
          pontos: [
            [-23.421, -46.855], [-23.414, -46.860], [-23.407, -46.866],
            [-23.397, -46.872], [-23.380, -46.884]
          ],
          tempo: "18 min", distancia: "8,6 km", atraso: "",
          descricao: "Segue pela Estrada de Cajamar e passa pela interdição."
        },
        alternative: {
          pontos: [
            [-23.421, -46.855], [-23.414, -46.848], [-23.405, -46.850],
            [-23.391, -46.860], [-23.380, -46.884]
          ],
          tempo: "24 min", distancia: "10,9 km", atraso: "+6 min",
          descricao: "Desvio por vias locais de Polvilho · evita a interdição."
        },
        "alternative-two": {
          pontos: [
            [-23.421, -46.855], [-23.429, -46.864], [-23.420, -46.878],
            [-23.404, -46.883], [-23.380, -46.884]
          ],
          tempo: "29 min", distancia: "13,2 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno de Polvilho e Cajamar."
        }
      }
    },
    "ponunduva-cajamar": {
      origem: "Ponunduva, Cajamar",
      destino: "Centro de Cajamar",
      locais: ["ponunduva", "centro"],
      ocorrencia: "Obra simulada",
      localOcorrencia: "Estrada de Ponunduva · Cajamar",
      bloqueio: [-23.344, -46.913],
      rotas: {
        primary: {
          pontos: [
            [-23.337, -46.929], [-23.341, -46.921], [-23.344, -46.913],
            [-23.348, -46.900], [-23.357, -46.879]
          ],
          tempo: "21 min", distancia: "9,4 km", atraso: "",
          descricao: "Segue pela Estrada de Ponunduva e passa pela obra simulada."
        },
        alternative: {
          pontos: [
            [-23.337, -46.929], [-23.331, -46.918], [-23.334, -46.902],
            [-23.342, -46.890], [-23.357, -46.879]
          ],
          tempo: "27 min", distancia: "11,8 km", atraso: "+6 min",
          descricao: "Desvio por vias alternativas da região de Ponunduva."
        },
        "alternative-two": {
          pontos: [
            [-23.337, -46.929], [-23.347, -46.935], [-23.357, -46.925],
            [-23.363, -46.906], [-23.357, -46.879]
          ],
          tempo: "32 min", distancia: "14,1 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno rural de Cajamar."
        }
      }
    },
    "jordanesia-polvilho": {
      origem: "Jordanésia, Cajamar",
      destino: "Polvilho, Cajamar",
      locais: ["jordanesia", "polvilho"],
      ocorrencia: "Bloqueio simulado",
      localOcorrencia: "Av. Tenente Marques · Cajamar",
      bloqueio: [-23.389, -46.861],
      rotas: {
        primary: {
          pontos: [
            [-23.350, -46.869], [-23.362, -46.866], [-23.376, -46.863],
            [-23.389, -46.861], [-23.421, -46.855]
          ],
          tempo: "19 min", distancia: "8,9 km", atraso: "",
          descricao: "Passa pelo bloqueio simulado na Av. Tenente Marques."
        },
        alternative: {
          pontos: [
            [-23.350, -46.869], [-23.357, -46.878], [-23.373, -46.880],
            [-23.394, -46.875], [-23.421, -46.855]
          ],
          tempo: "25 min", distancia: "11,3 km", atraso: "+6 min",
          descricao: "Desvio por vias de Jordanésia · evita o bloqueio."
        },
        "alternative-two": {
          pontos: [
            [-23.350, -46.869], [-23.343, -46.861], [-23.353, -46.848],
            [-23.374, -46.847], [-23.398, -46.850], [-23.421, -46.855]
          ],
          tempo: "30 min", distancia: "13,6 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno de Cajamar."
        }
      }
    },
    "centro-parque": {
      origem: "Centro de Cajamar",
      destino: "Parque Maria Aparecida, Cajamar",
      locais: ["centro"],
      ocorrencia: "Bloqueio simulado",
      localOcorrencia: "Av. Professor Walter Ribas de Andrade · Cajamar",
      bloqueio: [-23.354, -46.879],
      rotas: {
        primary: {
          pontos: [
            [-23.357, -46.879], [-23.354, -46.879], [-23.350, -46.878],
            [-23.346, -46.875], [-23.342, -46.871]
          ],
          tempo: "11 min", distancia: "3,8 km", atraso: "",
          descricao: "Passa pelo bloqueio simulado na Av. Professor Walter Ribas de Andrade."
        },
        alternative: {
          pontos: [
            [-23.357, -46.879], [-23.360, -46.874], [-23.354, -46.868],
            [-23.346, -46.867], [-23.342, -46.871]
          ],
          tempo: "15 min", distancia: "5,2 km", atraso: "+4 min",
          descricao: "Desvio por vias locais do centro de Cajamar."
        },
        "alternative-two": {
          pontos: [
            [-23.357, -46.879], [-23.363, -46.880], [-23.362, -46.869],
            [-23.352, -46.863], [-23.342, -46.871]
          ],
          tempo: "19 min", distancia: "6,7 km", atraso: "+8 min",
          descricao: "Desvio ampliado pelo entorno do Parque Maria Aparecida."
        }
      }
    },
    "jordanesia-empresarial": {
      origem: "Jordanésia, Cajamar",
      destino: "Parque Empresarial de Cajamar",
      locais: ["jordanesia"],
      ocorrencia: "Obra simulada",
      localOcorrencia: "Estrada de Jordanésia · acesso empresarial",
      bloqueio: [-23.368, -46.858],
      rotas: {
        primary: {
          pontos: [
            [-23.350, -46.869], [-23.357, -46.865], [-23.368, -46.858],
            [-23.378, -46.850], [-23.387, -46.842]
          ],
          tempo: "17 min", distancia: "7,3 km", atraso: "",
          descricao: "Passa pela obra simulada no acesso ao parque empresarial."
        },
        alternative: {
          pontos: [
            [-23.350, -46.869], [-23.353, -46.859], [-23.361, -46.850],
            [-23.375, -46.844], [-23.387, -46.842]
          ],
          tempo: "23 min", distancia: "9,5 km", atraso: "+6 min",
          descricao: "Desvio por vias locais de Jordanésia."
        },
        "alternative-two": {
          pontos: [
            [-23.350, -46.869], [-23.343, -46.860], [-23.350, -46.847],
            [-23.366, -46.839], [-23.387, -46.842]
          ],
          tempo: "28 min", distancia: "11,8 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno de Jordanésia."
        }
      }
    },
    "polvilho-centro": {
      origem: "Polvilho, Cajamar",
      destino: "Centro de Cajamar",
      locais: ["polvilho", "centro"],
      ocorrencia: "Interdição simulada",
      localOcorrencia: "Av. Tenente Marques · região de Polvilho",
      bloqueio: [-23.405, -46.866],
      rotas: {
        primary: {
          pontos: [
            [-23.421, -46.855], [-23.414, -46.860], [-23.405, -46.866],
            [-23.391, -46.873], [-23.357, -46.879]
          ],
          tempo: "20 min", distancia: "9,1 km", atraso: "",
          descricao: "Segue pela Av. Tenente Marques e passa pela interdição simulada."
        },
        alternative: {
          pontos: [
            [-23.421, -46.855], [-23.419, -46.866], [-23.407, -46.878],
            [-23.385, -46.884], [-23.357, -46.879]
          ],
          tempo: "26 min", distancia: "11,7 km", atraso: "+6 min",
          descricao: "Desvio por vias locais de Polvilho · evita a interdição."
        },
        "alternative-two": {
          pontos: [
            [-23.421, -46.855], [-23.430, -46.850], [-23.431, -46.870],
            [-23.411, -46.890], [-23.383, -46.888], [-23.357, -46.879]
          ],
          tempo: "32 min", distancia: "14,5 km", atraso: "+12 min",
          descricao: "Desvio ampliado pelo entorno de Cajamar."
        }
      }
    },
    "ponunduva-jordanesia": {
      origem: "Ponunduva, Cajamar",
      destino: "Jordanésia, Cajamar",
      locais: ["ponunduva", "jordanesia"],
      ocorrencia: "Bloqueio viário simulado",
      localOcorrencia: "Estrada de Ponunduva · acesso a Jordanésia",
      bloqueio: [-23.351, -46.900],
      rotas: {
        primary: {
          pontos: [
            [-23.337, -46.929], [-23.342, -46.916], [-23.351, -46.900],
            [-23.350, -46.885], [-23.350, -46.869]
          ],
          tempo: "25 min", distancia: "11,2 km", atraso: "",
          descricao: "Passa pelo bloqueio simulado na Estrada de Ponunduva."
        },
        alternative: {
          pontos: [
            [-23.337, -46.929], [-23.330, -46.914], [-23.336, -46.896],
            [-23.342, -46.880], [-23.350, -46.869]
          ],
          tempo: "32 min", distancia: "13,8 km", atraso: "+7 min",
          descricao: "Desvio por vias locais de Ponunduva."
        },
        "alternative-two": {
          pontos: [
            [-23.337, -46.929], [-23.348, -46.937], [-23.360, -46.918],
            [-23.365, -46.895], [-23.359, -46.878], [-23.350, -46.869]
          ],
          tempo: "38 min", distancia: "16,4 km", atraso: "+13 min",
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

  const mapa = L.map("mapa", {
    zoomControl: false,
    scrollWheelZoom: false
  });

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
    primary: { color: "#4778e8", weight: 5, opacity: 0.8, lineCap: "round", lineJoin: "round" },
    alternative: { color: "#17a88b", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" },
    "alternative-two": { color: "#a56add", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }
  };
  const nomesRotas = {
    primary: "rota principal",
    alternative: "desvio sugerido",
    "alternative-two": "alternativa 2"
  };
  const linhas = {
    primary: L.polyline([], estilos.primary).addTo(mapa),
    alternative: L.polyline([], estilos.alternative).addTo(mapa),
    "alternative-two": L.polyline([], estilos["alternative-two"]).addTo(mapa)
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

  const seletorLocal = document.getElementById("selLocal");
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
  let rotaSelecionada = "alternative";
  const locaisPorId = {};

  function idsCenariosDoLocal(idLocal) {
    return Object.keys(cenarios).filter(function (id) {
      return (cenarios[id].locais || []).includes(idLocal);
    });
  }

  function popularCenarios(idLocal, preferido) {
    const ids = idsCenariosDoLocal(idLocal);
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
    seletorCenario.disabled = ids.length === 0;
    return escolhido;
  }

  function popularLocais(lista, padrao) {
    seletorLocal.innerHTML = "";
    lista.forEach(function (local) {
      locaisPorId[local.id] = local;
      const option = document.createElement("option");
      option.value = local.id;
      option.textContent = local.nome;
      seletorLocal.appendChild(option);
    });
    const escolhido = locaisPorId[padrao] ? padrao : lista[0] && lista[0].id;
    if (escolhido) {
      seletorLocal.value = escolhido;
    }
    seletorLocal.disabled = lista.length === 0;
    return escolhido;
  }

  function enquadrarRotas() {
    mapa.fitBounds(limites.getBounds(), { padding: [34, 34] });
  }

  function aoTrocarLocal(idLocal) {
    const id = popularCenarios(idLocal, seletorCenario.value);
    if (id) {
      atualizarCenario(id);
      return;
    }
    feedbackFormulario.textContent = "Nenhum cenário disponível para esta região.";
  }

  function selecionarRota(tipo) {
    if (!linhas[tipo]) {
      return;
    }

    rotaSelecionada = tipo;
    botoesRota.forEach(function (botao) {
      const selecionado = botao.dataset.route === tipo;
      botao.classList.toggle("selected", selecionado);
      botao.setAttribute("aria-pressed", String(selecionado));
    });

    Object.keys(linhas).forEach(function (chave) {
      linhas[chave].setStyle(chave === tipo
        ? estilos[chave]
        : { ...estilos[chave], opacity: 0.35 });
    });

    if (tipo === "primary") {
      tituloDirecionamento.textContent = "Rota principal selecionada";
      descricaoDirecionamento.textContent = "A rota passa pela ocorrência deste cenário simulado.";
    } else if (tipo === "alternative") {
      tituloDirecionamento.textContent = "Desvio selecionado";
      descricaoDirecionamento.textContent = "A equipe seguirá pela rota de contingência sugerida.";
    } else {
      tituloDirecionamento.textContent = "Alternativa 2 selecionada";
      descricaoDirecionamento.textContent = "A equipe seguirá pelo desvio ampliado de contingência.";
    }

    botaoDirecionamento.disabled = false;
    botaoDirecionamento.textContent = "Ativar direcionamento";
    feedbackDirecionamento.textContent = "";
  }

  function atualizarCenario(id) {
    const cenario = cenarios[id];
    if (!cenario) {
      return;
    }

    entradaOrigem.value = cenario.origem;
    entradaDestino.value = cenario.destino;
    tituloRota.textContent = cenario.origem + " → " + cenario.destino;
    tituloOcorrencia.textContent = cenario.ocorrencia;
    localOcorrencia.textContent = cenario.localOcorrencia;
    feedbackFormulario.textContent = "Cenário demonstrativo carregado.";
    document.getElementById("mapa").setAttribute(
      "aria-label",
      "Mapa demonstrativo do trajeto entre " + cenario.origem + " e " + cenario.destino
    );

    Object.keys(linhas).forEach(function (chave) {
      const rota = cenario.rotas[chave];
      linhas[chave].setLatLngs(pontosDaRota(id, chave));

      const cartao = document.querySelector('.route-option[data-route="' + chave + '"]');
      cartao.querySelector("[data-route-time]").textContent = rota.tempo;
      cartao.querySelector("[data-route-distance]").textContent = rota.distancia;
      cartao.querySelector("[data-route-delay]").textContent = rota.atraso;
      cartao.querySelector("[data-route-description]").textContent = rota.descricao;
    });

    marcadorBloqueio.setLatLng(tracados[id] ? tracados[id].bloqueio : cenario.bloqueio);
    marcadorBloqueio.setPopupContent(
      "<strong>" + cenario.ocorrencia + "</strong><br>" + cenario.localOcorrencia
    );
    const pontosPrincipal = pontosDaRota(id, "primary");
    marcadorOrigem.setLatLng(pontosPrincipal[0])
      .bindPopup("Ponto de partida: " + cenario.origem);
    marcadorDestino.setLatLng(pontosPrincipal[pontosPrincipal.length - 1])
      .bindPopup("Destino: " + cenario.destino);

    selecionarRota("alternative");
    enquadrarRotas();
  }

  seletorCenario.addEventListener("change", function () {
    atualizarCenario(seletorCenario.value);
  });

  seletorLocal.addEventListener("change", function () {
    aoTrocarLocal(seletorLocal.value);
  });

  botoesRota.forEach(function (botao) {
    botao.addEventListener("click", function () {
      selecionarRota(botao.dataset.route);
    });
  });

  function iniciar(idLocal) {
    const id = popularCenarios(idLocal, seletorCenario.value);
    if (id) {
      atualizarCenario(id);
    } else {
      feedbackFormulario.textContent = "Nenhum cenário disponível para esta região.";
    }
    window.setTimeout(function () {
      mapa.invalidateSize();
      enquadrarRotas();
    }, 0);
  }

  Promise.all([
    fetch("data/rotas-contingencia.json")
      .then(function (resposta) {
        return resposta.ok ? resposta.json() : {};
      })
      .catch(function () {
        return {};
      }),
    carregarLocais(URL_LOCAIS)
  ])
    .then(function (resultado) {
      tracados = resultado[0];
      const cadastro = resultado[1];
      const idLocal = popularLocais(cadastro.locais, cadastro.padrao);
      iniciar(idLocal);
    })
    .catch(function (erro) {
      seletorLocal.disabled = true;
      feedbackFormulario.textContent = erro.message || "Não foi possível carregar as regiões.";
    });

  document.getElementById("fit-map").addEventListener("click", enquadrarRotas);

  document.getElementById("route-form").addEventListener("submit", function (evento) {
    evento.preventDefault();
    const origem = entradaOrigem.value.trim();
    const destino = entradaDestino.value.trim();

    if (!origem || !destino) {
      feedbackFormulario.textContent = "Informe o ponto de partida e o destino.";
      return;
    }

    tituloRota.textContent = origem + " → " + destino;
    feedbackFormulario.textContent =
      "Endereços atualizados. O traçado continua ilustrativo do cenário selecionado.";
    botaoDirecionamento.disabled = false;
    botaoDirecionamento.textContent = "Ativar direcionamento";
    feedbackDirecionamento.textContent = "";
  });

  botaoDirecionamento.addEventListener("click", function () {
    botaoDirecionamento.disabled = true;
    botaoDirecionamento.textContent = "Direcionamento ativado";
    tituloDirecionamento.textContent = "Direcionamento ativado";
    descricaoDirecionamento.textContent =
      "Cenário demonstrativo · " + nomesRotas[rotaSelecionada] + ".";
    feedbackDirecionamento.textContent =
      "Simulação local: nenhuma equipe real foi notificada.";
  });

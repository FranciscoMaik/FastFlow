import { carregarLocais, lerLocalId, salvarLocalId } from "./adaptador/locais.js";

(function () {
  const cenarios = {
    // Extremidades ancoradas em avenidas/estradas arteriais para o OSRM não
    // puxar a rota principal (e o bloqueio) para becos ou ruas sem saída.
    "cajamar-centro": {
      origem: "Centro de Cajamar",
      destino: "Jordanésia",
      regioes: ["centro", "jordanesia"],
      ocorrencia: "Bloqueio viário",
      localOcorrencia: "Av. Dr. Antônio João Abdalla · Cajamar",
      bloqueio: [-23.349504, -46.872853],
      rotas: {
        primary: {
          pontos: [
            [-23.36166, -46.87303], [-23.355, -46.865], [-23.34822, -46.84846]
          ],
          tempo: "12 min", distancia: "5,6 km", atraso: "",
          descricao: "Segue pelas avenidas do centro em direção a Jordanésia e passa pelo bloqueio."
        },
        alternative: {
          pontos: [
            [-23.36166, -46.87303], [-23.358, -46.880], [-23.350, -46.875],
            [-23.34822, -46.84846]
          ],
          tempo: "16 min", distancia: "7,2 km", atraso: "+4 min",
          descricao: "Desvio pela região central de Cajamar · evita o bloqueio."
        },
        "alternative-two": {
          pontos: [
            [-23.36166, -46.87303], [-23.368, -46.870], [-23.360, -46.855],
            [-23.34822, -46.84846]
          ],
          tempo: "19 min", distancia: "8,5 km", atraso: "+7 min",
          descricao: "Desvio ampliado pelo entorno do centro de Cajamar."
        }
      }
    },
    "polvilho-distrito": {
      origem: "Polvilho, Cajamar",
      destino: "Distrito Industrial de Cajamar",
      regioes: ["polvilho"],
      ocorrencia: "Interdição simulada",
      localOcorrencia: "Rua José Marques Ribeiro · Polvilho",
      bloqueio: [-23.383015, -46.860805],
      rotas: {
        primary: {
          pontos: [
            [-23.40640, -46.86399], [-23.400, -46.868], [-23.380, -46.884]
          ],
          tempo: "18 min", distancia: "8,6 km", atraso: "",
          descricao: "Segue pela Av. Tenente Marques e passa pela interdição."
        },
        alternative: {
          pontos: [
            [-23.40640, -46.86399], [-23.410, -46.850], [-23.395, -46.855],
            [-23.380, -46.884]
          ],
          tempo: "24 min", distancia: "10,9 km", atraso: "+6 min",
          descricao: "Desvio por vias de Polvilho · evita a interdição."
        },
        "alternative-two": {
          pontos: [
            [-23.40640, -46.86399], [-23.420, -46.870], [-23.405, -46.885],
            [-23.380, -46.884]
          ],
          tempo: "29 min", distancia: "13,2 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno de Polvilho e Cajamar."
        }
      }
    },
    "ponunduva-cajamar": {
      origem: "Ponunduva, Cajamar",
      destino: "Centro de Cajamar",
      regioes: ["ponunduva", "centro"],
      ocorrencia: "Obra simulada",
      localOcorrencia: "Estrada João Félix Domingues · Ponunduva",
      bloqueio: [-23.311616, -46.897799],
      rotas: {
        primary: {
          pontos: [
            [-23.33240, -46.92864], [-23.340, -46.905], [-23.36166, -46.87303]
          ],
          tempo: "21 min", distancia: "12,9 km", atraso: "",
          descricao: "Segue pela Estrada Francisco Missé e passa pela obra simulada."
        },
        alternative: {
          pontos: [
            [-23.33240, -46.92864], [-23.325, -46.910], [-23.345, -46.890],
            [-23.36166, -46.87303]
          ],
          tempo: "27 min", distancia: "14,5 km", atraso: "+6 min",
          descricao: "Desvio por vias alternativas da região de Ponunduva."
        },
        "alternative-two": {
          pontos: [
            [-23.33240, -46.92864], [-23.345, -46.935], [-23.360, -46.910],
            [-23.36166, -46.87303]
          ],
          tempo: "32 min", distancia: "16,0 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno rural de Cajamar."
        }
      }
    },
    "jordanesia-polvilho": {
      origem: "Jordanésia, Cajamar",
      destino: "Polvilho, Cajamar",
      regioes: ["jordanesia", "polvilho"],
      ocorrencia: "Bloqueio simulado",
      localOcorrencia: "Av. Pref. Juvenal Ferreira dos Santos · Cajamar",
      bloqueio: [-23.372503, -46.851875],
      rotas: {
        primary: {
          pontos: [
            [-23.34822, -46.84846], [-23.370, -46.855], [-23.40640, -46.86399]
          ],
          tempo: "19 min", distancia: "8,7 km", atraso: "",
          descricao: "Passa pelo bloqueio simulado no corredor Jordanésia–Polvilho."
        },
        alternative: {
          pontos: [
            [-23.34822, -46.84846], [-23.355, -46.865], [-23.385, -46.875],
            [-23.40640, -46.86399]
          ],
          tempo: "25 min", distancia: "11,3 km", atraso: "+6 min",
          descricao: "Desvio por vias de Jordanésia · evita o bloqueio."
        },
        "alternative-two": {
          pontos: [
            [-23.34822, -46.84846], [-23.340, -46.840], [-23.365, -46.835],
            [-23.390, -46.845], [-23.40640, -46.86399]
          ],
          tempo: "30 min", distancia: "13,6 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno de Cajamar."
        }
      }
    },
    "centro-parque": {
      origem: "Centro de Cajamar",
      destino: "Parque Maria Aparecida, Cajamar",
      regioes: ["centro"],
      ocorrencia: "Bloqueio simulado",
      localOcorrencia: "Av. Dr. Antônio João Abdalla · Cajamar",
      bloqueio: [-23.350574, -46.876746],
      rotas: {
        primary: {
          pontos: [
            [-23.36166, -46.87303], [-23.352, -46.862], [-23.34660, -46.85440]
          ],
          tempo: "11 min", distancia: "4,6 km", atraso: "",
          descricao: "Passa pelo bloqueio simulado na Av. Dr. Antônio João Abdalla."
        },
        alternative: {
          pontos: [
            [-23.36166, -46.87303], [-23.358, -46.865], [-23.350, -46.860],
            [-23.34660, -46.85440]
          ],
          tempo: "15 min", distancia: "5,8 km", atraso: "+4 min",
          descricao: "Desvio por vias do centro de Cajamar."
        },
        "alternative-two": {
          pontos: [
            [-23.36166, -46.87303], [-23.368, -46.870], [-23.360, -46.855],
            [-23.34660, -46.85440]
          ],
          tempo: "19 min", distancia: "7,0 km", atraso: "+8 min",
          descricao: "Desvio ampliado pelo entorno do Parque Maria Aparecida."
        }
      }
    },
    "jordanesia-empresarial": {
      origem: "Jordanésia, Cajamar",
      destino: "Parque Empresarial de Cajamar",
      regioes: ["jordanesia"],
      ocorrencia: "Obra simulada",
      localOcorrencia: "Av. Dr. Antônio João Abdala · Jordanésia",
      bloqueio: [-23.336964, -46.845669],
      rotas: {
        primary: {
          pontos: [
            [-23.34822, -46.84846], [-23.345, -46.842], [-23.34100, -46.83774]
          ],
          tempo: "17 min", distancia: "3,5 km", atraso: "",
          descricao: "Passa pela obra simulada na rodovia de acesso ao parque empresarial."
        },
        alternative: {
          pontos: [
            [-23.34822, -46.84846], [-23.352, -46.845], [-23.348, -46.838],
            [-23.34100, -46.83774]
          ],
          tempo: "23 min", distancia: "5,2 km", atraso: "+6 min",
          descricao: "Desvio por vias locais de Jordanésia."
        },
        "alternative-two": {
          pontos: [
            [-23.34822, -46.84846], [-23.355, -46.855], [-23.350, -46.840],
            [-23.34100, -46.83774]
          ],
          tempo: "28 min", distancia: "6,8 km", atraso: "+11 min",
          descricao: "Desvio ampliado pelo entorno de Jordanésia."
        }
      }
    },
    "polvilho-centro": {
      origem: "Polvilho, Cajamar",
      destino: "Centro de Cajamar",
      regioes: ["polvilho", "centro"],
      ocorrencia: "Interdição simulada",
      localOcorrencia: "Rua José Marques Ribeiro · Polvilho",
      bloqueio: [-23.384022, -46.862279],
      rotas: {
        primary: {
          pontos: [
            [-23.40640, -46.86399], [-23.390, -46.868], [-23.36166, -46.87303]
          ],
          tempo: "20 min", distancia: "7,2 km", atraso: "",
          descricao: "Segue pela Av. Tenente Marques e passa pela interdição simulada."
        },
        alternative: {
          pontos: [
            [-23.40640, -46.86399], [-23.410, -46.875], [-23.385, -46.880],
            [-23.36166, -46.87303]
          ],
          tempo: "26 min", distancia: "9,5 km", atraso: "+6 min",
          descricao: "Desvio por vias de Polvilho · evita a interdição."
        },
        "alternative-two": {
          pontos: [
            [-23.40640, -46.86399], [-23.420, -46.850], [-23.400, -46.885],
            [-23.36166, -46.87303]
          ],
          tempo: "32 min", distancia: "12,0 km", atraso: "+12 min",
          descricao: "Desvio ampliado pelo entorno de Cajamar."
        }
      }
    },
    "ponunduva-jordanesia": {
      origem: "Ponunduva, Cajamar",
      destino: "Jordanésia, Cajamar",
      regioes: ["ponunduva", "jordanesia"],
      ocorrencia: "Bloqueio viário simulado",
      localOcorrencia: "Estrada João Félix Domingues · Cajamar",
      bloqueio: [-23.317243, -46.894906],
      rotas: {
        primary: {
          pontos: [
            [-23.33240, -46.92864], [-23.335, -46.890], [-23.34822, -46.84846]
          ],
          tempo: "25 min", distancia: "14,7 km", atraso: "",
          descricao: "Passa pelo bloqueio simulado no corredor Ponunduva–Jordanésia."
        },
        alternative: {
          pontos: [
            [-23.33240, -46.92864], [-23.325, -46.905], [-23.340, -46.870],
            [-23.34822, -46.84846]
          ],
          tempo: "32 min", distancia: "16,5 km", atraso: "+7 min",
          descricao: "Desvio por vias de Ponunduva."
        },
        "alternative-two": {
          pontos: [
            [-23.33240, -46.92864], [-23.345, -46.935], [-23.360, -46.900],
            [-23.355, -46.865], [-23.34822, -46.84846]
          ],
          tempo: "38 min", distancia: "18,5 km", atraso: "+13 min",
          descricao: "Desvio ampliado pelo entorno rural de Cajamar."
        }
      }
    }
  };

  // Traçados que seguem as ruas, gerados por scripts/gerar-rotas-contingencia.mjs.
  // Se o arquivo não carregar, a página usa as linhas retas de `cenarios`.
  let tracados = {};

  // Nome da via do bloqueio (vindo do traçado gerado); cai no texto do cenário.
  function localDoBloqueio(id) {
    const via = tracados[id] && tracados[id].local;
    if (!via) return cenarios[id].localOcorrencia;
    return via + " · " + cenarios[id].localOcorrencia.split(" · ").pop();
  }

  function pontosDaRota(id, tipo) {
    const tracado = tracados[id] && tracados[id].rotas[tipo];
    return tracado ? tracado.pontos : cenarios[id].rotas[tipo].pontos;
  }

  // A visão inicial é obrigatória: sem ela o Leaflet adia a renderização das
  // camadas e `bringToFront()` falha antes do primeiro `fitBounds`.
  const mapa = L.map("mapa", {
    zoomControl: false,
    scrollWheelZoom: true,
    center: [-23.356, -46.875],
    zoom: 14
  });

  // Tiles do OpenStreetMap. A política de uso exige um Referer válido; forçar a
  // política aqui evita que extensões/configurações de privacidade o removam.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapa);

  L.control.zoom({ position: "topright" }).addTo(mapa);

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
  let rotaSelecionada = "alternative";
  let direcionamentoAtivo = false;

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
    mapa.fitBounds(limites.getBounds(), { padding: [34, 34] });
  }

  function atualizarAnimacaoRotas(tipoAtivo) {
    Object.keys(linhas).forEach(function (chave) {
      const elemento = linhas[chave].getElement();
      if (!elemento) {
        return;
      }
      elemento.classList.toggle("rota-contingencia-ativa", chave === tipoAtivo);
    });
    if (linhas[tipoAtivo].getElement()) {
      linhas[tipoAtivo].bringToFront();
    }
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

    entradaOrigem.value = cenario.origem;
    entradaDestino.value = cenario.destino;
    tituloRota.textContent = cenario.origem + " → " + cenario.destino;
    tituloOcorrencia.textContent = cenario.ocorrencia;
    localOcorrencia.textContent = localDoBloqueio(id);
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
      "<strong>" + cenario.ocorrencia + "</strong><br>" + localDoBloqueio(id)
    );
    const pontosPrincipal = pontosDaRota(id, "primary");
    marcadorOrigem.setLatLng(pontosPrincipal[0])
      .bindPopup("Ponto de partida: " + cenario.origem);
    marcadorDestino.setLatLng(pontosPrincipal[pontosPrincipal.length - 1])
      .bindPopup("Destino: " + cenario.destino);

    selecionarRota("alternative");
    definirDirecionamentoAtivo(false, { silencioso: true });
    enquadrarRotas();
  }

  seletorCenario.addEventListener("change", function () {
    atualizarCenario(seletorCenario.value);
  });

  const seletorLocal = document.getElementById("selLocal");
  const urlLocais = seletorLocal.dataset.locais || "data/locais.json";

  seletorLocal.addEventListener("change", function () {
    const idLocal = seletorLocal.value;
    if (!idLocal) return;
    salvarLocalId(idLocal);
    const id = popularCenarios(idLocal, seletorCenario.value);
    if (id) {
      atualizarCenario(id);
    }
  });

  botoesRota.forEach(function (botao) {
    botao.addEventListener("click", function () {
      selecionarRota(botao.dataset.route);
    });
  });

  function iniciarComLocal(idLocal) {
    const id = popularCenarios(idLocal, seletorCenario.value);
    if (id) {
      atualizarCenario(id);
    }
    window.setTimeout(function () {
      mapa.invalidateSize();
      enquadrarRotas();
    }, 0);
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

    const locais = cadastro.locais || [];
    if (locais.length === 0) {
      seletorLocal.replaceChildren(new Option("Locais indisponíveis", ""));
      seletorLocal.disabled = true;
      return;
    }

    const ids = locais.map(function (local) {
      return local.id;
    });
    const idInicial = lerLocalId(ids, cadastro.padrao);
    seletorLocal.replaceChildren(
      ...locais.map(function (local) {
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

  document.getElementById("route-form").addEventListener("submit", function (evento) {
    evento.preventDefault();
  });

  botaoDirecionamento.addEventListener("click", function () {
    definirDirecionamentoAtivo(!direcionamentoAtivo);
  });

  // O mapa ocupa a célula central do grid; ao redimensionar a janela o Leaflet
  // precisa recalcular o tamanho do container antes de enquadrar as rotas.
  let redimensionarMapaId = 0;
  window.addEventListener("resize", function () {
    window.clearTimeout(redimensionarMapaId);
    redimensionarMapaId = window.setTimeout(function () {
      mapa.invalidateSize();
    }, 120);
  });
})();

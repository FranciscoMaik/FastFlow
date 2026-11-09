// Ponto de entrada da tela de simulação de bloqueio viário. Liga os componentes
// de interface ao ControleBloqueio (adaptador); não acessa o motor diretamente.
/* global L */
import { ControleBloqueio } from "../adaptador/controleBloqueio.js";
import { criarCamadaVias } from "./camadaVias.js";
import { criarCamadaVeiculos } from "./camadaVeiculos.js";
import { criarCamadaDispositivos } from "./camadaDispositivos.js";
import { criarSeletorVias } from "./seletorVias.js";
import {
  renderizarBloqueios,
  renderizarDispositivos,
  atualizarMetricasNaListaDispositivos,
  renderizarEstatisticas,
  renderizarInfoTrecho,
} from "./painelBloqueios.js";
import { criarLoopAnimacaoVeiculos } from "./loopAnimacaoVeiculos.js";
import { iniciarSeletorLocal } from "./seletorLocal.js";
import { ligarPausa } from "./pausaSimulacao.js";
import { confirmar, oferecerDesfazer } from "./confirmacao.js";
import { criarStatusSimulacao } from "./statusSimulacao.js";
import { ligarPainelAbas } from "./painelAbas.js";
import { montarAtalhos } from "./atalhos.js";
import { criarPreviewImpactoBloqueio } from "./previewImpactoBloqueio.js";
import { criarPreviewImpactoDispositivo } from "./previewImpactoDispositivo.js";
import { criarPreviewImpactoLigacao } from "./previewImpactoLigacao.js";
import { solicitarParametrosLigacao } from "./dialogoLigacao.js";
import { criarPainelOndeConstruir } from "./painelOndeConstruir.js";
import { criarPainelCustoBloqueios } from "./custoBloqueiosPainel.js";
import { iniciarBarraCenario } from "./barraCenario.js";
import { construirGrafo } from "../adaptador/carregarMalha.js";
import {
  aplicarCenarioNaSessao,
  desfazerMudancaNoAtivo,
  obterCenarioAtivo,
  registrarMudancaNoAtivo,
} from "../adaptador/cenarios.js";

const DEBOUNCE_CUSTO_MS = 120;

const DEBOUNCE_PREVIEW_MS = 80;
/** Busca de desvio recomendado roda após a prévia principal (amostra menor). */
const DEBOUNCE_DESVIO_MS = 40;
const DEBOUNCE_PREVIEW_DISP_MS = 100;
const CENTRO_CAJAMAR = [-23.355, -46.878];
const $ = (id) => document.getElementById(id);

async function iniciar() {
  const mapa = L.map("mapa", { zoomControl: true }).setView(CENTRO_CAJAMAR, 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  const status = criarStatusSimulacao($("badgeStatus"));
  montarAtalhos($("atalhosSim"), "bloqueio");
  ligarPainelAbas($("painelAbas"));

  const pausa = ligarPausa($("btnPausar"), {
    aoMudar(rodando) {
      if (!$("carregando")?.hidden) return;
      status.definir(rodando ? "executando" : "pausada", "", {
        bprAtivo: Boolean(montagemAtual?.congestionamentoAtivo),
      });
    },
  });
  let montagemAtual = null;
  /** @type {{ reiniciarSessao: () => object|null } | null} */
  let seletorApi = null;
  const barraCenario = iniciarBarraCenario();
  // Troca de cenário na barra → remount + aplicarCenarioNaSessao (sem reload).
  barraCenario.definirAoTrocarCenario(() => {
    seletorApi?.reiniciarSessao();
  });

  seletorApi = await iniciarSeletorLocal({
    mapa,
    urlLocais: $("mapa").dataset.locais,
    select: $("selLocal"),
    info: $("infoLocal"),
    carregando: $("carregando"),
    obterResumoAlteracoes: () => montagemAtual?.resumoAlteracoes() ?? null,
    aoEstadoCarregamento(estado, detalhe) {
      if (estado === "carregando") status.definir("carregando", detalhe);
      else if (estado === "erro") status.definir("erro", detalhe);
      else {
        status.definir(pausa.estaRodando() ? "executando" : "pausada", "", {
          bprAtivo: Boolean(montagemAtual?.congestionamentoAtivo),
        });
      }
    },
    montar: (local, geojson, { primeiraVez }) => {
      montagemAtual = montar(mapa, local, geojson, primeiraVez, pausa, barraCenario, status);
      return montagemAtual;
    },
  });
}

function montar(mapa, local, geojson, primeiraVez, pausa, barraCenario, status) {
  const eventos = new AbortController();
  const { signal } = eventos;

  const controle = new ControleBloqueio(geojson, {
    quantidadeVeiculos: Number($("selQuantidade").value),
    fatorTempo: Number($("selVelocidade").value),
  });

  if (status) {
    status.definir(pausa.estaRodando() ? "executando" : "pausada", "", {
      bprAtivo: controle.congestionamentoAtivo,
    });
  }

  const grafoBase = construirGrafo(geojson);
  barraCenario?.aoTrocarLocal(local, grafoBase);
  const cenarioAtivo = obterCenarioAtivo();
  /** @type {{ aplicadas: number, puladas: object[] } | null} */
  let resultadoCenarioInicial = null;
  if (cenarioAtivo?.regiaoId === local.id && cenarioAtivo.mudancas.length) {
    resultadoCenarioInicial = aplicarCenarioNaSessao(controle, cenarioAtivo, {
      tiposPermitidos: ["bloquear", "inverter", "lombada", "semaforo", "adicionarLigacao"],
    });
  }

  // F5: a UI chama `registrarMudancaNoAtivo` ao aplicar; o histórico live
  // em `controle.mudancasDoCenario()` fica como gancho para o comparador.
  controle.definirGanchoCenario(null);

  function ctxCenario() {
    return { regiaoId: local.id, nomeRegiao: local.nome };
  }

  let modoFerramenta = "navegar";
  /** @type {null | { noId: string, coordenadas: [number, number] }} */
  let ligacaoOrigem = null;
  let previewLigacaoTimer = null;
  let previewLigacaoGeracao = 0;
  /** @type {ReturnType<typeof criarPreviewImpactoLigacao> | null} */
  let previewLigacao = null;
  const camadaRascunhoLigacao = L.layerGroup().addTo(mapa);

  function limparRascunhoLigacao() {
    camadaRascunhoLigacao.clearLayers();
    ligacaoOrigem = null;
  }

  function marcarNoLigacao(coords, titulo) {
    return L.marker(coords, {
      icon: L.divIcon({
        className: "",
        html: '<div class="marcador-no-ligacao"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
      interactive: false,
      keyboard: false,
      title: titulo,
      zIndexOffset: 1200,
    }).addTo(camadaRascunhoLigacao);
  }

  function definirModo(modo) {
    if (modo !== "ligacao") {
      limparRascunhoLigacao();
      if (previewLigacaoTimer != null) {
        clearTimeout(previewLigacaoTimer);
        previewLigacaoTimer = null;
      }
      previewLigacao?.limpar();
    }
    modoFerramenta = modo;
    $("btnModoNavegar").classList.toggle("ativo", modo === "navegar");
    $("btnModoNavegar").setAttribute("aria-pressed", String(modo === "navegar"));
    $("btnModoLombada").classList.toggle("ativo", modo === "lombada");
    $("btnModoLombada").setAttribute("aria-pressed", String(modo === "lombada"));
    $("btnModoSemaforo").classList.toggle("ativo", modo === "semaforo");
    $("btnModoSemaforo").setAttribute("aria-pressed", String(modo === "semaforo"));
    const btnLig = $("btnModoLigacao");
    if (btnLig) {
      btnLig.classList.toggle("ativo", modo === "ligacao");
      btnLig.setAttribute("aria-pressed", String(modo === "ligacao"));
    }

    const mapaEl = $("mapa");
    mapaEl.classList.toggle("cursor-insercao", modo !== "navegar");

    const banner = $("bannerFerramenta");
    if (modo === "navegar") {
      banner.hidden = true;
    } else {
      banner.hidden = false;
      $("textoBannerFerramenta").textContent =
        modo === "lombada"
          ? "Ferramenta Lombada: clique sobre uma via no mapa para posicionar. (ESC para cancelar)"
          : modo === "semaforo"
            ? "Ferramenta Semáforo: clique sobre uma via no mapa para posicionar. (ESC para cancelar)"
            : "Nova ligação: clique na 1ª interseção. (ESC para cancelar)";
    }
  }

  function mensagem(texto, tipo) {
    const caixa = $("mensagem");
    caixa.textContent = texto;
    caixa.className = `mensagem ${tipo ?? ""}`;
  }

  function processarInsercao(latlng, trechoIdSugerido = null) {
    let lat = latlng?.lat;
    let lon = latlng?.lng;

    if (lat == null && trechoIdSugerido) {
      const t = controle.trecho(trechoIdSugerido);
      if (t?.meio) {
        lat = t.meio[0];
        lon = t.meio[1];
      }
    }

    if (lat == null || lon == null) return false;

    if (modoFerramenta === "lombada") {
      const res = controle.adicionarLombada({ lat, lon, trechoId: trechoIdSugerido });
      if (res.permitido) {
        const d = res.dispositivo;
        registrarMudancaNoAtivo(
          {
            tipo: "lombada",
            trechoId: d.trechoId,
            distancia: d.distancia,
            fracao: d.fracao,
            coordenadas: d.coordenadas,
            velocidadeMaxKmh: d.velocidadeMaxKmh,
            raioEfeito: d.raioEfeito,
            id: d.id,
          },
          ctxCenario()
        );
        barraCenario?.notificarMudanca();
        mensagem(`Lombada posicionada com sucesso em ${d.nomeTrecho}.`, "sucesso");
        controle.focarDispositivo(d.id);
        definirModo("navegar");
        redesenhar();
        camadaDispositivos.focar(d.id);
        atualizarPreviewDispositivo(d.id);
      } else {
        mensagem(res.motivo, "erro");
      }
      return true;
    }

    if (modoFerramenta === "semaforo") {
      const res = controle.adicionarSemaforo({ lat, lon, trechoId: trechoIdSugerido });
      if (res.permitido) {
        const d = res.dispositivo;
        registrarMudancaNoAtivo(
          {
            tipo: "semaforo",
            trechoId: d.trechoId,
            distancia: d.distancia,
            fracao: d.fracao,
            coordenadas: d.coordenadas,
            tempos: d.tempos,
            estadoInicial: d.estado,
            sentido: d.sentido,
            id: d.id,
          },
          ctxCenario()
        );
        barraCenario?.notificarMudanca();
        mensagem(`Semáforo posicionado com sucesso em ${d.nomeTrecho}.`, "sucesso");
        controle.focarDispositivo(d.id);
        definirModo("navegar");
        redesenhar();
        camadaDispositivos.focar(d.id);
        atualizarPreviewDispositivo(d.id);
      } else {
        mensagem(res.motivo, "erro");
      }
      return true;
    }

    if (modoFerramenta === "ligacao") {
      processarCliqueLigacao(lat, lon);
      return true;
    }

    return false;
  }

  async function processarCliqueLigacao(lat, lon) {
    const snap = controle.snapParaNo(lat, lon, 45);
    if (!snap.valido) {
      mensagem(snap.motivo, "erro");
      return;
    }

    if (!ligacaoOrigem) {
      ligacaoOrigem = { noId: snap.noId, coordenadas: snap.coordenadas };
      marcarNoLigacao(snap.coordenadas, `Origem ${snap.noId}`);
      $("textoBannerFerramenta").textContent =
        "Nova ligação: clique na 2ª interseção. (ESC para cancelar)";
      mensagem(`1ª interseção: ${snap.noId}. Selecione a segunda.`, "sucesso");
      return;
    }

    if (snap.noId === ligacaoOrigem.noId) {
      mensagem("Escolha uma interseção diferente da primeira.", "erro");
      return;
    }

    const de = ligacaoOrigem.noId;
    const para = snap.noId;
    const coordsDe = ligacaoOrigem.coordenadas;
    const coordsPara = snap.coordenadas;
    marcarNoLigacao(coordsPara, `Destino ${para}`);
    L.polyline([coordsDe, coordsPara], {
      className: "linha-preview-ligacao",
      weight: 4,
      interactive: false,
    }).addTo(camadaRascunhoLigacao);

    const comprimento = controle.comprimentoEntreNos(de, para);
    if (!(comprimento > 0)) {
      mensagem("Não foi possível medir o comprimento entre as interseções.", "erro");
      limparRascunhoLigacao();
      return;
    }

    const params = await solicitarParametrosLigacao({ comprimento, de, para });
    if (!params) {
      limparRascunhoLigacao();
      $("textoBannerFerramenta").textContent =
        "Nova ligação: clique na 1ª interseção. (ESC para cancelar)";
      mensagem("Ligação cancelada.", "");
      return;
    }

    agendarPreviewLigacao({
      de,
      para,
      comprimento,
      sentido: params.sentido,
      velocidadeKmh: params.velocidadeKmh,
    });
  }

  function agendarPreviewLigacao(entrada) {
    if (previewLigacaoTimer != null) clearTimeout(previewLigacaoTimer);
    const geracao = ++previewLigacaoGeracao;
    previewLigacao?.mostrarCarregando(entrada);
    previewLigacaoTimer = setTimeout(() => {
      previewLigacaoTimer = null;
      if (geracao !== previewLigacaoGeracao) return;
      try {
        const resultado = controle.avaliarImpactoLigacao(entrada);
        if (geracao !== previewLigacaoGeracao) return;
        previewLigacao?.renderizar(resultado);
        if (resultado?.ok) {
          mensagem("Prévia pronta — revise o impacto e clique em Aplicar ligação.", "sucesso");
        } else {
          mensagem(resultado?.motivo || "Falha na prévia.", "erro");
        }
      } catch (err) {
        if (geracao !== previewLigacaoGeracao) return;
        previewLigacao?.mostrarErro(err?.message || "Falha ao avaliar a ligação.");
      }
    }, DEBOUNCE_PREVIEW_MS);
  }

  function aplicarLigacaoPendente(resultado) {
    if (!resultado?.ok || !resultado.mudanca) return;
    const res = controle.adicionarLigacao(resultado.mudanca);
    if (!res.permitido) {
      mensagem(res.motivo, "erro");
      return;
    }

    registrarMudancaNoAtivo(res.mudanca, ctxCenario());
    barraCenario?.notificarMudanca();

    if (res.trecho) {
      camadaVias.adicionarTrecho(res.trecho);
      destacados = [res.trechoId];
      camadaVias.focar([res.trechoId]);
    }

    const trechoId = res.trechoId;
    oferecerDesfazer({
      mensagem: `Ligação ${trechoId} aplicada.`,
      aoDesfazer: () => {
        const rem = controle.removerLigacao(trechoId);
        if (rem.removido) {
          camadaVias.removerTrecho(trechoId);
          desfazerMudancaNoAtivo((m) => m.tipo === "adicionarLigacao" && m.id === trechoId);
          barraCenario?.notificarMudanca();
          destacados = destacados.filter((id) => id !== trechoId);
          redesenhar();
          mensagem("Ligação desfeita.", "sucesso");
        }
      },
    });

    limparRascunhoLigacao();
    previewLigacao?.limpar();
    definirModo("navegar");
    redesenhar();
    mensagem(
      `Ligação ${trechoId} criada (${Math.round(resultado.mudanca.comprimento)} m).`,
      "sucesso"
    );
  }

  let destacados = [];

  const camadaVias = criarCamadaVias(mapa, controle.trechos(), {
    aoClicar: (id, latlng) => {
      if (modoFerramenta !== "navegar") {
        processarInsercao(latlng, id);
        return;
      }
      controle.selecionar(id);
    },
  });

  if (resultadoCenarioInicial?.puladas?.length) {
    console.warn(
      "[FastFlow] Mudanças do cenário não aplicadas:",
      resultadoCenarioInicial.puladas.map((p) => p.motivo)
    );
  }

  const camadaVeiculos = criarCamadaVeiculos(mapa);

  const camadaDispositivos = criarCamadaDispositivos(mapa, {
    aoReposicionar(id, [lat, lon]) {
      const res = controle.reposicionarDispositivo(id, { lat, lon });
      if (res?.permitido) {
        controle.focarDispositivo(id);
        atualizarPreviewDispositivo(id);
      }
      redesenhar();
      return res;
    },
    aoRemover: (id) => removerDispositivo(id),
    aoConfigurarSemaforo: (id, tempos) => {
      controle.configurarSemaforo(id, tempos);
      redesenhar();
      atualizarPreviewDispositivo(id);
    },
    aoAlternarSemaforo: (id) => {
      const res = controle.alternarSemaforo(id);
      redesenhar();
      return res.estado;
    },
    aoCompararPlanosFase: (id, planos) =>
      controle.compararPlanosFaseSemaforo(id, planos, { comDeltaF2: true }),
    aoNotificar: (txt, tipo) => mensagem(txt, tipo),
    aoFocar(id) {
      controle.focarDispositivo(id);
      atualizarPreviewDispositivo(id);
      redesenharListaDispositivos();
    },
  });

  const seletor = criarSeletorVias(
    {
      selectLogradouro: $("selLogradouro"),
      selectTrecho: $("selTrecho"),
      filtroLogradouro: $("filtroLogradouro"),
    },
    controle.logradouros(),
    (id) => controle.trecho(id),
    {
      aoEscolherLogradouro(nome) {
        controle.selecionar(null);
        destacados = nome ? seletor.trechosDo(nome) : [];
        redesenhar();
        if (destacados.length) camadaVias.focar(destacados);
      },
      aoEscolherTrecho(id) {
        controle.selecionar(id);
        camadaVias.focar([id]);
      },
    },
    { signal }
  );

  const estatisticas = {
    ativos: $("estAtivos"),
    desviados: $("estDesviados"),
    retidos: $("estRetidos"),
    recalculos: $("estRecalculos"),
    viagens: $("estViagens"),
    tempoMedio: $("estTempoMedio"),
  };

  /** @type {object | null} */
  let ultimaRecomendacao = null;
  /** Evita reinverter o mesmo trecho se o usuário clicar Testar de novo. */
  let mitigacaoTestadaId = null;

  const preview = criarPreviewImpactoBloqueio($("preview-bloqueio"), {
    nomeDoTrecho(id) {
      return controle.trecho(id)?.nome ?? id;
    },
    aoTestarRecomendacao(recomendacao) {
      testarDesvioRecomendado(recomendacao);
    },
    periodoInicial: "pico",
    bprAnaliticoInicial: Boolean(controle.congestionamentoAtivo),
    aoMudarOpcoes() {
      // Troca de pico/fora de pico ou BPR → reavalia a prévia F2.
      atualizarPreviewBloqueio();
    },
  });
  let previewTimer = null;
  let previewGeracao = 0;
  let desvioTimer = null;
  let desvioGeracao = 0;

  const painelCusto = criarPainelCustoBloqueios($("custo-bloqueios"));
  let custoTimer = null;
  let custoGeracao = 0;
  /** @type {Record<string, object>} */
  let impactoPorId = {};
  let custoCarregando = false;
  let ultimaChaveCustoUi = "";

  const previewDisp = criarPreviewImpactoDispositivo($("preview-dispositivo"));
  let previewDispTimer = null;
  let previewDispGeracao = 0;
  /** @type {Record<string, object>} */
  let metricasPorId = {};

  previewLigacao = criarPreviewImpactoLigacao($("preview-ligacao"), {
    nomeDoTrecho: (id) => controle.trecho(id)?.nome ?? id,
    aoAplicar: (resultado) => aplicarLigacaoPendente(resultado),
    aoCancelar: () => {
      limparRascunhoLigacao();
      if (modoFerramenta === "ligacao") {
        $("textoBannerFerramenta").textContent =
          "Nova ligação: clique na 1ª interseção. (ESC para cancelar)";
      }
      mensagem("Prévia da ligação cancelada.", "");
    },
  });

  /** @type {AbortController | null} */
  let ondeConstruirAbort = null;
  let ondeConstruirGeracao = 0;

  function cancelarOndeConstruir() {
    ondeConstruirAbort?.abort();
    ondeConstruirAbort = null;
    ondeConstruirGeracao += 1;
  }

  function escolherSugestaoLigacao(item) {
    if (!item?.de || !item?.para) return;
    cancelarOndeConstruir();
    definirModo("ligacao");
    limparRascunhoLigacao();
    const noDe = controle.coordenadasNo(item.de);
    const noPara = controle.coordenadasNo(item.para);
    if (!noDe || !noPara) {
      mensagem("Não foi possível localizar as interseções sugeridas.", "erro");
      return;
    }
    ligacaoOrigem = { noId: item.de, coordenadas: noDe };
    marcarNoLigacao(noDe, `Origem ${item.de}`);
    marcarNoLigacao(noPara, `Destino ${item.para}`);
    L.polyline([noDe, noPara], {
      className: "linha-preview-ligacao",
      interactive: false,
    }).addTo(camadaRascunhoLigacao);
    $("textoBannerFerramenta").textContent =
      "Sugestão selecionada — revise a prévia e aplique (ESC cancela).";
    const comprimento =
      item.comprimento ?? controle.comprimentoEntreNos(item.de, item.para);
    agendarPreviewLigacao({
      de: item.de,
      para: item.para,
      comprimento,
      sentido: 0,
      velocidadeKmh: 40,
      nome: "Sugestão de ligação",
    });
    mensagem(`Prévia da sugestão ${item.de} ↔ ${item.para}…`, "");
  }

  async function buscarOndeConstruir() {
    cancelarOndeConstruir();
    const geracao = ++ondeConstruirGeracao;
    const ac = new AbortController();
    ondeConstruirAbort = ac;
    painelOnde.mostrarProgresso({ atual: 0, total: 0, fase: "pares" });
    mensagem("Buscando onde construir (pares <300 m)…", "");
    try {
      const resultado = await controle.oportunidadesLigacaoAsync(
        {},
        {
          signal: ac.signal,
          onProgress: (p) => {
            if (geracao !== ondeConstruirGeracao) return;
            painelOnde.mostrarProgresso(p);
          },
        }
      );
      if (geracao !== ondeConstruirGeracao) return;
      painelOnde.renderizar(resultado);
      if (resultado?.cancelado) {
        mensagem("Busca cancelada.", "");
      } else if (resultado?.ok) {
        const n = resultado.itens?.length ?? 0;
        mensagem(
          n > 0
            ? `${n} sugestão(ões) de ligação com ganho de tempo.`
            : "Nenhuma sugestão com ganho na amostra limitada.",
          n > 0 ? "sucesso" : ""
        );
      } else {
        mensagem(resultado?.motivo || "Falha na busca.", "erro");
      }
    } catch (err) {
      if (geracao !== ondeConstruirGeracao) return;
      if (ac.signal.aborted) {
        painelOnde.renderizar({ ok: false, motivo: "Busca cancelada.", cancelado: true });
        return;
      }
      painelOnde.mostrarErro(err?.message || "Falha na busca.");
      mensagem(err?.message || "Falha na busca.", "erro");
    } finally {
      if (ondeConstruirAbort === ac) ondeConstruirAbort = null;
    }
  }

  const painelOnde = criarPainelOndeConstruir($("secao-onde-construir"), {
    aoBuscar: () => buscarOndeConstruir(),
    aoCancelar: () => {
      cancelarOndeConstruir();
      painelOnde.renderizar({ ok: false, motivo: "Busca cancelada.", cancelado: true });
      mensagem("Busca cancelada.", "");
    },
    aoEscolher: (item) => escolherSugestaoLigacao(item),
  });
  signal.addEventListener("abort", () => cancelarOndeConstruir());

  function cancelarPreviewDispAgendado() {
    if (previewDispTimer != null) {
      clearTimeout(previewDispTimer);
      previewDispTimer = null;
    }
  }

  function atualizarMetricasDispositivos() {
    metricasPorId = controle.metricasDispositivos().porId;
  }

  function redesenharListaDispositivos() {
    atualizarMetricasDispositivos();
    renderizarDispositivos(
      $("listaDispositivos"),
      $("contadorDispositivos"),
      $("contadorLombadas"),
      $("contadorSemaforos"),
      $("btnRemoverTodosDispositivos"),
      $("semDispositivos"),
      controle.dispositivos(),
      {
        localizar(id) {
          camadaDispositivos.focar(id);
        },
        remover: removerDispositivo,
      },
      { metricasPorId, focadoId: controle.dispositivoFocado }
    );
  }

  function atualizarPreviewDispositivo(id = controle.dispositivoFocado) {
    cancelarPreviewDispAgendado();
    const geracao = ++previewDispGeracao;
    if (!id || !controle.dispositivo(id)) {
      previewDisp.limpar();
      return;
    }
    const d = controle.dispositivo(id);
    previewDisp.mostrarCarregando(d.tipo);
    previewDispTimer = setTimeout(() => {
      previewDispTimer = null;
      if (geracao !== previewDispGeracao || controle.dispositivoFocado !== id) return;
      try {
        const resultado = controle.avaliarImpactoDispositivo(id);
        if (geracao !== previewDispGeracao || controle.dispositivoFocado !== id) return;
        if (!resultado) {
          previewDisp.limpar();
          return;
        }
        previewDisp.renderizar(resultado);
      } catch (err) {
        if (geracao !== previewDispGeracao) return;
        previewDisp.mostrarErro(err?.message || "Falha ao avaliar impacto do dispositivo.");
      }
    }, DEBOUNCE_PREVIEW_DISP_MS);
  }

  function cancelarPreviewAgendado() {
    if (previewTimer != null) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (desvioTimer != null) {
      clearTimeout(desvioTimer);
      desvioTimer = null;
    }
  }

  function agendarDesvioRecomendado(trechoId, geracaoPreview) {
    if (desvioTimer != null) clearTimeout(desvioTimer);
    const geracao = ++desvioGeracao;
    desvioTimer = setTimeout(() => {
      desvioTimer = null;
      if (geracao !== desvioGeracao || geracaoPreview !== previewGeracao) return;
      if (controle.selecionado !== trechoId) return;
      try {
        const resultado = controle.recomendarDesvioBloqueio(trechoId);
        if (geracao !== desvioGeracao || controle.selecionado !== trechoId) return;
        if (!resultado) {
          ultimaRecomendacao = null;
          preview.limparRecomendacao();
          return;
        }
        ultimaRecomendacao = resultado.recomendacao
          ? {
              ...resultado.recomendacao,
              nomeMitigacao: resultado.nomeMitigacao,
            }
          : null;
        preview.mostrarRecomendacao(resultado);
      } catch (err) {
        if (geracao !== desvioGeracao) return;
        ultimaRecomendacao = null;
        preview.mostrarRecomendacao({
          ok: false,
          motivo: err?.message || "Falha ao buscar desvio recomendado.",
        });
      }
    }, DEBOUNCE_DESVIO_MS);
  }

  function testarDesvioRecomendado(recomendacao) {
    const id = controle.selecionado;
    if (!id || !recomendacao?.mudanca) return;

    // Destaca a via sugerida no mapa e prévia o bloqueio + inversão.
    destacados = [id, recomendacao.trechoId];
    camadaVias.focar([recomendacao.trechoId]);
    redesenhar();

    try {
      const opcoesPreview = preview.obterOpcoes?.() ?? {};
      const combinado = controle.avaliarImpactoBloqueioComMitigacao(
        id,
        recomendacao.mudanca,
        opcoesPreview
      );

      if (!combinado?.ok) {
        mensagem(combinado?.motivo || "Não foi possível testar a mitigação.", "erro");
        return;
      }
      preview.renderizar(combinado);
      if (ultimaRecomendacao) {
        preview.mostrarRecomendacao({
          ok: true,
          recomendacao: ultimaRecomendacao,
          nomeMitigacao: ultimaRecomendacao.nomeMitigacao,
        });
      }

      const chaveMitigacao = `${recomendacao.mudanca.tipo}:${recomendacao.trechoId}`;
      if (mitigacaoTestadaId === chaveMitigacao) {
        mensagem(
          `Prévia atualizada com o desvio em ${recomendacao.nomeMitigacao ?? recomendacao.trechoId}.`,
          "sucesso"
        );
        return;
      }

      const aplicado = controle.aplicarMitigacao(recomendacao.mudanca);
      if (aplicado.ok) {
        mitigacaoTestadaId = chaveMitigacao;
        registrarMudancaNoAtivo(recomendacao.mudanca, ctxCenario());
        barraCenario?.notificarMudanca();
        mensagem(
          `Mitigação testada: sentido invertido em ${recomendacao.nomeMitigacao ?? recomendacao.trechoId}. O bloqueio ainda não foi aplicado.`,
          "sucesso"
        );
        redesenhar();
      } else {
        mensagem(
          `Prévia do desvio atualizada. ${aplicado.motivo || "Inversão não aplicada na malha."}`,
          "sucesso"
        );
      }
    } catch (err) {
      mensagem(err?.message || "Falha ao testar o desvio recomendado.", "erro");
    }
  }

  function cancelarCustoAgendado() {
    if (custoTimer != null) {
      clearTimeout(custoTimer);
      custoTimer = null;
    }
  }

  function mapaImpactos(resultado) {
    /** @type {Record<string, object>} */
    const mapa = {};
    for (const item of resultado?.itens ?? []) {
      if (item?.trechoId && item.impacto) mapa[item.trechoId] = item.impacto;
    }
    return mapa;
  }

  function chaveCustoUi(bloqueios) {
    return bloqueios
      .map((b) => b.id)
      .slice()
      .sort()
      .join("|");
  }

  /** Só recalcula quando o conjunto de bloqueios muda (debounce + cache no adaptador). */
  function sincronizarCustoBloqueios() {
    const bloqueios = controle.bloqueios();
    const chave = chaveCustoUi(bloqueios);
    if (chave === ultimaChaveCustoUi) return;
    ultimaChaveCustoUi = chave;
    atualizarCustoBloqueios();
  }

  function atualizarCustoBloqueios() {
    cancelarCustoAgendado();
    const bloqueios = controle.bloqueios();
    const geracao = ++custoGeracao;
    if (bloqueios.length === 0) {
      impactoPorId = {};
      custoCarregando = false;
      painelCusto.limpar();
      return;
    }

    custoCarregando = true;
    painelCusto.mostrarCarregando(bloqueios.length);
    // Re-pinta a lista com “Calculando…” sem apagar impactos já conhecidos.
    renderizarBloqueios(
      $("listaBloqueios"),
      $("contadorBloqueios"),
      $("btnRemoverTodos"),
      $("semBloqueios"),
      bloqueios,
      {
        localizar(id) {
          controle.selecionar(id);
          camadaVias.focar([id]);
        },
        remover: removerBloqueio,
      },
      { impactoPorId, carregandoImpacto: true }
    );

    custoTimer = setTimeout(() => {
      custoTimer = null;
      if (geracao !== custoGeracao) return;
      try {
        const resultado = controle.avaliarCustoAcumuladoBloqueios();
        if (geracao !== custoGeracao) return;
        if (!resultado?.ok) {
          impactoPorId = {};
          custoCarregando = false;
          painelCusto.mostrarErro(resultado?.motivo);
          return;
        }
        impactoPorId = mapaImpactos(resultado);
        custoCarregando = false;
        painelCusto.renderizar(resultado);
        renderizarBloqueios(
          $("listaBloqueios"),
          $("contadorBloqueios"),
          $("btnRemoverTodos"),
          $("semBloqueios"),
          controle.bloqueios(),
          {
            localizar(id) {
              controle.selecionar(id);
              camadaVias.focar([id]);
            },
            remover: removerBloqueio,
          },
          { impactoPorId, carregandoImpacto: false }
        );
      } catch (err) {
        if (geracao !== custoGeracao) return;
        impactoPorId = {};
        custoCarregando = false;
        painelCusto.mostrarErro(err?.message || "Falha ao avaliar o custo acumulado.");
      }
    }, DEBOUNCE_CUSTO_MS);
  }

  function limparDestaquePresos() {
    camadaVeiculos.destacar([]);
  }

  function destacarPresosNoMapa(ids) {
    const lista = Array.isArray(ids) ? ids : [];
    camadaVeiculos.destacar(lista);
    if (!lista.length) return;
    const alvos = new Set(lista);
    const pontos = controle.veiculos().filter((v) => alvos.has(v.id));
    if (!pontos.length) return;
    const limites = L.latLngBounds(pontos.map((v) => [v.lat, v.lon]));
    if (limites.isValid()) {
      mapa.flyToBounds(limites, { maxZoom: 18, padding: [48, 48], duration: 0.5 });
    }
  }

  function atualizarPreviewBloqueio() {
    cancelarPreviewAgendado();
    ultimaRecomendacao = null;
    mitigacaoTestadaId = null;
    const id = controle.selecionado;
    const geracao = ++previewGeracao;
    desvioGeracao += 1;
    if (!id) {
      preview.limpar();
      return;
    }
    const trecho = controle.trecho(id);
    if (trecho?.bloqueado) {
      preview.mostrarErro("Este trecho já está bloqueado.");
      return;
    }
    preview.mostrarCarregando();
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (geracao !== previewGeracao || controle.selecionado !== id) return;
      try {
        const opcoesPreview = preview.obterOpcoes?.() ?? {};
        const resultado = controle.avaliarImpactoBloqueio(id, opcoesPreview);
        if (geracao !== previewGeracao || controle.selecionado !== id) return;
        if (!resultado) {
          preview.limpar();
          return;
        }
        if (!resultado.ok) {
          preview.mostrarErro(resultado.motivo);
          return;
        }
        preview.renderizar(resultado);
        agendarDesvioRecomendado(id, geracao);
      } catch (err) {
        if (geracao !== previewGeracao) return;
        preview.mostrarErro(err?.message || "Falha ao avaliar impacto.");
      }
    }, DEBOUNCE_PREVIEW_MS);
  }

  function atualizarInfo() {
    const trecho = controle.selecionado ? controle.trecho(controle.selecionado) : null;
    renderizarInfoTrecho($("infoTrecho"), trecho);
    $("btnBloquear").disabled = !trecho || trecho.bloqueado;
    $("btnDesbloquear").disabled = !trecho || !trecho.bloqueado;
  }

  function redesenhar() {
    const bloqueios = controle.bloqueios();
    const dispositivos = controle.dispositivos();
    atualizarMetricasDispositivos();

    camadaVias.atualizar({ selecionados: destacados, bloqueados: bloqueios });
    camadaDispositivos.atualizar(dispositivos, metricasPorId);
    atualizarInfo();

    renderizarBloqueios(
      $("listaBloqueios"),
      $("contadorBloqueios"),
      $("btnRemoverTodos"),
      $("semBloqueios"),
      bloqueios,
      {
        localizar(id) {
          controle.selecionar(id);
          camadaVias.focar([id]);
        },
        remover: removerBloqueio,
      },
      { impactoPorId, carregandoImpacto: custoCarregando }
    );

    renderizarDispositivos(
      $("listaDispositivos"),
      $("contadorDispositivos"),
      $("contadorLombadas"),
      $("contadorSemaforos"),
      $("btnRemoverTodosDispositivos"),
      $("semDispositivos"),
      dispositivos,
      {
        localizar(id) {
          camadaDispositivos.focar(id);
        },
        remover: removerDispositivo,
      },
      { metricasPorId, focadoId: controle.dispositivoFocado }
    );

    sincronizarCustoBloqueios();
  }

  function removerBloqueio(id) {
    const r = controle.removerBloqueio(id);
    if (r.removido) {
      desfazerMudancaNoAtivo({ tipo: "bloquear", trechoId: id });
      barraCenario?.notificarMudanca();
      mensagem(`Bloqueio removido. ${plural(r.rotasRecalculadas, "veículo redirecionado", "veículos redirecionados")}.`, "sucesso");
    }
    seletor.sincronizar(controle.selecionado);
    redesenhar();
    atualizarPreviewBloqueio();
  }

  function removerDispositivo(id) {
    const d = controle.dispositivo(id);
    const r = controle.removerDispositivo(id);
    if (r.removido) {
      if (d?.tipo === "lombada" || d?.tipo === "semaforo") {
        if (d.id) desfazerMudancaNoAtivo({ tipo: d.tipo, id: d.id });
        else if (d.trechoId) desfazerMudancaNoAtivo({ tipo: d.tipo, trechoId: d.trechoId });
      }
      barraCenario?.notificarMudanca();
      const nome = d?.tipo === "lombada" ? "Lombada" : "Semáforo";
      mensagem(`${nome} removido(a) com sucesso da via.`, "sucesso");
      if (controle.dispositivoFocado === id) {
        controle.focarDispositivo(null);
        previewDisp.limpar();
      }
    }
    redesenhar();
  }

  function restaurarDispositivo(snapshot) {
    const [lat, lon] = snapshot.coordenadas ?? [];
    if (lat == null || lon == null) return;
    if (snapshot.tipo === "lombada") {
      controle.adicionarLombada({
        lat,
        lon,
        trechoId: snapshot.trechoId,
        velocidadeMaxKmh: snapshot.velocidadeMaxKmh,
        raioEfeito: snapshot.raioEfeito,
      });
      return;
    }
    if (snapshot.tipo === "semaforo") {
      controle.adicionarSemaforo({
        lat,
        lon,
        trechoId: snapshot.trechoId,
        tempos: snapshot.tempos,
        estadoInicial: snapshot.estado,
        sentido: snapshot.sentido,
      });
    }
  }

  function aoClicarMapa(e) {
    if (modoFerramenta !== "navegar") {
      processarInsercao(e.latlng);
      return;
    }

    controle.selecionar(null);
    destacados = [];
    seletor.sincronizar(null);
    redesenhar();
  }
  mapa.on("click", aoClicarMapa);

  $("btnModoNavegar").addEventListener("click", () => definirModo("navegar"), { signal });
  $("btnModoLombada").addEventListener("click", () => definirModo("lombada"), { signal });
  $("btnModoSemaforo").addEventListener("click", () => definirModo("semaforo"), { signal });
  $("btnModoLigacao")?.addEventListener("click", () => definirModo("ligacao"), { signal });
  $("btnOndeConstruir")?.addEventListener(
    "click",
    () => {
      $("secao-onde-construir")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      buscarOndeConstruir();
    },
    { signal }
  );
  $("btnCancelarFerramenta").addEventListener("click", () => definirModo("navegar"), { signal });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modoFerramenta !== "navegar") {
        definirModo("navegar");
      } else if (controle.selecionado) {
        mapa.fire("click");
      }
    }
  }, { signal });

  controle.on("selecaoAlterada", (id) => {
    if (id) {
      destacados = [id];
      seletor.sincronizar(id);
    }
    limparDestaquePresos();
    mensagem("");
    redesenhar();
    atualizarPreviewBloqueio();
  });

  controle.on("faseSemafóricaAlterada", () => {
    camadaDispositivos.atualizar(controle.dispositivos());
  }, { signal });

  $("btnBloquear").addEventListener("click", () => {
    const id = controle.selecionado;
    const r = controle.solicitarBloqueio(id);
    if (!r.permitido) {
      mensagem(r.motivo, "erro");
      destacarPresosNoMapa(r.veiculosPresos);
      return;
    }
    limparDestaquePresos();
    registrarMudancaNoAtivo({ tipo: "bloquear", trechoId: id }, ctxCenario());
    barraCenario?.notificarMudanca();
    mensagem(
      `Bloqueio aplicado. ${plural(r.rotasRecalculadas, "veículo foi redirecionado", "veículos foram redirecionados")}.`,
      "sucesso"
    );
    seletor.sincronizar(id);
    redesenhar();
    atualizarPreviewBloqueio();
  }, { signal });

  $("btnDesbloquear").addEventListener("click", () => {
    limparDestaquePresos();
    removerBloqueio(controle.selecionado);
    atualizarPreviewBloqueio();
  }, { signal });

  $("btnRemoverTodos").addEventListener("click", async () => {
    const bloqueios = controle.bloqueios();
    if (bloqueios.length === 0) return;

    const ok = await confirmar({
      titulo: "Remover todos os bloqueios?",
      mensagem: `Isso remove ${bloqueios.length} bloqueio(s) desta sessão.`,
      confirmarTexto: "Remover todos",
      cancelarTexto: "Cancelar",
      perigo: true,
    });
    if (!ok) return;

    const ids = bloqueios.map((b) => b.id);
    for (const id of ids) {
      controle.removerBloqueio(id);
      desfazerMudancaNoAtivo({ tipo: "bloquear", trechoId: id });
    }
    barraCenario?.notificarMudanca();
    mensagem("Todos os bloqueios foram removidos.", "sucesso");
    seletor.sincronizar(controle.selecionado);
    redesenhar();

    oferecerDesfazer({
      mensagem: `${ids.length} bloqueio(s) removido(s).`,
      aoDesfazer: () => {
        for (const id of ids) {
          controle.solicitarBloqueio(id);
          registrarMudancaNoAtivo({ tipo: "bloquear", trechoId: id }, ctxCenario());
        }
        barraCenario?.notificarMudanca();
        seletor.sincronizar(controle.selecionado);
        redesenhar();
        atualizarPreviewBloqueio();
        mensagem("Bloqueios restaurados.", "sucesso");
      },
    });
  }, { signal });

  $("btnRemoverTodosDispositivos").addEventListener("click", async () => {
    const dispositivos = controle.dispositivos();
    if (dispositivos.length === 0) return;

    const ok = await confirmar({
      titulo: "Remover todos os dispositivos?",
      mensagem: `Isso remove ${dispositivos.length} dispositivo(s) de tráfego desta sessão.`,
      confirmarTexto: "Remover todos",
      cancelarTexto: "Cancelar",
      perigo: true,
    });
    if (!ok) return;

    const snapshot = dispositivos.map((d) => ({ ...d }));
    const r = controle.removerTodosDispositivos();
    for (const d of snapshot) {
      if (d.tipo === "lombada" || d.tipo === "semaforo") {
        if (d.id) desfazerMudancaNoAtivo({ tipo: d.tipo, id: d.id });
        else if (d.trechoId) desfazerMudancaNoAtivo({ tipo: d.tipo, trechoId: d.trechoId });
      }
    }
    barraCenario?.notificarMudanca();
    controle.focarDispositivo(null);
    previewDisp.limpar();
    mensagem(`Todos os ${r.removidos} dispositivos de tráfego foram removidos.`, "sucesso");
    redesenhar();

    oferecerDesfazer({
      mensagem: `${snapshot.length} dispositivo(s) removido(s).`,
      aoDesfazer: () => {
        for (const item of snapshot) {
          restaurarDispositivo(item);
          if (item.tipo === "lombada") {
            registrarMudancaNoAtivo(
              {
                tipo: "lombada",
                trechoId: item.trechoId,
                distancia: item.distancia,
                fracao: item.fracao,
                coordenadas: item.coordenadas,
                velocidadeMaxKmh: item.velocidadeMaxKmh,
                raioEfeito: item.raioEfeito,
                id: item.id,
              },
              ctxCenario()
            );
          } else if (item.tipo === "semaforo") {
            registrarMudancaNoAtivo(
              {
                tipo: "semaforo",
                trechoId: item.trechoId,
                distancia: item.distancia,
                fracao: item.fracao,
                coordenadas: item.coordenadas,
                tempos: item.tempos,
                estadoInicial: item.estado,
                sentido: item.sentido,
                id: item.id,
              },
              ctxCenario()
            );
          }
        }
        barraCenario?.notificarMudanca();
        redesenhar();
        mensagem("Dispositivos restaurados.", "sucesso");
      },
    });
  }, { signal });

  $("selQuantidade").addEventListener("change", (e) => controle.definirQuantidadeVeiculos(Number(e.target.value)), { signal });
  $("selVelocidade").addEventListener("change", (e) => controle.definirFatorTempo(Number(e.target.value)), { signal });

  redesenhar();
  if (!primeiraVez) mensagem(`Simulação reiniciada em ${local.nome}.`, "sucesso");
  const loop = criarLoopAnimacaoVeiculos({
    controle,
    camadaVeiculos,
    estaRodando: () => pausa.estaRodando(),
    intervaloAtualizacaoMs: 500,
    aoAtualizar() {
      renderizarEstatisticas(estatisticas, controle.estatisticas());
      atualizarInfo();
      atualizarMetricasDispositivos();
      camadaDispositivos.atualizar(controle.dispositivos(), metricasPorId);
      const ok = atualizarMetricasNaListaDispositivos($("listaDispositivos"), metricasPorId, {
        focadoId: controle.dispositivoFocado,
      });
      if (!ok) redesenharListaDispositivos();
    },
  });

  return {
    totalTrechos: controle.trechos().length,
    get congestionamentoAtivo() {
      return controle.congestionamentoAtivo;
    },
    resumoAlteracoes() {
      const nBloqueios = controle.bloqueios().length;
      const nDispositivos = controle.dispositivos().length;
      if (!nBloqueios && !nDispositivos) return null;
      const partes = [];
      if (nBloqueios) partes.push(nBloqueios === 1 ? "1 bloqueio" : `${nBloqueios} bloqueios`);
      if (nDispositivos) partes.push(nDispositivos === 1 ? "1 dispositivo" : `${nDispositivos} dispositivos`);
      return `Há ${partes.join(" e ")} nesta sessão.`;
    },
    desmontar() {
      loop.parar();
      cancelarPreviewAgendado();
      previewGeracao += 1;
      desvioGeracao += 1;
      ultimaRecomendacao = null;
      mitigacaoTestadaId = null;
      preview.limpar();
      cancelarPreviewDispAgendado();
      previewDispGeracao += 1;
      previewDisp.limpar();
      metricasPorId = {};
      cancelarCustoAgendado();
      custoGeracao += 1;
      impactoPorId = {};
      custoCarregando = false;
      ultimaChaveCustoUi = "";
      painelCusto.limpar();
      limparDestaquePresos();
      eventos.abort();
      mapa.off("click", aoClicarMapa);
      mapa.stop();
      limparRascunhoLigacao();
      mapa.removeLayer(camadaRascunhoLigacao);
      previewLigacao?.limpar();
      controle.encerrar();
      camadaVeiculos.remover();
      camadaVias.remover();
      camadaDispositivos.limpar();
      seletor.limpar();
      mensagem("");
      renderizarInfoTrecho($("infoTrecho"), null);
      $("btnBloquear").disabled = true;
      $("btnDesbloquear").disabled = true;
      renderizarBloqueios($("listaBloqueios"), $("contadorBloqueios"), $("btnRemoverTodos"), $("semBloqueios"), [], {});
      renderizarDispositivos(
        $("listaDispositivos"),
        $("contadorDispositivos"),
        $("contadorLombadas"),
        $("contadorSemaforos"),
        $("btnRemoverTodosDispositivos"),
        $("semDispositivos"),
        [],
        {}
      );
      for (const campo of Object.values(estatisticas)) campo.textContent = "—";
    },
  };
}

function plural(n, singular, varios) {
  return n === 1 ? `1 ${singular}` : `${n} ${varios}`;
}

iniciar();

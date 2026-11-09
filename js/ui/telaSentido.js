// Tela Página 1: simulação de trânsito (com inversão de sentido) sobre o mapa Leaflet de Cajamar.
/* global L */
import { ControleSentido } from "../adaptador/controleSentido.js";
import { criarCamadaVias } from "./camadaVias.js";
import { criarCamadaVeiculos } from "./camadaVeiculos.js";
import { criarCamadaSetas } from "./camadaSetas.js";
import { criarCamadaVariacaoFluxo } from "./camadaVariacaoFluxo.js";
import { criarSeletorVias } from "./seletorVias.js";
import { criarLoopAnimacaoVeiculos } from "./loopAnimacaoVeiculos.js";
import { iniciarSeletorLocal } from "./seletorLocal.js";
import { ligarPausa } from "./pausaSimulacao.js";
import { criarStatusSimulacao } from "./statusSimulacao.js";
import { montarAtalhos } from "./atalhos.js";
import { ligarPainelAbas } from "./painelAbas.js";
import { criarPreviewImpactoSentido } from "./previewImpactoSentido.js";
import {
  criarPainelBaseAtual,
  renderizarRegistroImpacto,
  renderizarOportunidades,
} from "./painelImpactoSentido.js";
import { iniciarBarraCenario } from "./barraCenario.js";
import { construirGrafo } from "../adaptador/carregarMalha.js";
import {
  aplicarCenarioNaSessao,
  desfazerMudancaNoAtivo,
  obterCenarioAtivo,
  registrarMudancaNoAtivo,
} from "../adaptador/cenarios.js";

const DEBOUNCE_BASE_ATUAL_MS = 120;

const DEBOUNCE_PREVIEW_MS = 80;
const ROTULO_SENTIDO = {
  0: "Mão dupla",
  1: "Sentido da geometria (→)",
  [-1]: "Sentido contrário (←)",
};

const CENTRO_CAJAMAR = [-23.355, -46.878];
const $ = (id) => document.getElementById(id);

async function iniciar() {
  const mapa = L.map("mapa", { zoomControl: true }).setView(CENTRO_CAJAMAR, 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  const status = criarStatusSimulacao($("badgeStatus"));
  montarAtalhos($("atalhosSim"), "sentido");
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

  const controle = new ControleSentido(geojson, {
    quantidadeVeiculos: Number($("selQuantidade").value),
    fatorTempo: Number($("selVelocidade").value),
    politicaSentido: $("policy").value,
  });

  if (status) {
    status.definir(pausa.estaRodando() ? "executando" : "pausada", "", {
      bprAtivo: controle.congestionamentoAtivo,
    });
  }

  const grafoBase = construirGrafo(geojson);
  barraCenario?.aoTrocarLocal(local, grafoBase);
  const cenarioAtivo = obterCenarioAtivo();
  if (cenarioAtivo?.regiaoId === local.id && cenarioAtivo.mudancas.length) {
    aplicarCenarioNaSessao(controle, cenarioAtivo, { tiposPermitidos: ["inverter"] });
  }

  let destacados = [];
  const camadaVias = criarCamadaVias(mapa, controle.trechos(), {
    aoClicar: (id) => controle.selecionar(id),
  });
  const camadaSetas = criarCamadaSetas(mapa);
  const camadaVeiculos = criarCamadaVeiculos(mapa);
  const camadaVariacao = criarCamadaVariacaoFluxo(mapa);
  /** Após inverter, mantém a pintura da prévia até mudar a seleção. */
  let variacaoAplicada = null; // { trechoId, segmentos }
  const chkVariacao = $("chk-variacao-fluxo");
  const legendaVariacao = $("legenda-variacao-fluxo");

  function sincronizarToggleVariacao() {
    const tem = camadaVariacao.temDados() || Boolean(variacaoAplicada?.segmentos?.length);
    if (legendaVariacao) legendaVariacao.hidden = !tem;
    if (chkVariacao) {
      chkVariacao.disabled = !tem;
      if (!tem) chkVariacao.checked = true;
    }
  }

  function pintarVariacaoDoDelta(delta) {
    const ok = camadaVariacao.atualizar(delta, controle.trechos());
    if (chkVariacao) camadaVariacao.definirVisivel(chkVariacao.checked);
    sincronizarToggleVariacao();
    return ok;
  }

  function limparVariacaoMapa({ manterAplicada = false } = {}) {
    if (!manterAplicada) variacaoAplicada = null;
    if (manterAplicada && variacaoAplicada?.segmentos?.length) {
      camadaVariacao.restaurar(variacaoAplicada.segmentos);
      if (chkVariacao) camadaVariacao.definirVisivel(chkVariacao.checked);
    } else {
      camadaVariacao.limpar();
    }
    sincronizarToggleVariacao();
  }

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

  const preview = criarPreviewImpactoSentido($("preview-inversao"), {
    nomeDoTrecho(id) {
      return controle.trecho(id)?.nome ?? id;
    },
  });
  const painelBase = criarPainelBaseAtual($("painel-base-atual"));
  let previewTimer = null;
  let previewGeracao = 0;
  let baseAtualTimer = null;
  let baseAtualGeracao = 0;
  let oportunidadesGeracao = 0;

  function cancelarPreviewAgendado() {
    if (previewTimer != null) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
  }

  function cancelarBaseAtualAgendado() {
    if (baseAtualTimer != null) {
      clearTimeout(baseAtualTimer);
      baseAtualTimer = null;
    }
  }

  function atualizarPreviewInversao() {
    cancelarPreviewAgendado();
    const id = controle.selecionado;
    const geracao = ++previewGeracao;
    if (!id) {
      preview.limpar();
      // Sem seleção: mantém mapa se acabou de inverter; senão limpa.
      limparVariacaoMapa({ manterAplicada: Boolean(variacaoAplicada) });
      return;
    }
    preview.mostrarCarregando();
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (geracao !== previewGeracao || controle.selecionado !== id) return;
      try {
        const resultado = controle.avaliarImpactoInversao(id);
        if (geracao !== previewGeracao || controle.selecionado !== id) return;
        if (!resultado) {
          preview.limpar();
          limparVariacaoMapa({
            manterAplicada: variacaoAplicada?.trechoId === id,
          });
          return;
        }
        if (!resultado.ok) {
          preview.mostrarErro(resultado.motivo);
          // Erro de prévia: não apaga variação já aplicada neste trecho.
          if (variacaoAplicada?.trechoId !== id) limparVariacaoMapa();
          else limparVariacaoMapa({ manterAplicada: true });
          return;
        }
        preview.renderizar(resultado, {
          rotuloSentido: (s) => ROTULO_SENTIDO[s] ?? String(s),
        });
        // Após inverter, preserva a pintura da prévia aplicada até trocar de via.
        if (variacaoAplicada?.trechoId === id) {
          limparVariacaoMapa({ manterAplicada: true });
          return;
        }
        variacaoAplicada = null;
        pintarVariacaoDoDelta(resultado.avaliacao.delta);
      } catch (err) {
        if (geracao !== previewGeracao) return;
        preview.mostrarErro(err?.message || "Falha ao avaliar impacto.");
        if (variacaoAplicada?.trechoId !== id) limparVariacaoMapa();
      }
    }, DEBOUNCE_PREVIEW_MS);
  }

  function atualizarBaseAtual() {
    cancelarBaseAtualAgendado();
    const geracao = ++baseAtualGeracao;
    painelBase.mostrarCarregando();
    baseAtualTimer = setTimeout(() => {
      baseAtualTimer = null;
      if (geracao !== baseAtualGeracao) return;
      try {
        const resultado = controle.compararComBase();
        if (geracao !== baseAtualGeracao) return;
        painelBase.renderizar(resultado);
      } catch (err) {
        if (geracao !== baseAtualGeracao) return;
        painelBase.mostrarErro(err?.message || "Falha ao comparar.");
      }
    }, DEBOUNCE_BASE_ATUAL_MS);
  }

  function atualizarOportunidades() {
    const geracao = ++oportunidadesGeracao;
    const vazio = $("oportunidades-vazio");
    if (vazio) {
      vazio.hidden = false;
      vazio.textContent = "Calculando oportunidades…";
    }
    $("lista-oportunidades")?.replaceChildren();
    // defer so UI paints the loading state
    setTimeout(() => {
      if (geracao !== oportunidadesGeracao) return;
      const resultado = controle.oportunidades();
      if (geracao !== oportunidadesGeracao) return;
      renderizarOportunidades($("lista-oportunidades"), vazio, resultado, {
        aoEscolher(trechoId) {
          controle.selecionar(trechoId);
          camadaVias.focar([trechoId]);
          const abaVias = document.getElementById("aba-vias");
          abaVias?.click();
        },
      });
    }, 0);
  }

  function mensagem(texto, tipo) {
    const caixa = $("mensagem");
    caixa.textContent = texto;
    caixa.className = `mensagem ${tipo ?? ""}`;
  }

  function atualizarInfo() {
    const trecho = controle.selecionado ? controle.trecho(controle.selecionado) : null;
    $("sel-empty").hidden = !!trecho;
    $("sel-info").hidden = !trecho;
    $("btn-reverse").disabled = !trecho;
    if (!trecho) return;
    $("sel-name").textContent = trecho.nome;
    $("sel-id").textContent = trecho.referencia?.trim() || "Sem cruzamento cadastrado";
    $("sel-dir").textContent = trecho.sentidoRotulo;
    $("sel-count").textContent = String(trecho.veiculosNoTrecho);
  }

  function atualizarRegistro() {
    renderizarRegistroImpacto($("log"), $("log-vazio"), controle.registro(), {
      aoDesfazer(registroId) {
        const r = controle.desfazerRegistro(registroId);
        if (!r.ok) {
          mensagem(r.motivo, "erro");
          return;
        }
        desfazerMudancaNoAtivo({ tipo: "inverter", trechoId: r.trechoId });
        barraCenario?.notificarMudanca();
        mensagem(
          r.trecho
            ? `Inversão desfeita: ${r.trecho.sentidoRotulo}.`
            : "Inversão desfeita.",
          "sucesso"
        );
        atualizarRegistro();
        redesenhar();
        atualizarPreviewInversao();
        atualizarBaseAtual();
      },
    });
  }

  function atualizarStats() {
    const s = controle.estatisticas();
    $("st-cars").textContent = String(s.ativos);
    $("st-rev").textContent = String(s.inversoes);
    $("st-rer").textContent = String(s.rotasRecalculadas);
    $("st-evac").textContent = String(s.evacuados + s.retornos);
    $("st-desp").textContent = String(s.retidos);
    $("st-conn").textContent = s.malhaConectada
      ? "Rede viária íntegra"
      : `Rede parcial (${s.nosNaMalha}/${s.nosTotal} nós)`;
    $("st-conn").dataset.ok = s.malhaConectada ? "1" : "0";
  }

  function redesenhar() {
    const trechos = controle.trechos();
    camadaVias.atualizar({
      selecionados: destacados,
      bloqueados: [],
      alterados: trechos.filter((t) => t.alterado).map((t) => t.id),
    });
    camadaSetas.atualizar(trechos, { selecionado: controle.selecionado });
    atualizarInfo();
  }

  function inverter() {
    const trechoId = controle.selecionado;
    // Congela a pintura da prévia atual antes de mutar o grafo.
    const segmentosAntes = camadaVariacao.obterSegmentos();
    const r = controle.inverterSelecionado();
    if (!r.ok) {
      mensagem(r.motivo, "erro");
      return;
    }
    if (trechoId && segmentosAntes?.length) {
      variacaoAplicada = { trechoId, segmentos: segmentosAntes };
      camadaVariacao.restaurar(segmentosAntes);
      if (chkVariacao) camadaVariacao.definirVisivel(chkVariacao.checked);
      sincronizarToggleVariacao();
    }
    if (trechoId) {
      registrarMudancaNoAtivo(
        { tipo: "inverter", trechoId },
        { regiaoId: local.id, nomeRegiao: local.nome }
      );
      barraCenario?.notificarMudanca();
    }
    mensagem(`Sentido alterado: ${r.trecho.sentidoRotulo}.`, "sucesso");
    atualizarRegistro();
    redesenhar();
    atualizarPreviewInversao();
    atualizarBaseAtual();
  }

  controle.on("selecaoAlterada", (id) => {
    if (id) {
      destacados = [id];
      seletor.sincronizar(id);
      // Troca de via: solta a pintura fixada de outra inversão.
      if (variacaoAplicada && variacaoAplicada.trechoId !== id) {
        variacaoAplicada = null;
      }
    }
    mensagem("");
    redesenhar();
    atualizarPreviewInversao();
  });

  function aoClicarMapa() {
    controle.selecionar(null);
    destacados = [];
    seletor.sincronizar(null);
    redesenhar();
  }
  mapa.on("click", aoClicarMapa);

  document.addEventListener("keydown", (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      inverter();
    } else if (e.key === "Escape" && controle.selecionado) {
      mapa.fire("click");
    } else if (e.key === " " && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      $("btnPausar").click();
    }
  }, { signal });

  $("btn-reverse").addEventListener("click", inverter, { signal });
  $("btn-clear").addEventListener("click", () => mapa.fire("click"), { signal });
  $("btn-oportunidades")?.addEventListener("click", () => atualizarOportunidades(), { signal });
  chkVariacao?.addEventListener(
    "change",
    () => {
      if (!camadaVariacao.temDados() && variacaoAplicada?.segmentos?.length) {
        camadaVariacao.restaurar(variacaoAplicada.segmentos);
      }
      camadaVariacao.definirVisivel(Boolean(chkVariacao.checked));
    },
    { signal }
  );

  $("selVelocidade").addEventListener("change", (e) => {
    controle.definirFatorTempo(Number(e.target.value));
  }, { signal });
  $("selQuantidade").addEventListener("change", (e) => {
    controle.definirQuantidadeVeiculos(Number(e.target.value));
  }, { signal });
  $("policy").addEventListener("change", () => controle.definirPolitica($("policy").value), { signal });

  // Recalcula Base×Atual / oportunidades ao abrir a aba Indicadores.
  document.getElementById("aba-indicadores")?.addEventListener(
    "click",
    () => {
      atualizarBaseAtual();
      if (($("lista-oportunidades")?.children.length ?? 0) === 0) {
        atualizarOportunidades();
      }
    },
    { signal }
  );

  redesenhar();
  atualizarRegistro();
  atualizarStats();
  atualizarBaseAtual();
  if (!primeiraVez) mensagem(`Simulação reiniciada em ${local.nome}.`, "sucesso");
  const loop = criarLoopAnimacaoVeiculos({
    controle,
    camadaVeiculos,
    estaRodando: () => pausa.estaRodando(),
    aoAtualizar() {
      atualizarStats();
      atualizarInfo();
    },
  });

  return {
    totalTrechos: controle.trechos().length,
    get congestionamentoAtivo() {
      return controle.congestionamentoAtivo;
    },
    resumoAlteracoes() {
      const inversoes = controle.estatisticas().inversoes;
      if (!inversoes) return null;
      return inversoes === 1
        ? "Há 1 inversão de sentido nesta sessão."
        : `Há ${inversoes} inversões de sentido nesta sessão.`;
    },
    desmontar() {
      loop.parar();
      cancelarPreviewAgendado();
      cancelarBaseAtualAgendado();
      previewGeracao += 1;
      baseAtualGeracao += 1;
      oportunidadesGeracao += 1;
      preview.limpar();
      painelBase.limpar();
      eventos.abort();
      mapa.off("click", aoClicarMapa);
      mapa.stop();
      controle.encerrar();
      camadaVeiculos.remover();
      camadaSetas.remover();
      camadaVariacao.remover();
      variacaoAplicada = null;
      sincronizarToggleVariacao();
      camadaVias.remover();
      seletor.limpar();
      mensagem("");
      $("sel-empty").hidden = false;
      $("sel-info").hidden = true;
      $("btn-reverse").disabled = true;
      $("log").replaceChildren();
      $("lista-oportunidades")?.replaceChildren();
      const vazio = $("log-vazio");
      if (vazio) vazio.hidden = false;
      const oppVazio = $("oportunidades-vazio");
      if (oppVazio) oppVazio.hidden = false;
      for (const id of ["st-cars", "st-rev", "st-rer", "st-evac", "st-desp"]) $(id).textContent = "—";
    },
  };
}

iniciar();

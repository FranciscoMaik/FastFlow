// Tela Página 1: simulação de inversão de sentido sobre o mapa Leaflet de Cajamar.
/* global L */
import { ControleSentido } from "../adaptador/controleSentido.js";
import { criarCamadaVias } from "./camadaVias.js";
import { criarCamadaVeiculos } from "./camadaVeiculos.js";
import { criarCamadaSetas } from "./camadaSetas.js";
import { criarSeletorVias } from "./seletorVias.js";
import { criarLoopAnimacaoVeiculos } from "./loopAnimacaoVeiculos.js";
import { iniciarSeletorLocal } from "./seletorLocal.js";
import { ligarPausa } from "./pausaSimulacao.js";

const CENTRO_CAJAMAR = [-23.355, -46.878];
const $ = (id) => document.getElementById(id);

function iniciar() {
  const mapa = L.map("mapa", { zoomControl: true }).setView(CENTRO_CAJAMAR, 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  const pausa = ligarPausa($("btnPausar"));
  let montagemAtual = null;

  iniciarSeletorLocal({
    mapa,
    urlLocais: $("mapa").dataset.locais,
    select: $("selLocal"),
    info: $("infoLocal"),
    carregando: $("carregando"),
    obterResumoAlteracoes: () => montagemAtual?.resumoAlteracoes() ?? null,
    montar: (local, geojson, { primeiraVez }) => {
      montagemAtual = montar(mapa, local, geojson, primeiraVez, pausa);
      return montagemAtual;
    },
  });
}

function montar(mapa, local, geojson, primeiraVez, pausa) {
  const eventos = new AbortController();
  const { signal } = eventos;

  const controle = new ControleSentido(geojson, {
    quantidadeVeiculos: Number($("selQuantidade").value),
    fatorTempo: Number($("selVelocidade").value),
    politicaSentido: $("policy").value,
  });

  let destacados = [];
  const camadaVias = criarCamadaVias(mapa, controle.trechos(), {
    aoClicar: (id) => controle.selecionar(id),
  });
  const camadaSetas = criarCamadaSetas(mapa);
  const camadaVeiculos = criarCamadaVeiculos(mapa);

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
    $("sel-id").textContent = trecho.referencia ?? trecho.id;
    $("sel-dir").textContent = trecho.sentidoRotulo;
    $("sel-count").textContent = String(trecho.veiculosNoTrecho);
  }

  function atualizarRegistro() {
    const ul = $("log");
    ul.replaceChildren(
      ...controle.registro().map((item) => {
        const li = document.createElement("li");
        li.textContent = item.texto;
        return li;
      })
    );
  }

  function atualizarStats() {
    const s = controle.estatisticas();
    $("st-cars").textContent = String(s.ativos);
    $("st-rev").textContent = String(s.inversoes);
    $("st-rer").textContent = String(s.rotasRecalculadas);
    $("st-evac").textContent = String(s.evacuados + s.retornos);
    $("st-desp").textContent = String(s.retidos);
    $("st-conn").textContent = s.malhaConectada
      ? "Malha conectada"
      : `Malha parcial (${s.nosNaMalha}/${s.nosTotal} nós)`;
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
    const r = controle.inverterSelecionado();
    if (!r.ok) {
      mensagem(r.motivo, "erro");
      return;
    }
    mensagem(`Sentido alterado: ${r.trecho.sentidoRotulo}.`, "sucesso");
    atualizarRegistro();
    redesenhar();
  }

  controle.on("selecaoAlterada", (id) => {
    if (id) {
      destacados = [id];
      seletor.sincronizar(id);
    }
    mensagem("");
    redesenhar();
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

  $("selVelocidade").addEventListener("change", (e) => {
    controle.definirFatorTempo(Number(e.target.value));
  }, { signal });
  $("selQuantidade").addEventListener("change", (e) => {
    controle.definirQuantidadeVeiculos(Number(e.target.value));
  }, { signal });
  $("policy").addEventListener("change", () => controle.definirPolitica($("policy").value), { signal });

  redesenhar();
  atualizarRegistro();
  atualizarStats();
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
    resumoAlteracoes() {
      const inversoes = controle.estatisticas().inversoes;
      if (!inversoes) return null;
      return inversoes === 1
        ? "Há 1 inversão de sentido nesta sessão."
        : `Há ${inversoes} inversões de sentido nesta sessão.`;
    },
    desmontar() {
      loop.parar();
      eventos.abort();
      mapa.off("click", aoClicarMapa);
      mapa.stop();
      controle.encerrar();
      camadaVeiculos.remover();
      camadaSetas.remover();
      camadaVias.remover();
      seletor.limpar();
      mensagem("");
      $("sel-empty").hidden = false;
      $("sel-info").hidden = true;
      $("btn-reverse").disabled = true;
      $("log").replaceChildren();
      for (const id of ["st-cars", "st-rev", "st-rer", "st-evac", "st-desp"]) $(id).textContent = "—";
    },
  };
}

iniciar();

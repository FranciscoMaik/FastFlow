// Tela Página 1: simulação de inversão de sentido sobre o mapa Leaflet de Cajamar.
/* global L */
import { carregarControleSentido } from "../adaptador/controleSentido.js";
import { ligarSeletorRegiao } from "../regioes.js";
import { criarCamadaVias } from "./camadaVias.js";
import { criarCamadaVeiculos } from "./camadaVeiculos.js";
import { criarCamadaSetas } from "./camadaSetas.js";
import { criarSeletorVias } from "./seletorVias.js";
import { criarLoopAnimacaoVeiculos } from "./loopAnimacaoVeiculos.js";

const $ = (id) => document.getElementById(id);

async function iniciar() {
  const regiao = ligarSeletorRegiao($("selRegiao"), {
    aoTrocar() {
      location.reload();
    },
  });

  const mapa = L.map("mapa", { zoomControl: true }).setView(regiao.centro, 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  $("carregando").textContent = `Carregando malha viária de ${regiao.nome}…`;

  let controle;
  try {
    controle = await carregarControleSentido(regiao.malha, {
      quantidadeVeiculos: Number($("cars").value),
      fatorTempo: Number($("speed").value),
      politicaSentido: $("policy").value,
    });
  } catch (erro) {
    $("carregando").textContent = `Erro ao carregar a malha viária: ${erro.message}`;
    return;
  }
  $("carregando").hidden = true;

  let destacados = [];
  const camadaVias = criarCamadaVias(mapa, controle.trechos(), {
    aoClicar: (id) => controle.selecionar(id),
  });
  const camadaSetas = criarCamadaSetas(mapa);
  const camadaVeiculos = criarCamadaVeiculos(mapa);
  mapa.fitBounds(regiao.area);

  const seletor = criarSeletorVias(
    { selectLogradouro: $("selLogradouro"), selectTrecho: $("selTrecho") },
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
    }
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

  mapa.on("click", () => {
    controle.selecionar(null);
    destacados = [];
    seletor.sincronizar(null);
    redesenhar();
  });

  document.addEventListener("keydown", (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      inverter();
    } else if (e.key === "Escape" && controle.selecionado) {
      mapa.fire("click");
    } else if (e.key === " " && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      $("btn-play").click();
    }
  });

  $("btn-reverse").addEventListener("click", inverter);
  $("btn-clear").addEventListener("click", () => mapa.fire("click"));

  let rodando = true;
  $("btn-play").addEventListener("click", (e) => {
    rodando = !rodando;
    e.target.textContent = rodando ? "Pausar" : "Retomar";
    e.target.setAttribute("aria-pressed", String(!rodando));
  });

  $("speed").addEventListener("input", () => {
    const v = Number($("speed").value);
    $("speed-out").textContent = `${v}×`;
    controle.definirFatorTempo(v);
  });
  $("cars").addEventListener("input", () => {
    $("cars-out").textContent = $("cars").value;
    controle.definirQuantidadeVeiculos(Number($("cars").value));
  });
  $("policy").addEventListener("change", () => controle.definirPolitica($("policy").value));

  redesenhar();
  atualizarStats();
  criarLoopAnimacaoVeiculos({
    controle,
    camadaVeiculos,
    estaRodando: () => rodando,
    aoAtualizar() {
      atualizarStats();
      atualizarInfo();
    },
  });
}

iniciar();

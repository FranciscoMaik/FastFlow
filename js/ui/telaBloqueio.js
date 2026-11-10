// Ponto de entrada da tela de simulação de bloqueio viário. Liga os componentes
// de interface ao ControleBloqueio (adaptador); não acessa o motor diretamente.
/* global L */
import { carregarControle } from "../adaptador/controleBloqueio.js";
import { criarCamadaVias } from "./camadaVias.js";
import { criarCamadaVeiculos } from "./camadaVeiculos.js";
import { criarSeletorVias } from "./seletorVias.js";
import { renderizarBloqueios, renderizarEstatisticas, renderizarInfoTrecho } from "./painelBloqueios.js";
import { criarLoopAnimacaoVeiculos } from "./loopAnimacaoVeiculos.js";

const CENTRO_CAJAMAR = [-23.355, -46.878];
// Mesma área usada na consulta de scripts/gerar-malha.mjs (algumas vias seguem além dela).
const AREA_SIMULADA = [[-23.365, -46.89], [-23.345, -46.866]];
const $ = (id) => document.getElementById(id);

async function iniciar() {
  const mapa = L.map("mapa", { zoomControl: true }).setView(CENTRO_CAJAMAR, 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  let controle;
  try {
    controle = await carregarControle($("mapa").dataset.malha, {
      quantidadeVeiculos: Number($("selQuantidade").value),
      fatorTempo: Number($("selVelocidade").value),
    });
  } catch (erro) {
    $("carregando").textContent = `Erro ao carregar a malha viária: ${erro.message}`;
    return;
  }
  $("carregando").hidden = true;

  // ---------- Componentes ----------
  let destacados = [];

  const camadaVias = criarCamadaVias(mapa, controle.trechos(), {
    aoClicar: (id) => controle.selecionar(id),
  });
  mapa.fitBounds(AREA_SIMULADA);

  const camadaVeiculos = criarCamadaVeiculos(mapa);

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

  const estatisticas = {
    ativos: $("estAtivos"),
    desviados: $("estDesviados"),
    retidos: $("estRetidos"),
    recalculos: $("estRecalculos"),
    viagens: $("estViagens"),
    tempoMedio: $("estTempoMedio"),
  };

  // ---------- Mensagens ----------
  function mensagem(texto, tipo) {
    const caixa = $("mensagem");
    caixa.textContent = texto;
    caixa.className = `mensagem ${tipo ?? ""}`;
  }

  // ---------- Renderização ----------
  function atualizarInfo() {
    const trecho = controle.selecionado ? controle.trecho(controle.selecionado) : null;
    renderizarInfoTrecho($("infoTrecho"), trecho);
    $("btnBloquear").disabled = !trecho || trecho.bloqueado || !trecho.bloqueavel;
    $("btnDesbloquear").disabled = !trecho || !trecho.bloqueado;
  }

  function redesenhar() {
    const bloqueios = controle.bloqueios();
    camadaVias.atualizar({ selecionados: destacados, bloqueados: bloqueios });
    atualizarInfo();
    renderizarBloqueios($("listaBloqueios"), $("contadorBloqueios"), $("btnRemoverTodos"), $("semBloqueios"), bloqueios, {
      localizar(id) {
        controle.selecionar(id);
        camadaVias.focar([id]);
      },
      remover: removerBloqueio,
    });
  }

  function removerBloqueio(id) {
    const r = controle.removerBloqueio(id);
    if (r.removido) {
      mensagem(`Bloqueio removido. ${plural(r.rotasRecalculadas, "rota recalculada", "rotas recalculadas")}.`, "sucesso");
    }
    seletor.sincronizar(controle.selecionado);
    redesenhar();
  }

  // ---------- Eventos ----------
  controle.on("selecaoAlterada", (id) => {
    if (id) {
      destacados = [id];
      seletor.sincronizar(id);
    }
    const trecho = id ? controle.trecho(id) : null;
    mensagem(
      trecho && !trecho.bloqueavel && !trecho.bloqueado
        ? `Interdição indisponível: ${trecho.motivoBloqueio}`
        : "",
      trecho && !trecho.bloqueavel && !trecho.bloqueado ? "erro" : ""
    );
    redesenhar();
  });

  controle.on("eligibilidadeAlterada", () => {
    const trechos = controle.trechos();
    camadaVias.atualizarDados(trechos);
    seletor.atualizarLogradouros(controle.logradouros());
    seletor.sincronizar(controle.selecionado);
    redesenhar();
  });

  mapa.on("click", () => {
    controle.selecionar(null);
    destacados = [];
    seletor.sincronizar(null);
    redesenhar();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && controle.selecionado) mapa.fire("click");
  });

  $("btnBloquear").addEventListener("click", () => {
    const id = controle.selecionado;
    const r = controle.solicitarBloqueio(id);
    if (!r.permitido) {
      mensagem(r.motivo, "erro");
      return;
    }
    mensagem(
      `Bloqueio aplicado. ${plural(r.rotasRecalculadas, "veículo teve a rota recalculada", "veículos tiveram a rota recalculada")}.`,
      "sucesso"
    );
    seletor.sincronizar(id);
    redesenhar();
  });

  $("btnDesbloquear").addEventListener("click", () => removerBloqueio(controle.selecionado));

  $("btnRemoverTodos").addEventListener("click", () => {
    for (const b of controle.bloqueios()) controle.removerBloqueio(b.id);
    mensagem("Todos os bloqueios foram removidos.", "sucesso");
    seletor.sincronizar(controle.selecionado);
    redesenhar();
  });

  $("selQuantidade").addEventListener("change", (e) => controle.definirQuantidadeVeiculos(Number(e.target.value)));
  $("selVelocidade").addEventListener("change", (e) => controle.definirFatorTempo(Number(e.target.value)));

  let rodando = true;
  $("btnPausar").addEventListener("click", (e) => {
    rodando = !rodando;
    e.target.textContent = rodando ? "Pausar" : "Continuar";
    e.target.setAttribute("aria-pressed", String(!rodando));
  });

  // ---------- Laço da simulação ----------
  redesenhar();
  criarLoopAnimacaoVeiculos({
    controle,
    camadaVeiculos,
    estaRodando: () => rodando,
    intervaloAtualizacaoMs: 500,
    aoAtualizar() {
      renderizarEstatisticas(estatisticas, controle.estatisticas());
      atualizarInfo();
    },
  });
}

function plural(n, singular, varios) {
  return n === 1 ? `1 ${singular}` : `${n} ${varios}`;
}

iniciar();

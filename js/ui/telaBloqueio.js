// Ponto de entrada da tela de simulação de bloqueio viário. Liga os componentes
// de interface ao ControleBloqueio (adaptador); não acessa o motor diretamente.
/* global L */
import { ControleBloqueio } from "../adaptador/controleBloqueio.js";
import { criarCamadaVias } from "./camadaVias.js";
import { criarCamadaVeiculos } from "./camadaVeiculos.js";
import { criarSeletorVias } from "./seletorVias.js";
import { renderizarBloqueios, renderizarEstatisticas, renderizarInfoTrecho } from "./painelBloqueios.js";
import { criarLoopAnimacaoVeiculos } from "./loopAnimacaoVeiculos.js";
import { iniciarSeletorLocal } from "./seletorLocal.js";

const CENTRO_CAJAMAR = [-23.355, -46.878];
const $ = (id) => document.getElementById(id);

// Vale para todos os locais: a pausa continua como o operador deixou.
let rodando = true;

function iniciar() {
  const mapa = L.map("mapa", { zoomControl: true }).setView(CENTRO_CAJAMAR, 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  $("btnPausar").addEventListener("click", (e) => {
    rodando = !rodando;
    e.target.textContent = rodando ? "Pausar" : "Continuar";
    e.target.setAttribute("aria-pressed", String(!rodando));
  });

  iniciarSeletorLocal({
    mapa,
    urlLocais: $("mapa").dataset.locais,
    select: $("selLocal"),
    info: $("infoLocal"),
    carregando: $("carregando"),
    montar: (local, geojson, { primeiraVez }) => montar(mapa, local, geojson, primeiraVez),
  });
}

// Monta a simulação de um local e devolve como desmontá-la por completo.
function montar(mapa, local, geojson, primeiraVez) {
  const eventos = new AbortController();
  const { signal } = eventos;

  const controle = new ControleBloqueio(geojson, {
    quantidadeVeiculos: Number($("selQuantidade").value),
    fatorTempo: Number($("selVelocidade").value),
  });

  // ---------- Componentes ----------
  let destacados = [];

  const camadaVias = criarCamadaVias(mapa, controle.trechos(), {
    aoClicar: (id) => controle.selecionar(id),
  });

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
    $("btnBloquear").disabled = !trecho || trecho.bloqueado;
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
    if (e.key === "Escape" && controle.selecionado) mapa.fire("click");
  }, { signal });

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
  }, { signal });

  $("btnDesbloquear").addEventListener("click", () => removerBloqueio(controle.selecionado), { signal });

  $("btnRemoverTodos").addEventListener("click", () => {
    for (const b of controle.bloqueios()) controle.removerBloqueio(b.id);
    mensagem("Todos os bloqueios foram removidos.", "sucesso");
    seletor.sincronizar(controle.selecionado);
    redesenhar();
  }, { signal });

  $("selQuantidade").addEventListener("change", (e) => controle.definirQuantidadeVeiculos(Number(e.target.value)), { signal });
  $("selVelocidade").addEventListener("change", (e) => controle.definirFatorTempo(Number(e.target.value)), { signal });

  // ---------- Laço da simulação ----------
  redesenhar();
  if (!primeiraVez) mensagem(`Simulação reiniciada em ${local.nome}.`, "sucesso");
  const loop = criarLoopAnimacaoVeiculos({
    controle,
    camadaVeiculos,
    estaRodando: () => rodando,
    intervaloAtualizacaoMs: 500,
    aoAtualizar() {
      renderizarEstatisticas(estatisticas, controle.estatisticas());
      atualizarInfo();
    },
  });

  return {
    totalTrechos: controle.trechos().length,
    // Teardown: nada do local anterior pode continuar rodando ou ouvindo eventos.
    desmontar() {
      loop.parar();
      eventos.abort();
      mapa.off("click", aoClicarMapa);
      mapa.stop(); // interrompe um "voo" de câmera em andamento
      controle.encerrar();
      camadaVeiculos.remover();
      camadaVias.remover();
      seletor.limpar();
      mensagem("");
      renderizarInfoTrecho($("infoTrecho"), null);
      $("btnBloquear").disabled = true;
      $("btnDesbloquear").disabled = true;
      renderizarBloqueios($("listaBloqueios"), $("contadorBloqueios"), $("btnRemoverTodos"), $("semBloqueios"), [], {});
      for (const campo of Object.values(estatisticas)) campo.textContent = "—";
    },
  };
}

function plural(n, singular, varios) {
  return n === 1 ? `1 ${singular}` : `${n} ${varios}`;
}

iniciar();

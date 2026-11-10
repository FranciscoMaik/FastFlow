// Drawer lateral de resultados da simulação (telemetria executiva).
// Consome snapshots do motor/metricasSimulacao — sem lógica estocástica aqui.

const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function el(tag, propriedades = {}, ...filhos) {
  const elemento = Object.assign(document.createElement(tag), propriedades);
  elemento.append(...filhos);
  return elemento;
}

function formatarMinutos(valor) {
  if (valor == null || !Number.isFinite(valor)) return "—";
  const arred = Math.round(valor * 10) / 10;
  return `${arred.toLocaleString("pt-BR", { minimumFractionDigits: arred % 1 ? 1 : 0, maximumFractionDigits: 1 })} min`;
}

function formatarDelta(valor, { sufixo = "", inverter = false } = {}) {
  if (valor == null || !Number.isFinite(valor) || valor === 0) {
    return { texto: "0", classe: "neutro" };
  }
  const sinal = valor > 0 ? "+" : "";
  const pior = inverter ? valor < 0 : valor > 0;
  return {
    texto: `${sinal}${valor.toLocaleString("pt-BR")}${sufixo}`,
    classe: pior ? "pior" : "melhor",
  };
}

function cardAnalitico({ titulo, valor, detalhe, destaque = false }) {
  return el(
    "article",
    { className: `card-analitico${destaque ? " destaque" : ""}` },
    el("h3", { className: "card-analitico-titulo", textContent: titulo }),
    el("p", { className: "card-analitico-valor", textContent: valor }),
    detalhe ? el("p", { className: "card-analitico-detalhe", textContent: detalhe }) : ""
  );
}

/**
 * Atualiza os cards agregados no painel Indicadores (preview ao vivo).
 * @param {{ congestao?: HTMLElement, tempo?: HTMLElement, percentual?: HTMLElement }} campos
 * @param {object|null} metricas
 */
export function renderizarIndicadoresAnaliticos(campos, metricas) {
  if (!campos) return;
  if (!metricas) {
    if (campos.congestao) campos.congestao.textContent = "—";
    if (campos.tempo) campos.tempo.textContent = "—";
    if (campos.percentual) campos.percentual.textContent = "";
    return;
  }
  if (campos.congestao) {
    campos.congestao.textContent = `${metricas.viasCongestionadas} / ${metricas.totalVias}`;
  }
  if (campos.percentual) {
    campos.percentual.textContent = `${metricas.percentualCongestionamento}% das vias`;
  }
  if (campos.tempo) {
    campos.tempo.textContent = formatarMinutos(metricas.tempoMedioLocomocaoMinutos);
  }
}

/**
 * Cria o drawer de resultados com histórico e comparação entre rodadas.
 * O host pode ser um elemento existente ou será criado em document.body.
 */
export function criarDrawerResultados({ host = null, titulo = "Relatório da simulação" } = {}) {
  const raiz = host ?? document.createElement("div");
  if (!host) document.body.appendChild(raiz);

  raiz.className = "drawer-resultados-host";
  raiz.innerHTML = `
    <div class="drawer-resultados-fundo" data-acao="fechar" hidden></div>
    <aside class="drawer-resultados" role="dialog" aria-modal="true" aria-labelledby="drawer-resultados-titulo" hidden>
      <header class="drawer-resultados-cabecalho">
        <div>
          <p class="drawer-resultados-eyebrow">Telemetria de fluxo</p>
          <h2 id="drawer-resultados-titulo">${titulo}</h2>
          <p class="drawer-resultados-subtitulo" data-campo="subtitulo"></p>
        </div>
        <button type="button" class="botao botao-secundario botao-pequeno" data-acao="fechar" aria-label="Fechar relatório">Fechar</button>
      </header>
      <div class="drawer-resultados-corpo">
        <section class="drawer-secao" aria-labelledby="h-cards-atuais">
          <h3 id="h-cards-atuais">Desfecho da rodada</h3>
          <div class="cards-analiticos" data-campo="cards"></div>
        </section>
        <section class="drawer-secao" aria-labelledby="h-agregados">
          <h3 id="h-agregados">Indicadores agregados</h3>
          <dl class="estatisticas estatisticas-drawer" data-campo="agregados"></dl>
        </section>
        <section class="drawer-secao" aria-labelledby="h-comparacao" data-bloco="comparacao" hidden>
          <h3 id="h-comparacao">Comparação com a rodada anterior</h3>
          <ul class="lista-comparacao" data-campo="comparacao"></ul>
        </section>
        <section class="drawer-secao" aria-labelledby="h-historico">
          <h3 id="h-historico">Histórico de rodadas</h3>
          <ol class="lista-historico-rodadas" data-campo="historico"></ol>
          <p class="vazio" data-campo="historico-vazio">Nenhuma rodada encerrada ainda.</p>
        </section>
      </div>
    </aside>
  `;

  const fundo = raiz.querySelector(".drawer-resultados-fundo");
  const painel = raiz.querySelector(".drawer-resultados");
  const subtitulo = raiz.querySelector('[data-campo="subtitulo"]');
  const cards = raiz.querySelector('[data-campo="cards"]');
  const agregados = raiz.querySelector('[data-campo="agregados"]');
  const blocoComparacao = raiz.querySelector('[data-bloco="comparacao"]');
  const listaComparacao = raiz.querySelector('[data-campo="comparacao"]');
  const historicoEl = raiz.querySelector('[data-campo="historico"]');
  const historicoVazio = raiz.querySelector('[data-campo="historico-vazio"]');

  let aberto = false;
  let ultimoFoco = null;

  function fechar() {
    if (!aberto) return;
    aberto = false;
    fundo.hidden = true;
    painel.hidden = true;
    fundo.setAttribute("aria-hidden", "true");
    painel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-resultados-aberto");
    const foco = ultimoFoco;
    ultimoFoco = null;
    // Evita reaplicar foco em elemento dentro do drawer (ou removido).
    if (foco && typeof foco.focus === "function" && document.contains(foco) && !painel.contains(foco)) {
      foco.focus();
    }
  }

  function linhaAgregada(rotulo, valor) {
    return el("div", {}, el("dt", { textContent: rotulo }), el("dd", { textContent: valor }));
  }

  function renderizarCards(metricas) {
    cards.replaceChildren(
      cardAnalitico({
        titulo: "Vias com trânsito intenso",
        valor: `${metricas.viasCongestionadas} / ${metricas.totalVias}`,
        detalhe: `${metricas.percentualCongestionamento}% da malha carregada`,
        destaque: true,
      }),
      cardAnalitico({
        titulo: "Tempo médio de locomoção",
        valor: formatarMinutos(metricas.tempoMedioLocomocaoMinutos),
        detalhe: "Estimativa projetada por ciclo (minutos)",
        destaque: true,
      })
    );
  }

  function renderizarAgregados(metricas, modo) {
    const filhos = [
      linhaAgregada("Veículos ativos", String(metricas.ativos)),
      linhaAgregada("Desviados", String(metricas.desviados)),
      linhaAgregada("Retidos", String(metricas.retidos)),
      linhaAgregada("Veículos redirecionados", String(metricas.rotasRecalculadas)),
      linhaAgregada("Viagens concluídas", String(metricas.viagensConcluidas)),
    ];
    if (modo === "sentido") {
      filhos.push(linhaAgregada("Inversões de sentido", String(metricas.inversoes ?? 0)));
    }
    agregados.replaceChildren(...filhos);
  }

  function renderizarComparacao(deltas) {
    if (!deltas) {
      blocoComparacao.hidden = true;
      listaComparacao.replaceChildren();
      return;
    }
    blocoComparacao.hidden = false;
    const itens = [
      { rotulo: "Vias congestionadas", delta: deltas.viasCongestionadas, inverter: true },
      { rotulo: "Congestionamento", delta: deltas.percentualCongestionamento, sufixo: " p.p.", inverter: true },
      { rotulo: "Tempo médio", delta: deltas.tempoMedioLocomocaoMinutos, sufixo: " min", inverter: true },
      { rotulo: "Desviados", delta: deltas.desviados, inverter: true },
      { rotulo: "Retidos", delta: deltas.retidos, inverter: true },
      { rotulo: "Viagens concluídas", delta: deltas.viagensConcluidas, inverter: false },
    ];
    listaComparacao.replaceChildren(
      ...itens.map((item) => {
        const fmt = formatarDelta(item.delta, { sufixo: item.sufixo ?? "", inverter: item.inverter });
        return el(
          "li",
          {},
          el("span", { className: "comp-rotulo", textContent: item.rotulo }),
          el("span", { className: `comp-delta ${fmt.classe}`, textContent: fmt.texto })
        );
      })
    );
  }

  function renderizarHistorico(rodadas) {
    historicoVazio.hidden = rodadas.length > 0;
    historicoEl.replaceChildren(
      ...[...rodadas].reverse().map((rodada) => {
        const m = rodada.metricas;
        const quando = formatoHora.format(rodada.horario instanceof Date ? rodada.horario : new Date(rodada.horario));
        return el(
          "li",
          {},
          el(
            "div",
            { className: "hist-cabecalho" },
            el("strong", { textContent: rodada.rotulo }),
            el("time", { textContent: quando })
          ),
          el(
            "div",
            { className: "hist-detalhe" },
            `${m.viasCongestionadas}/${m.totalVias} congest. · ${formatarMinutos(m.tempoMedioLocomocaoMinutos)}`
          ),
          rodada.local
            ? el("div", { className: "hist-local", textContent: rodada.local })
            : ""
        );
      })
    );
  }

  /**
   * Abre o drawer com a rodada atual e o histórico completo.
   * @param {{ rodada: object, historico: object[], comparacao: object|null, subtitulo?: string, modo?: string }} dados
   */
  function abrir({ rodada, historico = [], comparacao = null, subtitulo: textoSub = "", modo = "bloqueio" } = {}) {
    if (!rodada?.metricas) return;
    ultimoFoco = document.activeElement;
    renderizarCards(rodada.metricas);
    renderizarAgregados(rodada.metricas, modo);
    renderizarComparacao(comparacao);
    renderizarHistorico(historico);
    subtitulo.textContent = textoSub || (rodada.local
      ? `${rodada.local} · ${rodada.rotulo}`
      : rodada.rotulo);

    aberto = true;
    fundo.hidden = false;
    painel.hidden = false;
    fundo.setAttribute("aria-hidden", "false");
    painel.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-resultados-aberto");
    painel.querySelector('[data-acao="fechar"]')?.focus();
  }

  raiz.addEventListener("click", (e) => {
    const alvo = e.target.closest('[data-acao="fechar"]');
    if (!alvo || !raiz.contains(alvo)) return;
    e.preventDefault();
    fechar();
  });

  document.addEventListener("keydown", (e) => {
    if (aberto && e.key === "Escape") {
      e.preventDefault();
      fechar();
    }
  });

  return { abrir, fechar, estaAberto: () => aberto, raiz };
}

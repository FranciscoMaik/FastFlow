// Painel lateral: trecho selecionado, bloqueios, dispositivos e estatísticas.
import { rotulo } from "./camadaVias.js";
import { fmtComparacao, fmtNumero, fmtTempo, fmtInt } from "./previewImpactoFmt.js";
import {
  textoVelocidadeTrecho,
  textoFilaSemaforo,
  textoTransbordo,
  textoFugaDeRota,
} from "./metricasDispositivoFmt.js";

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function el(tag, propriedades = {}, ...filhos) {
  const elemento = Object.assign(document.createElement(tag), propriedades);
  elemento.append(...filhos);
  return elemento;
}

/** Linha compacta de impacto isolado (Fase 2) para um item da lista. */
export function textoImpactoIsolado(impacto, { carregando = false } = {}) {
  if (carregando) return "Calculando impacto…";
  if (!impacto) return null;
  const afet = impacto.viagensAfetadas;
  const tempo = fmtComparacao(
    impacto.base?.tempoMedioViagem,
    impacto.cenario?.tempoMedioViagem,
    impacto.tempoMedioViagem,
    fmtTempo
  );
  const afetTxt =
    afet == null
      ? "—"
      : `${fmtNumero(afet.percentual)}% viagens (${fmtInt(afet.contagem)})`;
  return `Isolado · Δ tempo ${tempo.deltaTxt} · ${afetTxt}`;
}

export function metros(valor) {
  return valor >= 1000 ? `${(valor / 1000).toFixed(2)} km` : `${Math.round(valor)} m`;
}

export function renderizarInfoTrecho(container, trecho) {
  container.hidden = !trecho;
  container.replaceChildren();
  if (!trecho) return;
  container.classList.toggle("bloqueado", trecho.bloqueado);

  const linha = (rotuloCampo, valor, classe = "") =>
    [el("dt", { textContent: rotuloCampo }), el("dd", { textContent: valor, className: classe })];

  container.append(
    el("strong", { textContent: trecho.nome }),
    el("div", { className: "referencia", textContent: trecho.referencia ?? "Sem referência de cruzamento" }),
    el(
      "dl",
      {},
      ...linha("Status", trecho.bloqueado ? "Bloqueado" : "Livre", `status-via${trecho.bloqueado ? " bloqueado" : ""}`),
      ...linha("Extensão", metros(trecho.comprimento)),
      ...linha("Sentido", trecho.sentidoUnico ? "Mão única" : "Mão dupla"),
      ...linha("Veículos agora", String(trecho.veiculosNoTrecho))
    )
  );
}

/**
 * @param {HTMLElement} lista
 * @param {HTMLElement} contador
 * @param {HTMLElement} botaoRemoverTodos
 * @param {HTMLElement} vazio
 * @param {object[]} bloqueios
 * @param {{ localizar: (id: string) => void, remover: (id: string) => void }} acoes
 * @param {{
 *   impactoPorId?: Record<string, object>|Map<string, object>|null,
 *   carregandoImpacto?: boolean,
 * }} [opcoes]
 */
export function renderizarBloqueios(
  lista,
  contador,
  botaoRemoverTodos,
  vazio,
  bloqueios,
  acoes,
  { impactoPorId = null, carregandoImpacto = false } = {}
) {
  contador.textContent = String(bloqueios.length);
  contador.classList.toggle("ativo", bloqueios.length > 0);
  vazio.hidden = bloqueios.length > 0;
  botaoRemoverTodos.hidden = bloqueios.length < 2;

  const lerImpacto = (id) => {
    if (!impactoPorId) return null;
    if (impactoPorId instanceof Map) return impactoPorId.get(id) ?? null;
    return impactoPorId[id] ?? null;
  };

  lista.replaceChildren(
    ...bloqueios.map((b) => {
      const localizar = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Localizar",
      });
      localizar.addEventListener("click", () => acoes.localizar(b.id));
      const remover = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Remover",
      });
      remover.addEventListener("click", () => acoes.remover(b.id));

      const rotas = b.rotasRecalculadas === 1
        ? "1 veículo redirecionado"
        : `${b.rotasRecalculadas} veículos redirecionados`;

      const impactoTxt = textoImpactoIsolado(lerImpacto(b.id), {
        carregando: carregandoImpacto && !lerImpacto(b.id),
      });
      const filhos = [
        el("strong", { textContent: rotulo(b) }),
        el("div", { className: "detalhe", textContent: `Desde ${formatoHora.format(b.horario)} · ${rotas}` }),
      ];
      if (impactoTxt) {
        filhos.push(el("div", { className: "impacto-bloqueio-item", textContent: impactoTxt }));
      }
      filhos.push(el("div", { className: "acoes" }, localizar, remover));
      return el("li", {}, ...filhos);
    })
  );
}

/**
 * @param {HTMLElement} lista
 * @param {HTMLElement} contadorGeral
 * @param {HTMLElement} contadorLombadas
 * @param {HTMLElement} contadorSemaforos
 * @param {HTMLElement} botaoRemoverTodos
 * @param {HTMLElement} vazio
 * @param {object[]} dispositivos
 * @param {{ localizar: (id: string) => void, remover: (id: string) => void }} acoes
 * @param {{
 *   metricasPorId?: Record<string, object>|null,
 *   focadoId?: string|null,
 * }} [opcoes]
 */
export function renderizarDispositivos(
  lista,
  contadorGeral,
  contadorLombadas,
  contadorSemaforos,
  botaoRemoverTodos,
  vazio,
  dispositivos,
  acoes,
  { metricasPorId = null, focadoId = null } = {}
) {
  const lombadas = dispositivos.filter((d) => d.tipo === "lombada");
  const semaforos = dispositivos.filter((d) => d.tipo === "semaforo");

  contadorGeral.textContent = String(dispositivos.length);
  contadorGeral.classList.toggle("ativo", dispositivos.length > 0);
  contadorLombadas.textContent = String(lombadas.length);
  contadorSemaforos.textContent = String(semaforos.length);
  vazio.hidden = dispositivos.length > 0;
  botaoRemoverTodos.hidden = dispositivos.length < 2;

  lista.replaceChildren(
    ...dispositivos.map((d) => {
      const localizar = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Localizar",
      });
      localizar.addEventListener("click", () => acoes.localizar(d.id));

      const remover = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Remover",
      });
      remover.addEventListener("click", () => acoes.remover(d.id));

      const badge = el(
        "span",
        {
          className: `badge-item ${d.tipo === "lombada" ? "badge-lombada" : `badge-semaforo badge-${d.estado}`}`,
        },
        d.tipo === "lombada"
          ? `Lombada (${d.velocidadeMaxKmh ?? 20} km/h)`
          : `Semáforo (${d.estado})`
      );

      const detalhe = d.tipo === "lombada"
        ? `Na via ${d.nomeTrecho} · ${Math.round(d.distancia)} m do início`
        : `Na via ${d.nomeTrecho} · V:${d.tempos.verde}s A:${d.tempos.amarelo}s Vm:${d.tempos.vermelho}s`;

      const met = metricasPorId?.[d.id] ?? null;
      const filhos = [
        el("div", { className: "item-dispositivo-cabecalho" }, badge),
        el("strong", { textContent: d.nomeTrecho }),
        el("div", { className: "detalhe", textContent: detalhe }),
      ];

      if (met?.velocidade) {
        filhos.push(
          el("div", {
            className: "metrica-dispositivo",
            textContent: textoVelocidadeTrecho(met.velocidade),
          })
        );
      }
      if (d.tipo === "semaforo" && met) {
        filhos.push(
          el("div", {
            className: "metrica-dispositivo",
            textContent: textoFilaSemaforo({
              filaAtual: met.fila?.atual,
              filaMax: met.filaMax,
              filaMedia: met.filaMedia,
              esperaMedia: met.esperaMedia,
            }),
          })
        );
        const alerta = textoTransbordo(met.transbordo);
        if (alerta) {
          filhos.push(el("div", { className: "alerta-transbordo", textContent: alerta }));
        }
      }
      if (met?.fuga) {
        filhos.push(
          el("div", {
            className: "metrica-dispositivo metrica-fuga-rota",
            textContent: textoFugaDeRota(met.fuga),
          })
        );
      }

      filhos.push(el("div", { className: "acoes" }, localizar, remover));

      const item = el(
        "li",
        {
          className: [
            "item-dispositivo",
            `item-${d.tipo}`,
            focadoId === d.id ? "focado" : "",
            met?.transbordo ? "com-transbordo" : "",
          ]
            .filter(Boolean)
            .join(" "),
        },
        ...filhos
      );
      item.dataset.id = d.id;
      return item;
    })
  );
}

/**
 * Atualiza só as linhas de métrica/alerta sem recriar a lista (loop de animação).
 * @returns {boolean} false se a lista precisa de re-render completo
 */
export function atualizarMetricasNaListaDispositivos(lista, metricasPorId, { focadoId = null } = {}) {
  if (!lista) return false;
  const itens = [...lista.querySelectorAll(".item-dispositivo[data-id]")];
  if (itens.length === 0) return true;

  for (const li of itens) {
    const id = li.dataset.id;
    const met = metricasPorId?.[id] ?? null;
    li.classList.toggle("focado", focadoId === id);
    li.classList.toggle("com-transbordo", Boolean(met?.transbordo));

    const metricasEls = li.querySelectorAll(".metrica-dispositivo");
    if (met?.velocidade) {
      if (metricasEls[0]) metricasEls[0].textContent = textoVelocidadeTrecho(met.velocidade);
      else return false;
    }
    if (li.classList.contains("item-semaforo")) {
      if (metricasEls[1]) {
        metricasEls[1].textContent = textoFilaSemaforo({
          filaAtual: met?.fila?.atual,
          filaMax: met?.filaMax,
          filaMedia: met?.filaMedia,
          esperaMedia: met?.esperaMedia,
        });
      } else if (met) {
        return false;
      }
      let alertaEl = li.querySelector(".alerta-transbordo");
      const alertaTxt = textoTransbordo(met?.transbordo);
      if (alertaTxt) {
        if (!alertaEl) {
          alertaEl = el("div", { className: "alerta-transbordo", textContent: alertaTxt });
          const acoes = li.querySelector(".acoes");
          if (acoes) li.insertBefore(alertaEl, acoes);
          else li.append(alertaEl);
        } else {
          alertaEl.textContent = alertaTxt;
        }
      } else if (alertaEl) {
        alertaEl.remove();
      }
    }

    let fugaEl = li.querySelector(".metrica-fuga-rota");
    if (met?.fuga) {
      const txt = textoFugaDeRota(met.fuga);
      if (!fugaEl) {
        fugaEl = el("div", { className: "metrica-dispositivo metrica-fuga-rota", textContent: txt });
        const acoes = li.querySelector(".acoes");
        if (acoes) li.insertBefore(fugaEl, acoes);
        else li.append(fugaEl);
      } else {
        fugaEl.textContent = txt;
      }
    } else if (fugaEl) {
      fugaEl.remove();
    }
  }
  return true;
}

export function renderizarEstatisticas(campos, e) {
  campos.ativos.textContent = String(e.ativos);
  campos.desviados.textContent = String(e.desviados);
  campos.retidos.textContent = String(e.retidos);
  campos.recalculos.textContent = String(e.rotasRecalculadas);
  campos.viagens.textContent = String(e.viagensConcluidas);
  campos.tempoMedio.textContent = e.tempoMedioViagem == null ? "—" : `${Math.round(e.tempoMedioViagem)} s`;
}

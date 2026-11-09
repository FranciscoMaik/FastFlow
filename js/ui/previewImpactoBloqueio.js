// Card “Se bloquear…” em Ações de via: formata o resultado de `avaliar` sem tocar no motor.
import { listarPerfisPeriodo } from "../motor/demandaFixa.js";
import {
  texto,
  fmtNumero,
  fmtTempo,
  fmtComparacao,
  fmtInt,
  rodapeAmostra,
} from "./previewImpactoFmt.js";

/**
 * Liga o card de prévia de bloqueio ao DOM.
 * @param {HTMLElement | null} raiz
 * @param {{
 *   nomeDoTrecho?: (id: string) => string,
 *   aoTestarRecomendacao?: (recomendacao: object) => void,
 *   aoMudarOpcoes?: (opcoes: { periodo: string, bprAnalitico: boolean }) => void,
 *   periodoInicial?: string,
 *   bprAnaliticoInicial?: boolean,
 * }} [opcoes]
 */
export function criarPreviewImpactoBloqueio(
  raiz,
  {
    nomeDoTrecho,
    aoTestarRecomendacao,
    aoMudarOpcoes,
    periodoInicial = "pico",
    bprAnaliticoInicial = false,
  } = {}
) {
  if (!raiz) {
    return {
      limpar() {},
      mostrarCarregando() {},
      renderizar() {},
      mostrarErro() {},
      mostrarRecomendacao() {},
      limparRecomendacao() {},
      obterOpcoes() {
        return { periodo: periodoInicial, bprAnalitico: bprAnaliticoInicial };
      },
      definirOpcoes() {},
    };
  }

  const els = {
    titulo: raiz.querySelector("[data-preview='titulo']"),
    afetadas: raiz.querySelector("[data-preview='afetadas']"),
    tempo: raiz.querySelector("[data-preview='tempo']"),
    piorCaso: raiz.querySelector("[data-preview='pior-caso']"),
    desvios: raiz.querySelector("[data-preview='desvios']"),
    desviosLinha: raiz.querySelector("[data-preview='desvios-linha']"),
    rodape: raiz.querySelector("[data-preview='rodape']"),
    alertaAcesso: raiz.querySelector("[data-preview='alerta-acesso']"),
    recomendacao: raiz.querySelector("[data-preview='recomendacao']"),
    recomendacaoTexto: raiz.querySelector("[data-preview='recomendacao-texto']"),
    recomendacaoTestar: raiz.querySelector("[data-preview='recomendacao-testar']"),
    periodo: raiz.querySelector("[data-preview='periodo']"),
    bpr: raiz.querySelector("[data-preview='bpr-analitico']"),
  };

  /** @type {object | null} */
  let recomendacaoAtual = null;
  let modoTeste = false;
  let periodo = periodoInicial;
  let bprAnalitico = Boolean(bprAnaliticoInicial);

  function preencherSeletorPeriodo() {
    if (!els.periodo) return;
    const perfis = listarPerfisPeriodo();
    if (els.periodo.options.length === 0) {
      for (const p of perfis) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.rotulo;
        els.periodo.appendChild(opt);
      }
    }
    els.periodo.value = periodo;
  }

  function sincronizarControles() {
    preencherSeletorPeriodo();
    if (els.bpr) els.bpr.checked = bprAnalitico;
  }

  function emitirOpcoes() {
    aoMudarOpcoes?.({ periodo, bprAnalitico });
  }

  function obterOpcoes() {
    return { periodo, bprAnalitico };
  }

  function definirOpcoes({ periodo: p, bprAnalitico: b } = {}) {
    if (p != null) periodo = p;
    if (b != null) bprAnalitico = Boolean(b);
    sincronizarControles();
  }

  if (els.periodo) {
    els.periodo.addEventListener("change", () => {
      periodo = els.periodo.value || "pico";
      emitirOpcoes();
    });
  }
  if (els.bpr) {
    els.bpr.addEventListener("change", () => {
      bprAnalitico = Boolean(els.bpr.checked);
      emitirOpcoes();
    });
  }
  sincronizarControles();

  function limparRecomendacao() {
    recomendacaoAtual = null;
    modoTeste = false;
    if (els.recomendacao) els.recomendacao.hidden = true;
    if (els.recomendacaoTestar) els.recomendacaoTestar.hidden = true;
    texto(els.recomendacaoTexto, "—");
  }

  function limpar() {
    raiz.hidden = true;
    raiz.dataset.estado = "vazio";
    texto(els.afetadas, "—");
    texto(els.tempo, "—");
    texto(els.piorCaso, "—");
    texto(els.desvios, "—");
    if (els.desviosLinha) els.desviosLinha.hidden = true;
    if (els.alertaAcesso) els.alertaAcesso.hidden = true;
    texto(els.rodape, "");
    limparRecomendacao();
  }

  function mostrarCarregando() {
    raiz.hidden = false;
    raiz.dataset.estado = "carregando";
    texto(els.titulo, "Se bloquear…");
    texto(els.afetadas, "Calculando…");
    texto(els.tempo, "…");
    texto(els.piorCaso, "…");
    texto(els.desvios, "…");
    if (els.desviosLinha) els.desviosLinha.hidden = false;
    if (els.alertaAcesso) els.alertaAcesso.hidden = true;
    texto(els.rodape, "Simulação comparativa…");
    limparRecomendacao();
  }

  function mostrarErro(motivo) {
    raiz.hidden = false;
    raiz.dataset.estado = "erro";
    texto(els.titulo, "Se bloquear…");
    texto(els.afetadas, motivo || "Não foi possível avaliar.");
    texto(els.tempo, "—");
    texto(els.piorCaso, "—");
    texto(els.desvios, "—");
    if (els.desviosLinha) els.desviosLinha.hidden = true;
    if (els.alertaAcesso) els.alertaAcesso.hidden = true;
    texto(els.rodape, "");
    limparRecomendacao();
  }

  function preencherMetricas(resultado, { titulo } = {}) {
    const { avaliacao: r, nome } = resultado;
    const { delta, base, cenario, amostra, extras } = r;

    texto(els.titulo, titulo ?? (nome ? `Se bloquear… · ${nome}` : "Se bloquear…"));

    const afet = delta.viagensAfetadas;
    texto(
      els.afetadas,
      `${fmtNumero(afet.percentual)}% (${fmtInt(afet.contagem)} de ${fmtInt(amostra.tamanho)})`
    );

    const tempo = fmtComparacao(
      base.tempoMedioViagem,
      cenario.tempoMedioViagem,
      delta.tempoMedioViagem,
      fmtTempo
    );
    texto(els.tempo, `${tempo.baseTxt} → ${tempo.cenTxt} · ${tempo.deltaTxt}`);

    const pior = delta.piorCaso;
    if (!pior) {
      texto(els.piorCaso, "Nenhum piora na amostra");
    } else if (pior.retidoNoCenario || !Number.isFinite(pior.deltaTempo)) {
      texto(els.piorCaso, `${pior.origem} → ${pior.destino} · perde rota`);
    } else {
      texto(
        els.piorCaso,
        `${pior.origem} → ${pior.destino} · +${fmtTempo(pior.deltaTempo)}`
      );
    }

    const top = extras?.trechosSobrecarregados ?? [];
    if (els.desviosLinha) {
      els.desviosLinha.hidden = false;
      if (!top.length) {
        texto(els.desvios, "Nenhuma rota de desvio relevante na amostra");
      } else {
        texto(
          els.desvios,
          top
            .map((t) => {
              const rotulo = nomeDoTrecho?.(t.trechoId) ?? t.trechoId;
              const pct =
                t.percentual == null ? "" : ` (+${fmtNumero(t.percentual)}%)`;
              return `${rotulo}: +${fmtInt(t.delta)} fluxo${pct}`;
            })
            .join(" · ")
        );
      }
    }

    const perda = delta.perdaAcesso?.contagem ?? 0;
    if (els.alertaAcesso) {
      els.alertaAcesso.hidden = perda <= 0;
      if (perda > 0) {
        texto(
          els.alertaAcesso,
          perda === 1
            ? "Alerta: 1 nó perde acesso à malha principal."
            : `Alerta: ${fmtInt(perda)} nós perdem acesso à malha principal.`
        );
      }
    }

    const bprNaAvaliacao = Boolean(
      resultado.bprAnalitico || extras?.bprAnalitico?.aplicado
    );
    texto(
      els.rodape,
      rodapeAmostra(amostra.tamanho, {
        bprSimulacao: Boolean(resultado.bprSimulacao),
        bprAnalitico: bprNaAvaliacao,
        periodo: resultado.periodo ?? periodo,
      })
    );
  }

  /**
   * @param {{ ok: true, trechoId: string, nome?: string, avaliacao: object, mitigacao?: object, nomeMitigacao?: string }
   *   | { ok: false, motivo?: string }} resultado
   */
  function renderizar(resultado) {
    if (!resultado?.ok || !resultado.avaliacao) {
      mostrarErro(resultado?.motivo);
      return;
    }

    raiz.hidden = false;
    raiz.dataset.estado = "pronto";
    modoTeste = Boolean(resultado.mitigacao);

    if (resultado.periodo) periodo = resultado.periodo;
    if (resultado.bprAnalitico != null) bprAnalitico = Boolean(resultado.bprAnalitico);
    sincronizarControles();

    const titulo = modoTeste
      ? `Se bloquear + inverter… · ${resultado.nomeMitigacao ?? resultado.mitigacao.trechoId}`
      : resultado.nome
        ? `Se bloquear… · ${resultado.nome}`
        : "Se bloquear…";

    preencherMetricas(resultado, { titulo });
  }

  /**
   * Mostra a sugestão de mitigação (abaixo das métricas do bloqueio).
   * @param {{ ok?: boolean, recomendacao?: object|null, nomeMitigacao?: string, motivo?: string, amostra?: object } | null} resultado
   */
  function mostrarRecomendacao(resultado) {
    if (!els.recomendacao) return;

    if (!resultado?.ok || !resultado.recomendacao) {
      recomendacaoAtual = null;
      els.recomendacao.hidden = false;
      if (els.recomendacaoTestar) els.recomendacaoTestar.hidden = true;
      texto(
        els.recomendacaoTexto,
        resultado?.motivo || "Nenhuma inversão próxima reduz o custo deste bloqueio."
      );
      return;
    }

    const rec = resultado.recomendacao;
    recomendacaoAtual = {
      ...rec,
      nomeMitigacao: resultado.nomeMitigacao ?? nomeDoTrecho?.(rec.trechoId) ?? rec.trechoId,
    };

    const nome = recomendacaoAtual.nomeMitigacao;
    const melhoriaTxt =
      rec.melhoria != null ? fmtTempo(rec.melhoria) : "—";
    const antes =
      rec.tempoBloqueio != null ? fmtTempo(rec.tempoBloqueio) : "—";
    const depois =
      rec.tempoMitigado != null ? fmtTempo(rec.tempoMitigado) : "—";

    els.recomendacao.hidden = false;
    texto(
      els.recomendacaoTexto,
      `Inverter ${nome} · Δt ${antes} → ${depois} (melhora ${melhoriaTxt})`
    );
    if (els.recomendacaoTestar) {
      els.recomendacaoTestar.hidden = false;
      els.recomendacaoTestar.disabled = false;
    }
  }

  if (els.recomendacaoTestar) {
    els.recomendacaoTestar.addEventListener("click", () => {
      if (!recomendacaoAtual) return;
      aoTestarRecomendacao?.(recomendacaoAtual);
    });
  }

  limpar();
  return {
    limpar,
    mostrarCarregando,
    renderizar,
    mostrarErro,
    mostrarRecomendacao,
    limparRecomendacao,
    obterOpcoes,
    definirOpcoes,
  };
}

// Card “Se inverter…” na aba Vias: formata o resultado de `avaliar` sem tocar no motor.
import {
  texto,
  fmtNumero,
  fmtDelta,
  fmtTempo,
  fmtDistancia,
  fmtComparacao,
  fmtInt,
  rodapeAmostra,
} from "./previewImpactoFmt.js";

/**
 * Liga o card de prévia ao DOM. A avaliação em si fica no adaptador/controle.
 * @param {HTMLElement | null} raiz
 * @param {{ nomeDoTrecho?: (id: string) => string }} [opcoes]
 */
export function criarPreviewImpactoSentido(raiz, { nomeDoTrecho } = {}) {
  if (!raiz) {
    return {
      limpar() {},
      mostrarCarregando() {},
      renderizar() {},
      mostrarErro() {},
    };
  }

  const els = {
    titulo: raiz.querySelector("[data-preview='titulo']"),
    afetadas: raiz.querySelector("[data-preview='afetadas']"),
    tempo: raiz.querySelector("[data-preview='tempo']"),
    distancia: raiz.querySelector("[data-preview='distancia']"),
    piorCaso: raiz.querySelector("[data-preview='pior-caso']"),
    acesso: raiz.querySelector("[data-preview='acesso']"),
    sobrecarga: raiz.querySelector("[data-preview='sobrecarga']"),
    desvio: raiz.querySelector("[data-preview='desvio']"),
    desvioLinha: raiz.querySelector("[data-preview='desvio-linha']"),
    rodape: raiz.querySelector("[data-preview='rodape']"),
    alertaAcesso: raiz.querySelector("[data-preview='alerta-acesso']"),
  };

  function limpar() {
    raiz.hidden = true;
    raiz.dataset.estado = "vazio";
    texto(els.afetadas, "—");
    texto(els.tempo, "—");
    texto(els.distancia, "—");
    texto(els.piorCaso, "—");
    texto(els.acesso, "—");
    texto(els.sobrecarga, "—");
    texto(els.desvio, "—");
    if (els.desvioLinha) els.desvioLinha.hidden = true;
    if (els.alertaAcesso) els.alertaAcesso.hidden = true;
    texto(els.rodape, "");
  }

  function mostrarCarregando() {
    raiz.hidden = false;
    raiz.dataset.estado = "carregando";
    texto(els.afetadas, "Calculando…");
    texto(els.tempo, "…");
    texto(els.distancia, "…");
    texto(els.piorCaso, "…");
    texto(els.acesso, "…");
    texto(els.sobrecarga, "…");
    if (els.desvioLinha) els.desvioLinha.hidden = true;
    if (els.alertaAcesso) els.alertaAcesso.hidden = true;
    texto(els.rodape, "Simulação comparativa…");
  }

  function mostrarErro(motivo) {
    raiz.hidden = false;
    raiz.dataset.estado = "erro";
    texto(els.afetadas, motivo || "Não foi possível avaliar.");
    texto(els.tempo, "—");
    texto(els.distancia, "—");
    texto(els.piorCaso, "—");
    texto(els.acesso, "—");
    texto(els.sobrecarga, "—");
    if (els.desvioLinha) els.desvioLinha.hidden = true;
    if (els.alertaAcesso) els.alertaAcesso.hidden = true;
    texto(els.rodape, "");
  }

  /**
   * @param {{ ok: true, trechoId: string, sentidoAtual: number, sentidoProximo: number, avaliacao: object }
   *   | { ok: false, motivo?: string }} resultado
   * @param {{ rotuloSentido?: (s: number) => string }} [extra]
   */
  function renderizar(resultado, { rotuloSentido } = {}) {
    if (!resultado?.ok || !resultado.avaliacao) {
      mostrarErro(resultado?.motivo);
      return;
    }

    const { avaliacao: r, sentidoProximo } = resultado;
    const { delta, base, cenario, amostra, extras } = r;

    raiz.hidden = false;
    raiz.dataset.estado = "pronto";

    if (els.titulo && rotuloSentido) {
      texto(els.titulo, `Se inverter… → ${rotuloSentido(sentidoProximo)}`);
    } else if (els.titulo) {
      texto(els.titulo, "Se inverter…");
    }

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

    const dist = fmtComparacao(
      base.distanciaMedia,
      cenario.distanciaMedia,
      delta.distanciaMedia,
      fmtDistancia
    );
    texto(els.distancia, `${dist.baseTxt} → ${dist.cenTxt} · ${dist.deltaTxt}`);

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

    const perda = delta.perdaAcesso?.contagem ?? 0;
    texto(els.acesso, perda === 0 ? "Nenhuma perda" : `${fmtInt(perda)} nó(s) sem acesso`);
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

    const top = extras?.trechosSobrecarregados ?? [];
    if (!top.length) {
      texto(els.sobrecarga, "Nenhuma sobrecarga relevante");
    } else {
      texto(
        els.sobrecarga,
        top
          .map((t) => {
            const nome = nomeDoTrecho?.(t.trechoId) ?? t.trechoId;
            const pct =
              t.percentual == null ? "" : ` (+${fmtNumero(t.percentual)}%)`;
            return `${nome}: +${fmtInt(t.delta)} fluxo${pct}`;
          })
          .join(" · ")
      );
    }

    const desvio = extras?.desvioMoradores;
    if (els.desvioLinha) {
      const mostrar = desvio && desvio.pares > 0;
      els.desvioLinha.hidden = !mostrar;
      if (mostrar) {
        const partes = [`${fmtInt(desvio.pares)} pares`];
        if (desvio.deltaTempoMedio != null) {
          partes.push(`Δt ${fmtDelta(desvio.deltaTempoMedio, null, { digitos: 1 })} s`);
        }
        if (desvio.deltaDistanciaMedia != null) {
          partes.push(`Δd ${fmtDelta(desvio.deltaDistanciaMedia, null, { digitos: 0 })} m`);
        }
        texto(els.desvio, partes.join(" · "));
      }
    }

    texto(
      els.rodape,
      rodapeAmostra(amostra.tamanho, { bprSimulacao: Boolean(resultado.bprSimulacao) })
    );
  }

  limpar();
  return { limpar, mostrarCarregando, renderizar, mostrarErro };
}

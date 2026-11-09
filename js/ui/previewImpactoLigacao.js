// Card “Se construir ligação…” — formata prévia F2 de `adicionarLigacao`.
import {
  texto,
  fmtNumero,
  fmtTempo,
  fmtDistancia,
  fmtComparacao,
  fmtInt,
  rodapeAmostra,
} from "./previewImpactoFmt.js";

/**
 * @param {HTMLElement | null} raiz
 * @param {{
 *   nomeDoTrecho?: (id: string) => string,
 *   aoAplicar?: (pendente: object) => void,
 *   aoCancelar?: () => void,
 * }} [opcoes]
 */
export function criarPreviewImpactoLigacao(raiz, { nomeDoTrecho, aoAplicar, aoCancelar } = {}) {
  if (!raiz) {
    return {
      limpar() {},
      mostrarCarregando() {},
      renderizar() {},
      mostrarErro() {},
      pendente: () => null,
    };
  }

  const els = {
    titulo: raiz.querySelector("[data-preview-lig='titulo']"),
    tempo: raiz.querySelector("[data-preview-lig='tempo']"),
    usariam: raiz.querySelector("[data-preview-lig='usariam']"),
    aliviados: raiz.querySelector("[data-preview-lig='aliviados']"),
    reconectados: raiz.querySelector("[data-preview-lig='reconectados']"),
    detalhe: raiz.querySelector("[data-preview-lig='detalhe']"),
    aviso: raiz.querySelector("[data-preview-lig='aviso']"),
    rodape: raiz.querySelector("[data-preview-lig='rodape']"),
    aplicar: raiz.querySelector("[data-preview-lig='aplicar']"),
    cancelar: raiz.querySelector("[data-preview-lig='cancelar']"),
  };

  /** @type {object | null} */
  let pendenteAtual = null;

  function limpar() {
    pendenteAtual = null;
    raiz.hidden = true;
    raiz.dataset.estado = "vazio";
    texto(els.tempo, "—");
    texto(els.usariam, "—");
    texto(els.aliviados, "—");
    texto(els.reconectados, "—");
    texto(els.detalhe, "");
    texto(els.rodape, "");
    if (els.aviso) els.aviso.hidden = true;
    if (els.aplicar) els.aplicar.disabled = true;
  }

  function mostrarCarregando({ de, para, comprimento } = {}) {
    pendenteAtual = null;
    raiz.hidden = false;
    raiz.dataset.estado = "carregando";
    const comp =
      comprimento != null ? ` · ${fmtDistancia(comprimento)}` : "";
    texto(els.titulo, `Se construir ligação…${comp}`);
    texto(els.tempo, "Calculando…");
    texto(els.usariam, "…");
    texto(els.aliviados, "…");
    texto(els.reconectados, "…");
    texto(
      els.detalhe,
      de && para ? `${de} → ${para}` : ""
    );
    texto(els.rodape, "Simulação comparativa…");
    if (els.aviso) els.aviso.hidden = true;
    if (els.aplicar) els.aplicar.disabled = true;
  }

  function mostrarErro(motivo) {
    pendenteAtual = null;
    raiz.hidden = false;
    raiz.dataset.estado = "erro";
    texto(els.titulo, "Nova ligação");
    texto(els.tempo, motivo || "Não foi possível avaliar.");
    texto(els.usariam, "—");
    texto(els.aliviados, "—");
    texto(els.reconectados, "—");
    texto(els.rodape, "");
    if (els.aviso) els.aviso.hidden = true;
    if (els.aplicar) els.aplicar.disabled = true;
  }

  /**
   * @param {{ ok: true, mudanca: object, avaliacao: object, aviso?: string, nome?: string }
   *   | { ok: false, motivo?: string } | null} resultado
   */
  function renderizar(resultado) {
    if (!resultado?.ok || !resultado.avaliacao) {
      mostrarErro(resultado?.motivo);
      return;
    }

    pendenteAtual = resultado;
    const { avaliacao: r, mudanca, aviso, nome } = resultado;
    const { delta, base, cenario, amostra, extras } = r;

    raiz.hidden = false;
    raiz.dataset.estado = "pronto";

    const comp = mudanca?.comprimento != null ? ` · ${fmtDistancia(mudanca.comprimento)}` : "";
    texto(els.titulo, nome ? `Se construir… · ${nome}${comp}` : `Se construir ligação…${comp}`);

    const tempo = fmtComparacao(
      base.tempoMedioViagem,
      cenario.tempoMedioViagem,
      delta.tempoMedioViagem,
      fmtTempo
    );
    const economia =
      delta.tempoMedioViagem?.absoluto != null && delta.tempoMedioViagem.absoluto < 0
        ? ` · economia ${fmtTempo(Math.abs(delta.tempoMedioViagem.absoluto))}`
        : "";
    texto(els.tempo, `${tempo.baseTxt} → ${tempo.cenTxt} · ${tempo.deltaTxt}${economia}`);

    const usam = extras?.viagensNaLigacao;
    if (!usam) {
      texto(els.usariam, "—");
    } else {
      texto(
        els.usariam,
        `${fmtNumero(usam.percentual)}% (${fmtInt(usam.contagem)} de ${fmtInt(amostra.tamanho)})`
      );
    }

    const aliviados = extras?.trechosAliviados ?? [];
    if (!aliviados.length) {
      texto(els.aliviados, "Nenhum trecho aliviado relevante na amostra");
    } else {
      texto(
        els.aliviados,
        aliviados
          .map((t) => {
            const rotulo = nomeDoTrecho?.(t.trechoId) ?? t.trechoId;
            const pct =
              t.percentual == null ? "" : ` (${fmtNumero(t.percentual)}%)`;
            return `${rotulo}: ${fmtInt(t.delta)} fluxo${pct}`;
          })
          .join(" · ")
      );
    }

    const ganho = delta.ganhoAcesso?.contagem ?? 0;
    if (ganho <= 0) {
      texto(els.reconectados, "Nenhuma área reconectada na amostra");
    } else {
      texto(
        els.reconectados,
        ganho === 1
          ? "1 nó recupera acesso à malha principal"
          : `${fmtInt(ganho)} nós recuperam acesso à malha principal`
      );
    }

    const sentidoTxt =
      mudanca?.sentido === 0
        ? "mão dupla"
        : mudanca?.sentido === -1
          ? "mão única (volta)"
          : "mão única";
    const velKmh =
      mudanca?.velocidade != null ? Math.round(mudanca.velocidade * 3.6) : null;
    texto(
      els.detalhe,
      [
        mudanca?.de && mudanca?.para ? `${mudanca.de} → ${mudanca.para}` : null,
        sentidoTxt,
        velKmh != null ? `${velKmh} km/h` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );

    if (els.aviso) {
      els.aviso.hidden = false;
      texto(
        els.aviso,
        aviso ||
          (resultado.bprSimulacao
            ? "Prévia analítica F2: sem BPR dinâmico nesta estimativa (paradoxo de Braess não modelado aqui). Na simulação ao vivo, congestionamento BPR está ativo."
            : "Prévia analítica F2: sem congestionamento dinâmico (paradoxo de Braess não modelado aqui).")
      );
    }

    texto(
      els.rodape,
      rodapeAmostra(amostra.tamanho, { bprSimulacao: Boolean(resultado.bprSimulacao) })
    );
    if (els.aplicar) els.aplicar.disabled = false;
  }

  if (els.aplicar) {
    els.aplicar.addEventListener("click", () => {
      if (!pendenteAtual?.ok) return;
      aoAplicar?.(pendenteAtual);
    });
  }
  if (els.cancelar) {
    els.cancelar.addEventListener("click", () => {
      limpar();
      aoCancelar?.();
    });
  }

  limpar();
  return {
    limpar,
    mostrarCarregando,
    renderizar,
    mostrarErro,
    pendente: () => pendenteAtual,
  };
}

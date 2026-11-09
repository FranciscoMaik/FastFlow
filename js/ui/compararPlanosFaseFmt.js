// HTML compacto do comparativo de planos de fase (popup do semáforo).
import { fmtDelta, fmtNumero, fmtTempo } from "./previewImpactoFmt.js";

/**
 * @param {{ ok: boolean, motivo?: string, planos?: object[], f2?: object|null, melhorEsperaId?: string, melhorDeltaId?: string|null }} resultado
 * @returns {string}
 */
export function htmlTabelaPlanosFase(resultado) {
  if (!resultado?.ok || !resultado.planos?.length) {
    return `<p class="popup-planos-erro">${resultado?.motivo || "Não foi possível comparar."}</p>`;
  }

  const cols = resultado.planos
    .map((p) => {
      const classes = ["plano-col"];
      if (p.id === resultado.melhorEsperaId) classes.push("plano-melhor-espera");
      if (p.referencia) classes.push("plano-referencia");
      return `<th scope="col" class="${classes.join(" ")}">${escapar(p.rotulo)}<br><span class="plano-tempos">${escapar(p.rotuloTempos)}</span></th>`;
    })
    .join("");

  const celula = (plano, valorHtml, { melhor = false } = {}) => {
    const classes = [];
    if (plano.referencia) classes.push("plano-referencia");
    if (melhor && plano.id === resultado.melhorEsperaId) classes.push("plano-melhor-espera");
    if (melhor && resultado.melhorDeltaId && plano.id === resultado.melhorDeltaId) {
      classes.push("plano-melhor-delta");
    }
    return `<td class="${classes.join(" ")}">${valorHtml}</td>`;
  };

  const linhaCiclo = resultado.planos
    .map((p) => celula(p, `${fmtNumero(p.ciclo, { digitos: 0 })} s`))
    .join("");
  const linhaEspera = resultado.planos
    .map((p) =>
      celula(p, fmtTempo(p.esperaMedia), { melhor: true })
    )
    .join("");
  const linhaDeltaEspera = resultado.planos
    .map((p) => {
      if (p.referencia) return celula(p, "ref.");
      return celula(
        p,
        fmtDelta(p.deltaEsperaVsRef, null, { unidade: " s" })
      );
    })
    .join("");

  const temFila = resultado.planos.some((p) => p.filaEstimada != null);
  const linhaFila = temFila
    ? `<tr><th scope="row">Fila est.</th>${resultado.planos
        .map((p) =>
          celula(
            p,
            p.filaEstimada == null ? "—" : fmtNumero(p.filaEstimada, { digitos: 1 })
          )
        )
        .join("")}</tr>`
    : "";

  const temDeltaF2 = Boolean(resultado.f2);
  const linhaDeltaTempo = temDeltaF2
    ? `<tr><th scope="row">Δ tempo médio</th>${resultado.planos
        .map((p) => {
          if (p.referencia) return celula(p, "ref.");
          const d = p.deltaTempoMedio;
          return celula(
            p,
            fmtDelta(d?.absoluto, d?.percentual, { unidade: " s" }),
            { melhor: true }
          );
        })
        .join("")}</tr>`
    : "";

  const acoes = resultado.planos
    .map(
      (p) =>
        `<td class="${p.referencia ? "plano-referencia" : ""}">
          <button type="button" class="botao botao-secundario botao-pequeno btn-usar-plano"
            data-plano-id="${escaparAttr(p.id)}"
            data-verde="${p.tempos.verde}"
            data-amarelo="${p.tempos.amarelo}"
            data-vermelho="${p.tempos.vermelho}">Usar</button>
        </td>`
    )
    .join("");

  const rodapeF2 = temDeltaF2
    ? `Δ tempo médio: prévia F2 · amostra de ${fmtNumero(resultado.f2.amostra, { digitos: 0 })} viagens (vs ${escapar(resultado.planos.find((p) => p.referencia)?.rotulo || "referência")}).`
    : "Δ tempo médio omitido (só métricas de ciclo).";

  const rodapeFila = temFila
    ? "Fila estimada = taxa ao vivo × espera do ciclo."
    : "Fila estimada indisponível (sem taxa ao vivo).";

  return `
    <div class="popup-planos-tabela-wrap">
      <table class="popup-planos-tabela">
        <thead><tr><th scope="col">Métrica</th>${cols}</tr></thead>
        <tbody>
          <tr><th scope="row">Ciclo</th>${linhaCiclo}</tr>
          <tr><th scope="row">Espera</th>${linhaEspera}</tr>
          <tr><th scope="row">Δ espera</th>${linhaDeltaEspera}</tr>
          ${linhaFila}
          ${linhaDeltaTempo}
          <tr class="popup-planos-acoes-row"><th scope="row"></th>${acoes}</tr>
        </tbody>
      </table>
      <p class="popup-planos-rodape">${rodapeFila} ${rodapeF2}</p>
    </div>
  `;
}

function escapar(texto) {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escaparAttr(texto) {
  return escapar(texto).replaceAll("'", "&#39;");
}

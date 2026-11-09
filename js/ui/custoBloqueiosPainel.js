// Totais do custo acumulado dos bloqueios (lista “Vias bloqueadas”).
import {
  texto,
  fmtComparacao,
  fmtTempo,
  fmtNumero,
  fmtInt,
  rodapeAmostra,
} from "./previewImpactoFmt.js";

/**
 * @param {HTMLElement | null} raiz
 */
export function criarPainelCustoBloqueios(raiz) {
  if (!raiz) {
    return {
      limpar() {},
      mostrarCarregando() {},
      renderizar() {},
      mostrarErro() {},
    };
  }

  const els = {
    titulo: raiz.querySelector("[data-custo='titulo']"),
    afetadas: raiz.querySelector("[data-custo='afetadas']"),
    tempo: raiz.querySelector("[data-custo='tempo']"),
    retidos: raiz.querySelector("[data-custo='retidos']"),
    acesso: raiz.querySelector("[data-custo='acesso']"),
    rodape: raiz.querySelector("[data-custo='rodape']"),
  };

  function limpar() {
    raiz.hidden = true;
    raiz.dataset.estado = "vazio";
    texto(els.afetadas, "—");
    texto(els.tempo, "—");
    texto(els.retidos, "—");
    texto(els.acesso, "—");
    texto(els.rodape, "");
  }

  function mostrarCarregando(n = 0) {
    raiz.hidden = false;
    raiz.dataset.estado = "carregando";
    texto(
      els.titulo,
      n > 1 ? `Impacto acumulado · ${fmtInt(n)} bloqueios` : "Impacto acumulado"
    );
    texto(els.afetadas, "Calculando…");
    texto(els.tempo, "…");
    texto(els.retidos, "…");
    texto(els.acesso, "…");
    texto(els.rodape, "Comparando com a malha sem bloqueios…");
  }

  function mostrarErro(motivo) {
    raiz.hidden = false;
    raiz.dataset.estado = "erro";
    texto(els.titulo, "Impacto acumulado");
    texto(els.afetadas, motivo || "Não foi possível avaliar o custo acumulado.");
    texto(els.tempo, "—");
    texto(els.retidos, "—");
    texto(els.acesso, "—");
    texto(els.rodape, "");
  }

  /**
   * @param {{ ok: true, ids: string[], total: object|null, amostra?: object }
   *   | { ok: false, motivo?: string }} resultado
   */
  function renderizar(resultado) {
    if (!resultado?.ok) {
      mostrarErro(resultado?.motivo);
      return;
    }
    if (!resultado.ids?.length || !resultado.total) {
      limpar();
      return;
    }

    const { total, ids, amostra } = resultado;
    raiz.hidden = false;
    raiz.dataset.estado = "pronto";

    texto(
      els.titulo,
      ids.length > 1
        ? `Impacto acumulado · ${fmtInt(ids.length)} bloqueios`
        : "Impacto acumulado · 1 bloqueio"
    );

    const afet = total.viagensAfetadas;
    texto(
      els.afetadas,
      `${fmtNumero(afet.percentual)}% (${fmtInt(afet.contagem)} de ${fmtInt(amostra?.tamanho ?? total.amostra?.tamanho ?? 0)})`
    );

    const tempo = fmtComparacao(
      total.base?.tempoMedioViagem,
      total.cenario?.tempoMedioViagem,
      total.tempoMedioViagem,
      fmtTempo
    );
    texto(els.tempo, `${tempo.baseTxt} → ${tempo.cenTxt} · ${tempo.deltaTxt}`);

    const retidos = total.retidos ?? 0;
    texto(
      els.retidos,
      retidos === 0 ? "Nenhum a mais" : `${retidos > 0 ? "+" : ""}${fmtInt(retidos)} vs base`
    );

    const perda = total.perdaAcesso ?? 0;
    texto(els.acesso, perda === 0 ? "Nenhuma perda" : `${fmtInt(perda)} nó(s) sem acesso`);

    const tamanho = amostra?.tamanho ?? total.amostra?.tamanho;
    texto(els.rodape, tamanho != null ? `${rodapeAmostra(tamanho)} · base sem bloqueios` : "");
  }

  limpar();
  return { limpar, mostrarCarregando, renderizar, mostrarErro };
}

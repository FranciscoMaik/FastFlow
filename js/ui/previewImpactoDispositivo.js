// Card “Se colocar lombada/semáforo…” na aba Dispositivos — formata `avaliarImpactoDispositivo`.
import {
  texto,
  fmtNumero,
  fmtTempo,
  fmtComparacao,
  fmtInt,
  rodapeAmostra,
} from "./previewImpactoFmt.js";

/**
 * @param {HTMLElement | null} raiz
 */
export function criarPreviewImpactoDispositivo(raiz) {
  if (!raiz) {
    return {
      limpar() {},
      mostrarCarregando() {},
      renderizar() {},
      mostrarErro() {},
    };
  }

  const els = {
    titulo: raiz.querySelector("[data-preview-disp='titulo']"),
    afetadas: raiz.querySelector("[data-preview-disp='afetadas']"),
    tempo: raiz.querySelector("[data-preview-disp='tempo']"),
    piorCaso: raiz.querySelector("[data-preview-disp='pior-caso']"),
    rodape: raiz.querySelector("[data-preview-disp='rodape']"),
    aviso: raiz.querySelector("[data-preview-disp='aviso']"),
  };

  function limpar() {
    raiz.hidden = true;
    raiz.dataset.estado = "vazio";
    texto(els.afetadas, "—");
    texto(els.tempo, "—");
    texto(els.piorCaso, "—");
    texto(els.rodape, "");
    if (els.aviso) els.aviso.hidden = true;
  }

  function rotuloTipo(tipo) {
    return tipo === "lombada" ? "lombada" : "semáforo";
  }

  function mostrarCarregando(tipo = "dispositivo") {
    raiz.hidden = false;
    raiz.dataset.estado = "carregando";
    texto(els.titulo, `Se colocar ${rotuloTipo(tipo)}…`);
    texto(els.afetadas, "Calculando…");
    texto(els.tempo, "…");
    texto(els.piorCaso, "…");
    texto(els.rodape, "Simulação comparativa…");
    if (els.aviso) els.aviso.hidden = true;
  }

  function mostrarErro(motivo) {
    raiz.hidden = false;
    raiz.dataset.estado = "erro";
    texto(els.titulo, "Impacto do dispositivo");
    texto(els.afetadas, motivo || "Não foi possível avaliar.");
    texto(els.tempo, "—");
    texto(els.piorCaso, "—");
    texto(els.rodape, "");
    if (els.aviso) els.aviso.hidden = true;
  }

  /**
   * @param {{ ok: true, tipo?: string, nome?: string, avaliacao: object, aviso?: string }
   *   | { ok: false, motivo?: string } | null} resultado
   */
  function renderizar(resultado) {
    if (!resultado?.ok || !resultado.avaliacao) {
      mostrarErro(resultado?.motivo);
      return;
    }

    const { avaliacao: r, nome, tipo, aviso } = resultado;
    const { delta, base, cenario, amostra } = r;

    raiz.hidden = false;
    raiz.dataset.estado = "pronto";

    const baseTitulo = `Se colocar ${rotuloTipo(tipo)}…`;
    texto(els.titulo, nome ? `${baseTitulo} · ${nome}` : baseTitulo);

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
      texto(els.piorCaso, "Nenhuma piora na amostra");
    } else if (pior.retidoNoCenario || !Number.isFinite(pior.deltaTempo)) {
      texto(els.piorCaso, `${pior.origem} → ${pior.destino} · perde rota`);
    } else {
      texto(els.piorCaso, `${pior.origem} → ${pior.destino} · +${fmtTempo(pior.deltaTempo)}`);
    }

    if (els.aviso) {
      els.aviso.hidden = !aviso;
      texto(els.aviso, aviso || "");
    }

    texto(
      els.rodape,
      rodapeAmostra(amostra.tamanho, { bprSimulacao: Boolean(resultado.bprSimulacao) })
    );
  }

  limpar();
  return { limpar, mostrarCarregando, renderizar, mostrarErro };
}

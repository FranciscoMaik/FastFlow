// Painel “Onde construir?” — ranking de ligações curtas por ganho F2.
import { fmtDistancia, fmtNumero, fmtTempo, texto } from "./previewImpactoFmt.js";

/**
 * @param {HTMLElement | null} raiz
 * @param {{
 *   aoEscolher?: (item: object) => void,
 *   aoBuscar?: () => void,
 *   aoCancelar?: () => void,
 * }} [opcoes]
 */
export function criarPainelOndeConstruir(raiz, { aoEscolher, aoBuscar, aoCancelar } = {}) {
  if (!raiz) {
    return {
      mostrarOcioso() {},
      mostrarProgresso() {},
      renderizar() {},
      mostrarErro() {},
      limpar() {},
    };
  }

  const els = {
    titulo: raiz.querySelector("[data-onde='titulo']"),
    progresso: raiz.querySelector("[data-onde='progresso']"),
    barra: raiz.querySelector("[data-onde='barra']"),
    lista: raiz.querySelector("[data-onde='lista']"),
    vazio: raiz.querySelector("[data-onde='vazio']"),
    rodape: raiz.querySelector("[data-onde='rodape']"),
    buscar: raiz.querySelector("[data-onde='buscar']"),
    cancelar: raiz.querySelector("[data-onde='cancelar']"),
  };

  els.buscar?.addEventListener("click", () => aoBuscar?.());
  els.cancelar?.addEventListener("click", () => aoCancelar?.());

  function setCarregando(ativo) {
    raiz.dataset.estado = ativo ? "carregando" : "";
    if (els.buscar) els.buscar.disabled = !!ativo;
    if (els.cancelar) els.cancelar.hidden = !ativo;
  }

  function mostrarOcioso(mensagem) {
    setCarregando(false);
    if (els.progresso) els.progresso.hidden = true;
    if (els.barra) els.barra.style.width = "0%";
    els.lista?.replaceChildren();
    if (els.vazio) {
      els.vazio.hidden = false;
      texto(
        els.vazio,
        mensagem ||
          "Busca lacunas 40–300 m sem aresta direta e ranqueia por ganho de tempo (amostra limitada)."
      );
    }
    texto(els.rodape, "Cap apertado · 40–300 m · OD=60 · até 10 candidatos");
  }

  /**
   * @param {{ atual: number, total: number, fase?: string }} p
   */
  function mostrarProgresso(p) {
    setCarregando(true);
    if (els.progresso) els.progresso.hidden = false;
    if (els.vazio) els.vazio.hidden = true;
    const total = Math.max(0, p.total || 0);
    const atual = Math.max(0, p.atual || 0);
    const pct = total > 0 ? Math.min(100, Math.round((atual / total) * 100)) : p.fase === "pares" ? 5 : 0;
    if (els.barra) els.barra.style.width = `${pct}%`;
    const fase =
      p.fase === "pares"
        ? "Selecionando pares próximos…"
        : total > 0
          ? `Avaliando ${atual} de ${total}…`
          : "Calculando…";
    texto(els.rodape, fase);
  }

  /**
   * @param {{ ok?: boolean, itens?: object[], motivo?: string, candidatosAvaliados?: number, maxDist?: number, cancelado?: boolean }} resultado
   */
  function renderizar(resultado) {
    setCarregando(false);
    if (els.progresso) els.progresso.hidden = true;
    if (els.barra) els.barra.style.width = "0%";

    if (!resultado?.ok) {
      els.lista?.replaceChildren();
      if (els.vazio) {
        els.vazio.hidden = false;
        texto(els.vazio, resultado?.motivo || "Não foi possível calcular.");
      }
      texto(els.rodape, resultado?.cancelado ? "Busca cancelada." : "");
      return;
    }

    const itens = resultado.itens ?? [];
    els.lista?.replaceChildren(
      ...itens.map((item) => {
        const li = document.createElement("li");
        li.className = "lista-oportunidades-item";

        const nome = document.createElement("button");
        nome.type = "button";
        nome.className = "lista-oportunidades-nome";
        nome.textContent = item.rotulo || `${item.de} ↔ ${item.para}`;
        nome.title = `Prévia desta ligação (${fmtDistancia(item.comprimento)})`;
        if (typeof aoEscolher === "function") {
          nome.addEventListener("click", () => aoEscolher(item));
        }

        const meta = document.createElement("span");
        meta.className = "lista-oportunidades-meta";
        const ganho = fmtTempo(item.ganhoTempo);
        const dist = fmtDistancia(item.comprimento);
        const pct =
          item.viagensAfetadasPct == null
            ? ""
            : ` · ${fmtNumero(item.viagensAfetadasPct)}% viagens`;
        meta.textContent = `−${ganho} · ${dist}${pct}`;

        li.append(nome, meta);
        return li;
      })
    );

    if (els.vazio) {
      els.vazio.hidden = itens.length > 0;
      if (itens.length === 0) {
        texto(
          els.vazio,
          "Nenhuma ligação com ganho de tempo na amostra (cap apertado de pares curtos)."
        );
      }
    }

    const aval = resultado.candidatosAvaliados ?? itens.length;
    const dist = resultado.maxDist ?? 300;
    texto(
      els.rodape,
      `${aval} candidato(s) · <${fmtNumero(dist, { digitos: 0 })} m · OD limitada`
    );
  }

  function mostrarErro(msg) {
    renderizar({ ok: false, motivo: msg || "Falha na busca." });
  }

  function limpar() {
    mostrarOcioso();
  }

  mostrarOcioso();
  return { mostrarOcioso, mostrarProgresso, renderizar, mostrarErro, limpar };
}

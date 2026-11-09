// Badge de status da simulação no mapa (em execução / pausada / carregando).

export function criarStatusSimulacao(elemento) {
  if (!elemento) {
    return { definir() {}, destruir() {} };
  }

  /**
   * @param {"executando"|"pausada"|"carregando"|"erro"} estado
   * @param {string} [detalhe]
   * @param {{ bprAtivo?: boolean }} [opcoes]
   */
  function definir(estado, detalhe = "", { bprAtivo = false } = {}) {
    const mapa = {
      executando: { texto: "Em execução", classe: "status-executando" },
      pausada: { texto: "Pausada", classe: "status-pausada" },
      carregando: { texto: detalhe ? `Carregando ${detalhe}` : "Carregando…", classe: "status-carregando" },
      erro: { texto: detalhe || "Falha ao carregar", classe: "status-erro" },
    };
    const info = mapa[estado] ?? mapa.executando;
    let texto = info.texto;
    if (bprAtivo && (estado === "executando" || estado === "pausada")) {
      texto = `${texto} · Congestionamento BPR ativo`;
    }
    elemento.hidden = false;
    elemento.dataset.estado = estado;
    elemento.dataset.bpr = bprAtivo ? "1" : "0";
    elemento.className = `badge-status-sim ${info.classe}`;
    elemento.textContent = texto;
    elemento.title = bprAtivo
      ? "Congestionamento BPR ativo: custos de aresta sobem com a ocupação e rotas podem ser recalculadas."
      : "";
  }

  function destruir() {
    elemento.hidden = true;
    elemento.textContent = "";
    elemento.removeAttribute("data-estado");
    elemento.removeAttribute("data-bpr");
    elemento.removeAttribute("title");
  }

  return { definir, destruir };
}

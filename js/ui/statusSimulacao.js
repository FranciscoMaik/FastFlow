// Badge de status da simulação no mapa (em execução / pausada / carregando).

export function criarStatusSimulacao(elemento) {
  if (!elemento) {
    return { definir() {}, destruir() {} };
  }

  function definir(estado, detalhe = "") {
    const mapa = {
      executando: { texto: "Em execução", classe: "status-executando" },
      pausada: { texto: "Pausada", classe: "status-pausada" },
      carregando: { texto: detalhe ? `Carregando ${detalhe}` : "Carregando…", classe: "status-carregando" },
      erro: { texto: detalhe || "Falha ao carregar", classe: "status-erro" },
    };
    const info = mapa[estado] ?? mapa.executando;
    elemento.hidden = false;
    elemento.dataset.estado = estado;
    elemento.className = `badge-status-sim ${info.classe}`;
    elemento.textContent = info.texto;
  }

  function destruir() {
    elemento.hidden = true;
    elemento.textContent = "";
    elemento.removeAttribute("data-estado");
  }

  return { definir, destruir };
}

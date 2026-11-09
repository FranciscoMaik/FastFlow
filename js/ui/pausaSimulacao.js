// Controle de pausa padronizado entre as telas de simulação.

export function ligarPausa(botao, { aoMudar } = {}) {
  let rodando = true;

  function atualizar() {
    botao.textContent = rodando ? "Pausar" : "Continuar";
    botao.setAttribute("aria-pressed", String(!rodando));
  }

  botao.addEventListener("click", () => {
    rodando = !rodando;
    atualizar();
    aoMudar?.(rodando);
  });

  atualizar();
  return {
    estaRodando: () => rodando,
  };
}

// Controle de pausa padronizado entre as telas de simulação.

export function ligarPausa(botao, { aoMudar } = {}) {
  let rodando = true;

  function atualizar() {
    botao.textContent = rodando ? "Pausar" : "Continuar";
    botao.setAttribute("aria-pressed", String(!rodando));
    aoMudar?.(rodando);
  }

  botao.addEventListener("click", () => {
    rodando = !rodando;
    atualizar();
  });

  botao.textContent = "Pausar";
  botao.setAttribute("aria-pressed", "false");
  return {
    estaRodando: () => rodando,
    definirRodando(valor) {
      rodando = Boolean(valor);
      atualizar();
    },
  };
}

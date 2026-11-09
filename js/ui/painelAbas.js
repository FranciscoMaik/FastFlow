// Abas simples para progressive disclosure no painel lateral.

export function ligarPainelAbas(raiz, { signal } = {}) {
  if (!raiz) return { ativar() {} };

  const botoes = [...raiz.querySelectorAll("[data-aba]")];
  const paineis = [...raiz.querySelectorAll("[data-painel]")];

  function ativar(id) {
    for (const botao of botoes) {
      const ativo = botao.dataset.aba === id;
      botao.classList.toggle("ativo", ativo);
      botao.setAttribute("aria-selected", String(ativo));
      botao.setAttribute("tabindex", ativo ? "0" : "-1");
    }
    for (const painel of paineis) {
      const ativo = painel.dataset.painel === id;
      painel.hidden = !ativo;
      painel.classList.toggle("ativo", ativo);
    }
  }

  for (const botao of botoes) {
    botao.addEventListener("click", () => ativar(botao.dataset.aba), { signal });
  }

  const inicial = botoes.find((b) => b.classList.contains("ativo"))?.dataset.aba ?? botoes[0]?.dataset.aba;
  if (inicial) ativar(inicial);

  return { ativar };
}

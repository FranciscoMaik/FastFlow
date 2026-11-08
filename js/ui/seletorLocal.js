// Seletor do local (região) simulado, compartilhado pelas telas de simulação.
// Ao trocar de local, nesta ordem:
//   1. desmonta a simulação anterior (veículos, rotas, eventos e camadas);
//   2. mostra o estado de carregamento e trava o seletor;
//   3. carrega e valida a malha do novo local;
//   4. monta a nova simulação (função `montar` de cada tela);
//   5. enquadra a câmera na nova área.
// Tudo sem recarregar a página.
import { carregarLocais, carregarMalhaDoLocal } from "../adaptador/locais.js";

export async function iniciarSeletorLocal({ mapa, urlLocais, select, info, carregando, montar }) {
  let locais;
  let padrao;
  try {
    ({ locais, padrao } = await carregarLocais(urlLocais));
  } catch (erro) {
    carregando.textContent = erro.message;
    select.replaceChildren(new Option("Locais indisponíveis", ""));
    return;
  }

  select.replaceChildren(...locais.map((l) => new Option(l.nome, l.id)));
  select.value = padrao;

  let desmontarAtual = null;
  let pedido = 0; // descarta carregamentos que ficaram velhos

  async function trocar(local, { primeiraVez = false } = {}) {
    const meuPedido = ++pedido;

    // 1. Teardown obrigatório antes de qualquer coisa do novo local.
    desmontarAtual?.();
    desmontarAtual = null;

    // 2. Feedback de carregamento.
    select.disabled = true;
    mapa.getContainer().setAttribute("aria-busy", "true");
    carregando.classList.toggle("sobre-mapa", !primeiraVez);
    carregando.classList.remove("erro");
    carregando.textContent = `Carregando malha viária de ${local.nome}…`;
    carregando.hidden = false;
    info.textContent = local.descricao ?? "";

    try {
      // 3. Dados geográficos do local (com validação do schema). Na troca, o aviso
      // fica pelo menos 400 ms na tela para o operador perceber o reinício.
      const tempoMinimo = new Promise((r) => setTimeout(r, primeiraVez ? 0 : 400));
      const [geojson] = await Promise.all([carregarMalhaDoLocal(local), tempoMinimo]);
      if (meuPedido !== pedido) return;

      // 4. Nova simulação.
      const montado = montar(local, geojson, { primeiraVez });
      desmontarAtual = montado.desmontar;
      info.textContent = [local.descricao, `${montado.totalTrechos} trechos`].filter(Boolean).join(" · ");

      // 5. Câmera centralizada na nova área.
      if (primeiraVez) mapa.fitBounds(local.limites);
      else mapa.flyToBounds(local.limites, { duration: 0.8 });
      carregando.hidden = true;
    } catch (erro) {
      if (meuPedido !== pedido) return;
      carregando.classList.add("erro");
      carregando.textContent = `${erro.message} Escolha outro local na lista.`;
    } finally {
      if (meuPedido === pedido) {
        select.disabled = false;
        mapa.getContainer().removeAttribute("aria-busy");
      }
    }
  }

  select.addEventListener("change", () => {
    const local = locais.find((l) => l.id === select.value);
    if (local) trocar(local);
  });

  await trocar(locais.find((l) => l.id === padrao), { primeiraVez: true });
}

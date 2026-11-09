// Seletor de região simulada compartilhado pelas telas de simulação.
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
  let pedido = 0;

  async function trocar(local, { primeiraVez = false } = {}) {
    const meuPedido = ++pedido;

    desmontarAtual?.();
    desmontarAtual = null;

    select.disabled = true;
    mapa.getContainer().setAttribute("aria-busy", "true");
    carregando.classList.toggle("sobre-mapa", !primeiraVez);
    carregando.classList.remove("erro");
    carregando.textContent = `Carregando malha viária de ${local.nome}…`;
    carregando.hidden = false;
    info.textContent = local.descricao ?? "";

    try {
      const tempoMinimo = new Promise((r) => setTimeout(r, primeiraVez ? 0 : 400));
      const [geojson] = await Promise.all([carregarMalhaDoLocal(local), tempoMinimo]);
      if (meuPedido !== pedido) return;

      const montado = montar(local, geojson, { primeiraVez });
      desmontarAtual = montado.desmontar;
      info.textContent = [local.descricao, `${montado.totalTrechos} trechos`].filter(Boolean).join(" · ");

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

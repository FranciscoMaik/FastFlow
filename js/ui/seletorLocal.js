// Seletor de local simulável compartilhado pelas telas (persistência + confirmação de troca).
import { carregarLocais, carregarMalhaDoLocal, lerLocalId, salvarLocalId } from "../adaptador/locais.js";
import { confirmar } from "./confirmacao.js";

export async function iniciarSeletorLocal({
  mapa,
  urlLocais,
  select,
  info,
  carregando,
  montar,
  obterResumoAlteracoes = null,
  aoEstadoCarregamento = null,
} = {}) {
  let locais;
  let padrao;
  try {
    ({ locais, padrao } = await carregarLocais(urlLocais));
  } catch (erro) {
    carregando.textContent = erro.message;
    select.replaceChildren(new Option("Locais indisponíveis", ""));
    return;
  }

  const ids = locais.map((l) => l.id);
  const idInicial = lerLocalId(ids, padrao);
  select.replaceChildren(...locais.map((l) => new Option(l.nome, l.id)));
  select.value = idInicial;

  let desmontarAtual = null;
  let localAtual = null;
  let geojsonAtual = null;
  let pedido = 0;

  function aplicarMontagem(local, geojson, { primeiraVez = false } = {}) {
    const montado = montar(local, geojson, { primeiraVez });
    desmontarAtual = montado?.desmontar ?? null;
    localAtual = local;
    geojsonAtual = geojson;
    salvarLocalId(local.id);
    info.textContent = [local.descricao, `${montado.totalTrechos} trechos`].filter(Boolean).join(" · ");
    return montado;
  }

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
    aoEstadoCarregamento?.("carregando", local.nome);

    try {
      const tempoMinimo = new Promise((r) => setTimeout(r, primeiraVez ? 0 : 400));
      const [geojson] = await Promise.all([carregarMalhaDoLocal(local), tempoMinimo]);
      if (meuPedido !== pedido) return;

      aplicarMontagem(local, geojson, { primeiraVez });

      if (primeiraVez) mapa.fitBounds(local.limites);
      else mapa.flyToBounds(local.limites, { duration: 0.8 });
      carregando.hidden = true;
      aoEstadoCarregamento?.("pronto", local.nome);
    } catch (erro) {
      if (meuPedido !== pedido) return;
      carregando.classList.add("erro");
      carregando.textContent = `${erro.message} Escolha outro local na lista.`;
      aoEstadoCarregamento?.("erro", erro.message);
    } finally {
      if (meuPedido === pedido) {
        select.disabled = false;
        mapa.getContainer().removeAttribute("aria-busy");
      }
    }
  }

  /**
   * Remonta a sessão atual (mesmo local/malha) — usado ao trocar o cenário ativo (F5)
   * para reaplicar mudanças via `aplicarCenarioNaSessao` sem reload da página.
   */
  function reiniciarSessao() {
    if (!localAtual || !geojsonAtual) return null;
    desmontarAtual?.();
    desmontarAtual = null;
    return aplicarMontagem(localAtual, geojsonAtual, { primeiraVez: false });
  }

  select.addEventListener("change", async () => {
    const local = locais.find((l) => l.id === select.value);
    if (!local || local.id === localAtual?.id) return;

    const resumo = typeof obterResumoAlteracoes === "function" ? obterResumoAlteracoes() : null;
    if (resumo) {
      const ok = await confirmar({
        titulo: "Trocar local da simulação?",
        mensagem: `A simulação em ${localAtual.nome} será reiniciada. ${resumo}`,
        confirmarTexto: "Trocar e reiniciar",
        cancelarTexto: "Manter local",
        perigo: true,
      });
      if (!ok) {
        select.value = localAtual.id;
        return;
      }
    }

    await trocar(local);
  });

  await trocar(locais.find((l) => l.id === idInicial) ?? locais[0], { primeiraVez: true });

  return {
    reiniciarSessao,
    obterLocal: () => localAtual,
  };
}

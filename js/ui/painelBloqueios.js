// Painel lateral: dados do trecho selecionado, lista de bloqueios e estatísticas.
import { rotulo } from "./camadaVias.js";

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function el(tag, propriedades = {}, ...filhos) {
  const elemento = Object.assign(document.createElement(tag), propriedades);
  elemento.append(...filhos);
  return elemento;
}

export function metros(valor) {
  return valor >= 1000 ? `${(valor / 1000).toFixed(2)} km` : `${Math.round(valor)} m`;
}

export function renderizarInfoTrecho(container, trecho) {
  container.hidden = !trecho;
  container.replaceChildren();
  if (!trecho) return;
  container.classList.toggle("bloqueado", trecho.bloqueado);

  const linha = (rotuloCampo, valor, classe = "") =>
    [el("dt", { textContent: rotuloCampo }), el("dd", { textContent: valor, className: classe })];

  container.append(
    el("strong", { textContent: trecho.nome }),
    el("div", { className: "referencia", textContent: trecho.referencia ?? "Sem referência de cruzamento" }),
    el(
      "dl",
      {},
      ...linha("Status", trecho.bloqueado ? "Bloqueado" : "Livre", `status-via${trecho.bloqueado ? " bloqueado" : ""}`),
      ...linha("Extensão", metros(trecho.comprimento)),
      ...linha("Sentido", trecho.sentidoUnico ? "Mão única" : "Mão dupla"),
      ...linha("Veículos agora", String(trecho.veiculosNoTrecho))
    )
  );
}

export function renderizarBloqueios(lista, contador, botaoRemoverTodos, vazio, bloqueios, acoes) {
  contador.textContent = String(bloqueios.length);
  contador.classList.toggle("ativo", bloqueios.length > 0);
  vazio.hidden = bloqueios.length > 0;
  botaoRemoverTodos.hidden = bloqueios.length < 2;

  lista.replaceChildren(
    ...bloqueios.map((b) => {
      const localizar = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Localizar",
      });
      localizar.addEventListener("click", () => acoes.localizar(b.id));
      const remover = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Remover bloqueio",
      });
      remover.addEventListener("click", () => acoes.remover(b.id));

      const rotas = b.rotasRecalculadas === 1 ? "1 rota recalculada" : `${b.rotasRecalculadas} rotas recalculadas`;
      return el(
        "li",
        {},
        el("strong", { textContent: rotulo(b) }),
        el("div", { className: "detalhe", textContent: `Desde ${formatoHora.format(b.horario)} · ${rotas}` }),
        el("div", { className: "acoes" }, localizar, remover)
      );
    })
  );
}

export function renderizarEstatisticas(campos, e) {
  campos.ativos.textContent = String(e.ativos);
  campos.desviados.textContent = String(e.desviados);
  campos.retidos.textContent = String(e.retidos);
  campos.recalculos.textContent = String(e.rotasRecalculadas);
  campos.viagens.textContent = String(e.viagensConcluidas);
  campos.tempoMedio.textContent = e.tempoMedioViagem == null ? "—" : `${Math.round(e.tempoMedioViagem)} s`;
}

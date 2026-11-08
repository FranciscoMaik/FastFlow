// Painel lateral: trecho selecionado, bloqueios, dispositivos e estatísticas.
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
        textContent: "Remover",
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

export function renderizarDispositivos(
  lista,
  contadorGeral,
  contadorLombadas,
  contadorSemaforos,
  botaoRemoverTodos,
  vazio,
  dispositivos,
  acoes
) {
  const lombadas = dispositivos.filter((d) => d.tipo === "lombada");
  const semaforos = dispositivos.filter((d) => d.tipo === "semaforo");

  contadorGeral.textContent = String(dispositivos.length);
  contadorGeral.classList.toggle("ativo", dispositivos.length > 0);
  contadorLombadas.textContent = String(lombadas.length);
  contadorSemaforos.textContent = String(semaforos.length);
  vazio.hidden = dispositivos.length > 0;
  botaoRemoverTodos.hidden = dispositivos.length < 2;

  lista.replaceChildren(
    ...dispositivos.map((d) => {
      const localizar = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Localizar",
      });
      localizar.addEventListener("click", () => acoes.localizar(d.id));

      const remover = el("button", {
        type: "button",
        className: "botao botao-secundario botao-pequeno",
        textContent: "Remover",
      });
      remover.addEventListener("click", () => acoes.remover(d.id));

      const badge = el(
        "span",
        {
          className: `badge-item ${d.tipo === "lombada" ? "badge-lombada" : `badge-semaforo badge-${d.estado}`}`,
        },
        d.tipo === "lombada" ? "Lombada (20 km/h)" : `Semáforo (${d.estado})`
      );

      const detalhe = d.tipo === "lombada"
        ? `Na via ${d.nomeTrecho} · ${Math.round(d.distancia)} m do início`
        : `Na via ${d.nomeTrecho} · V:${d.tempos.verde}s A:${d.tempos.amarelo}s Vm:${d.tempos.vermelho}s`;

      return el(
        "li",
        { className: `item-dispositivo item-${d.tipo}` },
        el("div", { className: "item-dispositivo-cabecalho" }, badge),
        el("strong", { textContent: d.nomeTrecho }),
        el("div", { className: "detalhe", textContent: detalhe }),
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

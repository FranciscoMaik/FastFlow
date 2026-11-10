const ATRIBUTO_DESCRIBEDBY = "aria-describedby";
let proximoId = 0;

const POSICOES = new Set(["top", "bottom", "left", "right"]);

export function criarTooltip(alvo, texto = alvo.dataset.tooltip, opcoes = {}) {
  if (!(alvo instanceof Element)) throw new TypeError("O alvo do tooltip deve ser um elemento.");
  if (typeof texto !== "string" || !texto.trim()) {
    throw new TypeError("O tooltip precisa de um texto informativo.");
  }

  const {
    posicao = alvo.dataset.tooltipPosition || "top",
  } = opcoes;
  const delayAbertura =
    opcoes.delayAbertura ?? Number(alvo.dataset.tooltipDelayOpen ?? 300);
  const delayFechamento =
    opcoes.delayFechamento ?? Number(alvo.dataset.tooltipDelayClose ?? 120);
  if (!POSICOES.has(posicao)) throw new RangeError(`Posição de tooltip inválida: ${posicao}`);
  if (![delayAbertura, delayFechamento].every((valor) => Number.isFinite(valor) && valor >= 0)) {
    throw new RangeError("Os delays do tooltip devem ser números não negativos.");
  }

  let id;
  do {
    id = `fastflow-tooltip-${++proximoId}`;
  } while (document.getElementById(id));
  const elemento = document.createElement("div");
  elemento.id = id;
  elemento.className = "tooltip-flutuante";
  elemento.setAttribute("role", "tooltip");
  elemento.dataset.placement = posicao;
  elemento.textContent = texto.trim();
  document.body.append(elemento);

  const idsAnteriores = (alvo.getAttribute(ATRIBUTO_DESCRIBEDBY) || "")
    .split(/\s+/)
    .filter(Boolean);
  alvo.setAttribute(ATRIBUTO_DESCRIBEDBY, [...new Set([...idsAnteriores, id])].join(" "));

  let timerAbertura = null;
  let timerFechamento = null;
  let aberto = false;

  function posicionar() {
    const ancora = alvo.getBoundingClientRect();
    const caixa = elemento.getBoundingClientRect();
    const margem = 8;
    const espaco = {
      top: ancora.top,
      bottom: window.innerHeight - ancora.bottom,
      left: ancora.left,
      right: window.innerWidth - ancora.right,
    };
    const opostos = { top: "bottom", bottom: "top", left: "right", right: "left" };
    let colocacao = posicao;
    const vertical = colocacao === "top" || colocacao === "bottom";
    const tamanhoNecessario = vertical ? caixa.height + margem : caixa.width + margem;
    const tamanhoDisponivel = espaco[colocacao];
    if (tamanhoDisponivel < tamanhoNecessario && espaco[opostos[colocacao]] > tamanhoDisponivel) {
      colocacao = opostos[colocacao];
    }

    let left = ancora.left + (ancora.width - caixa.width) / 2;
    let top = ancora.top - caixa.height - margem;
    if (colocacao === "bottom") top = ancora.bottom + margem;
    if (colocacao === "left") {
      left = ancora.left - caixa.width - margem;
      top = ancora.top + (ancora.height - caixa.height) / 2;
    }
    if (colocacao === "right") {
      left = ancora.right + margem;
      top = ancora.top + (ancora.height - caixa.height) / 2;
    }

    elemento.dataset.placement = colocacao;
    elemento.style.left = `${Math.max(margem, Math.min(left, window.innerWidth - caixa.width - margem))}px`;
    elemento.style.top = `${Math.max(margem, Math.min(top, window.innerHeight - caixa.height - margem))}px`;
  }

  function abrir() {
    clearTimeout(timerFechamento);
    clearTimeout(timerAbertura);
    timerAbertura = null;
    if (aberto) return;
    aberto = true;
    elemento.dataset.visible = "true";
    posicionar();
    requestAnimationFrame(posicionar);
  }

  function fechar() {
    clearTimeout(timerAbertura);
    clearTimeout(timerFechamento);
    timerAbertura = null;
    timerFechamento = setTimeout(() => {
      aberto = false;
      delete elemento.dataset.visible;
    }, delayFechamento);
  }

  function agendarAbertura() {
    clearTimeout(timerFechamento);
    clearTimeout(timerAbertura);
    timerAbertura = setTimeout(abrir, delayAbertura);
  }

  function aoClicar() {
    if (!window.matchMedia("(hover: none)").matches) return;
    if (aberto) fechar();
    else abrir();
  }

  function aoTeclar(evento) {
    if (evento.key === "Escape" && aberto) {
      fechar();
      alvo.focus();
    }
  }

  alvo.addEventListener("pointerenter", agendarAbertura);
  alvo.addEventListener("pointerleave", fechar);
  alvo.addEventListener("focus", agendarAbertura);
  alvo.addEventListener("blur", fechar);
  alvo.addEventListener("click", aoClicar);
  alvo.addEventListener("keydown", aoTeclar);
  window.addEventListener("resize", posicionar);
  window.addEventListener("scroll", posicionar, true);

  return {
    elemento,
    abrir,
    fechar,
    atualizar(novoTexto) {
      if (typeof novoTexto !== "string" || !novoTexto.trim()) {
        throw new TypeError("O tooltip precisa de um texto informativo.");
      }
      elemento.textContent = novoTexto.trim();
      if (aberto) posicionar();
    },
    destruir() {
      clearTimeout(timerAbertura);
      clearTimeout(timerFechamento);
      alvo.removeEventListener("pointerenter", agendarAbertura);
      alvo.removeEventListener("pointerleave", fechar);
      alvo.removeEventListener("focus", agendarAbertura);
      alvo.removeEventListener("blur", fechar);
      alvo.removeEventListener("click", aoClicar);
      alvo.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
      const idsRestantes = idsAnteriores.filter((idExistente) => idExistente !== id);
      if (idsRestantes.length) alvo.setAttribute(ATRIBUTO_DESCRIBEDBY, idsRestantes.join(" "));
      else alvo.removeAttribute(ATRIBUTO_DESCRIBEDBY);
      elemento.remove();
    },
  };
}

export function criarIconeAjuda(texto, rotulo = "Ajuda contextual", opcoes = {}) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "tooltip-ajuda";
  botao.setAttribute("aria-label", rotulo);
  botao.dataset.tooltip = texto;
  if (opcoes.posicao) botao.dataset.tooltipPosition = opcoes.posicao;
  botao.innerHTML =
    '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"></circle><path d="M7.9 7.6a2.2 2.2 0 1 1 3.5 1.8c-.9.6-1.4 1-1.4 2"></path><path d="M10 14.3h.01"></path></svg>';
  return botao;
}

export function inicializarTooltips(raiz = document) {
  const instancias = new Map();
  raiz.querySelectorAll("[data-tooltip-icon]").forEach((ancora) => {
    const icone = criarIconeAjuda(
      ancora.dataset.tooltipIcon,
      ancora.dataset.tooltipLabel || "Ajuda contextual",
      { posicao: ancora.dataset.tooltipPosition }
    );
    ancora.replaceWith(icone);
  });
  const vincular = (alvo) => {
    if (instancias.has(alvo) || !alvo.dataset.tooltip?.trim()) return;
    instancias.set(alvo, criarTooltip(alvo));
  };
  raiz.querySelectorAll("[data-tooltip]").forEach(vincular);
  const observador = new MutationObserver((mutacoes) => {
    for (const mutacao of mutacoes) {
      if (mutacao.type === "attributes") {
        const instancia = instancias.get(mutacao.target);
        if (instancia && mutacao.target.dataset.tooltip?.trim()) {
          instancia.atualizar(mutacao.target.dataset.tooltip);
        } else if (instancia) {
          instancia.destruir();
          instancias.delete(mutacao.target);
        } else {
          vincular(mutacao.target);
        }
      }
      for (const no of mutacao.addedNodes) {
        if (!(no instanceof Element)) continue;
        if (no.matches("[data-tooltip]")) vincular(no);
        no.querySelectorAll("[data-tooltip]").forEach(vincular);
      }
      for (const no of mutacao.removedNodes) {
        if (!(no instanceof Element)) continue;
        const removidos = [...instancias.keys()].filter((alvo) => no === alvo || no.contains(alvo));
        for (const alvo of removidos) {
          instancias.get(alvo).destruir();
          instancias.delete(alvo);
        }
      }
    }
  });
  observador.observe(raiz === document ? document.body : raiz, {
    attributes: true,
    attributeFilter: ["data-tooltip"],
    childList: true,
    subtree: true,
  });

  return {
    destruir() {
      observador.disconnect();
      instancias.forEach((instancia) => instancia.destruir());
      instancias.clear();
    },
  };
}

if (typeof window !== "undefined") {
  window.FastFlowTooltip = Object.freeze({ criarTooltip, criarIconeAjuda, inicializarTooltips });
  inicializarTooltips();
}

// Seleção por lista: primeiro o logradouro (com busca), depois o trecho dele.

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function criarSeletorVias(
  { selectLogradouro, selectTrecho, filtroLogradouro = null },
  logradouros,
  obterTrecho,
  eventos,
  { signal } = {}
) {
  let trechosPorNome = new Map(logradouros.map((l) => [l.nome, l.trechos]));
  let listaCompleta = logradouros.map(({ nome, trechos }) => ({ nome, trechos }));
  let filtroAtual = "";

  function atualizarLogradouros(lista) {
    const nomeAtual = selectLogradouro.value;
    trechosPorNome = new Map(lista.map((l) => [l.nome, l.trechos]));
    listaCompleta = lista.map(({ nome, trechos }) => ({ nome, trechos }));
    preencherLogradouros(nomeAtual);
    preencherTrechos(selectLogradouro.value);
  }

  function preencherLogradouros(nomeSelecionado = "") {
    const termo = normalizar(filtroAtual);
    const filtrados = termo
      ? listaCompleta.filter((item) => normalizar(item.nome).includes(termo))
      : listaCompleta;

    const valorAtual = nomeSelecionado || selectLogradouro.value;
    selectLogradouro.replaceChildren(new Option("Selecione um logradouro…", ""));
    for (const { nome, trechos } of filtrados) {
      selectLogradouro.add(new Option(`${nome} (${trechos.length})`, nome));
    }

    if (valorAtual && trechosPorNome.has(valorAtual) && (!termo || normalizar(valorAtual).includes(termo))) {
      selectLogradouro.value = valorAtual;
    } else {
      selectLogradouro.value = "";
    }

    if (filtroLogradouro) {
      const vazio = filtrados.length === 0 && termo !== "";
      filtroLogradouro.setAttribute("aria-invalid", vazio ? "true" : "false");
    }
  }

  function preencherTrechos(nome) {
    selectTrecho.replaceChildren();
    const ids = trechosPorNome.get(nome) ?? [];
    selectTrecho.disabled = ids.length === 0;
    if (ids.length === 0) {
      selectTrecho.add(new Option("Escolha um logradouro", ""));
      return;
    }
    selectTrecho.add(new Option(`Todos os ${ids.length} trechos (destacar)`, ""));
    ids.forEach((id, i) => {
      const t = obterTrecho(id);
      const desc = t.referencia ?? `${Math.round(t.comprimento)} m`;
      const marca = t.bloqueado ? " ⛔" : "";
      selectTrecho.add(new Option(`Trecho ${i + 1}: ${desc}${marca}`, id));
    });
  }

  selectLogradouro.addEventListener("change", () => {
    preencherTrechos(selectLogradouro.value);
    eventos.aoEscolherLogradouro(selectLogradouro.value || null);
  }, { signal });

  selectTrecho.addEventListener("change", () => {
    if (selectTrecho.value) {
      eventos.aoEscolherTrecho(selectTrecho.value);
    } else {
      eventos.aoEscolherLogradouro(selectLogradouro.value || null);
    }
  }, { signal });

  if (filtroLogradouro) {
    filtroLogradouro.addEventListener("input", () => {
      const anterior = selectLogradouro.value;
      filtroAtual = filtroLogradouro.value;
      preencherLogradouros(anterior);
      if (selectLogradouro.value !== anterior) {
        preencherTrechos(selectLogradouro.value);
        eventos.aoEscolherLogradouro(selectLogradouro.value || null);
      }
    }, { signal });
  }

  preencherLogradouros();
  preencherTrechos("");

  return {
    atualizarLogradouros,
    // Mantém a lista em sincronia quando o trecho é escolhido pelo mapa.
    sincronizar(trechoId) {
      const t = trechoId ? obterTrecho(trechoId) : null;
      const nome = t?.temNome ? t.nome : "";
      if (nome && filtroAtual && !normalizar(nome).includes(normalizar(filtroAtual))) {
        filtroAtual = "";
        if (filtroLogradouro) filtroLogradouro.value = "";
      }
      preencherLogradouros(nome);
      preencherTrechos(nome);
      selectTrecho.value = t?.temNome ? trechoId : "";
    },
    trechosDo: (nome) => trechosPorNome.get(nome) ?? [],
    limpar() {
      trechosPorNome.clear();
      listaCompleta.length = 0;
      filtroAtual = "";
      if (filtroLogradouro) {
        filtroLogradouro.value = "";
        filtroLogradouro.removeAttribute("aria-invalid");
      }
      selectLogradouro.replaceChildren(new Option("Selecione um logradouro…", ""));
      selectLogradouro.value = "";
      preencherTrechos("");
    },
  };
}

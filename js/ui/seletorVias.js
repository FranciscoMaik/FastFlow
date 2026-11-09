// Seleção por lista: primeiro o logradouro, depois o trecho dele.

export function criarSeletorVias({ selectLogradouro, selectTrecho }, logradouros, obterTrecho, eventos, { signal } = {}) {
  const trechosPorNome = new Map(logradouros.map((l) => [l.nome, l.trechos]));

  selectLogradouro.length = 1;
  selectLogradouro.value = "";
  for (const { nome, trechos } of logradouros) {
    const opcao = new Option(`${nome} (${trechos.length})`, nome);
    selectLogradouro.add(opcao);
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

  preencherTrechos("");

  return {
    // Mantém a lista em sincronia quando o trecho é escolhido pelo mapa.
    sincronizar(trechoId) {
      const t = trechoId ? obterTrecho(trechoId) : null;
      const nome = t?.temNome ? t.nome : "";
      if (selectLogradouro.value !== nome) {
        selectLogradouro.value = nome;
      }
      preencherTrechos(nome);
      selectTrecho.value = t?.temNome ? trechoId : "";
    },
    trechosDo: (nome) => trechosPorNome.get(nome) ?? [],
    limpar() {
      trechosPorNome.clear();
      selectLogradouro.length = 1;
      selectLogradouro.value = "";
      preencherTrechos("");
    },
  };
}

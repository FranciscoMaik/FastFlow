// Popover de atalhos de teclado compartilhado pelas telas de simulação.

const ATALHOS_SENTIDO = [
  ["R", "Inverter sentido da via selecionada"],
  ["Espaço", "Pausar / continuar a simulação"],
  ["Esc", "Limpar seleção da via"],
];

const ATALHOS_BLOQUEIO = [
  ["Esc", "Cancelar ferramenta ou limpar seleção"],
  ["Espaço", "Pausar / continuar (foque fora de campos)"],
  ["Clique + ferramenta", "Posicionar lombada, semáforo ou ligação"],
  ["Onde construir?", "Sugerir ligações curtas (<300 m) por ganho de tempo"],
];

export function montarAtalhos(container, modo = "bloqueio") {
  if (!container) return;

  const atalhos = modo === "sentido" ? ATALHOS_SENTIDO : ATALHOS_BLOQUEIO;
  const detalhes = document.createElement("details");
  detalhes.className = "atalhos-sim";

  const resumo = document.createElement("summary");
  resumo.textContent = "Atalhos";
  detalhes.appendChild(resumo);

  const lista = document.createElement("dl");
  lista.className = "atalhos-lista";
  for (const [tecla, descricao] of atalhos) {
    const dt = document.createElement("dt");
    dt.innerHTML = `<kbd>${tecla}</kbd>`;
    const dd = document.createElement("dd");
    dd.textContent = descricao;
    lista.append(dt, dd);
  }
  detalhes.appendChild(lista);
  container.replaceChildren(detalhes);
}

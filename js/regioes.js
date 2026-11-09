// Regiões simuláveis nas três telas. Persistência compartilhada via localStorage.
const CHAVE = "fastflow.regiao";
const PADRAO = "centro";

export const REGIOES = {
  centro: {
    id: "centro",
    nome: "Centro de Cajamar",
    centro: [-23.355, -46.878],
    area: [
      [-23.365, -46.89],
      [-23.345, -46.866],
    ],
    malha: "data/malha.geojson",
  },
  jordanesia: {
    id: "jordanesia",
    nome: "Jordanésia",
    centro: [-23.33465, -46.835555],
    area: [
      [-23.345, -46.848],
      [-23.325, -46.824],
    ],
    malha: "data/malha-jordanesia.geojson",
  },
  polvilho: {
    id: "polvilho",
    nome: "Polvilho",
    centro: [-23.407691, -46.854781],
    area: [
      [-23.418, -46.867],
      [-23.398, -46.843],
    ],
    malha: "data/malha-polvilho.geojson",
  },
};

export function lerRegiao() {
  const id = localStorage.getItem(CHAVE);
  return REGIOES[id] ? id : PADRAO;
}

export function salvarRegiao(id) {
  if (!REGIOES[id]) return;
  localStorage.setItem(CHAVE, id);
}

export function obterRegiao(id = lerRegiao()) {
  return REGIOES[id] || REGIOES[PADRAO];
}

/** Preenche o <select> e liga change → salvar + callback (ex.: reload). */
export function ligarSeletorRegiao(select, { aoTrocar } = {}) {
  if (!select) return obterRegiao();

  select.innerHTML = "";
  for (const regiao of Object.values(REGIOES)) {
    const option = document.createElement("option");
    option.value = regiao.id;
    option.textContent = regiao.nome;
    select.appendChild(option);
  }

  const atual = lerRegiao();
  select.value = atual;

  select.addEventListener("change", () => {
    const id = select.value;
    if (!REGIOES[id] || id === lerRegiao()) return;
    salvarRegiao(id);
    if (typeof aoTrocar === "function") aoTrocar(id);
  });

  return obterRegiao(atual);
}

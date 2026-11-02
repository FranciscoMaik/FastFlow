// Algoritmos sobre o grafo. Arestas com peso Infinity (bloqueadas) e as do
// conjunto `ignorar` (bloqueios hipotéticos, usados na validação) não são percorridas.

class FilaPrioridade {
  #itens = [];

  get tamanho() {
    return this.#itens.length;
  }

  inserir(prioridade, valor) {
    const itens = this.#itens;
    itens.push([prioridade, valor]);
    let i = itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (itens[pai][0] <= itens[i][0]) break;
      [itens[pai], itens[i]] = [itens[i], itens[pai]];
      i = pai;
    }
  }

  retirar() {
    const itens = this.#itens;
    const topo = itens[0];
    const ultimo = itens.pop();
    if (itens.length > 0) {
      itens[0] = ultimo;
      let i = 0;
      for (;;) {
        const esq = 2 * i + 1;
        const dir = esq + 1;
        let menor = i;
        if (esq < itens.length && itens[esq][0] < itens[menor][0]) menor = esq;
        if (dir < itens.length && itens[dir][0] < itens[menor][0]) menor = dir;
        if (menor === i) break;
        [itens[menor], itens[i]] = [itens[i], itens[menor]];
        i = menor;
      }
    }
    return topo;
  }
}

function transitavel(grafo, arestaId, ignorar) {
  return Number.isFinite(grafo.arestas.get(arestaId).peso) && !ignorar?.has(arestaId);
}

// Dijkstra. Retorna a lista de ids de arestas da origem ao destino,
// [] se origem === destino, ou null se não houver caminho.
export function menorCaminho(grafo, origem, destino, { ignorar } = {}) {
  if (origem === destino) return [];
  const distancia = new Map([[origem, 0]]);
  const chegouPor = new Map();
  const fila = new FilaPrioridade();
  fila.inserir(0, origem);

  while (fila.tamanho > 0) {
    const [d, no] = fila.retirar();
    if (d > distancia.get(no)) continue;
    if (no === destino) break;
    for (const arestaId of grafo.saidas.get(no)) {
      if (!transitavel(grafo, arestaId, ignorar)) continue;
      const aresta = grafo.arestas.get(arestaId);
      const nova = d + aresta.peso;
      if (nova < (distancia.get(aresta.para) ?? Infinity)) {
        distancia.set(aresta.para, nova);
        chegouPor.set(aresta.para, arestaId);
        fila.inserir(nova, aresta.para);
      }
    }
  }

  if (!chegouPor.has(destino)) return null;
  const rota = [];
  for (let no = destino; no !== origem; ) {
    const arestaId = chegouPor.get(no);
    rota.push(arestaId);
    no = grafo.arestas.get(arestaId).de;
  }
  return rota.reverse();
}

export function custoRota(grafo, rota) {
  return rota.reduce((total, id) => total + grafo.arestas.get(id).peso, 0);
}

// Nós alcançáveis a partir de `origens` (busca em largura). Com `reverso`,
// retorna os nós que CONSEGUEM CHEGAR em alguma das origens.
export function alcancaveis(grafo, origens, { ignorar, reverso = false } = {}) {
  const lista = reverso ? grafo.entradas : grafo.saidas;
  const visitados = new Set(origens);
  const fila = [...visitados];
  while (fila.length > 0) {
    const no = fila.pop();
    for (const arestaId of lista.get(no)) {
      if (!transitavel(grafo, arestaId, ignorar)) continue;
      const aresta = grafo.arestas.get(arestaId);
      const vizinho = reverso ? aresta.de : aresta.para;
      if (!visitados.has(vizinho)) {
        visitados.add(vizinho);
        fila.push(vizinho);
      }
    }
  }
  return visitados;
}

// Maior componente fortemente conexa (Kosaraju, iterativo): o conjunto de nós
// em que qualquer um alcança qualquer outro. É a "malha principal" da simulação.
export function maiorComponenteForte(grafo, { ignorar } = {}) {
  const vizinhos = (no, reverso) => {
    const ids = (reverso ? grafo.entradas : grafo.saidas).get(no);
    const resultado = [];
    for (const id of ids) {
      if (!transitavel(grafo, id, ignorar)) continue;
      const aresta = grafo.arestas.get(id);
      resultado.push(reverso ? aresta.de : aresta.para);
    }
    return resultado;
  };

  const visitados = new Set();
  const ordem = [];
  for (const inicio of grafo.nos.keys()) {
    if (visitados.has(inicio)) continue;
    visitados.add(inicio);
    const pilha = [[inicio, vizinhos(inicio, false), 0]];
    while (pilha.length > 0) {
      const topo = pilha[pilha.length - 1];
      if (topo[2] < topo[1].length) {
        const proximo = topo[1][topo[2]++];
        if (!visitados.has(proximo)) {
          visitados.add(proximo);
          pilha.push([proximo, vizinhos(proximo, false), 0]);
        }
      } else {
        pilha.pop();
        ordem.push(topo[0]);
      }
    }
  }

  const atribuidos = new Set();
  let maior = new Set();
  for (let i = ordem.length - 1; i >= 0; i--) {
    const raiz = ordem[i];
    if (atribuidos.has(raiz)) continue;
    const componente = new Set([raiz]);
    atribuidos.add(raiz);
    const pilha = [raiz];
    while (pilha.length > 0) {
      for (const anterior of vizinhos(pilha.pop(), true)) {
        if (!atribuidos.has(anterior)) {
          atribuidos.add(anterior);
          componente.add(anterior);
          pilha.push(anterior);
        }
      }
    }
    if (componente.size > maior.size) maior = componente;
  }
  return maior;
}

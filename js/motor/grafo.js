// Grafo viário dirigido: cruzamentos são nós e cada sentido de um trecho de via
// é uma aresta com peso = tempo de travessia (s). Um "trecho" agrupa as arestas
// dos dois sentidos de um mesmo segmento entre cruzamentos e é a unidade de bloqueio.
import { Emissor } from "./eventos.js";

export class Grafo extends Emissor {
  constructor() {
    super();
    this.nos = new Map();
    this.arestas = new Map();
    this.trechos = new Map();
    this.saidas = new Map(); // nó -> ids das arestas que saem dele (lista de adjacência)
    this.entradas = new Map(); // nó -> ids das arestas que chegam nele
  }

  adicionarNo(id, dados = {}) {
    if (!this.nos.has(id)) {
      this.nos.set(id, { id, ...dados });
      this.saidas.set(id, []);
      this.entradas.set(id, []);
    }
    return this.nos.get(id);
  }

  adicionarAresta({ id, de, para, peso, trechoId, ...extras }) {
    this.adicionarNo(de);
    this.adicionarNo(para);
    const aresta = { ...extras, id, de, para, peso, pesoOriginal: peso, trechoId };
    this.arestas.set(id, aresta);
    this.saidas.get(de).push(id);
    this.entradas.get(para).push(id);
    return aresta;
  }

  adicionarTrecho({ id, arestas, ...meta }) {
    const trecho = { id, arestas, bloqueado: false, meta };
    this.trechos.set(id, trecho);
    return trecho;
  }

  estaAcessivel(arestaId) {
    return Number.isFinite(this.arestas.get(arestaId).peso);
  }

  // O peso vai para Infinity na própria aresta, então qualquer cálculo de rota
  // feito a partir deste momento já evita o trecho.
  bloquearTrecho(trechoId) {
    const trecho = this.#trecho(trechoId);
    if (trecho.bloqueado) return false;
    trecho.bloqueado = true;
    for (const id of trecho.arestas) {
      this.arestas.get(id).peso = Infinity;
    }
    this.emitir("bloqueioAlterado", { trechoId, bloqueado: true });
    return true;
  }

  desbloquearTrecho(trechoId) {
    const trecho = this.#trecho(trechoId);
    if (!trecho.bloqueado) return false;
    trecho.bloqueado = false;
    for (const id of trecho.arestas) {
      const aresta = this.arestas.get(id);
      aresta.peso = aresta.pesoOriginal;
    }
    this.emitir("bloqueioAlterado", { trechoId, bloqueado: false });
    return true;
  }

  trechosBloqueados() {
    return [...this.trechos.values()].filter((t) => t.bloqueado).map((t) => t.id);
  }

  #trecho(trechoId) {
    const trecho = this.trechos.get(trechoId);
    if (!trecho) throw new Error(`Trecho inexistente: ${trechoId}`);
    return trecho;
  }
}

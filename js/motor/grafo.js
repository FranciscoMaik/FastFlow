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

  adicionarTrecho({ id, arestas, sentido, permiteDuplo, ...meta }) {
    const temIda = arestas.some((a) => a.endsWith(">"));
    const temVolta = arestas.some((a) => a.endsWith("<"));
    const sentidoInicial =
      sentido ?? (temIda && temVolta ? 0 : temIda ? 1 : -1);
    const trecho = {
      id,
      arestas,
      bloqueado: false,
      sentido: sentidoInicial,
      sentidoInicial,
      permiteDuplo: permiteDuplo ?? (temIda && temVolta),
      meta,
    };
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
    // Restaura só as arestas permitidas pelo sentido atual.
    this.#aplicarSentido(trecho, trecho.sentido);
    this.emitir("bloqueioAlterado", { trechoId, bloqueado: false });
    return true;
  }

  trechosBloqueados() {
    return [...this.trechos.values()].filter((t) => t.bloqueado).map((t) => t.id);
  }

  // Sentido operacional do trecho: 0 = mão dupla, 1 = só no sentido da geometria (>),
  // -1 = só no sentido contrário (<). Inverter cicla 0→1→-1→0 quando a via permite
  // mão dupla; em vias que já nasceram de mão única, só alterna 1↔-1.
  sentidoDoTrecho(trechoId) {
    return this.#trecho(trechoId).sentido;
  }

  inverterSentido(trechoId) {
    const trecho = this.#trecho(trechoId);
    if (trecho.bloqueado) return false;
    this.#garantirParDeArestas(trecho);
    const anterior = trecho.sentido;
    const proximo = trecho.permiteDuplo
      ? anterior === 0
        ? 1
        : anterior === 1
          ? -1
          : 0
      : anterior === 1
        ? -1
        : 1;
    this.#aplicarSentido(trecho, proximo);
    this.emitir("sentidoAlterado", { trechoId, sentido: proximo, anterior });
    return true;
  }

  definirSentido(trechoId, sentido) {
    const trecho = this.#trecho(trechoId);
    if (![0, 1, -1].includes(sentido)) throw new Error(`Sentido inválido: ${sentido}`);
    if (sentido === 0 && !trecho.permiteDuplo) {
      throw new Error(`Trecho ${trechoId} não permite mão dupla`);
    }
    if (trecho.bloqueado) return false;
    this.#garantirParDeArestas(trecho);
    const anterior = trecho.sentido;
    if (anterior === sentido) return false;
    this.#aplicarSentido(trecho, sentido);
    this.emitir("sentidoAlterado", { trechoId, sentido, anterior });
    return true;
  }

  #aplicarSentido(trecho, sentido) {
    trecho.sentido = sentido;
    for (const id of trecho.arestas) {
      const ida = id.endsWith(">");
      const ativo = sentido === 0 || (sentido === 1 && ida) || (sentido === -1 && !ida);
      this.#definirAcessivel(id, ativo);
    }
  }

  #definirAcessivel(arestaId, ativo) {
    const aresta = this.arestas.get(arestaId);
    const trecho = this.trechos.get(aresta.trechoId);
    aresta.peso = trecho.bloqueado || !ativo ? Infinity : aresta.pesoOriginal;
  }

  // Garante arestas ">" e "<" (cria a oposta sob demanda ao inverter uma mão única).
  #garantirParDeArestas(trecho) {
    const temIda = trecho.arestas.some((id) => id.endsWith(">"));
    const temVolta = trecho.arestas.some((id) => id.endsWith("<"));
    if (temIda && temVolta) return;
    const baseId = trecho.arestas[0];
    const base = this.arestas.get(baseId);
    const criarIda = !temIda;
    const novoId = `${trecho.id}${criarIda ? ">" : "<"}`;
    const pontos = [...base.geometria.pontos].reverse();
    const acumulado = [0];
    for (let i = 1; i < pontos.length; i++) {
      const [lat1, lon1] = pontos[i - 1];
      const [lat2, lon2] = pontos[i];
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      acumulado.push(acumulado[i - 1] + 2 * 6371000 * Math.asin(Math.sqrt(a)));
    }
    const geometria = { pontos, acumulado, comprimento: base.comprimento };
    this.adicionarAresta({
      id: novoId,
      de: base.para,
      para: base.de,
      peso: base.pesoOriginal,
      trechoId: trecho.id,
      comprimento: base.comprimento,
      velocidade: base.velocidade,
      geometria,
    });
    trecho.arestas.push(novoId);
  }

  #trecho(trechoId) {
    const trecho = this.trechos.get(trechoId);
    if (!trecho) throw new Error(`Trecho inexistente: ${trechoId}`);
    return trecho;
  }
}

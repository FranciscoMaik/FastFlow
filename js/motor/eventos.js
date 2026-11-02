// Emissor de eventos mínimo usado pelo motor para avisar quem estiver ouvindo
// (por exemplo, a interface) sem precisar conhecer quem é.
export class Emissor {
  #ouvintes = new Map();

  on(evento, funcao) {
    if (!this.#ouvintes.has(evento)) {
      this.#ouvintes.set(evento, new Set());
    }
    this.#ouvintes.get(evento).add(funcao);
    return () => this.off(evento, funcao);
  }

  off(evento, funcao) {
    this.#ouvintes.get(evento)?.delete(funcao);
  }

  emitir(evento, dados) {
    for (const funcao of [...(this.#ouvintes.get(evento) ?? [])]) {
      funcao(dados);
    }
  }
}

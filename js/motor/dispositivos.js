// Modelagem dos dispositivos físicos e semafóricos de controle de tráfego.
// Gerencia o ciclo autônomo de semáforos e parâmetros de lombadas.
import { Emissor } from "./eventos.js";

export const VELOCIDADE_PADRAO_LOMBADA_KMH = 20;
export const VELOCIDADE_PADRAO_LOMBADA_MS = VELOCIDADE_PADRAO_LOMBADA_KMH / 3.6; // ~5.56 m/s
export const RAIO_EFEITO_LOMBADA = 25; // metros de aproximação

export const TEMPOS_PADRAO_SEMAFORO = {
  verde: 12,    // segundos simulados
  amarelo: 3,   // segundos simulados
  vermelho: 10, // segundos simulados
};

export class Lombada {
  constructor({
    id,
    trechoId,
    distancia,
    fracao,
    coordenadas,
    velocidadeMaxKmh = VELOCIDADE_PADRAO_LOMBADA_KMH,
    raioEfeito = RAIO_EFEITO_LOMBADA,
  }) {
    this.tipo = "lombada";
    this.id = id;
    this.trechoId = trechoId;
    this.distancia = distancia;
    this.fracao = fracao;
    this.coordenadas = coordenadas;
    this.velocidadeMaxKmh = velocidadeMaxKmh;
    this.velocidadeMax = velocidadeMaxKmh / 3.6;
    this.raioEfeito = raioEfeito;
  }

  definirVelocidadeMax(kmh) {
    const val = Math.max(5, Math.min(60, Number(kmh) || VELOCIDADE_PADRAO_LOMBADA_KMH));
    this.velocidadeMaxKmh = val;
    this.velocidadeMax = val / 3.6;
  }
}

export class Semaforo {
  constructor({
    id,
    trechoId,
    distancia,
    fracao,
    coordenadas,
    estadoInicial = "verde",
    tempos = TEMPOS_PADRAO_SEMAFORO,
    sentido = "ambos",
  }) {
    this.tipo = "semaforo";
    this.id = id;
    this.trechoId = trechoId;
    this.distancia = distancia;
    this.fracao = fracao;
    this.coordenadas = coordenadas;
    this.estado = estadoInicial;
    this.sentido = sentido; // "ambos", ">", "<"
    this.tempos = {
      verde: Math.max(1, tempos.verde ?? TEMPOS_PADRAO_SEMAFORO.verde),
      amarelo: Math.max(1, tempos.amarelo ?? TEMPOS_PADRAO_SEMAFORO.amarelo),
      vermelho: Math.max(1, tempos.vermelho ?? TEMPOS_PADRAO_SEMAFORO.vermelho),
    };
    this.tempoRestante = this.tempos[this.estado] ?? this.tempos.verde;
  }

  /**
   * Avança o ciclo semafórico pelo tempo dt (segundos simulados).
   * Retorna true caso o estado tenha mudado.
   */
  avancar(dt) {
    if (dt <= 0) return false;
    this.tempoRestante -= dt;
    let mudou = false;

    while (this.tempoRestante <= 0) {
      mudou = true;
      if (this.estado === "verde") {
        this.estado = "amarelo";
        this.tempoRestante += this.tempos.amarelo;
      } else if (this.estado === "amarelo") {
        this.estado = "vermelho";
        this.tempoRestante += this.tempos.vermelho;
      } else {
        this.estado = "verde";
        this.tempoRestante += this.tempos.verde;
      }
    }
    return mudou;
  }

  alternarEstado() {
    if (this.estado === "verde") {
      this.estado = "amarelo";
      this.tempoRestante = this.tempos.amarelo;
    } else if (this.estado === "amarelo") {
      this.estado = "vermelho";
      this.tempoRestante = this.tempos.vermelho;
    } else {
      this.estado = "verde";
      this.tempoRestante = this.tempos.verde;
    }
    return this.estado;
  }

  definirEstado(novoEstado) {
    if (!["verde", "amarelo", "vermelho"].includes(novoEstado)) return;
    this.estado = novoEstado;
    this.tempoRestante = this.tempos[novoEstado];
  }

  configurarTempos({ verde, amarelo, vermelho }) {
    if (verde != null) this.tempos.verde = Math.max(1, Number(verde));
    if (amarelo != null) this.tempos.amarelo = Math.max(1, Number(amarelo));
    if (vermelho != null) this.tempos.vermelho = Math.max(1, Number(vermelho));
    if (this.tempoRestante > this.tempos[this.estado]) {
      this.tempoRestante = this.tempos[this.estado];
    }
  }
}

export class GerenciadorDispositivos extends Emissor {
  #lombadas = new Map();
  #semaforos = new Map();
  #contadorLombadas = 0;
  #contadorSemaforos = 0;

  adicionarLombada({
    id,
    trechoId,
    distancia,
    fracao,
    coordenadas,
    velocidadeMaxKmh,
    raioEfeito,
  }) {
    const dispositivoId = id ?? `lombada-${++this.#contadorLombadas}`;
    const lombada = new Lombada({
      id: dispositivoId,
      trechoId,
      distancia,
      fracao,
      coordenadas,
      velocidadeMaxKmh,
      raioEfeito,
    });
    this.#lombadas.set(dispositivoId, lombada);
    this.emitir("dispositivoAdicionado", lombada);
    return lombada;
  }

  adicionarSemaforo({
    id,
    trechoId,
    distancia,
    fracao,
    coordenadas,
    estadoInicial,
    tempos,
    sentido,
  }) {
    const dispositivoId = id ?? `semaforo-${++this.#contadorSemaforos}`;
    const semaforo = new Semaforo({
      id: dispositivoId,
      trechoId,
      distancia,
      fracao,
      coordenadas,
      estadoInicial,
      tempos,
      sentido,
    });
    this.#semaforos.set(dispositivoId, semaforo);
    this.emitir("dispositivoAdicionado", semaforo);
    return semaforo;
  }

  removerDispositivo(id) {
    let removido = null;
    if (this.#lombadas.has(id)) {
      removido = this.#lombadas.get(id);
      this.#lombadas.delete(id);
    } else if (this.#semaforos.has(id)) {
      removido = this.#semaforos.get(id);
      this.#semaforos.delete(id);
    }
    if (removido) {
      this.emitir("dispositivoRemovido", removido);
      return true;
    }
    return false;
  }

  removerTodos() {
    const lista = this.listarTodos();
    this.#lombadas.clear();
    this.#semaforos.clear();
    for (const d of lista) {
      this.emitir("dispositivoRemovido", d);
    }
    return lista.length;
  }

  reposicionar(id, { trechoId, distancia, fracao, coordenadas }) {
    const d = this.obter(id);
    if (!d) return false;
    d.trechoId = trechoId;
    d.distancia = distancia;
    d.fracao = fracao;
    d.coordenadas = coordenadas;
    this.emitir("dispositivoAtualizado", d);
    return true;
  }

  configurarSemaforo(id, { verde, amarelo, vermelho }) {
    const s = this.#semaforos.get(id);
    if (!s) return false;
    s.configurarTempos({ verde, amarelo, vermelho });
    this.emitir("dispositivoAtualizado", s);
    return true;
  }

  alternarSemaforo(id) {
    const s = this.#semaforos.get(id);
    if (!s) return null;
    const novoEstado = s.alternarEstado();
    this.emitir("faseAlterada", s);
    this.emitir("dispositivoAtualizado", s);
    return novoEstado;
  }

  obter(id) {
    return this.#lombadas.get(id) ?? this.#semaforos.get(id) ?? null;
  }

  listarLombadas() {
    return [...this.#lombadas.values()];
  }

  listarSemaforos() {
    return [...this.#semaforos.values()];
  }

  listarTodos() {
    return [...this.#lombadas.values(), ...this.#semaforos.values()];
  }

  dispositivosDoTrecho(trechoId) {
    const lombadas = [];
    for (const l of this.#lombadas.values()) {
      if (l.trechoId === trechoId) lombadas.push(l);
    }
    const semaforos = [];
    for (const s of this.#semaforos.values()) {
      if (s.trechoId === trechoId) semaforos.push(s);
    }
    return { lombadas, semaforos };
  }

  /**
   * Avança todos os semáforos no tempo e emite notificações assíncronas de mudança.
   */
  avancar(dt) {
    for (const s of this.#semaforos.values()) {
      const mudou = s.avancar(dt);
      if (mudou) {
        this.emitir("faseAlterada", s);
      }
    }
  }
}

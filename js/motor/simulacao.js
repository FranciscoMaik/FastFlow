// Simulação de veículos sobre o grafo. Cada veículo segue a rota mais rápida até
// um destino; ao chegar, sorteia outro. Quando um trecho é bloqueado ou liberado,
// as rotas afetadas são recalculadas na hora.
import { Emissor } from "./eventos.js";
import { maiorComponenteForte, menorCaminho } from "./roteamento.js";

const VIAGENS_NA_MEDIA = 50;
const TENTATIVAS_DE_SORTEIO = 12;
const DISTANCIA_SEGURA_METROS = 5;

export class Simulacao extends Emissor {
  constructor(
    grafo,
    {
      aleatorio = Math.random,
      fatorTempo = 4,
      politicaSentido = "complete",
      intervaloSpawn = 0.2,
    } = {}
  ) {
    super();
    if (!Number.isFinite(intervaloSpawn) || intervaloSpawn <= 0) {
      throw new RangeError("O intervalo de spawn deve ser um número positivo.");
    }
    this.grafo = grafo;
    this.aleatorio = aleatorio;
    this.fatorTempo = fatorTempo;
    this.politicaSentido = politicaSentido; // "complete" | "uturn"
    this.intervaloSpawn = intervaloSpawn;
    this.tempo = 0;
    this.tempoSpawn = 0;
    this.quantidadeDesejada = 0;
    this.veiculos = [];
    this.rotasRecalculadas = 0;
    this.viagensConcluidas = 0;
    this.inversoes = 0;
    this.evacuados = 0;
    this.retornos = 0;
    this.duracoes = [];
    this.proximoId = 1;
    this.#atualizarMalhaPrincipal();
    grafo.on("bloqueioAlterado", (evento) => this.#aoAlterarBloqueio(evento));
    grafo.on("sentidoAlterado", (evento) => this.#aoAlterarSentido(evento));
  }

  definirQuantidade(quantidade) {
    this.quantidadeDesejada = quantidade;
    while (this.veiculos.length > quantidade) this.veiculos.pop();
    while (this.veiculos.length < quantidade) {
      const veiculo = this.#criarVeiculo();
      if (!veiculo) break;
      this.veiculos.push(veiculo);
    }
  }

  // `dtReal` em segundos de relógio; o tempo simulado anda `fatorTempo` vezes mais rápido.
  avancar(dtReal) {
    const dt = dtReal * this.fatorTempo;
    this.tempo += dt;
    if (this.veiculos.length >= this.quantidadeDesejada) {
      this.tempoSpawn = 0;
    } else {
      this.tempoSpawn += dt;
      while (this.tempoSpawn >= this.intervaloSpawn) {
        this.tempoSpawn -= this.intervaloSpawn;
        const veiculo = this.#criarVeiculo({ naEntrada: true });
        if (!veiculo) {
          this.tempoSpawn = 0;
          break;
        }
        this.veiculos.push(veiculo);
      }
    }
    const ocupacaoPorAresta = new Map();
    for (const veiculo of this.veiculos) {
      const arestaId = veiculo.rota[veiculo.indice];
      if (!ocupacaoPorAresta.has(arestaId)) ocupacaoPorAresta.set(arestaId, []);
      ocupacaoPorAresta.get(arestaId).push({ id: veiculo.id, progresso: veiculo.progresso });
    }
    for (const ocupacao of ocupacaoPorAresta.values()) {
      ocupacao.sort((a, b) => b.progresso - a.progresso || a.id - b.id);
    }
    const paraRemover = new Set();
    for (const veiculo of this.veiculos) {
      if (veiculo.status !== "retido" && this.#mover(veiculo, dt, ocupacaoPorAresta)) {
        paraRemover.add(veiculo);
      }
    }
    if (paraRemover.size) {
      this.veiculos = this.veiculos.filter((veiculo) => !paraRemover.has(veiculo));
    }
    this.emitir("tick", { tempo: this.tempo });
  }

  // Próximo nó que cada veículo alcança: usado pela validação de bloqueio.
  posicoesDeSaida() {
    return this.veiculos.map((v) => {
      const arestaId = v.rota[v.indice];
      return { id: v.id, arestaId, no: this.grafo.arestas.get(arestaId).para };
    });
  }

  estatisticas() {
    const media = this.duracoes.length
      ? this.duracoes.reduce((a, b) => a + b, 0) / this.duracoes.length
      : null;
    return {
      ativos: this.veiculos.length,
      retidos: this.veiculos.filter((v) => v.status === "retido").length,
      desviados: this.veiculos.filter((v) => v.status === "desviado").length,
      evacuando: this.veiculos.filter((v) => v.evacuando).length,
      rotasRecalculadas: this.rotasRecalculadas,
      viagensConcluidas: this.viagensConcluidas,
      inversoes: this.inversoes,
      evacuados: this.evacuados,
      retornos: this.retornos,
      tempoMedioViagem: media,
      tempoSimulado: this.tempo,
    };
  }

  #mover(veiculo, dt, ocupacaoPorAresta) {
    let restante = dt;
    while (restante > 0) {
      const arestaId = veiculo.rota[veiculo.indice];
      const aresta = this.grafo.arestas.get(arestaId);
      const ocupacao = ocupacaoPorAresta.get(arestaId) ?? [];
      const lider = ocupacao.find(
        (outro) =>
          outro.id !== veiculo.id &&
          (outro.progresso > veiculo.progresso ||
            (outro.progresso === veiculo.progresso && outro.id < veiculo.id))
      );
      const limite = Math.min(
        aresta.comprimento,
        lider ? lider.progresso - DISTANCIA_SEGURA_METROS : aresta.comprimento
      );
      const falta = limite - veiculo.progresso;
      if (falta <= 1e-6 && limite < aresta.comprimento - 1e-6) return;
      const percorrivel = aresta.velocidade * restante;
      if (percorrivel < falta) {
        veiculo.progresso += percorrivel;
        return;
      }
      restante -= falta / aresta.velocidade;
      veiculo.progresso = limite;
      if (limite < aresta.comprimento - 1e-6) return;

      // Terminou a aresta atual (inclusive ao evacuar após inversão).
      if (veiculo.evacuando) {
        veiculo.evacuando = false;
        if (!this.#novaViagem(veiculo, aresta.para)) return;
        continue;
      }

      if (veiculo.indice === veiculo.rota.length - 1) {
        this.#registrarChegada(veiculo);
        return true;
      }

      // Segurança: se a próxima aresta foi bloqueada/invertida, recalcula antes de entrar.
      if (!this.grafo.estaAcessivel(veiculo.rota[veiculo.indice + 1])) {
        if (!this.#recalcular(veiculo)) return;
      }
      veiculo.indice += 1;
      veiculo.progresso = 0;
    }
    return false;
  }

  #registrarChegada(veiculo) {
    this.viagensConcluidas += 1;
    this.duracoes.push(this.tempo - veiculo.inicio);
    if (this.duracoes.length > VIAGENS_NA_MEDIA) this.duracoes.shift();
  }

  // Coloca o veículo (parado no fim da aresta atual) em uma nova viagem.
  #novaViagem(veiculo, noAtual) {
    const arestaAtual = veiculo.rota[veiculo.indice];
    for (let i = 0; i < TENTATIVAS_DE_SORTEIO; i++) {
      const destino = this.#sortearNo();
      const caminho = menorCaminho(this.grafo, noAtual, destino);
      if (caminho && caminho.length > 0) {
        Object.assign(veiculo, {
          destino,
          rota: [arestaAtual, ...caminho],
          indice: 0,
          inicio: this.tempo,
          status: veiculo.status === "retido" ? "desviado" : "circulando",
        });
        return true;
      }
    }
    this.#reter(veiculo);
    return false;
  }

  // Recalcula a rota a partir do fim da aresta atual. Se o destino ficou
  // inalcançável, escolhe outro. Retorna false se o veículo ficou retido.
  #recalcular(veiculo) {
    const arestaAtual = veiculo.rota[veiculo.indice];
    const noAtual = this.grafo.arestas.get(arestaAtual).para;
    const caminho = menorCaminho(this.grafo, noAtual, veiculo.destino);
    if (caminho && caminho.length > 0) {
      veiculo.rota = [arestaAtual, ...caminho];
      veiculo.indice = 0;
      if (veiculo.status === "retido") veiculo.status = "desviado";
      return true;
    }
    return this.#novaViagem(veiculo, noAtual);
  }

  #reter(veiculo) {
    veiculo.status = "retido";
    veiculo.rota = [veiculo.rota[veiculo.indice]];
    veiculo.indice = 0;
  }

  #aoAlterarBloqueio({ trechoId, bloqueado }) {
    this.#atualizarMalhaPrincipal();
    let recalculadas = 0;
    for (const veiculo of this.veiculos) {
      const futuras = veiculo.rota.slice(veiculo.indice + 1);
      const passaPeloTrecho = futuras.some(
        (id) => this.grafo.arestas.get(id).trechoId === trechoId
      );
      if (bloqueado) {
        // Bloqueio: só quem ainda passaria pelo trecho precisa de nova rota.
        if (!passaPeloTrecho) continue;
        this.#recalcular(veiculo);
        if (veiculo.status !== "retido") veiculo.status = "desviado";
        recalculadas += 1;
      } else {
        // Liberação: todos procuram uma rota possivelmente melhor; retidos voltam a andar.
        const estavaRetido = veiculo.status === "retido";
        const antes = futuras.join();
        this.#recalcular(veiculo);
        if (estavaRetido || veiculo.rota.slice(veiculo.indice + 1).join() !== antes) {
          recalculadas += 1;
        }
      }
    }
    this.rotasRecalculadas += recalculadas;
    this.emitir("rotasRecalculadas", { trechoId, bloqueado, quantidade: recalculadas });
  }

  #aoAlterarSentido({ trechoId, sentido, anterior }) {
    this.#atualizarMalhaPrincipal();
    this.inversoes += 1;
    let recalculadas = 0;
    let evacuando = 0;
    let retornos = 0;

    for (const veiculo of this.veiculos) {
      const arestaAtualId = veiculo.rota[veiculo.indice];
      const arestaAtual = this.grafo.arestas.get(arestaAtualId);
      const noTrecho = arestaAtual.trechoId === trechoId;
      const sentidoFechouAresta = noTrecho && !this.grafo.estaAcessivel(arestaAtualId);

      if (sentidoFechouAresta) {
        if (this.politicaSentido === "uturn") {
          if (this.#fazerUturn(veiculo, trechoId)) {
            retornos += 1;
            recalculadas += 1;
            continue;
          }
        }
        // complete (ou uturn sem aresta oposta): conclui a travessia atual.
        veiculo.evacuando = true;
        veiculo.rota = [arestaAtualId];
        veiculo.indice = 0;
        veiculo.status = "desviado";
        evacuando += 1;
        continue;
      }

      const futuras = veiculo.rota.slice(veiculo.indice + 1);
      const precisa = futuras.some((id) => !this.grafo.estaAcessivel(id));
      if (!precisa) continue;
      this.#recalcular(veiculo);
      if (veiculo.status !== "retido") veiculo.status = "desviado";
      recalculadas += 1;
    }

    this.evacuados += evacuando;
    this.retornos += retornos;
    this.rotasRecalculadas += recalculadas;
    this.emitir("sentidoReagido", {
      trechoId,
      sentido,
      anterior,
      evacuando,
      retornos,
      recalculadas,
    });
  }

  #fazerUturn(veiculo, trechoId) {
    const atualId = veiculo.rota[veiculo.indice];
    const atual = this.grafo.arestas.get(atualId);
    const opostaId = atualId.endsWith(">") ? `${trechoId}<` : `${trechoId}>`;
    const oposta = this.grafo.arestas.get(opostaId);
    if (!oposta || !this.grafo.estaAcessivel(opostaId)) return false;

    veiculo.evacuando = false;
    veiculo.progresso = Math.max(0, atual.comprimento - veiculo.progresso);
    veiculo.rota = [opostaId];
    veiculo.indice = 0;
    veiculo.status = "desviado";
    // Escolhe novo destino a partir do fim da aresta oposta.
    return this.#novaViagem(veiculo, oposta.para);
  }

  #atualizarMalhaPrincipal() {
    const principal = maiorComponenteForte(this.grafo);
    this.malhaPrincipal = [...principal];
    this.arestasPrincipais = [...this.grafo.arestas.values()].filter(
      (a) => this.grafo.estaAcessivel(a.id) && principal.has(a.de) && principal.has(a.para)
    );
  }

  #sortearNo() {
    return this.malhaPrincipal[Math.floor(this.aleatorio() * this.malhaPrincipal.length)];
  }

  #criarVeiculo({ naEntrada = false } = {}) {
    if (this.arestasPrincipais.length === 0) return null;
    for (let tentativa = 0; tentativa < TENTATIVAS_DE_SORTEIO; tentativa++) {
      const inicial =
        this.arestasPrincipais[Math.floor(this.aleatorio() * this.arestasPrincipais.length)];
      const progresso = naEntrada ? 0 : this.aleatorio() * inicial.comprimento;
      if (
        naEntrada &&
        this.veiculos.some(
          (veiculo) =>
            veiculo.rota[veiculo.indice] === inicial.id &&
            veiculo.progresso < DISTANCIA_SEGURA_METROS
        )
      ) {
        continue;
      }
      const veiculo = {
        id: this.proximoId++,
        destino: null,
        rota: [inicial.id],
        indice: 0,
        progresso,
        inicio: this.tempo,
        status: "circulando",
        evacuando: false,
      };
      if (this.#novaViagem(veiculo, inicial.para)) return veiculo;
    }
    return null;
  }
}

// Simulação de veículos sobre o grafo. Cada veículo segue a rota mais rápida até
// um destino; ao chegar, sorteia outro. Quando um trecho é bloqueado ou liberado,
// as rotas afetadas são recalculadas na hora.
import { Emissor } from "./eventos.js";
import { maiorComponenteForte, menorCaminho } from "./roteamento.js";

const VIAGENS_NA_MEDIA = 50;
const TENTATIVAS_DE_SORTEIO = 12;

export class Simulacao extends Emissor {
  constructor(grafo, { aleatorio = Math.random, fatorTempo = 4 } = {}) {
    super();
    this.grafo = grafo;
    this.aleatorio = aleatorio;
    this.fatorTempo = fatorTempo;
    this.tempo = 0;
    this.veiculos = [];
    this.rotasRecalculadas = 0;
    this.viagensConcluidas = 0;
    this.duracoes = [];
    this.proximoId = 1;
    this.#atualizarMalhaPrincipal();
    grafo.on("bloqueioAlterado", (evento) => this.#aoAlterarBloqueio(evento));
  }

  definirQuantidade(quantidade) {
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
    for (const veiculo of this.veiculos) {
      if (veiculo.status !== "retido") this.#mover(veiculo, dt);
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
      rotasRecalculadas: this.rotasRecalculadas,
      viagensConcluidas: this.viagensConcluidas,
      tempoMedioViagem: media,
      tempoSimulado: this.tempo,
    };
  }

  #mover(veiculo, dt) {
    let restante = dt;
    while (restante > 0) {
      const aresta = this.grafo.arestas.get(veiculo.rota[veiculo.indice]);
      const falta = aresta.comprimento - veiculo.progresso;
      const percorrivel = aresta.velocidade * restante;
      if (percorrivel < falta) {
        veiculo.progresso += percorrivel;
        return;
      }
      restante -= falta / aresta.velocidade;
      veiculo.progresso = aresta.comprimento;

      if (veiculo.indice === veiculo.rota.length - 1) {
        this.#registrarChegada(veiculo);
        if (!this.#novaViagem(veiculo, aresta.para)) return;
        continue;
      }

      // Segurança: se a próxima aresta foi bloqueada, recalcula antes de entrar.
      if (!this.grafo.estaAcessivel(veiculo.rota[veiculo.indice + 1])) {
        if (!this.#recalcular(veiculo)) return;
      }
      veiculo.indice += 1;
      veiculo.progresso = 0;
    }
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

  #criarVeiculo() {
    if (this.arestasPrincipais.length === 0) return null;
    const inicial =
      this.arestasPrincipais[Math.floor(this.aleatorio() * this.arestasPrincipais.length)];
    const veiculo = {
      id: this.proximoId++,
      destino: null,
      rota: [inicial.id],
      indice: 0,
      progresso: this.aleatorio() * inicial.comprimento,
      inicio: this.tempo,
      status: "circulando",
    };
    return this.#novaViagem(veiculo, inicial.para) ? veiculo : null;
  }
}

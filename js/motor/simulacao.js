// Simulação de veículos sobre o grafo. Cada veículo segue a rota mais rápida até
// um destino; ao chegar, sorteia outro. Respeita lombadas, semáforos e filas.
import { Emissor } from "./eventos.js";
import { maiorComponenteForte, menorCaminho } from "./roteamento.js";
import { GerenciadorDispositivos } from "./dispositivos.js";

const VIAGENS_NA_MEDIA = 50;
const TENTATIVAS_DE_SORTEIO = 12;

const ACELERACAO_MAX = 2.5; // m/s²
const DESACELERACAO_CONFORTAVEL = 3.2; // m/s²
const DESACELERACAO_MAX = 6.0; // m/s²
const DISTANCIA_SEGURANCA_FILA = 7.0; // m
const MARGEM_PARADA_SEMAFORO = 2.0; // m

export class Simulacao extends Emissor {
  constructor(grafo, { aleatorio = Math.random, fatorTempo = 4, dispositivos } = {}) {
    super();
    this.grafo = grafo;
    this.aleatorio = aleatorio;
    this.fatorTempo = fatorTempo;
    this.dispositivos = dispositivos ?? new GerenciadorDispositivos();
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
    this.dispositivos.avancar(dt);
    this.#atualizarVeiculos(dt);
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

  #atualizarVeiculos(dt) {
    if (dt <= 0) return;

    const porAresta = new Map();
    for (const v of this.veiculos) {
      if (v.status === "retido") continue;
      const arestaId = v.rota[v.indice];
      if (!porAresta.has(arestaId)) porAresta.set(arestaId, []);
      porAresta.get(arestaId).push(v);
    }

    for (const [arestaId, veiculosNaAresta] of porAresta.entries()) {
      veiculosNaAresta.sort((a, b) => b.progresso - a.progresso);

      const aresta = this.grafo.arestas.get(arestaId);
      if (!aresta) continue;

      const sentidoInverso = aresta.id.endsWith("<");
      const { lombadas, semaforos } = this.dispositivos.dispositivosDoTrecho(aresta.trechoId);

      for (let i = 0; i < veiculosNaAresta.length; i++) {
        const v = veiculosNaAresta[i];
        if (v.velocidade == null) v.velocidade = aresta.velocidade;

        let posParada = aresta.comprimento;
        let vDesejada = aresta.velocidade;

        if (i > 0) {
          const vFrente = veiculosNaAresta[i - 1];
          const posFrenteFila = Math.max(0, vFrente.progresso - DISTANCIA_SEGURANCA_FILA);
          if (posFrenteFila < posParada) {
            posParada = posFrenteFila;
          }
        }

        for (const sem of semaforos) {
          if (sem.sentido !== "ambos") {
            const sentidoCompativel = sentidoInverso ? sem.sentido === "<" : sem.sentido === ">";
            if (!sentidoCompativel) continue;
          }

          const posSem = sentidoInverso
            ? aresta.comprimento - sem.distancia
            : sem.distancia;

          if (posSem > v.progresso) {
            if (sem.estado === "vermelho") {
              const posParadaSem = Math.max(0, posSem - MARGEM_PARADA_SEMAFORO);
              if (posParadaSem < posParada) posParada = posParadaSem;
            } else if (sem.estado === "amarelo") {
              const distAteSem = posSem - v.progresso;
              const dFrenagemSegura = (v.velocidade * v.velocidade) / (2 * DESACELERACAO_CONFORTAVEL);
              // Amarelo: só para se ainda dá para frear com conforto; senão, cruza.
              if (distAteSem > dFrenagemSegura) {
                const posParadaSem = Math.max(0, posSem - MARGEM_PARADA_SEMAFORO);
                if (posParadaSem < posParada) posParada = posParadaSem;
              }
            }
          }
        }

        for (const lomb of lombadas) {
          const posLomb = sentidoInverso
            ? aresta.comprimento - lomb.distancia
            : lomb.distancia;

          if (posLomb > v.progresso) {
            const distAteLomb = posLomb - v.progresso;
            if (distAteLomb <= lomb.raioEfeito) {
              const vAlvo = Math.sqrt(
                lomb.velocidadeMax * lomb.velocidadeMax +
                2 * DESACELERACAO_CONFORTAVEL * Math.max(0, distAteLomb)
              );
              if (vAlvo < vDesejada) vDesejada = vAlvo;
            }
          }
        }

        if (posParada < aresta.comprimento) {
          const distParada = Math.max(0, posParada - v.progresso);
          const vSegura = Math.sqrt(2 * DESACELERACAO_CONFORTAVEL * distParada);
          if (vSegura < vDesejada) vDesejada = vSegura;
          if (distParada <= 0.25) vDesejada = 0;
        }

        if (v.velocidade < vDesejada) {
          v.velocidade = Math.min(vDesejada, v.velocidade + ACELERACAO_MAX * dt);
        } else if (v.velocidade > vDesejada) {
          v.velocidade = Math.max(vDesejada, v.velocidade - DESACELERACAO_MAX * dt);
        }

        if (vDesejada === 0 && (posParada - v.progresso) <= 0.35) {
          v.velocidade = 0;
        }

        let passo = v.velocidade * dt;
        if (posParada < aresta.comprimento) {
          passo = Math.min(passo, Math.max(0, posParada - v.progresso));
        }

        if (v.progresso + passo < aresta.comprimento) {
          v.progresso += passo;
        } else {
          const falta = aresta.comprimento - v.progresso;
          v.progresso = aresta.comprimento;

          if (v.indice === v.rota.length - 1) {
            this.#registrarChegada(v);
            this.#novaViagem(v, aresta.para);
            continue;
          }

          const proximaArestaId = v.rota[v.indice + 1];
          if (!this.grafo.estaAcessivel(proximaArestaId)) {
            if (!this.#recalcular(v)) continue;
          }

          v.indice += 1;
          v.progresso = 0;
          const tempoResidual = v.velocidade > 0 ? Math.max(0, dt - falta / v.velocidade) : 0;
          if (tempoResidual > 0) {
            v.progresso = Math.min(aresta.comprimento * 0.1, v.velocidade * tempoResidual);
          }
        }
      }
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
    veiculo.velocidade = 0;
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
      velocidade: inicial.velocidade,
      inicio: this.tempo,
      status: "circulando",
    };
    return this.#novaViagem(veiculo, inicial.para) ? veiculo : null;
  }
}

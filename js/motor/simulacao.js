// Simulação de veículos sobre o grafo. Cada veículo segue a rota mais rápida até
// um destino; ao chegar, sorteia outro. Respeita lombadas, semáforos, filas e
// inversões de sentido. Com demanda fixa (F1), destinos vêm de uma matriz OD.
// F4 (opcional): a cada intervalo BPR, pesos das arestas sobem com a ocupação
// e rotas podem ser recalculadas — não a cada frame, para preservar FPS.
import { Emissor } from "./eventos.js";
import { maiorComponenteForte, menorCaminho } from "./roteamento.js";
import { GerenciadorDispositivos } from "./dispositivos.js";
import { resolverDemanda, sortearParDemanda } from "./demandaFixa.js";
import {
  atualizarCongestionamento,
  resolverBprConfig,
  restaurarPesosLivres,
} from "./congestionamento.js";

const VIAGENS_NA_MEDIA = 50;
const TENTATIVAS_DE_SORTEIO = 12;

const ACELERACAO_MAX = 2.5; // m/s²
const DESACELERACAO_CONFORTAVEL = 3.2; // m/s²
const DESACELERACAO_MAX = 6.0; // m/s²
const DISTANCIA_SEGURANCA_FILA = 7.0; // m
const MARGEM_PARADA_SEMAFORO = 2.0; // m

export class Simulacao extends Emissor {
  constructor(
    grafo,
    {
      aleatorio = Math.random,
      fatorTempo = 4,
      dispositivos,
      politicaSentido = "complete",
      intervaloSpawn = 0.2,
      // Matriz OD, `{ n, semente, nos? }`, ou `false`/`null` para destinos livres.
      // Omitir gera demanda fixa padrão a partir da malha principal.
      demanda,
      // F4: `true`/objeto de overrides, ou `false` para desligar.
      congestionamento = true,
    } = {}
  ) {
    super();
    if (!Number.isFinite(intervaloSpawn) || intervaloSpawn <= 0) {
      throw new RangeError("O intervalo de spawn deve ser um número positivo.");
    }
    this.grafo = grafo;
    this.aleatorio = aleatorio;
    this.fatorTempo = fatorTempo;
    this.dispositivos = dispositivos ?? new GerenciadorDispositivos();
    this.politicaSentido = politicaSentido; // "complete" | "uturn"
    this.intervaloSpawn = intervaloSpawn;
    this.congestionamentoAtivo = congestionamento !== false && congestionamento != null;
    this.bpr = this.congestionamentoAtivo
      ? resolverBprConfig(typeof congestionamento === "object" ? congestionamento : {})
      : null;
    this.tempo = 0;
    this.tempoSpawn = 0;
    this.#acumuladoBpr = 0;
    this.ultimoCongestionamento = null;
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
    this.demanda = resolverDemanda(demanda, this.malhaPrincipal);
    this.#desligarEventos = [
      grafo.on("bloqueioAlterado", (evento) => this.#aoAlterarBloqueio(evento)),
      grafo.on("sentidoAlterado", (evento) => this.#aoAlterarSentido(evento)),
    ];
  }

  #desligarEventos;
  #acumuladoBpr;

  encerrar() {
    this.#desligarEventos.forEach((desligar) => desligar());
    this.#desligarEventos = [];
    this.quantidadeDesejada = 0;
    this.veiculos = [];
    if (this.congestionamentoAtivo) restaurarPesosLivres(this.grafo);
  }

  /** Liga/desliga F4 em runtime. Desligar restaura pesos free-flow. */
  definirCongestionamento(ativo, overrides = {}) {
    if (ativo) {
      this.congestionamentoAtivo = true;
      this.bpr = resolverBprConfig({ ...(this.bpr ?? {}), ...overrides });
      this.#acumuladoBpr = 0;
    } else {
      this.congestionamentoAtivo = false;
      this.bpr = null;
      this.#acumuladoBpr = 0;
      restaurarPesosLivres(this.grafo);
      this.ultimoCongestionamento = null;
    }
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
    this.dispositivos.avancar(dt);
    this.#atualizarVeiculos(dt);
    if (this.congestionamentoAtivo && this.bpr) {
      this.#acumuladoBpr += dt;
      if (this.#acumuladoBpr >= this.bpr.intervaloAtualizacao) {
        this.#acumuladoBpr = 0;
        this.#tickCongestionamento();
      }
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
      congestionamento: this.congestionamentoAtivo,
      ultimoCongestionamento: this.ultimoCongestionamento
        ? {
            atualizadas: this.ultimoCongestionamento.atualizadas,
            significativas: this.ultimoCongestionamento.significativas,
            maxMudancaRelativa: this.ultimoCongestionamento.maxMudancaRelativa,
            recalculadas: this.ultimoCongestionamento.recalculadas ?? 0,
          }
        : null,
    };
  }

  // Recomputa pesos BPR a partir da ocupação atual; rerroteia só se a mudança
  // relativa cruzar o limiar (evita Dijkstra em massa a cada frame).
  #tickCongestionamento() {
    const resultado = atualizarCongestionamento(this.grafo, this.veiculos, this.bpr);
    let recalculadas = 0;
    if (
      this.bpr.recalcularRotas &&
      resultado.significativas > 0 &&
      resultado.maxMudancaRelativa >= this.bpr.limiarRelativoRecalculo
    ) {
      recalculadas = this.#recalcularRotasPorCongestionamento();
    }
    this.ultimoCongestionamento = { ...resultado, recalculadas };
    this.emitir("congestionamentoAtualizado", this.ultimoCongestionamento);
  }

  #recalcularRotasPorCongestionamento() {
    let recalculadas = 0;
    for (const veiculo of this.veiculos) {
      if (veiculo.status === "retido") continue;
      if (veiculo.evacuando) continue;
      const futurasAntes = veiculo.rota.slice(veiculo.indice + 1).join();
      if (!this.#recalcular(veiculo)) continue;
      const futurasDepois = veiculo.rota.slice(veiculo.indice + 1).join();
      if (futurasDepois !== futurasAntes) {
        if (veiculo.status !== "retido") veiculo.status = "desviado";
        recalculadas += 1;
      }
    }
    this.rotasRecalculadas += recalculadas;
    return recalculadas;
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

    const paraRemover = new Set();

    for (const [arestaId, veiculosNaAresta] of porAresta.entries()) {
      veiculosNaAresta.sort((a, b) => b.progresso - a.progresso);

      const aresta = this.grafo.arestas.get(arestaId);
      if (!aresta) continue;

      const sentidoInverso = aresta.id.endsWith("<");
      const { lombadas, semaforos } = this.dispositivos.dispositivosDoTrecho(aresta.trechoId);

      for (let i = 0; i < veiculosNaAresta.length; i++) {
        const v = veiculosNaAresta[i];
        if (paraRemover.has(v)) continue;
        if (v.velocidade == null) v.velocidade = aresta.velocidade;

        let posParada = aresta.comprimento;
        let vDesejada = aresta.velocidade;

        if (i > 0) {
          const vFrente = veiculosNaAresta[i - 1];
          if (paraRemover.has(vFrente)) {
            // ignore
          } else {
            const posFrenteFila = Math.max(0, vFrente.progresso - DISTANCIA_SEGURANCA_FILA);
            if (posFrenteFila < posParada) {
              posParada = posFrenteFila;
            }
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

          // Terminou a aresta atual (inclusive ao evacuar após inversão).
          if (v.evacuando) {
            v.evacuando = false;
            if (!this.#novaViagem(v, aresta.para)) continue;
            continue;
          }

          if (v.indice === v.rota.length - 1) {
            this.#registrarChegada(v);
            paraRemover.add(v);
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
            const proxima = this.grafo.arestas.get(v.rota[v.indice]);
            if (proxima) {
              v.progresso = Math.min(proxima.comprimento * 0.1, v.velocidade * tempoResidual);
            }
          }
        }
      }
    }

    if (paraRemover.size) {
      this.veiculos = this.veiculos.filter((veiculo) => !paraRemover.has(veiculo));
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
      const par = this.#sortearViagem(noAtual);
      if (!par) break;
      const caminho = menorCaminho(this.grafo, noAtual, par.destino);
      if (caminho && caminho.length > 0) {
        Object.assign(veiculo, {
          origem: par.origem,
          destino: par.destino,
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
    veiculo.velocidade = oposta.velocidade;
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

  // Com demanda fixa, sorteia um par OD (preferindo origem === noAtual).
  // Sem demanda, devolve destino livre com origem = noAtual.
  #sortearViagem(noAtual) {
    if (!this.demanda?.length) {
      return { origem: noAtual, destino: this.#sortearNo() };
    }

    if (noAtual != null) {
      const noLocal = [];
      for (const par of this.demanda) {
        if (par.origem === noAtual && par.destino !== noAtual) noLocal.push(par);
      }
      if (noLocal.length) {
        return noLocal[Math.floor(this.aleatorio() * noLocal.length)];
      }
    }

    for (let i = 0; i < TENTATIVAS_DE_SORTEIO; i++) {
      const par = sortearParDemanda(this.demanda, this.aleatorio);
      if (par && par.destino !== noAtual) return par;
    }
    return sortearParDemanda(this.demanda, this.aleatorio);
  }

  #criarVeiculo({ naEntrada = false } = {}) {
    if (this.arestasPrincipais.length === 0) return null;

    if (this.demanda?.length) {
      return this.#criarVeiculoComDemanda({ naEntrada });
    }

    for (let tentativa = 0; tentativa < TENTATIVAS_DE_SORTEIO; tentativa++) {
      const inicial =
        this.arestasPrincipais[Math.floor(this.aleatorio() * this.arestasPrincipais.length)];
      const progresso = naEntrada ? 0 : this.aleatorio() * inicial.comprimento;
      if (
        naEntrada &&
        this.veiculos.some(
          (veiculo) =>
            veiculo.rota[veiculo.indice] === inicial.id &&
            veiculo.progresso < DISTANCIA_SEGURANCA_FILA
        )
      ) {
        continue;
      }
      const veiculo = {
        id: this.proximoId++,
        origem: null,
        destino: null,
        rota: [inicial.id],
        indice: 0,
        progresso,
        velocidade: inicial.velocidade,
        inicio: this.tempo,
        status: "circulando",
        evacuando: false,
      };
      if (this.#novaViagem(veiculo, inicial.para)) return veiculo;
    }
    return null;
  }

  // Coloca o veículo já na rota do par OD sorteado (sai da origem rumo ao destino).
  #criarVeiculoComDemanda({ naEntrada = false } = {}) {
    for (let tentativa = 0; tentativa < TENTATIVAS_DE_SORTEIO; tentativa++) {
      const par = this.#sortearViagem(null);
      if (!par) return null;
      const caminho = menorCaminho(this.grafo, par.origem, par.destino);
      if (!caminho || caminho.length === 0) continue;

      const inicial = this.grafo.arestas.get(caminho[0]);
      if (!inicial || !this.grafo.estaAcessivel(inicial.id)) continue;

      const progresso = naEntrada ? 0 : this.aleatorio() * inicial.comprimento;
      if (
        naEntrada &&
        this.veiculos.some(
          (veiculo) =>
            veiculo.rota[veiculo.indice] === inicial.id &&
            veiculo.progresso < DISTANCIA_SEGURANCA_FILA
        )
      ) {
        continue;
      }

      return {
        id: this.proximoId++,
        origem: par.origem,
        destino: par.destino,
        rota: caminho,
        indice: 0,
        progresso,
        velocidade: inicial.velocidade,
        inicio: this.tempo,
        status: "circulando",
        evacuando: false,
      };
    }
    return null;
  }
}

// Simulação de veículos sobre o grafo. Cada veículo segue a rota mais rápida até
// um destino; ao chegar, sorteia outro. Respeita lombadas, semáforos, filas e
// inversões de sentido.
import { Emissor } from "./eventos.js";
import { alcancaveis, maiorComponenteForte, menorCaminho, portoesDaMalha } from "./roteamento.js";
import { GerenciadorDispositivos } from "./dispositivos.js";

const VIAGENS_NA_MEDIA = 50;
const TENTATIVAS_DE_SORTEIO = 12;

// Distribuição das viagens:
// - parte dos veículos entra pelos portões (bordas da área), como o tráfego de
//   passagem de uma rodovia; o restante nasce nas vias internas;
// - parte das viagens internas termina saindo da área por um portão.
// Portões de vias de maior hierarquia recebem mais tráfego. A fração que usa a
// borda cresce com o peso total dos portões e chega ao máximo com o equivalente
// a uma pista de rodovia (PESO_REFERENCIA_PORTOES): uma região só de ruas
// locais quase não tem tráfego de passagem.
const FRACAO_MAXIMA_ENTRADA_PELA_BORDA = 0.35;
const FRACAO_MAXIMA_SAIDA_PELA_BORDA = 0.3;
const PESO_REFERENCIA_PORTOES = 8;
// Vias a partir deste peso contam como "principais": suas pontas viram portões
// (becos residenciais continuam sendo destinos internos comuns) e a chance de
// nascer nelas é proporcional à extensão.
const PESO_MINIMO_PONTA = 1;
const COMPRIMENTO_REFERENCIA = 100; // m: extensão de um trecho urbano típico
const PESO_HIERARQUIA = {
  motorway: 8, trunk: 6, primary: 4, secondary: 3, tertiary: 2,
  motorway_link: 2, trunk_link: 2, primary_link: 1.5, secondary_link: 1.2, tertiary_link: 1,
  unclassified: 0.6, residential: 0.25, living_street: 0.1,
};

// Sorteio ponderado (soma acumulada + busca binária): O(log n) por sorteio.
function criarSorteio(itens, peso) {
  const acumulado = [];
  let total = 0;
  for (const item of itens) {
    total += Math.max(0, peso(item));
    acumulado.push(total);
  }
  return {
    vazio: total <= 0,
    sortear(aleatorio) {
      const alvo = aleatorio() * total;
      let baixo = 0;
      let alto = acumulado.length - 1;
      while (baixo < alto) {
        const meio = (baixo + alto) >> 1;
        if (acumulado[meio] > alvo) alto = meio;
        else baixo = meio + 1;
      }
      return itens[baixo];
    },
  };
}

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
    this.#desligarEventos = [
      grafo.on("bloqueioAlterado", (evento) => this.#aoAlterarBloqueio(evento)),
      grafo.on("sentidoAlterado", (evento) => this.#aoAlterarSentido(evento)),
    ];
  }

  #desligarEventos;

  encerrar() {
    this.#desligarEventos.forEach((desligar) => desligar());
    this.#desligarEventos = [];
    this.quantidadeDesejada = 0;
    this.veiculos = [];
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
      const destino = this.#sortearDestino(noAtual);
      if (destino == null) break;
      if (destino === noAtual) {
        // Já está num portão de saída: a viagem termina ao fim desta aresta.
        Object.assign(veiculo, { destino, rota: [arestaAtual], indice: 0, inicio: this.tempo, status: "circulando" });
        return true;
      }
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

  // Recalcula as malhas usadas no sorteio de origens e destinos. Chamado no início
  // e sempre que a topologia muda (bloqueio, liberação ou inversão de sentido).
  #atualizarMalhaPrincipal() {
    const principal = maiorComponenteForte(this.grafo);
    this.malhaPrincipal = [...principal];
    this.arestasPrincipais = [...this.grafo.arestas.values()].filter(
      (a) => this.grafo.estaAcessivel(a.id) && principal.has(a.de) && principal.has(a.para)
    );
    // Vias internas. Locais (residencial etc.): mesma chance por trecho, como antes,
    // para não alterar o fluxo que já funcionava. Principais (terciária para cima,
    // alças e rodovias): chance proporcional à extensão — uma estrada de 3 km
    // recebe tantos veículos quanto 30 trechos de 100 m.
    this.sorteioInterno = criarSorteio(this.arestasPrincipais, (a) =>
      this.#pesoHierarquia(a.trechoId) >= PESO_MINIMO_PONTA
        ? Math.max(1, a.comprimento / COMPRIMENTO_REFERENCIA)
        : 1
    );

    // Portões: entradas e saídas pela borda (rodovias cortadas pelo limite do mapa
    // etc.). Só os que estão FORA da malha principal: as vias da malha principal já
    // recebem tráfego normalmente e continuam exatamente como antes.
    const portoes = portoesDaMalha(this.grafo);
    const fontes = new Set(portoes.fontes);
    const sumidouros = new Set(portoes.sumidouros);
    const entradas = portoes.arestasEntrada.filter(
      (a) => this.grafo.estaAcessivel(a.id) && !principal.has(a.de) &&
        (fontes.has(a.de) || this.#pesoHierarquia(a.trechoId) >= PESO_MINIMO_PONTA)
    );
    this.sorteioEntrada = criarSorteio(entradas, (a) => this.#pesoHierarquia(a.trechoId));
    this.pesoSaida = new Map();
    for (const no of portoes.nosSaida) {
      if (principal.has(no)) continue;
      const peso = Math.max(0, ...this.grafo.entradas.get(no).map((id) => this.#pesoHierarquia(this.grafo.arestas.get(id).trechoId)));
      if (sumidouros.has(no) || peso >= PESO_MINIMO_PONTA) this.pesoSaida.set(no, peso);
    }
    this.nosSaida = [...this.pesoSaida.keys()];
    const fracao = (soma, maxima) => maxima * Math.min(1, soma / PESO_REFERENCIA_PORTOES);
    this.fracaoEntradaPelaBorda = fracao(entradas.reduce((s, a) => s + this.#pesoHierarquia(a.trechoId), 0), FRACAO_MAXIMA_ENTRADA_PELA_BORDA);
    this.fracaoSaidaPelaBorda = fracao([...this.pesoSaida.values()].reduce((s, p) => s + p, 0), FRACAO_MAXIMA_SAIDA_PELA_BORDA);
    this.destinosPorNo = new Map(); // cache: nó → destinos alcançáveis a partir dele
  }

  #pesoHierarquia(trechoId) {
    return PESO_HIERARQUIA[this.grafo.trechos.get(trechoId)?.meta?.tipo] ?? 0.5;
  }

  // Destinos possíveis a partir de um nó: a malha principal (se alcançável) e os
  // portões de saída alcançáveis. Um veículo numa rodovia isolada, por exemplo,
  // só pode seguir até a saída dela — nunca é mandado para um ponto inalcançável.
  #destinosDe(no) {
    let destinos = this.destinosPorNo.get(no);
    if (!destinos) {
      const alcance = alcancaveis(this.grafo, [no]);
      const internos = this.malhaPrincipal.some((n) => alcance.has(n));
      const saidas = this.nosSaida.filter((n) => alcance.has(n) && (n !== no || this.#ehSumidouro(n)));
      destinos = {
        internos,
        sorteioSaida: criarSorteio(saidas, (n) => this.pesoSaida.get(n)),
      };
      this.destinosPorNo.set(no, destinos);
    }
    return destinos;
  }

  #ehSumidouro(no) {
    return this.grafo.saidas.get(no).every((id) => !this.grafo.estaAcessivel(id));
  }

  #sortearDestino(noAtual) {
    const { internos, sorteioSaida } = this.#destinosDe(noAtual);
    const sairPelaBorda = !sorteioSaida.vazio && (!internos || this.aleatorio() < this.fracaoSaidaPelaBorda);
    if (sairPelaBorda) return sorteioSaida.sortear(this.aleatorio);
    if (!internos) return null;
    return this.malhaPrincipal[Math.floor(this.aleatorio() * this.malhaPrincipal.length)];
  }

  // Inserção segura: ninguém nasce a menos da distância de segurança de outro
  // veículo na mesma aresta, e a velocidade inicial respeita o limite da via e a
  // distância de frenagem até o veículo da frente.
  #velocidadeInicialSegura(aresta, progresso) {
    let folgaFrente = Infinity;
    for (const v of this.veiculos) {
      if (v.rota[v.indice + 1] === aresta.id) {
        // Vem pela aresta anterior e vai entrar nesta: precisa de espaço para frear,
        // pois só "enxerga" este veículo depois de cruzar o cruzamento.
        const atual = this.grafo.arestas.get(v.rota[v.indice]);
        const atras = atual.comprimento - v.progresso + progresso;
        const frenagem = (v.velocidade * v.velocidade) / (2 * DESACELERACAO_CONFORTAVEL);
        if (atras < DISTANCIA_SEGURANCA_FILA + frenagem) return null;
        continue;
      }
      if (v.rota[v.indice] !== aresta.id) continue;
      const distancia = v.progresso - progresso;
      if (Math.abs(distancia) < DISTANCIA_SEGURANCA_FILA) return null;
      if (distancia > 0 && distancia < folgaFrente) folgaFrente = distancia;
    }
    const livre = Math.max(0, folgaFrente - DISTANCIA_SEGURANCA_FILA);
    return Math.min(aresta.velocidade, Math.sqrt(2 * DESACELERACAO_CONFORTAVEL * livre));
  }

  #sortearOrigem() {
    const pelaBorda = !this.sorteioEntrada.vazio &&
      (this.sorteioInterno.vazio || this.aleatorio() < this.fracaoEntradaPelaBorda);
    if (pelaBorda) return { aresta: this.sorteioEntrada.sortear(this.aleatorio), pelaBorda: true };
    if (this.sorteioInterno.vazio) return null;
    return { aresta: this.sorteioInterno.sortear(this.aleatorio), pelaBorda: false };
  }

  #criarVeiculo({ naEntrada = false } = {}) {
    for (let tentativa = 0; tentativa < TENTATIVAS_DE_SORTEIO; tentativa++) {
      const origem = this.#sortearOrigem();
      if (!origem) return null;
      const inicial = origem.aresta;
      // Inserido durante a simulação: começa no início da aresta (quem vem pela
      // borda "entra" no mapa). No preenchimento inicial, já está espalhado nela.
      const progresso = naEntrada ? 0 : this.aleatorio() * inicial.comprimento;
      const velocidade = this.#velocidadeInicialSegura(inicial, progresso);
      if (velocidade == null) continue;
      const veiculo = {
        id: this.proximoId++,
        destino: null,
        rota: [inicial.id],
        indice: 0,
        progresso,
        velocidade,
        inicio: this.tempo,
        status: "circulando",
        evacuando: false,
      };
      if (this.#novaViagem(veiculo, inicial.para)) return veiculo;
    }
    return null;
  }
}

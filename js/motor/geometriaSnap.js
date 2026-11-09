// Projeção geométrica e snap de pontos à malha viária.
import { distanciaMetros } from "../adaptador/carregarMalha.js";

// Projeção ortogonal de P sobre o segmento AB; retorna ponto e fator t ∈ [0, 1].
export function projetarPontoEmSegmento(ponto, pA, pB) {
  const [latP, lonP] = ponto;
  const [latA, lonA] = pA;
  const [latB, lonB] = pB;

  const latMedRad = ((latA + latB) / 2) * (Math.PI / 180);
  const cosLat = Math.cos(latMedRad);

  const dx = (lonB - lonA) * cosLat;
  const dy = latB - latA;
  const comprimentoSq = dx * dx + dy * dy;

  if (comprimentoSq === 0) {
    return { ponto: [latA, lonA], t: 0 };
  }

  const px = (lonP - lonA) * cosLat;
  const py = latP - latA;

  let t = (px * dx + py * dy) / comprimentoSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const latProj = latA + t * (latB - latA);
  const lonProj = lonA + t * (lonB - lonA);

  return { ponto: [latProj, lonProj], t };
}

export function projetarPontoNaMalha(ponto, grafo, raioMaxMetros = 50, trechoIdPreferido = null) {
  let melhor = null;
  let menorDistancia = Infinity;

  const listaTrechos = trechoIdPreferido && grafo.trechos.has(trechoIdPreferido)
    ? [grafo.trechos.get(trechoIdPreferido), ...grafo.trechos.values()]
    : grafo.trechos.values();

  for (const trecho of listaTrechos) {
    const pontos = trecho.meta?.pontos;
    if (!pontos || pontos.length < 2) continue;

    let distAcumulada = 0;
    for (let i = 0; i < pontos.length - 1; i++) {
      const pA = pontos[i];
      const pB = pontos[i + 1];
      const distSeg = distanciaMetros(pA, pB);

      const proj = projetarPontoEmSegmento(ponto, pA, pB);
      const distAoSegmento = distanciaMetros(ponto, proj.ponto);

      if (distAoSegmento < menorDistancia) {
        menorDistancia = distAoSegmento;
        const distTrecho = distAcumulada + proj.t * distSeg;
        melhor = {
          trechoId: trecho.id,
          nome: trecho.meta.nome,
          referencia: trecho.meta.referencia,
          comprimento: trecho.meta.comprimento,
          distancia: Math.max(0, Math.min(trecho.meta.comprimento, distTrecho)),
          fracao: trecho.meta.comprimento > 0 ? Math.max(0, Math.min(1, distTrecho / trecho.meta.comprimento)) : 0,
          coordenadas: proj.ponto,
          distanciaMetros: distAoSegmento,
        };

        // Clique direto na via preferida a < 20 m: match suficiente.
        if (trecho.id === trechoIdPreferido && distAoSegmento < 20) {
          return { valido: true, ...melhor };
        }
      }

      distAcumulada += distSeg;
    }
  }

  if (melhor && menorDistancia <= raioMaxMetros) {
    return { valido: true, ...melhor };
  }

  return {
    valido: false,
    motivo: `Posição fora da malha viária (distância mais próxima: ${Math.round(menorDistancia)}m, máx permitido: ${raioMaxMetros}m).`,
  };
}

/**
 * Snap magnético ao cruzamento (nó) mais próximo do clique.
 * Usado pela ferramenta “Nova ligação” (dois nós).
 *
 * @param {[number, number]} ponto `[lat, lon]`
 * @param {import("./grafo.js").Grafo} grafo
 * @param {number} [raioMaxMetros=40]
 * @returns {{ valido: true, noId: string, coordenadas: [number, number], distanciaMetros: number }
 *   | { valido: false, motivo: string }}
 */
export function snapParaNoMaisProximo(ponto, grafo, raioMaxMetros = 40) {
  let melhor = null;
  let menorDistancia = Infinity;

  for (const no of grafo.nos.values()) {
    if (no.lat == null || no.lon == null) continue;
    const coords = [no.lat, no.lon];
    const d = distanciaMetros(ponto, coords);
    if (d < menorDistancia) {
      menorDistancia = d;
      melhor = { noId: no.id, coordenadas: coords, distanciaMetros: d };
    }
  }

  if (melhor && menorDistancia <= raioMaxMetros) {
    return { valido: true, ...melhor };
  }

  return {
    valido: false,
    motivo: `Nenhuma interseção próxima (distância mais próxima: ${Math.round(menorDistancia)}m, máx permitido: ${raioMaxMetros}m).`,
  };
}

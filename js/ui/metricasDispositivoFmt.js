// Formatação das métricas ao vivo de lombada/semáforo (popup + lista).
import { fmtNumero, fmtTempo } from "./previewImpactoFmt.js";

export function fmtVelKmh(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return "—";
  return `${fmtNumero(kmh)} km/h`;
}

/** Texto compacto: livre → atual. */
export function textoVelocidadeTrecho(velocidade) {
  if (!velocidade) return "Vel. no trecho: —";
  const livre = fmtVelKmh(velocidade.livreKmh);
  if (velocidade.n === 0 || velocidade.atualKmh == null) {
    return `Vel. no trecho: ${livre} (livre) · sem veículos`;
  }
  return `Vel. no trecho: ${livre} → ${fmtVelKmh(velocidade.atualKmh)} (${velocidade.n} veíc.)`;
}

export function textoFilaSemaforo({ filaAtual, filaMax, filaMedia, esperaMedia } = {}) {
  const atual = filaAtual == null ? "—" : String(filaAtual);
  const max = filaMax == null ? "—" : String(filaMax);
  const media = filaMedia == null ? "—" : fmtNumero(filaMedia);
  const espera = esperaMedia == null ? "—" : fmtTempo(esperaMedia);
  return `Fila ${atual} · máx ${max} · média ${media} · espera ${espera}`;
}

export function textoTransbordo(ativo) {
  return ativo ? "Transbordo: fila alcança o cruzamento anterior" : null;
}

/**
 * Texto compacto de fuga de rota (F4) para popup/lista.
 * @param {object | null | undefined} fuga
 */
export function textoFugaDeRota(fuga) {
  if (!fuga) return "Fuga de rota: —";
  if (!fuga.disponivel || fuga.sinal === "aguardando") {
    return "Fuga de rota: coletando baseline…";
  }
  if (fuga.sinal === "fuga" && fuga.fugaEstimada > 0) {
    const n = Math.round(fuga.fugaEstimada);
    const detalhe =
      fuga.volumeDispositivo?.delta != null && fuga.volumeVizinhos?.delta != null
        ? ` · trecho ${fuga.volumeDispositivo.delta > 0 ? "+" : ""}${Math.round(fuga.volumeDispositivo.delta)}, vizinhos ${fuga.volumeVizinhos.delta > 0 ? "+" : ""}${Math.round(fuga.volumeVizinhos.delta)}`
        : "";
    return `Fuga de rota: ~${n} veíc. evitando o trecho${detalhe}`;
  }
  if (fuga.sinal === "insuficiente") {
    return "Fuga de rota: volume caiu no trecho, sem alta clara nos vizinhos";
  }
  return "Fuga de rota: sem desvio de fluxo detectado";
}

/** Formata metros OSRM para exibição (ex.: 4200 → "4,2 km"). Sem valor → "—". */
export function formatarDistancia(distanciaM) {
  if (typeof distanciaM !== "number" || !Number.isFinite(distanciaM) || distanciaM < 0) {
    return "—";
  }
  return (distanciaM / 1000).toFixed(1).replace(".", ",") + " km";
}

/** Formata segundos OSRM para minutos (ex.: 720 → "12 min"). Sem valor → "—". */
export function formatarDuracao(duracaoS) {
  if (typeof duracaoS !== "number" || !Number.isFinite(duracaoS) || duracaoS < 0) {
    return "—";
  }
  return Math.round(duracaoS / 60) + " min";
}

/**
 * Atraso relativo à rota principal, a partir de duracaoS.
 * Primary / sem dados / atraso zero → string vazia (esconde o selo).
 */
export function formatarAtraso(duracaoS, duracaoPrincipalS) {
  if (
    typeof duracaoS !== "number" ||
    typeof duracaoPrincipalS !== "number" ||
    !Number.isFinite(duracaoS) ||
    !Number.isFinite(duracaoPrincipalS)
  ) {
    return "";
  }
  const deltaMin = Math.round((duracaoS - duracaoPrincipalS) / 60);
  if (deltaMin <= 0) {
    return "";
  }
  return "+" + deltaMin + " min";
}

/** Selo textual de robustez da rota. */
export function formatarRobustez(selo) {
  if (selo === "robusta") return "Robusta";
  if (selo === "frágil" || selo === "fragil") return "Frágil";
  return "";
}

/** Classe CSS do selo de robustez. */
export function classeRobustez(selo) {
  if (selo === "robusta") return "tag-robust";
  if (selo === "frágil" || selo === "fragil") return "tag-fragile";
  return "tag-neutral";
}

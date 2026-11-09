// Gerenciamento e validação de malhas e locais simuláveis.

const SENTIDOS_VALIDOS = new Set([-1, 0, 1]);
const MAX_ERROS = 5;
export const CHAVE_LOCAL = "fastflow.local";
const CHAVE_LEGADA = "fastflow.regiao";

function armazenamentoPadrao() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Lê o local persistido (migra a chave legada `fastflow.regiao` se existir). */
export function lerLocalId(idsPermitidos, padrao, storage = armazenamentoPadrao()) {
  const permitidos = new Set(idsPermitidos);
  const fallback = permitidos.has(padrao) ? padrao : [...permitidos][0];
  if (!storage) return fallback;

  let id = null;
  try {
    id = storage.getItem(CHAVE_LOCAL);
    if (!id) {
      const legado = storage.getItem(CHAVE_LEGADA);
      if (legado && permitidos.has(legado)) {
        id = legado;
        storage.setItem(CHAVE_LOCAL, legado);
        storage.removeItem(CHAVE_LEGADA);
      }
    }
  } catch {
    return fallback;
  }

  return permitidos.has(id) ? id : fallback;
}

export function salvarLocalId(id, storage = armazenamentoPadrao()) {
  if (!storage || typeof id !== "string" || id === "") return;
  try {
    storage.setItem(CHAVE_LOCAL, id);
    storage.removeItem(CHAVE_LEGADA);
  } catch {
    /* persistência é best-effort */
  }
}

// Valida o schema GeoJSON da malha viária.
export function validarMalha(geojson) {
  if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    return ["O arquivo não é uma FeatureCollection GeoJSON."];
  }
  if (geojson.features.length === 0) return ["A malha não tem nenhuma via."];

  const erros = [];
  geojson.features.forEach((via, i) => {
    if (erros.length >= MAX_ERROS) return;
    const onde = `Via ${i + 1}`;
    const coords = via?.geometry?.coordinates;
    if (via?.geometry?.type !== "LineString" || !Array.isArray(coords) || coords.length < 2) {
      erros.push(`${onde}: geometria precisa ser uma LineString com 2 ou mais pontos.`);
      return;
    }
    const pontoInvalido = coords.some(
      (c) => !Array.isArray(c) || !(Math.abs(c[0]) <= 180) || !(Math.abs(c[1]) <= 90)
    );
    if (pontoInvalido) erros.push(`${onde}: coordenada fora do formato [longitude, latitude].`);

    const p = via.properties ?? {};
    if (typeof p.tipo !== "string" || p.tipo === "") erros.push(`${onde}: "tipo" ausente.`);
    if (!SENTIDOS_VALIDOS.has(p.sentidoUnico)) erros.push(`${onde}: "sentidoUnico" deve ser -1, 0 ou 1.`);
    if (!(typeof p.velocidade === "number" && p.velocidade > 0)) {
      erros.push(`${onde}: "velocidade" deve ser um número positivo.`);
    }
    if (p.nome !== null && p.nome !== undefined && typeof p.nome !== "string") {
      erros.push(`${onde}: "nome" deve ser texto.`);
    }
  });
  return erros.slice(0, MAX_ERROS);
}

// Valida o cadastro de locais (data/locais.json).
export function validarCadastro(cadastro) {
  if (!Array.isArray(cadastro?.locais) || cadastro.locais.length === 0) {
    return ["O cadastro não tem nenhum local."];
  }
  const erros = [];
  const ids = new Set();
  for (const local of cadastro.locais) {
    const nome = local?.nome ?? local?.id ?? "?";
    if (typeof local?.id !== "string" || ids.has(local.id)) erros.push(`Local "${nome}": id ausente ou repetido.`);
    ids.add(local?.id);
    if (typeof local?.nome !== "string") erros.push(`Local "${nome}": nome ausente.`);
    if (typeof local?.arquivo !== "string") erros.push(`Local "${nome}": arquivo da malha ausente.`);
    const [sw, ne] = local?.limites ?? [];
    const limitesOk =
      [sw, ne].every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
      sw[0] < ne[0] && sw[1] < ne[1];
    if (!limitesOk) erros.push(`Local "${nome}": limites devem ser [[sul, oeste], [norte, leste]].`);
  }
  if (cadastro.padrao !== undefined && !ids.has(cadastro.padrao)) {
    erros.push(`Local padrão "${cadastro.padrao}" não está no cadastro.`);
  }
  return erros;
}

export async function carregarLocais(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Não foi possível carregar a lista de locais (${resposta.status}).`);
  const cadastro = await resposta.json();
  const erros = validarCadastro(cadastro);
  if (erros.length) throw new Error(`Cadastro de locais inválido: ${erros.join(" ")}`);
  return {
    locais: cadastro.locais,
    padrao: cadastro.padrao ?? cadastro.locais[0].id,
  };
}

const cache = new Map();

export async function carregarMalhaDoLocal(local) {
  if (cache.has(local.arquivo)) return cache.get(local.arquivo);
  const resposta = await fetch(local.arquivo);
  if (!resposta.ok) throw new Error(`Não foi possível carregar a malha de ${local.nome} (${resposta.status}).`);
  const geojson = await resposta.json();
  const erros = validarMalha(geojson);
  if (erros.length) throw new Error(`A malha de ${local.nome} está fora do padrão: ${erros.join(" ")}`);
  cache.set(local.arquivo, geojson);
  return geojson;
}

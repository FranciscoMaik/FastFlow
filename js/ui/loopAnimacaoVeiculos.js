const PASSO_FISICA_SEGUNDOS = 1 / 30;

export function criarLoopAnimacaoVeiculos({
  controle,
  camadaVeiculos,
  estaRodando = () => true,
  aoAtualizar = () => {},
  intervaloAtualizacaoMs = 250,
}) {
  let quadroId = null;
  let ultimoQuadro = null;
  let ultimoPainel = 0;
  let acumulador = 0;
  let anteriores = controle.veiculos();
  let atuais = anteriores;

  function renderizar(agora) {
    if (document.hidden) {
      quadroId = null;
      ultimoQuadro = null;
      acumulador = 0;
      return;
    }

    const decorrido = ultimoQuadro === null ? 0 : Math.min((agora - ultimoQuadro) / 1000, 0.1);
    ultimoQuadro = agora;

    if (estaRodando()) {
      acumulador += decorrido;
      while (acumulador >= PASSO_FISICA_SEGUNDOS) {
        anteriores = atuais;
        controle.avancar(PASSO_FISICA_SEGUNDOS);
        atuais = controle.veiculos();
        acumulador -= PASSO_FISICA_SEGUNDOS;
      }
    } else {
      acumulador = 0;
      atuais = controle.veiculos();
      anteriores = atuais;
    }

    const alpha = estaRodando() ? acumulador / PASSO_FISICA_SEGUNDOS : 1;
    const anterioresPorId = new Map(anteriores.map((veiculo) => [veiculo.id, veiculo]));
    const interpolados = atuais.map((veiculo) => {
      const anterior = anterioresPorId.get(veiculo.id);
      if (!anterior || anterior.arestaId !== veiculo.arestaId) return veiculo;
      return {
        ...veiculo,
        lat: anterior.lat + (veiculo.lat - anterior.lat) * alpha,
        lon: anterior.lon + (veiculo.lon - anterior.lon) * alpha,
      };
    });
    camadaVeiculos.atualizar(interpolados);

    if (agora - ultimoPainel >= intervaloAtualizacaoMs) {
      ultimoPainel = agora;
      aoAtualizar();
    }
    quadroId = requestAnimationFrame(renderizar);
  }

  function iniciar() {
    if (document.hidden || quadroId !== null) return;
    ultimoQuadro = null;
    quadroId = requestAnimationFrame(renderizar);
  }

  function aoMudarVisibilidade() {
    if (document.hidden) {
      if (quadroId !== null) cancelAnimationFrame(quadroId);
      quadroId = null;
      ultimoQuadro = null;
      acumulador = 0;
      return;
    }
    iniciar();
  }

  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  iniciar();

  return {
    parar() {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      if (quadroId !== null) cancelAnimationFrame(quadroId);
      quadroId = null;
    },
  };
}

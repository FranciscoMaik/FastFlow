// Mapa do OpenStreetMap (Leaflet). Abre no centro do Brasil e, se o navegador
// liberar a localização do usuário, recentraliza nela.
(function () {
  const CENTRO_PADRAO = [-15.78, -47.93];
  const ZOOM_PADRAO = 5;
  const ZOOM_USUARIO = 17;

  const mapa = L.map("mapa").setView(CENTRO_PADRAO, ZOOM_PADRAO);

  // Tiles do OpenStreetMap. A política de uso exige um Referer válido; forçar a
  // política aqui evita que extensões/configurações de privacidade o removam.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  if (!navigator.geolocation) {
    return;
  }

  let marcador = null;
  let circuloPrecisao = null;
  let melhorPrecisao = Infinity;
  let usuarioMoveuMapa = false;

  mapa.on("dragstart", function () {
    usuarioMoveuMapa = true;
  });

  // A primeira leitura costuma ser aproximada (rede/IP). Acompanha as seguintes
  // para refinar a posição. O círculo mostra a margem de erro informada pelo navegador.
  // Se a permissão for negada ou a localização falhar, o mapa fica no centro padrão.
  navigator.geolocation.watchPosition(
    function (posicao) {
      const local = [posicao.coords.latitude, posicao.coords.longitude];
      const precisao = posicao.coords.accuracy;
      const texto = "Você está aqui<br>Margem de erro: ~" + Math.round(precisao) + " m";

      if (marcador) {
        marcador.setLatLng(local).setPopupContent(texto);
        circuloPrecisao.setLatLng(local).setRadius(precisao);
      } else {
        marcador = L.marker(local).addTo(mapa).bindPopup(texto);
        circuloPrecisao = L.circle(local, { radius: precisao, weight: 1 }).addTo(mapa);
      }

      // Só reposiciona a tela quando a leitura melhora e o usuário não arrastou o mapa.
      if (precisao < melhorPrecisao) {
        melhorPrecisao = precisao;
        if (!usuarioMoveuMapa) {
          mapa.fitBounds(circuloPrecisao.getBounds(), { maxZoom: ZOOM_USUARIO });
        }
      }
    },
    function (erro) {
      console.info("Localização indisponível:", erro.message);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
})();

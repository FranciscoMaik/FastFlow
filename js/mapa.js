// Mapa do OpenStreetMap (Leaflet). Abre no centro do Brasil e, se o navegador
// liberar a localização do usuário, recentraliza nela.
(function () {
  const CENTRO_PADRAO = [-15.78, -47.93];
  const ZOOM_PADRAO = 5;
  const ZOOM_USUARIO = 15;

  const mapa = L.map("mapa").setView(CENTRO_PADRAO, ZOOM_PADRAO);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  if (!navigator.geolocation) {
    return;
  }

  // Se a permissão for negada ou a localização falhar, o mapa fica no centro padrão.
  navigator.geolocation.getCurrentPosition(
    function (posicao) {
      const local = [posicao.coords.latitude, posicao.coords.longitude];
      mapa.setView(local, ZOOM_USUARIO);
      L.marker(local).addTo(mapa).bindPopup("Você está aqui");
    },
    function (erro) {
      console.info("Localização indisponível:", erro.message);
    },
    { timeout: 10000, maximumAge: 60000 }
  );
})();

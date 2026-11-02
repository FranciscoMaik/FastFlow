// Marca como ativo o link do menu superior e do menu lateral
// correspondentes à página atual.
(function () {
  const currentPage = window.location.pathname.split("/").pop() || "pagina1.html";

  document.querySelectorAll(".topbar nav a, .sidebar a").forEach(function (link) {
    const target = link.getAttribute("href");
    if (target === currentPage) {
      link.classList.add("active");
    }
  });
})();

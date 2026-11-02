// Marca como ativo o link do menu superior e do menu lateral
// correspondentes à página atual.
(function () {
  // Remove a extensão .html: com "cleanUrls" na Vercel a URL vira "/pagina1".
  function normalize(name) {
    return name.replace(/\.html$/, "");
  }

  const currentPage = normalize(window.location.pathname.split("/").pop() || "pagina1");

  document.querySelectorAll(".topbar nav a, .sidebar a").forEach(function (link) {
    const target = normalize(link.getAttribute("href") || "");
    if (target === currentPage) {
      link.classList.add("active");
    }
  });
})();

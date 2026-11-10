import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, "..");
const PORTA = 8000;

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const servidor = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const urlLimpa = decodeURIComponent(req.url.split("?")[0]);
  let caminhoRelativo = urlLimpa === "/" ? "/pagina2.html" : urlLimpa;
  let arquivo = path.join(raiz, caminhoRelativo);

  fs.stat(arquivo, (erro, stats) => {
    if (erro || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Não Encontrado");
      return;
    }

    const ext = path.extname(arquivo).toLowerCase();
    const mime = MIMES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(arquivo).pipe(res);
  });
});

servidor.listen(PORTA, () => {
  console.log(`Servidor FastFlow rodando em http://localhost:${PORTA}/pagina2.html`);
});

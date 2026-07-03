/*
 * Servidor estático mínimo para hospedar o app (Railway, Render etc.).
 * Sem dependências externas: usa apenas os módulos nativos do Node.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORTA = process.env.PORT || 3000;
const RAIZ = __dirname;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

const servidor = http.createServer((requisicao, resposta) => {
  let caminho = decodeURIComponent(new URL(requisicao.url, "http://x").pathname);
  if (caminho === "/") caminho = "/index.html";

  const arquivo = path.join(RAIZ, path.normalize(caminho));
  // impede acesso fora da pasta do projeto
  if (!arquivo.startsWith(RAIZ)) {
    resposta.writeHead(403);
    return resposta.end("Acesso negado");
  }

  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      resposta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return resposta.end("Página não encontrada");
    }
    const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream";
    resposta.writeHead(200, { "Content-Type": tipo });
    resposta.end(conteudo);
  });
});

servidor.listen(PORTA, () => {
  console.log("Controle de Aula Eventual rodando na porta " + PORTA);
});

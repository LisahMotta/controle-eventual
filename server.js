/*
 * Servidor do Controle de Aula Eventual.
 *
 * Serve os arquivos do app e expõe a API de registros:
 *   GET    /api/registros            lista todos os registros
 *   POST   /api/registros            cria ou atualiza um registro
 *   DELETE /api/registros/:id        exclui um registro
 *   POST   /api/registros/importar   importa vários registros (backup)
 *   GET    /api/sessao               confere o código de acesso
 *
 * Com a variável APP_SENHA definida, a API exige o código de acesso no
 * cabeçalho X-Codigo-Acesso (o app pede o código na primeira visita).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const armazenamento = require("./armazenamento");

const PORTA = process.env.PORT || 3000;
const RAIZ = __dirname;
const SENHA = process.env.APP_SENHA || "";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

function responderJson(resposta, codigo, dados) {
  resposta.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  resposta.end(JSON.stringify(dados));
}

function lerCorpo(requisicao) {
  return new Promise((resolver, rejeitar) => {
    let corpo = "";
    requisicao.on("data", pedaco => {
      corpo += pedaco;
      if (corpo.length > 5 * 1024 * 1024) {
        rejeitar(new Error("corpo grande demais"));
        requisicao.destroy();
      }
    });
    requisicao.on("end", () => {
      try {
        resolver(corpo ? JSON.parse(corpo) : {});
      } catch (e) {
        rejeitar(new Error("JSON inválido"));
      }
    });
    requisicao.on("error", rejeitar);
  });
}

function autorizado(requisicao) {
  if (!SENHA) return true;
  return requisicao.headers["x-codigo-acesso"] === SENHA;
}

function validarRegistro(r) {
  if (!r || typeof r !== "object") return null;
  const texto = v => String(v == null ? "" : v).trim().slice(0, 200);
  const registro = {
    id: texto(r.id) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
    nomeEventual: texto(r.nomeEventual),
    cpfEventual: texto(r.cpfEventual),
    data: texto(r.data),
    serie: texto(r.serie),
    disciplina: texto(r.disciplina),
    qtdAulas: Math.min(20, Math.max(1, parseInt(r.qtdAulas, 10) || 1)),
    nomeProfessor: texto(r.nomeProfessor),
    cpfProfessor: texto(r.cpfProfessor)
  };
  if (!registro.nomeEventual || !registro.cpfEventual ||
      !/^\d{4}-\d{2}-\d{2}$/.test(registro.data)) return null;
  return registro;
}

async function tratarApi(requisicao, resposta, caminho) {
  if (!autorizado(requisicao)) {
    return responderJson(resposta, 401, { erro: "Código de acesso incorreto ou ausente." });
  }

  if (caminho === "/api/sessao" && requisicao.method === "GET") {
    return responderJson(resposta, 200, { ok: true, armazenamento: armazenamento.tipo });
  }

  if (caminho === "/api/registros" && requisicao.method === "GET") {
    return responderJson(resposta, 200, await armazenamento.listar());
  }

  if (caminho === "/api/registros" && requisicao.method === "POST") {
    const registro = validarRegistro(await lerCorpo(requisicao));
    if (!registro) return responderJson(resposta, 400, { erro: "Registro inválido." });
    await armazenamento.salvar(registro);
    return responderJson(resposta, 200, registro);
  }

  const excluir = caminho.match(/^\/api\/registros\/([\w-]+)$/);
  if (excluir && requisicao.method === "DELETE") {
    const encontrou = await armazenamento.excluir(excluir[1]);
    return responderJson(resposta, encontrou ? 200 : 404,
      encontrou ? { ok: true } : { erro: "Registro não encontrado." });
  }

  if (caminho === "/api/registros/importar" && requisicao.method === "POST") {
    const corpo = await lerCorpo(requisicao);
    const lista = Array.isArray(corpo.registros) ? corpo.registros : [];
    const validos = lista.map(validarRegistro).filter(Boolean);
    if (!validos.length) {
      return responderJson(resposta, 400, { erro: "Nenhum registro válido no arquivo." });
    }
    await armazenamento.importar(validos, corpo.substituir === true);
    return responderJson(resposta, 200, { ok: true, importados: validos.length });
  }

  responderJson(resposta, 404, { erro: "Rota não encontrada." });
}

function servirArquivo(resposta, caminho) {
  if (caminho === "/") caminho = "/index.html";
  const arquivo = path.join(RAIZ, path.normalize(caminho));
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
}

const servidor = http.createServer(async (requisicao, resposta) => {
  const caminho = decodeURIComponent(new URL(requisicao.url, "http://x").pathname);
  try {
    if (caminho.startsWith("/api/")) {
      await tratarApi(requisicao, resposta, caminho);
    } else {
      servirArquivo(resposta, caminho);
    }
  } catch (erro) {
    console.error("Erro:", erro.message);
    if (!resposta.headersSent) {
      responderJson(resposta, 500, { erro: "Erro interno do servidor." });
    }
  }
});

servidor.listen(PORTA, () => {
  console.log("Controle de Aula Eventual rodando na porta " + PORTA +
    " | armazenamento: " + armazenamento.tipo +
    " | código de acesso: " + (SENHA ? "ativado" : "desativado"));
});

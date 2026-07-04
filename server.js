/*
 * Servidor do Controle de Aula Eventual.
 *
 * Serve os arquivos do app e expõe a API:
 *   GET    /api/registros | /api/eventuais | /api/professores
 *   POST   /api/registros | /api/eventuais | /api/professores
 *   DELETE /api/registros/:id | /api/eventuais/:id | /api/professores/:id
 *   POST   /api/importar          importa uma cópia de segurança
 *   GET    /api/sessao            confere o código de acesso
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

// ===================== Validação =====================

function texto(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 200);
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function validarRegistro(r) {
  if (!r || typeof r !== "object") return null;
  const registro = {
    id: texto(r.id) || novoId(),
    nomeEventual: texto(r.nomeEventual),
    cpfEventual: texto(r.cpfEventual, 20),
    data: texto(r.data, 10),
    serie: texto(r.serie, 60),
    disciplina: texto(r.disciplina, 80),
    qtdAulas: Math.min(10, Math.max(1, parseInt(r.qtdAulas, 10) || 1)),
    nomeProfessor: texto(r.nomeProfessor),
    cpfProfessor: texto(r.cpfProfessor, 20)
  };
  if (!registro.nomeEventual || !registro.cpfEventual ||
      !/^\d{4}-\d{2}-\d{2}$/.test(registro.data)) return null;
  return registro;
}

function validarEventual(e) {
  if (!e || typeof e !== "object") return null;
  const eventual = {
    id: texto(e.id) || novoId(),
    nome: texto(e.nome),
    cpf: texto(e.cpf, 20)
  };
  if (!eventual.nome || !eventual.cpf) return null;
  return eventual;
}

function validarProfessor(p) {
  if (!p || typeof p !== "object") return null;
  const series = Array.isArray(p.series)
    ? p.series.map(s => texto(s, 60)).filter(Boolean).slice(0, 60)
    : [];
  const professor = {
    id: texto(p.id) || novoId(),
    nome: texto(p.nome),
    cpf: texto(p.cpf, 20),
    disciplina: texto(p.disciplina, 80),
    series: series
  };
  if (!professor.nome || !professor.cpf || !professor.disciplina) return null;
  return professor;
}

const VALIDADORES = {
  registros: validarRegistro,
  eventuais: validarEventual,
  professores: validarProfessor
};

// ===================== API =====================

async function tratarApi(requisicao, resposta, caminho) {
  if (!autorizado(requisicao)) {
    return responderJson(resposta, 401, { erro: "Código de acesso incorreto ou ausente." });
  }

  if (caminho === "/api/sessao" && requisicao.method === "GET") {
    return responderJson(resposta, 200, { ok: true, armazenamento: armazenamento.tipo });
  }

  // Importação de cópia de segurança: aceita o formato novo
  // { registros, eventuais, professores } e o antigo (lista de registros).
  if ((caminho === "/api/importar" || caminho === "/api/registros/importar") &&
      requisicao.method === "POST") {
    const corpo = await lerCorpo(requisicao);
    const brutos = Array.isArray(corpo.registros) && !corpo.eventuais && !corpo.professores
      ? { registros: corpo.registros }
      : corpo;
    const dados = {};
    let totalImportados = 0;
    for (const nome of Object.keys(VALIDADORES)) {
      const lista = Array.isArray(brutos[nome]) ? brutos[nome] : [];
      dados[nome] = lista.map(VALIDADORES[nome]).filter(Boolean);
      totalImportados += dados[nome].length;
    }
    if (!totalImportados) {
      return responderJson(resposta, 400, { erro: "Nenhum dado válido no arquivo." });
    }
    await armazenamento.importar(dados, corpo.substituir === true);
    return responderJson(resposta, 200, { ok: true, importados: totalImportados });
  }

  const partes = caminho.match(/^\/api\/(registros|eventuais|professores)(?:\/([\w-]+))?$/);
  if (partes) {
    const colecao = partes[1];
    const id = partes[2];

    if (!id && requisicao.method === "GET") {
      return responderJson(resposta, 200, await armazenamento.listar(colecao));
    }

    if (!id && requisicao.method === "POST") {
      const item = VALIDADORES[colecao](await lerCorpo(requisicao));
      if (!item) return responderJson(resposta, 400, { erro: "Dados incompletos ou inválidos." });
      await armazenamento.salvar(colecao, item);
      return responderJson(resposta, 200, item);
    }

    if (id && requisicao.method === "DELETE") {
      const encontrou = await armazenamento.excluir(colecao, id);
      return responderJson(resposta, encontrou ? 200 : 404,
        encontrou ? { ok: true } : { erro: "Item não encontrado." });
    }
  }

  responderJson(resposta, 404, { erro: "Rota não encontrada." });
}

// ===================== Arquivos estáticos =====================

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

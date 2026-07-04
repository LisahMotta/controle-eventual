/*
 * Servidor do Controle de Aula Eventual.
 *
 * Serve os arquivos do app e expõe a API com login por perfil:
 *   GET    /api/estado             (público) diz se precisa configurar
 *   POST   /api/setup              (público, só na 1ª vez) cria o GOE
 *   POST   /api/login              (público) devolve o token
 *   GET    /api/sessao             dados do usuário logado
 *   GET/POST/DELETE registros | eventuais | professores | usuarios
 *   GET    /api/auditoria          log de acessos (só GOE)
 *   POST   /api/importar           importa uma cópia de segurança
 *
 * Autenticação por token assinado no cabeçalho Authorization: Bearer <token>.
 * Perfis: GOE (master), Secretário (master de dados), AOE (cadastra
 * eventuais e lança aulas).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const armazenamento = require("./armazenamento");
const auth = require("./auth");

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

function texto(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 200);
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function ipDaRequisicao(requisicao) {
  return (requisicao.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    requisicao.socket.remoteAddress || "";
}

// ===================== Validação de dados =====================

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

// ===================== Usuários e auditoria =====================

function usuarioPublico(u) {
  return { id: u.id, nome: u.nome, usuario: u.usuario, perfil: u.perfil, criadoEm: u.criadoEm };
}

async function auditar(nomeUsuario, acao, detalhe) {
  try {
    await armazenamento.salvar("auditoria", {
      id: novoId(),
      dataHora: new Date().toISOString(),
      usuario: nomeUsuario || "—",
      acao: texto(acao, 60),
      detalhe: texto(detalhe, 300)
    });
  } catch (e) {
    console.error("auditoria:", e.message);
  }
}

// Verifica o token e devolve o usuário atual (ou null).
function usuarioDaRequisicao(requisicao) {
  const cabecalho = requisicao.headers["authorization"] || "";
  const token = cabecalho.replace(/^Bearer\s+/i, "");
  return auth.verificarToken(token);
}

// ===================== Rotas públicas =====================

async function tratarPublica(requisicao, resposta, caminho) {
  if (caminho === "/api/estado" && requisicao.method === "GET") {
    const usuarios = await armazenamento.listar("usuarios");
    return responderJson(resposta, 200, {
      precisaConfigurar: usuarios.length === 0,
      armazenamento: armazenamento.tipo
    });
  }

  if (caminho === "/api/setup" && requisicao.method === "POST") {
    const usuarios = await armazenamento.listar("usuarios");
    if (usuarios.length > 0) {
      return responderJson(resposta, 409, { erro: "O sistema já foi configurado." });
    }
    const corpo = await lerCorpo(requisicao);
    const nome = texto(corpo.nome);
    const usuario = texto(corpo.usuario, 40).toLowerCase();
    const senha = String(corpo.senha || "");
    if (!nome || !usuario || senha.length < 4) {
      return responderJson(resposta, 400, {
        erro: "Preencha nome, usuário e uma senha de pelo menos 4 caracteres."
      });
    }
    const novo = {
      id: novoId(), nome: nome, usuario: usuario,
      senha: auth.hashSenha(senha), perfil: "GOE",
      criadoEm: new Date().toISOString()
    };
    await armazenamento.salvar("usuarios", novo);
    await auditar(nome, "Configuração inicial", "Criou o usuário GOE (administrador)");
    const token = auth.gerarToken({ id: novo.id, nome: novo.nome, perfil: novo.perfil });
    return responderJson(resposta, 200, { token: token, usuario: usuarioPublico(novo) });
  }

  if (caminho === "/api/login" && requisicao.method === "POST") {
    const corpo = await lerCorpo(requisicao);
    const usuario = texto(corpo.usuario, 40).toLowerCase();
    const senha = String(corpo.senha || "");
    const usuarios = await armazenamento.listar("usuarios");
    const encontrado = usuarios.find(u => u.usuario === usuario);
    if (!encontrado || !auth.conferirSenha(senha, encontrado.senha)) {
      return responderJson(resposta, 401, { erro: "Usuário ou senha incorretos." });
    }
    await auditar(encontrado.nome, "Login",
      "Perfil " + encontrado.perfil + " · IP " + ipDaRequisicao(requisicao));
    const token = auth.gerarToken({
      id: encontrado.id, nome: encontrado.nome, perfil: encontrado.perfil
    });
    return responderJson(resposta, 200, { token: token, usuario: usuarioPublico(encontrado) });
  }

  return false; // não é rota pública
}

// ===================== Rotas autenticadas =====================

async function tratarAutenticada(requisicao, resposta, caminho, atual) {
  const permissoes = auth.permissoes(atual.perfil);

  if (caminho === "/api/sessao" && requisicao.method === "GET") {
    return responderJson(resposta, 200, {
      usuario: { id: atual.id, nome: atual.nome, perfil: atual.perfil },
      permissoes: permissoes,
      armazenamento: armazenamento.tipo
    });
  }

  // ---- Usuários (GOE e Secretário) ----
  const rotaUsuario = caminho.match(/^\/api\/usuarios(?:\/([\w-]+))?$/);
  if (rotaUsuario) {
    if (!permissoes.gerenciarUsuarios) {
      return responderJson(resposta, 403, { erro: "Você não tem permissão para gerenciar usuários." });
    }
    return tratarUsuarios(requisicao, resposta, rotaUsuario[1], atual);
  }

  // ---- Auditoria (só GOE) ----
  if (caminho === "/api/auditoria" && requisicao.method === "GET") {
    if (!permissoes.verAuditoria) {
      return responderJson(resposta, 403, { erro: "Apenas o GOE pode ver a auditoria." });
    }
    const registros = await armazenamento.listar("auditoria");
    return responderJson(resposta, 200, registros.reverse().slice(0, 500)); // mais recentes primeiro
  }

  // ---- Importação de cópia de segurança ----
  if (caminho === "/api/importar" && requisicao.method === "POST") {
    if (!permissoes.alterarDados) {
      return responderJson(resposta, 403, { erro: "Você não tem permissão para importar dados." });
    }
    const corpo = await lerCorpo(requisicao);
    const brutos = Array.isArray(corpo.registros) && !corpo.eventuais && !corpo.professores
      ? { registros: corpo.registros }
      : corpo;
    const dados = {};
    let total = 0;
    for (const nome of Object.keys(VALIDADORES)) {
      const lista = Array.isArray(brutos[nome]) ? brutos[nome] : [];
      dados[nome] = lista.map(VALIDADORES[nome]).filter(Boolean);
      total += dados[nome].length;
    }
    if (!total) return responderJson(resposta, 400, { erro: "Nenhum dado válido no arquivo." });
    await armazenamento.importar(dados, corpo.substituir === true);
    await auditar(atual.nome, "Importação", total + " item(ns)" +
      (corpo.substituir ? " (substituindo tudo)" : ""));
    return responderJson(resposta, 200, { ok: true, importados: total });
  }

  // ---- Registros / eventuais / professores ----
  const rota = caminho.match(/^\/api\/(registros|eventuais|professores)(?:\/([\w-]+))?$/);
  if (rota) {
    return tratarColecao(requisicao, resposta, rota[1], rota[2], atual, permissoes);
  }

  responderJson(resposta, 404, { erro: "Rota não encontrada." });
}

async function tratarUsuarios(requisicao, resposta, id, atual) {
  if (!id && requisicao.method === "GET") {
    const usuarios = await armazenamento.listar("usuarios");
    return responderJson(resposta, 200, usuarios.map(usuarioPublico));
  }

  if (!id && requisicao.method === "POST") {
    const corpo = await lerCorpo(requisicao);
    const nome = texto(corpo.nome);
    const usuario = texto(corpo.usuario, 40).toLowerCase();
    const perfil = texto(corpo.perfil, 20);
    const senha = String(corpo.senha || "");
    const editando = texto(corpo.id);

    if (!nome || !usuario || auth.PERFIS.indexOf(perfil) < 0) {
      return responderJson(resposta, 400, { erro: "Preencha nome, usuário e um perfil válido." });
    }
    if (!editando && senha.length < 4) {
      return responderJson(resposta, 400, { erro: "A senha precisa ter pelo menos 4 caracteres." });
    }

    const usuarios = await armazenamento.listar("usuarios");

    // login único
    if (usuarios.some(u => u.usuario === usuario && u.id !== editando)) {
      return responderJson(resposta, 409, { erro: "Já existe um usuário com esse login." });
    }
    // só um GOE e um Secretário
    if (auth.PERFIS_UNICOS.indexOf(perfil) >= 0 &&
        usuarios.some(u => u.perfil === perfil && u.id !== editando)) {
      return responderJson(resposta, 409, { erro: "Já existe um usuário com o perfil " + perfil + "." });
    }

    let registro;
    if (editando) {
      const anterior = usuarios.find(u => u.id === editando);
      if (!anterior) return responderJson(resposta, 404, { erro: "Usuário não encontrado." });
      // impede tirar o último GOE
      if (anterior.perfil === "GOE" && perfil !== "GOE" &&
          usuarios.filter(u => u.perfil === "GOE").length === 1) {
        return responderJson(resposta, 409, { erro: "É preciso manter ao menos um usuário GOE." });
      }
      registro = {
        id: editando, nome: nome, usuario: usuario, perfil: perfil,
        senha: senha.length >= 4 ? auth.hashSenha(senha) : anterior.senha,
        criadoEm: anterior.criadoEm
      };
    } else {
      registro = {
        id: novoId(), nome: nome, usuario: usuario, perfil: perfil,
        senha: auth.hashSenha(senha), criadoEm: new Date().toISOString()
      };
    }
    await armazenamento.salvar("usuarios", registro);
    await auditar(atual.nome, editando ? "Editou usuário" : "Criou usuário",
      nome + " (" + perfil + ")");
    return responderJson(resposta, 200, usuarioPublico(registro));
  }

  if (id && requisicao.method === "DELETE") {
    const usuarios = await armazenamento.listar("usuarios");
    const alvo = usuarios.find(u => u.id === id);
    if (!alvo) return responderJson(resposta, 404, { erro: "Usuário não encontrado." });
    if (alvo.id === atual.id) {
      return responderJson(resposta, 409, { erro: "Você não pode excluir o seu próprio usuário." });
    }
    if (alvo.perfil === "GOE" && usuarios.filter(u => u.perfil === "GOE").length === 1) {
      return responderJson(resposta, 409, { erro: "É preciso manter ao menos um usuário GOE." });
    }
    await armazenamento.excluir("usuarios", id);
    await auditar(atual.nome, "Excluiu usuário", alvo.nome + " (" + alvo.perfil + ")");
    return responderJson(resposta, 200, { ok: true });
  }

  responderJson(resposta, 405, { erro: "Método não permitido." });
}

async function tratarColecao(requisicao, resposta, colecao, id, atual, permissoes) {
  // Leitura: qualquer usuário autenticado (precisa para preencher as listas)
  if (!id && requisicao.method === "GET") {
    return responderJson(resposta, 200, await armazenamento.listar(colecao));
  }

  if (!id && requisicao.method === "POST") {
    const item = VALIDADORES[colecao](await lerCorpo(requisicao));
    if (!item) return responderJson(resposta, 400, { erro: "Dados incompletos ou inválidos." });

    const existentes = await armazenamento.listar(colecao);
    const ehEdicao = existentes.some(x => x.id === item.id);

    if (!podeEscrever(colecao, permissoes, ehEdicao)) {
      return responderJson(resposta, 403, { erro: mensagemPermissao(colecao, ehEdicao) });
    }

    await armazenamento.salvar(colecao, item);
    await auditar(atual.nome, (ehEdicao ? "Editou " : "Cadastrou ") + singular(colecao),
      descricaoItem(colecao, item));
    return responderJson(resposta, 200, item);
  }

  if (id && requisicao.method === "DELETE") {
    if (!podeEscrever(colecao, permissoes, true)) {
      return responderJson(resposta, 403, { erro: mensagemPermissao(colecao, true) });
    }
    const encontrou = await armazenamento.excluir(colecao, id);
    if (encontrou) await auditar(atual.nome, "Excluiu " + singular(colecao), "id " + id);
    return responderJson(resposta, encontrou ? 200 : 404,
      encontrou ? { ok: true } : { erro: "Item não encontrado." });
  }

  responderJson(resposta, 405, { erro: "Método não permitido." });
}

function podeEscrever(colecao, permissoes, ehEdicao) {
  if (colecao === "professores") return permissoes.gerenciarProfessores;
  // registros e eventuais: criar é liberado; editar/excluir exige alterarDados
  return ehEdicao ? permissoes.alterarDados : true;
}

function mensagemPermissao(colecao, ehEdicao) {
  if (colecao === "professores") return "Apenas GOE e Secretário podem gerenciar professores.";
  return ehEdicao
    ? "Apenas GOE e Secretário podem alterar ou excluir dados já cadastrados."
    : "Você não tem permissão para esta ação.";
}

function singular(colecao) {
  return { registros: "aula", eventuais: "eventual", professores: "professor" }[colecao] || colecao;
}

function descricaoItem(colecao, item) {
  if (colecao === "registros") {
    return item.nomeEventual + " · " + item.data + " · " + item.disciplina;
  }
  return item.nome + (item.cpf ? " · " + item.cpf : "");
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
      const respondida = await tratarPublica(requisicao, resposta, caminho);
      if (respondida === false) {
        const atual = usuarioDaRequisicao(requisicao);
        if (!atual) {
          return responderJson(resposta, 401, { erro: "Faça login para continuar." });
        }
        await tratarAutenticada(requisicao, resposta, caminho, atual);
      }
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
    " | segredo fixo: " + (process.env.APP_SEGREDO ? "sim" : "não (temporário)"));
});

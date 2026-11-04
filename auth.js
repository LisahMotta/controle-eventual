/*
 * Autenticação e permissões, sem dependências externas.
 *
 * - Senhas são guardadas como "salt:hash" usando scrypt.
 * - A sessão é um token assinado (HMAC) e sem estado no servidor.
 *   Defina APP_SEGREDO no ambiente para que os tokens continuem
 *   válidos entre reinícios; sem ele, um segredo aleatório é gerado
 *   a cada início (as pessoas precisam entrar de novo após um deploy).
 */
const crypto = require("crypto");

const SEGREDO = process.env.APP_SEGREDO || crypto.randomBytes(32).toString("hex");
const HORAS_VALIDADE = 12;

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(senha), salt, 64).toString("hex");
  return salt + ":" + hash;
}

function conferirSenha(senha, armazenado) {
  const partes = String(armazenado || "").split(":");
  if (partes.length !== 2) return false;
  const hash = crypto.scryptSync(String(senha), partes[0], 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(partes[1], "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function gerarToken(payload) {
  const dados = Object.assign({}, payload, {
    exp: Date.now() + HORAS_VALIDADE * 3600 * 1000
  });
  const corpo = Buffer.from(JSON.stringify(dados)).toString("base64url");
  const assinatura = crypto.createHmac("sha256", SEGREDO).update(corpo).digest("base64url");
  return corpo + "." + assinatura;
}

function verificarToken(token) {
  if (!token) return null;
  const partes = String(token).split(".");
  if (partes.length !== 2) return null;
  const esperado = crypto.createHmac("sha256", SEGREDO).update(partes[0]).digest("base64url");
  const a = Buffer.from(partes[1]);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let dados;
  try {
    dados = JSON.parse(Buffer.from(partes[0], "base64url").toString());
  } catch (e) {
    return null;
  }
  if (!dados.exp || dados.exp < Date.now()) return null;
  return dados;
}

// Perfis: GOE (administrador master), Secretário (master de dados),
// AOE (apenas cadastra eventuais e lança aulas).
const PERFIS = ["GOE", "Secretário", "AOE"];
const PERFIS_UNICOS = ["GOE", "Secretário"]; // só pode existir um de cada

function permissoes(perfil) {
  const master = perfil === "GOE" || perfil === "Secretário";
  return {
    lancarAulas: true,        // registrar aulas (todos)
    criarEventual: true,      // cadastrar eventuais (todos)
    alterarDados: master,     // editar/excluir eventuais e registros
    gerenciarProfessores: master,
    gerenciarUsuarios: master,
    verAuditoria: perfil === "GOE"
  };
}

module.exports = {
  hashSenha, conferirSenha, gerarToken, verificarToken,
  permissoes, PERFIS, PERFIS_UNICOS
};

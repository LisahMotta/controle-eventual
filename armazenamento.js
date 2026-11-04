/*
 * Camada de armazenamento: registros de aula, eventuais, professores,
 * usuários e log de auditoria.
 *
 * - Com a variável de ambiente DATABASE_URL definida (Railway/PostgreSQL),
 *   os dados vão para o banco — acessíveis de qualquer dispositivo.
 * - Sem DATABASE_URL, os dados ficam em arquivos JSON locais
 *   (útil para testes e uso em um único computador).
 */
const fs = require("fs");
const path = require("path");

const URL_BANCO = process.env.DATABASE_URL;

// Coleções que entram na exportação/importação de cópia de segurança
// (não inclui usuários nem auditoria).
const DADOS_EXPORTAVEIS = ["registros", "eventuais", "professores"];

// Descrição das coleções: colunas no banco <-> campos usados pelo app
const COLECOES = {
  registros: {
    tabela: "registros",
    campos: [
      ["id", "id"],
      ["nome_eventual", "nomeEventual"],
      ["cpf_eventual", "cpfEventual"],
      ["data", "data"],
      ["serie", "serie"],
      ["disciplina", "disciplina"],
      ["qtd_aulas", "qtdAulas"],
      ["nome_professor", "nomeProfessor"],
      ["cpf_professor", "cpfProfessor"]
    ],
    criacao: `CREATE TABLE IF NOT EXISTS registros (
      id TEXT PRIMARY KEY,
      nome_eventual TEXT NOT NULL,
      cpf_eventual TEXT NOT NULL,
      data TEXT NOT NULL,
      serie TEXT NOT NULL,
      disciplina TEXT NOT NULL,
      qtd_aulas INTEGER NOT NULL DEFAULT 1,
      nome_professor TEXT NOT NULL,
      cpf_professor TEXT NOT NULL
    )`,
    ordem: "data"
  },
  eventuais: {
    tabela: "eventuais",
    campos: [
      ["id", "id"],
      ["nome", "nome"],
      ["cpf", "cpf"]
    ],
    criacao: `CREATE TABLE IF NOT EXISTS eventuais (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      cpf TEXT NOT NULL
    )`,
    ordem: "nome"
  },
  professores: {
    tabela: "professores",
    campos: [
      ["id", "id"],
      ["nome", "nome"],
      ["cpf", "cpf"],
      ["disciplina", "disciplina"],
      ["series", "series"] // lista de turmas, gravada como JSON
    ],
    criacao: `CREATE TABLE IF NOT EXISTS professores (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      cpf TEXT NOT NULL,
      disciplina TEXT NOT NULL,
      series TEXT NOT NULL DEFAULT '[]'
    )`,
    ordem: "nome"
  },
  usuarios: {
    tabela: "usuarios",
    campos: [
      ["id", "id"],
      ["nome", "nome"],
      ["usuario", "usuario"],
      ["senha", "senha"], // hash "salt:hash"
      ["perfil", "perfil"],
      ["criado_em", "criadoEm"]
    ],
    criacao: `CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      usuario TEXT NOT NULL,
      senha TEXT NOT NULL,
      perfil TEXT NOT NULL,
      criado_em TEXT NOT NULL
    )`,
    ordem: "nome"
  },
  auditoria: {
    tabela: "auditoria",
    campos: [
      ["id", "id"],
      ["data_hora", "dataHora"],
      ["usuario", "usuario"],
      ["acao", "acao"],
      ["detalhe", "detalhe"]
    ],
    criacao: `CREATE TABLE IF NOT EXISTS auditoria (
      id TEXT PRIMARY KEY,
      data_hora TEXT NOT NULL,
      usuario TEXT NOT NULL,
      acao TEXT NOT NULL,
      detalhe TEXT NOT NULL DEFAULT ''
    )`,
    ordem: "data_hora"
  }
};

function codificarCampo(nomeColecao, campoApp, valor) {
  if (nomeColecao === "professores" && campoApp === "series") {
    return JSON.stringify(Array.isArray(valor) ? valor : []);
  }
  return valor;
}

function decodificarCampo(nomeColecao, campoApp, valor) {
  if (nomeColecao === "professores" && campoApp === "series") {
    try {
      const lista = JSON.parse(valor);
      return Array.isArray(lista) ? lista : [];
    } catch (e) {
      return [];
    }
  }
  return valor;
}

// ===================== PostgreSQL =====================

function criarArmazenamentoPostgres() {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: URL_BANCO,
    ssl: /localhost|127\.0\.0\.1/.test(URL_BANCO) ? false : { rejectUnauthorized: false }
  });

  const pronto = (async () => {
    for (const nome of Object.keys(COLECOES)) {
      await pool.query(COLECOES[nome].criacao);
    }
  })();

  function paraApp(nome, linha) {
    const item = {};
    for (const [coluna, campo] of COLECOES[nome].campos) {
      item[campo] = decodificarCampo(nome, campo, linha[coluna]);
    }
    return item;
  }

  function comandoUpsert(nome) {
    const def = COLECOES[nome];
    const colunas = def.campos.map(c => c[0]);
    const posicoes = colunas.map((c, i) => "$" + (i + 1));
    const atualizacoes = colunas.slice(1).map((c, i) => c + " = $" + (i + 2));
    return `INSERT INTO ${def.tabela} (${colunas.join(", ")})
            VALUES (${posicoes.join(", ")})
            ON CONFLICT (id) DO UPDATE SET ${atualizacoes.join(", ")}`;
  }

  function valores(nome, item) {
    return COLECOES[nome].campos.map(([coluna, campo]) =>
      codificarCampo(nome, campo, item[campo]));
  }

  return {
    tipo: "postgres",

    async listar(nome) {
      await pronto;
      const def = COLECOES[nome];
      const resultado = await pool.query(
        `SELECT * FROM ${def.tabela} ORDER BY ${def.ordem}`);
      return resultado.rows.map(linha => paraApp(nome, linha));
    },

    async salvar(nome, item) {
      await pronto;
      await pool.query(comandoUpsert(nome), valores(nome, item));
    },

    async excluir(nome, id) {
      await pronto;
      const resultado = await pool.query(
        `DELETE FROM ${COLECOES[nome].tabela} WHERE id = $1`, [id]);
      return resultado.rowCount > 0;
    },

    async importar(dados, substituir) {
      await pronto;
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        for (const nome of DADOS_EXPORTAVEIS) {
          const itens = dados[nome] || [];
          if (substituir) await cliente.query(`DELETE FROM ${COLECOES[nome].tabela}`);
          for (const item of itens) {
            const comando = comandoUpsert(nome)
              .replace(/ON CONFLICT \(id\) DO UPDATE SET .*/s, "ON CONFLICT (id) DO NOTHING");
            await cliente.query(comando, valores(nome, item));
          }
        }
        await cliente.query("COMMIT");
      } catch (erro) {
        await cliente.query("ROLLBACK");
        throw erro;
      } finally {
        cliente.release();
      }
    }
  };
}

// ===================== Arquivos JSON locais =====================

function criarArmazenamentoArquivo() {
  const pasta = process.env.DATA_DIR || path.join(__dirname, "dados");

  function caminho(nome) {
    return path.join(pasta, nome + ".json");
  }

  function ler(nome) {
    try {
      const dados = JSON.parse(fs.readFileSync(caminho(nome), "utf8"));
      return Array.isArray(dados) ? dados : [];
    } catch (e) {
      return [];
    }
  }

  function gravar(nome, itens) {
    fs.mkdirSync(pasta, { recursive: true });
    const temporario = caminho(nome) + ".tmp";
    fs.writeFileSync(temporario, JSON.stringify(itens, null, 2));
    fs.renameSync(temporario, caminho(nome)); // gravação atômica
  }

  return {
    tipo: "arquivo",

    async listar(nome) {
      const campo = campoDaOrdem(nome);
      return ler(nome).sort((a, b) =>
        String(a[campo] || "").localeCompare(String(b[campo] || ""), "pt-BR"));
    },

    async salvar(nome, item) {
      const itens = ler(nome);
      const indice = itens.findIndex(x => x.id === item.id);
      if (indice >= 0) itens[indice] = item;
      else itens.push(item);
      gravar(nome, itens);
    },

    async excluir(nome, id) {
      const itens = ler(nome);
      const restantes = itens.filter(x => x.id !== id);
      gravar(nome, restantes);
      return restantes.length < itens.length;
    },

    async importar(dados, substituir) {
      for (const nome of DADOS_EXPORTAVEIS) {
        const novos = dados[nome] || [];
        let itens = substituir ? [] : ler(nome);
        const existentes = new Set(itens.map(x => x.id));
        for (const item of novos) {
          if (!existentes.has(item.id)) itens.push(item);
        }
        gravar(nome, itens);
      }
    }
  };

  // No arquivo os campos são camelCase; traduz a coluna de ordenação
  function campoDaOrdem(nome) {
    const par = COLECOES[nome].campos.find(c => c[0] === COLECOES[nome].ordem);
    return par ? par[1] : "id";
  }
}

module.exports = URL_BANCO ? criarArmazenamentoPostgres() : criarArmazenamentoArquivo();
module.exports.DADOS_EXPORTAVEIS = DADOS_EXPORTAVEIS;

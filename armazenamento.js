/*
 * Camada de armazenamento dos registros de aula.
 *
 * - Com a variável de ambiente DATABASE_URL definida (Railway/PostgreSQL),
 *   os dados vão para o banco — acessíveis de qualquer dispositivo.
 * - Sem DATABASE_URL, os dados ficam em um arquivo JSON local
 *   (útil para testes e uso em um único computador).
 */
const fs = require("fs");
const path = require("path");

const URL_BANCO = process.env.DATABASE_URL;

// ===================== PostgreSQL =====================

function criarArmazenamentoPostgres() {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: URL_BANCO,
    ssl: /localhost|127\.0\.0\.1/.test(URL_BANCO) ? false : { rejectUnauthorized: false }
  });

  const pronto = pool.query(`
    CREATE TABLE IF NOT EXISTS registros (
      id TEXT PRIMARY KEY,
      nome_eventual TEXT NOT NULL,
      cpf_eventual TEXT NOT NULL,
      data TEXT NOT NULL,
      serie TEXT NOT NULL,
      disciplina TEXT NOT NULL,
      qtd_aulas INTEGER NOT NULL DEFAULT 1,
      nome_professor TEXT NOT NULL,
      cpf_professor TEXT NOT NULL
    )`);

  function paraApp(linha) {
    return {
      id: linha.id,
      nomeEventual: linha.nome_eventual,
      cpfEventual: linha.cpf_eventual,
      data: linha.data,
      serie: linha.serie,
      disciplina: linha.disciplina,
      qtdAulas: linha.qtd_aulas,
      nomeProfessor: linha.nome_professor,
      cpfProfessor: linha.cpf_professor
    };
  }

  return {
    tipo: "postgres",

    async listar() {
      await pronto;
      const resultado = await pool.query("SELECT * FROM registros ORDER BY data");
      return resultado.rows.map(paraApp);
    },

    async salvar(r) {
      await pronto;
      await pool.query(
        `INSERT INTO registros
           (id, nome_eventual, cpf_eventual, data, serie, disciplina,
            qtd_aulas, nome_professor, cpf_professor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           nome_eventual = $2, cpf_eventual = $3, data = $4, serie = $5,
           disciplina = $6, qtd_aulas = $7, nome_professor = $8,
           cpf_professor = $9`,
        [r.id, r.nomeEventual, r.cpfEventual, r.data, r.serie,
          r.disciplina, r.qtdAulas, r.nomeProfessor, r.cpfProfessor]);
    },

    async excluir(id) {
      await pronto;
      const resultado = await pool.query("DELETE FROM registros WHERE id = $1", [id]);
      return resultado.rowCount > 0;
    },

    async importar(registros, substituir) {
      await pronto;
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        if (substituir) await cliente.query("DELETE FROM registros");
        for (const r of registros) {
          await cliente.query(
            `INSERT INTO registros
               (id, nome_eventual, cpf_eventual, data, serie, disciplina,
                qtd_aulas, nome_professor, cpf_professor)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id) DO NOTHING`,
            [r.id, r.nomeEventual, r.cpfEventual, r.data, r.serie,
              r.disciplina, r.qtdAulas, r.nomeProfessor, r.cpfProfessor]);
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

// ===================== Arquivo JSON local =====================

function criarArmazenamentoArquivo() {
  const pasta = process.env.DATA_DIR || path.join(__dirname, "dados");
  const arquivo = path.join(pasta, "registros.json");

  function ler() {
    try {
      const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
      return Array.isArray(dados) ? dados : [];
    } catch (e) {
      return [];
    }
  }

  function gravar(registros) {
    fs.mkdirSync(pasta, { recursive: true });
    const temporario = arquivo + ".tmp";
    fs.writeFileSync(temporario, JSON.stringify(registros, null, 2));
    fs.renameSync(temporario, arquivo); // gravação atômica
  }

  return {
    tipo: "arquivo",

    async listar() {
      return ler().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    },

    async salvar(r) {
      const registros = ler();
      const indice = registros.findIndex(x => x.id === r.id);
      if (indice >= 0) registros[indice] = r;
      else registros.push(r);
      gravar(registros);
    },

    async excluir(id) {
      const registros = ler();
      const restantes = registros.filter(r => r.id !== id);
      gravar(restantes);
      return restantes.length < registros.length;
    },

    async importar(novos, substituir) {
      let registros = substituir ? [] : ler();
      const existentes = new Set(registros.map(r => r.id));
      for (const r of novos) {
        if (!existentes.has(r.id)) registros.push(r);
      }
      gravar(registros);
    }
  };
}

module.exports = URL_BANCO ? criarArmazenamentoPostgres() : criarArmazenamentoArquivo();

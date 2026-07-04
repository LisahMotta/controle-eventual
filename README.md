# Controle de Aula Eventual

Aplicativo web para registrar aulas ministradas por professores eventuais (substitutos) e gerar o relatório mensal em PDF para conferência.

## Funcionalidades

O app é organizado em quatro abas:

- **Registrar aula** — tudo escolhido em listas: o professor eventual (do cadastro), a turma
  (agrupada por período: manhã, tarde e noite), a disciplina, a quantidade de aulas (1 a 10)
  e o professor substituído (do cadastro). Os CPFs são preenchidos automaticamente.
- **Eventuais** — cadastro dos professores eventuais (nome e CPF).
- **Professores** — cadastro dos professores com aula atribuída: nome, CPF, disciplina e
  as turmas em que dão aula.
- **Relatório** — relatório mensal por eventual, com prévia na tela e PDF.

Outros recursos:

- **Validação de CPF** (dígitos verificadores) com máscara automática `000.000.000-00`
- **Lista de aulas registradas** com edição e exclusão
- **Relatório mensal em PDF** por eventual, com todas as aulas do mês, o **total de aulas ministradas** e campos de assinatura (eventual e direção) para conferência
- **Banco de dados central** (PostgreSQL): os registros ficam acessíveis de qualquer computador ou celular
- **Código de acesso** opcional para proteger os dados (o app guarda CPFs)
- **Exportar / importar dados** em arquivo JSON, como cópia de segurança

## Como usar

1. Preencha o formulário **Registrar aula** e clique em **Salvar registro**.
2. As aulas ficam listadas em **Aulas registradas**, salvas no banco de dados — qualquer dispositivo que abrir o site vê os mesmos registros.
3. Em **Relatório mensal do eventual**, escolha o eventual e o mês e clique em **⬇ Gerar relatório em PDF** — o arquivo é baixado automaticamente.

Na primeira visita (se o código de acesso estiver ativado), o app pede o código uma única vez e o memoriza no dispositivo.

## Publicar no Railway

1. Acesse [railway.app](https://railway.app) e crie um novo projeto com **Deploy from GitHub repo**, escolhendo este repositório.
2. No projeto, clique em **Create → Database → Add PostgreSQL**. O Railway cria o banco.
3. No serviço do app, abra **Variables** e adicione:
   - `DATABASE_URL` → clique em **Add Reference** e escolha a `DATABASE_URL` do Postgres criado;
   - `APP_SENHA` → o código de acesso que a escola vai usar (ex.: `escola123`). **Recomendado**, pois sem ele qualquer pessoa com o link vê os CPFs.
4. Em **Settings → Networking → Generate Domain**, gere a URL pública do app.

A tabela do banco é criada automaticamente na primeira execução — não precisa rodar nenhum comando.

### Rodando sem banco (teste local)

Sem a variável `DATABASE_URL`, o servidor guarda os registros em um arquivo local (`dados/registros.json`): `npm start` e abra `http://localhost:3000`. No Railway, porém, use sempre o PostgreSQL — arquivos locais são apagados a cada novo deploy.

## Estrutura do projeto

| Arquivo            | Descrição                                                        |
| ------------------ | ---------------------------------------------------------------- |
| `index.html`       | Estrutura da página (formulário, listas, relatório)              |
| `styles.css`       | Aparência do aplicativo                                          |
| `app.js`           | Lógica da tela: validação de CPF, filtros, chamadas ao servidor  |
| `pdf.js`           | Gerador de PDF próprio, sem dependências externas                |
| `server.js`        | Servidor: arquivos do app + API de registros + código de acesso  |
| `armazenamento.js` | Camada de dados: PostgreSQL (Railway) ou arquivo local (testes)  |

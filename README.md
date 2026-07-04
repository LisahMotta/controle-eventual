# Controle de Aula Eventual

Aplicativo web para registrar aulas ministradas por professores eventuais (substitutos) e gerar o relatório mensal em PDF para conferência.

## Funcionalidades

O acesso é por **login com perfis de usuário**:

- **GOE** — administrador (master): gerencia professores, eventuais, aulas, **usuários** e vê a **auditoria**.
- **Secretário** — altera dados de professores/eventuais/aulas e gerencia usuários (não vê a auditoria).
- **AOE** — só cadastra eventuais e lança aulas (não altera dados já cadastrados nem gerencia usuários).

Só pode existir **um GOE** e **um Secretário**; os demais são AOE. No primeiro acesso, o sistema
pede a criação do usuário GOE.

Abas do app (visíveis conforme o perfil):

- **Registrar aula** — tudo escolhido em listas: o professor eventual (do cadastro), a turma
  (agrupada por período: manhã, tarde e noite), a disciplina, a quantidade de aulas (1 a 10)
  e o professor substituído (filtrado pela disciplina). Os CPFs são preenchidos automaticamente.
- **Eventuais** — cadastro dos professores eventuais (nome e CPF).
- **Professores** — cadastro dos professores com aula atribuída: nome, CPF, disciplina e turmas.
- **Folha de controle** — gera uma folha em PDF (1 a 31) para o eventual anotar as aulas à mão,
  inclusive uma **folha em branco** para o eventual de emergência ainda não cadastrado.
- **Relatório** — relatório mensal por eventual, com prévia na tela e PDF.
- **Usuários** (GOE/Secretário) — cadastro e edição de usuários e perfis.
- **Auditoria** (GOE) — log de quem acessou o sistema e das alterações feitas.

Outros recursos:

- **Validação de CPF** (dígitos verificadores) com máscara automática `000.000.000-00`
- **Relatório mensal em PDF** por eventual, com o **total de aulas ministradas** e campos de assinatura
- **Banco de dados central** (PostgreSQL): tudo fica acessível de qualquer computador ou celular
- **Exportar / importar dados** em arquivo JSON, como cópia de segurança

## Como usar

1. **Primeiro acesso:** crie o usuário **GOE** (administrador). Depois, em **Usuários**, cadastre o
   Secretário e os AOE.
2. Faça **login** com usuário e senha.
3. Em **Registrar aula**, escolha eventual, turma, disciplina, quantidade e professor substituído.
4. Em **Relatório mensal do eventual**, escolha o eventual e o mês e clique em **⬇ Gerar relatório em PDF**.

## Publicar no Railway

1. Acesse [railway.app](https://railway.app) e crie um novo projeto com **Deploy from GitHub repo**, escolhendo este repositório.
2. No projeto, clique em **Create → Database → Add PostgreSQL**. O Railway cria o banco.
3. No serviço do app, abra **Variables** e adicione:
   - `DATABASE_URL` → clique em **Add Reference** e escolha a `DATABASE_URL` do Postgres criado;
   - `APP_SEGREDO` → uma frase secreta qualquer (ex.: `troque-esta-frase-secreta`). Serve para
     assinar as sessões; com ela, os usuários **não** precisam entrar de novo a cada atualização do app.
4. Em **Settings → Networking → Generate Domain**, gere a URL pública do app.

As tabelas do banco são criadas automaticamente na primeira execução — não precisa rodar nenhum comando.
O controle de acesso é feito pelo **login com perfis** (não há mais código de acesso único).

### Rodando sem banco (teste local)

Sem a variável `DATABASE_URL`, o servidor guarda os registros em um arquivo local (`dados/registros.json`): `npm start` e abra `http://localhost:3000`. No Railway, porém, use sempre o PostgreSQL — arquivos locais são apagados a cada novo deploy.

## Estrutura do projeto

| Arquivo            | Descrição                                                        |
| ------------------ | ---------------------------------------------------------------- |
| `index.html`       | Estrutura da página (formulário, listas, relatório)              |
| `styles.css`       | Aparência do aplicativo                                          |
| `app.js`           | Lógica da tela: login, perfis, validação de CPF, chamadas à API  |
| `pdf.js`           | Gerador de PDF próprio, sem dependências externas                |
| `server.js`        | Servidor: arquivos do app + API + permissões por perfil          |
| `auth.js`          | Senhas (scrypt), tokens de sessão e regras de permissão          |
| `armazenamento.js` | Camada de dados: PostgreSQL (Railway) ou arquivo local (testes)  |

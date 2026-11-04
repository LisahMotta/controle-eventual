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
  Há também a opção **Aula livre (código 99)** no lugar do professor substituído — para aulas sem
  titular, em que vale a disciplina.
- **Eventuais** — cadastro dos professores eventuais (nome, CPF e **escola sede**).
- **Professores** — cadastro dos professores com aula atribuída: nome, CPF, **R.G.**, disciplina e turmas.
- **Folha de controle** — gera uma folha em PDF (1 a 31) para o eventual anotar as aulas à mão,
  inclusive uma **folha em branco** para o eventual de emergência ainda não cadastrado.
- **Relatório** — relatório mensal por eventual, com prévia na tela e PDF.
- **Boletim (B.O.)** — gera o Boletim de Ocorrências em PDF (no formato oficial da SEDUC-SP) para
  pagamento: escolhe-se o eventual e o mês, e a grade dia a dia traz, por dia, o **R.G. do titular
  substituído** e a **quantidade** de aulas; nas **aulas livres (99)**, no lugar do R.G., entra o
  **código da disciplina** (mapa `DISCIPLINA_CODIGO` em `app.js`; enquanto um código não é
  informado, mostra o nome da disciplina). Traz o total do mês e campos de assinatura; a **escola
  sede** do eventual entra no cabeçalho. Os dados da escola (estabelecimento, U.A., CIE, telefone)
  ficam salvos no navegador.
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

### Esqueci o usuário ou a senha do administrador

As senhas ficam cifradas (hash) e não podem ser lidas — o caminho é **redefinir**:

1. No Railway, abra o serviço do app → **Variables** e adicione:
   `RECUPERAR_GOE` = `usuario:senha` (ex.: `diretora:MinhaNovaSenha`).
2. O app reinicia sozinho. No próximo acesso, entre com esse usuário e senha —
   o usuário **GOE** passa a ter essas credenciais (se não houver GOE, ele é criado).
3. Entre no sistema, **remova a variável `RECUPERAR_GOE`** e, se quiser, troque a senha
   pela aba **Usuários**.

> Dica: para descobrir apenas o **nome de usuário** (sem trocar a senha), abra o banco
> PostgreSQL no Railway (aba **Data**) e veja a tabela `usuarios` — o login fica visível ali
> (a senha, não).

### Rodando sem banco (teste local)

Sem a variável `DATABASE_URL`, o servidor guarda os registros em um arquivo local (`dados/registros.json`): `npm start` e abra `http://localhost:3000`. No Railway, porém, use sempre o PostgreSQL — arquivos locais são apagados a cada novo deploy.

## Interface e sistema de design

A interface tem aparência **institucional** (inspirada em Microsoft 365 / Azure / GOV.BR), em
**modo claro**: tela de **login em duas colunas**, **sidebar** de navegação recolhível,
**header fixo** com trilha de navegação (breadcrumb), notificações e menu de usuário, e um
**Dashboard** com indicadores (KPIs), distribuição por disciplina e aulas recentes — tudo
calculado a partir dos dados reais do sistema.

A aparência é definida por um sistema de design em `styles.css`, com **tokens** em `:root`:

- **Cores** — azul institucional (`--primary` = `#1E3A8A`), neutros e estados
  (`--ok-*`, `--warn-*`, `--dang-*`, `--info-*`).
- **Superfícies** — `--bg` (`#F8FAFC`), `--surface`, `--surface-2`, `--border`.
- **Tipografia** — fonte **Inter** (com fallback do sistema), escala `--fs-*`.
- **Espaçamento** em múltiplos de 8 (`--e1…--e7`), **raios** de 12px (`--r`) e **sombras** discretas.

Os ícones são SVG inline (estilo Lucide), sem dependências externas. O layout é responsivo
(a sidebar vira menu lateral no celular) e respeita `prefers-reduced-motion`. Para reestilizar,
basta ajustar as variáveis — a mudança se propaga por toda a interface.

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

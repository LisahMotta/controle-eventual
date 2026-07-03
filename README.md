# Controle de Aula Eventual

Aplicativo web para registrar aulas ministradas por professores eventuais (substitutos) e gerar o relatório mensal em PDF para conferência.

## Funcionalidades

- **Registro de aulas** com os campos:
  - Nome e CPF do professor eventual
  - Data da aula
  - Série / turma
  - Disciplina
  - Quantidade de aulas no dia
  - Nome e CPF do professor substituído
- **Validação de CPF** (dígitos verificadores) com máscara automática `000.000.000-00`
- **Lista de aulas registradas** com edição e exclusão
- **Relatório mensal em PDF** por eventual, com todas as aulas do mês, o **total de aulas ministradas** e campos de assinatura (eventual e direção) para conferência
- **Exportar / importar dados** em arquivo JSON, como cópia de segurança

## Como usar

Não precisa instalar nada — basta abrir o arquivo `index.html` em qualquer navegador moderno (Chrome, Edge, Firefox). Funciona offline.

1. Preencha o formulário **Registrar aula** e clique em **Salvar registro**.
2. As aulas ficam listadas em **Aulas registradas** (salvas no próprio navegador).
3. Em **Relatório mensal do eventual**, escolha o eventual e o mês e clique em **⬇ Gerar relatório em PDF** — o arquivo é baixado automaticamente.

> **Importante:** os dados ficam salvos apenas no navegador em que foram digitados (localStorage). Use o botão **Exportar dados** periodicamente para guardar uma cópia de segurança, e **Importar dados** para restaurá-la em outro computador.

## Publicar no Railway (ou similar)

O projeto já vem com um servidor Node embutido (`server.js`, sem dependências) e `package.json` com o script `start`, então o Railway detecta e publica automaticamente:

1. Acesse [railway.app](https://railway.app) e crie um novo projeto com **Deploy from GitHub repo**.
2. Escolha este repositório e o branch desejado.
3. O Railway detecta o Node, roda `npm start` e gera a URL pública do app.

Nenhuma variável de ambiente é necessária — o servidor usa a porta definida pelo Railway (`PORT`) automaticamente.

Para testar localmente: `npm start` e abra `http://localhost:3000`.

## Estrutura do projeto

| Arquivo      | Descrição                                            |
| ------------ | ---------------------------------------------------- |
| `index.html` | Estrutura da página (formulário, listas, relatório)  |
| `styles.css` | Aparência do aplicativo                              |
| `app.js`     | Lógica: registros, validação de CPF, filtros, backup |
| `pdf.js`     | Gerador de PDF próprio, sem dependências externas    |
| `server.js`  | Servidor estático para hospedagem (Railway etc.)     |

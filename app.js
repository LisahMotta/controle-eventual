(function () {
  "use strict";

  var CHAVE_CODIGO = "controle-aula-eventual:codigo-acesso";
  var CHAVE_ANTIGA = "controle-aula-eventual:registros"; // dados da versão sem banco

  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  // Turmas da escola, por período
  var TURMAS = [
    {
      periodo: "Manhã",
      turmas: ["6º ano A", "7º ano A", "7º ano B", "8º ano A", "8º ano B",
        "9º ano A", "9º ano B", "9º ano C",
        "1º médio A", "1º médio B", "1º médio C", "2º médio A"]
    },
    {
      periodo: "Tarde",
      turmas: ["1º ano A", "1º ano B", "2º ano A", "2º ano B",
        "3º ano A", "3º ano B", "4º ano A", "4º ano B",
        "5º ano A", "5º ano B", "6º ano B"]
    },
    {
      periodo: "Noite",
      turmas: ["2º médio B", "2º médio C", "2º médio D",
        "3º médio A", "3º médio B", "3º médio C"]
    }
  ];

  var DISCIPLINAS = ["Classe", "Português", "Inglês", "Arte", "Educação Física",
    "História", "Geografia", "Ciências", "Matemática",
    "Orientação de Estudos – Língua Portuguesa",
    "Orientação de Estudos – Matemática",
    "Projeto de Vida", "Tecnologia", "Educação Financeira",
    "Redação e Leitura", "Biologia", "Química", "Física",
    "Sociologia", "Filosofia"];

  // ===================== Utilidades =====================

  function porId(id) {
    return document.getElementById(id);
  }

  function somenteDigitos(texto) {
    return String(texto || "").replace(/\D/g, "");
  }

  function formatarCpf(digitos) {
    digitos = somenteDigitos(digitos).slice(0, 11);
    var partes = [];
    if (digitos.length > 0) partes.push(digitos.slice(0, 3));
    if (digitos.length > 3) partes.push(digitos.slice(3, 6));
    if (digitos.length > 6) partes.push(digitos.slice(6, 9));
    var texto = partes.join(".");
    if (digitos.length > 9) texto += "-" + digitos.slice(9, 11);
    return texto;
  }

  function cpfValido(cpf) {
    var d = somenteDigitos(cpf);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (var t = 9; t < 11; t++) {
      var soma = 0;
      for (var i = 0; i < t; i++) soma += parseInt(d.charAt(i), 10) * (t + 1 - i);
      var digito = (soma * 10) % 11 % 10;
      if (digito !== parseInt(d.charAt(t), 10)) return false;
    }
    return true;
  }

  function formatarData(iso) {
    // iso: "2026-07-03" -> "03/07/2026" (sem criar Date, evita fuso horário)
    var partes = String(iso).split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
  }

  function escapeHtml(texto) {
    var div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
  }

  function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Ícones Lucide (inline, sem dependência externa)
  var SVG_EDITAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var SVG_EXCLUIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  // ===================== Comunicação com o servidor =====================

  var CHAVE_TOKEN = "controle-aula-eventual:token";

  function token() {
    return localStorage.getItem(CHAVE_TOKEN) || "";
  }

  var usuarioAtual = null;
  var permissoes = {};

  // Erro que indica falta de sessão (dispara a volta para a tela de login)
  function ErroSemSessao(msg) { this.message = msg; this.semSessao = true; }

  async function requisicaoApi(metodo, caminho, corpo) {
    var opcoes = {
      method: metodo,
      headers: { "Content-Type": "application/json" }
    };
    var t = token();
    if (t) opcoes.headers["Authorization"] = "Bearer " + t;
    if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);

    var resposta;
    try {
      resposta = await fetch(caminho, opcoes);
    } catch (e) {
      throw new Error("Sem conexão com o servidor. Verifique a internet e tente novamente.");
    }

    var dados = await resposta.json().catch(function () { return {}; });

    if (resposta.status === 401) {
      throw new ErroSemSessao(dados.erro || "Sessão expirada. Faça login novamente.");
    }
    if (!resposta.ok) {
      throw new Error(dados.erro || "Erro no servidor (" + resposta.status + ").");
    }
    return dados;
  }

  var registros = [];
  var eventuais = [];
  var professores = [];

  async function recarregarDados() {
    var resultados = await Promise.all([
      requisicaoApi("GET", "/api/registros"),
      requisicaoApi("GET", "/api/eventuais"),
      requisicaoApi("GET", "/api/professores")
    ]);
    registros = resultados[0];
    eventuais = resultados[1];
    professores = resultados[2];
    atualizarTudo();
  }

  // Migra dados salvos pela versão antiga (localStorage) para o banco.
  async function migrarDadosAntigos() {
    var antigos;
    try {
      antigos = JSON.parse(localStorage.getItem(CHAVE_ANTIGA));
    } catch (e) {
      antigos = null;
    }
    if (!Array.isArray(antigos) || !antigos.length) return;

    var enviar = confirm("Encontrei " + antigos.length + " aula(s) salvas apenas neste " +
      "navegador (versão anterior do app).\n\nEnviar para o banco de dados " +
      "para ficarem acessíveis em qualquer dispositivo?");
    if (!enviar) return;

    await requisicaoApi("POST", "/api/importar",
      { registros: antigos, substituir: false });
    localStorage.removeItem(CHAVE_ANTIGA);
    await recarregarDados();
    alert("Dados enviados para o banco com sucesso.");
  }

  // ===================== Navegação (sidebar / abas) =====================

  var TITULOS_ABA = {
    dashboard: "Dashboard", aulas: "Registrar aula", eventuais: "Eventuais",
    professores: "Professores", folha: "Folha de controle", relatorio: "Relatórios",
    bo: "Boletim (B.O.)", usuarios: "Usuários", auditoria: "Auditoria"
  };

  function irParaAba(nome) {
    document.querySelectorAll("#barra-abas .aba").forEach(function (aba) {
      aba.classList.toggle("ativa", aba.dataset.aba === nome);
    });
    document.querySelectorAll("main .painel").forEach(function (painel) {
      painel.hidden = painel.id !== "aba-" + nome;
    });
    var trilha = porId("trilha-atual");
    if (trilha) trilha.textContent = TITULOS_ABA[nome] || "";
    if (nome === "dashboard") renderizarDashboard();
    if (nome === "auditoria" && permissoes.verAuditoria) carregarAuditoria().catch(function () {});
    // fecha o menu lateral no celular
    porId("app").classList.remove("menu-aberto");
    window.scrollTo(0, 0);
  }

  porId("barra-abas").addEventListener("click", function (evento) {
    var botao = evento.target.closest("button[data-aba]");
    if (botao) irParaAba(botao.dataset.aba);
  });

  // Botões que navegam a partir de outros lugares
  porId("btn-nova-aula").addEventListener("click", function () { irParaAba("aulas"); });
  porId("btn-ir-usuarios").addEventListener("click", function () {
    fecharMenus(); irParaAba("usuarios");
  });

  // ===================== Menus, sidebar e microinterações =====================

  var app = porId("app");

  porId("btn-menu").addEventListener("click", function () {
    if (window.matchMedia("(max-width: 768px)").matches) {
      app.classList.toggle("menu-aberto");
    } else {
      app.classList.toggle("recolhido");
    }
  });
  porId("sidebar-overlay").addEventListener("click", function () {
    app.classList.remove("menu-aberto");
  });

  function fecharMenus() {
    porId("menu-usuario").hidden = true;
    porId("menu-notificacoes").hidden = true;
  }

  function alternarMenu(id) {
    var alvo = porId(id);
    var abrir = alvo.hidden;
    fecharMenus();
    alvo.hidden = !abrir;
  }

  porId("btn-menu-usuario").addEventListener("click", function (e) {
    e.stopPropagation(); alternarMenu("menu-usuario");
  });
  porId("btn-notificacoes").addEventListener("click", function (e) {
    e.stopPropagation(); alternarMenu("menu-notificacoes");
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-ancora")) fecharMenus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fecharMenus(); porId("modal-senha").hidden = true; }
  });

  // Mostrar/ocultar senha no login
  porId("btn-ver-senha").addEventListener("click", function () {
    var campo = porId("login-senha");
    campo.type = campo.type === "password" ? "text" : "password";
  });

  // Modal "esqueci a senha"
  porId("link-esqueci").addEventListener("click", function () { porId("modal-senha").hidden = false; });
  porId("btn-fechar-modal-senha").addEventListener("click", function () { porId("modal-senha").hidden = true; });
  porId("modal-senha").addEventListener("click", function (e) {
    if (e.target === this) this.hidden = true;
  });

  // ===================== Listas fixas (turmas, disciplinas, quantidade) =====================

  function preencherSelectTurmas(select) {
    TURMAS.forEach(function (grupo) {
      var optgroup = document.createElement("optgroup");
      optgroup.label = grupo.periodo;
      grupo.turmas.forEach(function (turma) {
        var opcao = document.createElement("option");
        opcao.value = turma;
        opcao.textContent = turma;
        optgroup.appendChild(opcao);
      });
      select.appendChild(optgroup);
    });
  }

  function preencherSelectDisciplinas(select) {
    DISCIPLINAS.forEach(function (disciplina) {
      var opcao = document.createElement("option");
      opcao.value = disciplina;
      opcao.textContent = disciplina;
      select.appendChild(opcao);
    });
  }

  preencherSelectTurmas(porId("serie"));
  preencherSelectDisciplinas(porId("disciplina"));
  preencherSelectDisciplinas(porId("disciplina-professor-cad"));

  (function preencherQuantidade() {
    var select = porId("qtd-aulas");
    for (var i = 1; i <= 10; i++) {
      var opcao = document.createElement("option");
      opcao.value = String(i);
      opcao.textContent = i + (i === 1 ? " aula" : " aulas");
      select.appendChild(opcao);
    }
  })();

  // Caixas de seleção de turmas no cadastro de professor
  (function montarTurmasProfessor() {
    var recipiente = porId("turmas-professor");
    TURMAS.forEach(function (grupo) {
      var bloco = document.createElement("fieldset");
      bloco.className = "grupo-turmas";
      var titulo = document.createElement("legend");
      titulo.textContent = grupo.periodo;
      bloco.appendChild(titulo);
      grupo.turmas.forEach(function (turma) {
        var rotulo = document.createElement("label");
        rotulo.className = "opcao-turma";
        var caixa = document.createElement("input");
        caixa.type = "checkbox";
        caixa.value = turma;
        caixa.name = "turma-professor";
        rotulo.appendChild(caixa);
        rotulo.appendChild(document.createTextNode(" " + turma));
        bloco.appendChild(rotulo);
      });
      recipiente.appendChild(bloco);
    });
  })();

  function turmasSelecionadas() {
    return Array.prototype.slice
      .call(document.querySelectorAll('input[name="turma-professor"]:checked'))
      .map(function (caixa) { return caixa.value; });
  }

  function marcarTurmas(series) {
    var conjunto = {};
    (series || []).forEach(function (s) { conjunto[s] = true; });
    document.querySelectorAll('input[name="turma-professor"]').forEach(function (caixa) {
      caixa.checked = !!conjunto[caixa.value];
    });
  }

  // ===================== Máscara de CPF nos cadastros =====================

  function ligarMascaraCpf(campo, idErro) {
    campo.addEventListener("input", function () {
      // guarda quantos dígitos existem antes do cursor para
      // recolocá-lo no mesmo lugar depois de aplicar a máscara
      var posicao = campo.selectionStart || 0;
      var digitosAntes = somenteDigitos(campo.value.slice(0, posicao)).length;

      campo.value = formatarCpf(campo.value);

      var novaPosicao = 0, contados = 0;
      while (novaPosicao < campo.value.length && contados < digitosAntes) {
        if (/\d/.test(campo.value.charAt(novaPosicao))) contados++;
        novaPosicao++;
      }
      campo.setSelectionRange(novaPosicao, novaPosicao);

      validarCampoCpf(campo, idErro);
    });
  }

  function validarCampoCpf(campo, idErro) {
    var spanErro = porId(idErro);
    var digitos = somenteDigitos(campo.value);
    if (digitos.length === 11 && !cpfValido(campo.value)) {
      campo.classList.add("invalido");
      spanErro.textContent = "CPF inválido — confira os dígitos.";
      return false;
    }
    campo.classList.remove("invalido");
    spanErro.textContent = "";
    return digitos.length === 11;
  }

  function exigirCpf(campo, idErro) {
    var digitos = somenteDigitos(campo.value);
    if (digitos.length !== 11) {
      porId(idErro).textContent = "O CPF precisa ter 11 dígitos.";
      campo.classList.add("invalido");
      return false;
    }
    if (!cpfValido(campo.value)) {
      // Não bloqueia: os dígitos verificadores não conferem, mas pode ser
      // um caso legítimo — deixa a pessoa decidir.
      return confirm("Atenção: o CPF " + campo.value + " parece estar incorreto " +
        "(os dígitos verificadores não conferem).\n\n" +
        "Confira se digitou certo. Deseja salvar mesmo assim?");
    }
    return true;
  }

  // ===================== Aba Eventuais =====================

  var formEventual = porId("form-eventual");
  var campoCpfEventualCad = porId("cpf-eventual-cad");
  var idEventualEmEdicao = null;
  ligarMascaraCpf(campoCpfEventualCad, "erro-cpf-eventual-cad");

  formEventual.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    if (!exigirCpf(campoCpfEventualCad, "erro-cpf-eventual-cad")) return;

    var eventual = {
      id: idEventualEmEdicao || novoId(),
      nome: porId("nome-eventual-cad").value.trim(),
      cpf: formatarCpf(campoCpfEventualCad.value),
      escolaSede: porId("escola-sede-cad").value.trim()
    };

    var botao = porId("btn-salvar-eventual");
    botao.disabled = true;
    try {
      await requisicaoApi("POST", "/api/eventuais", eventual);
      encerrarEdicaoEventual();
      formEventual.reset();
      await recarregarDados();
    } catch (erro) {
      alert("Não foi possível salvar: " + erro.message);
    } finally {
      botao.disabled = false;
    }
  });

  porId("btn-cancelar-eventual").addEventListener("click", function () {
    encerrarEdicaoEventual();
    formEventual.reset();
  });

  function encerrarEdicaoEventual() {
    idEventualEmEdicao = null;
    porId("btn-salvar-eventual").textContent = "Cadastrar eventual";
    porId("btn-cancelar-eventual").hidden = true;
  }

  // Botões de editar/excluir; só aparecem para quem pode alterar dados
  function botoesAcao(id) {
    if (!permissoes.alterarDados) return "<td></td>";
    return "<td>" +
      '<button type="button" class="btn-linha" title="Editar" data-acao="editar" data-id="' + id + '">' + SVG_EDITAR + '</button>' +
      '<button type="button" class="btn-linha perigo" title="Excluir" data-acao="excluir" data-id="' + id + '">' + SVG_EXCLUIR + '</button>' +
      "</td>";
  }

  function atualizarTabelaEventuais() {
    var corpo = porId("tabela-eventuais").querySelector("tbody");
    corpo.innerHTML = "";
    eventuais.forEach(function (e) {
      var linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + escapeHtml(e.nome) + "</td>" +
        "<td>" + escapeHtml(e.cpf) + "</td>" +
        "<td>" + escapeHtml(e.escolaSede || "") + "</td>" +
        botoesAcao(e.id);
      corpo.appendChild(linha);
    });
    porId("msg-sem-eventuais").hidden = eventuais.length > 0;
  }

  porId("tabela-eventuais").addEventListener("click", async function (evento) {
    var botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    var eventual = eventuais.find(function (e) { return e.id === botao.dataset.id; });
    if (!eventual) return;

    if (botao.dataset.acao === "editar") {
      idEventualEmEdicao = eventual.id;
      porId("nome-eventual-cad").value = eventual.nome;
      campoCpfEventualCad.value = eventual.cpf;
      porId("escola-sede-cad").value = eventual.escolaSede || "";
      porId("btn-salvar-eventual").textContent = "Atualizar eventual";
      porId("btn-cancelar-eventual").hidden = false;
      porId("nome-eventual-cad").focus();
    } else if (botao.dataset.acao === "excluir") {
      if (!confirm("Excluir o eventual " + eventual.nome + "?\n\n" +
        "As aulas já registradas dele não serão apagadas.")) return;
      try {
        await requisicaoApi("DELETE", "/api/eventuais/" + eventual.id);
        if (idEventualEmEdicao === eventual.id) encerrarEdicaoEventual();
        await recarregarDados();
      } catch (erro) {
        alert("Não foi possível excluir: " + erro.message);
      }
    }
  });

  // ===================== Aba Professores =====================

  var formProfessor = porId("form-professor");
  var campoCpfProfessorCad = porId("cpf-professor-cad");
  var idProfessorEmEdicao = null;
  ligarMascaraCpf(campoCpfProfessorCad, "erro-cpf-professor-cad");

  formProfessor.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    if (!exigirCpf(campoCpfProfessorCad, "erro-cpf-professor-cad")) return;

    var professor = {
      id: idProfessorEmEdicao || novoId(),
      nome: porId("nome-professor-cad").value.trim(),
      cpf: formatarCpf(campoCpfProfessorCad.value),
      rg: porId("rg-professor-cad").value.trim(),
      disciplina: porId("disciplina-professor-cad").value,
      series: turmasSelecionadas()
    };

    var botao = porId("btn-salvar-professor");
    botao.disabled = true;
    try {
      await requisicaoApi("POST", "/api/professores", professor);
      encerrarEdicaoProfessor();
      formProfessor.reset();
      marcarTurmas([]);
      await recarregarDados();
    } catch (erro) {
      alert("Não foi possível salvar: " + erro.message);
    } finally {
      botao.disabled = false;
    }
  });

  porId("btn-cancelar-professor").addEventListener("click", function () {
    encerrarEdicaoProfessor();
    formProfessor.reset();
    marcarTurmas([]);
  });

  function encerrarEdicaoProfessor() {
    idProfessorEmEdicao = null;
    porId("btn-salvar-professor").textContent = "Cadastrar professor";
    porId("btn-cancelar-professor").hidden = true;
  }

  function atualizarTabelaProfessores() {
    var corpo = porId("tabela-professores").querySelector("tbody");
    corpo.innerHTML = "";
    professores.forEach(function (p) {
      var linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + escapeHtml(p.nome) + "</td>" +
        "<td>" + escapeHtml(p.cpf) + "</td>" +
        "<td>" + escapeHtml(p.rg || "") + "</td>" +
        "<td>" + escapeHtml(p.disciplina) + "</td>" +
        '<td class="celula-turmas">' + escapeHtml((p.series || []).join(", ")) + "</td>" +
        "<td>" +
        '<button type="button" class="btn-linha" title="Editar" data-acao="editar" data-id="' + p.id + '">' + SVG_EDITAR + '</button>' +
        '<button type="button" class="btn-linha perigo" title="Excluir" data-acao="excluir" data-id="' + p.id + '">' + SVG_EXCLUIR + '</button>' +
        "</td>";
      corpo.appendChild(linha);
    });
    porId("msg-sem-professores").hidden = professores.length > 0;
  }

  porId("tabela-professores").addEventListener("click", async function (evento) {
    var botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    var professor = professores.find(function (p) { return p.id === botao.dataset.id; });
    if (!professor) return;

    if (botao.dataset.acao === "editar") {
      idProfessorEmEdicao = professor.id;
      porId("nome-professor-cad").value = professor.nome;
      campoCpfProfessorCad.value = professor.cpf;
      porId("rg-professor-cad").value = professor.rg || "";
      porId("disciplina-professor-cad").value = professor.disciplina;
      marcarTurmas(professor.series);
      porId("btn-salvar-professor").textContent = "Atualizar professor";
      porId("btn-cancelar-professor").hidden = false;
      porId("nome-professor-cad").focus();
    } else if (botao.dataset.acao === "excluir") {
      if (!confirm("Excluir o professor " + professor.nome + "?\n\n" +
        "As aulas já registradas não serão apagadas.")) return;
      try {
        await requisicaoApi("DELETE", "/api/professores/" + professor.id);
        if (idProfessorEmEdicao === professor.id) encerrarEdicaoProfessor();
        await recarregarDados();
      } catch (erro) {
        alert("Não foi possível excluir: " + erro.message);
      }
    }
  });

  // ===================== Aba Registrar aula =====================

  var formAula = porId("form-aula");
  var idEmEdicao = null;

  function preencherSelectComEventuais(select, opcaoBranco) {
    var valorAtual = select.value;
    select.innerHTML = '<option value="">— Selecione o eventual —</option>';
    if (opcaoBranco) {
      var branco = document.createElement("option");
      branco.value = "__branco__";
      branco.textContent = "⚠ Emergência — professor não cadastrado (folha em branco)";
      select.appendChild(branco);
    }
    eventuais.forEach(function (e) {
      var opcao = document.createElement("option");
      opcao.value = e.id;
      opcao.textContent = e.nome + " — " + e.cpf;
      select.appendChild(opcao);
    });
    var valores = eventuais.map(function (e) { return e.id; });
    if (opcaoBranco) valores.push("__branco__");
    if (valorAtual && valores.indexOf(valorAtual) >= 0) select.value = valorAtual;
  }

  function atualizarSelectEventuais() {
    preencherSelectComEventuais(porId("sel-eventual"), false);
    preencherSelectComEventuais(porId("folha-eventual"), true);
    preencherSelectComEventuais(porId("bo-eventual"), true);
    porId("dica-sem-eventuais").hidden = eventuais.length > 0;
    atualizarCpfEventual();
  }

  function atualizarSelectProfessores() {
    var select = porId("sel-professor");
    var valorAtual = select.value;
    var disciplina = porId("disciplina").value;

    // Com uma disciplina escolhida, mostra só os professores dela
    var lista = professores;
    var aviso = "";
    if (disciplina) {
      var daDisciplina = professores.filter(function (p) {
        return p.disciplina === disciplina;
      });
      if (daDisciplina.length) {
        lista = daDisciplina;
      } else if (professores.length) {
        aviso = "Nenhum professor cadastrado com a disciplina “" + disciplina +
          "” — mostrando todos.";
      }
    }

    // Mantém na lista o professor já escolhido, mesmo que seja de outra
    // disciplina (ex.: ao editar um registro antigo)
    if (valorAtual) {
      var atual = professores.find(function (p) { return p.id === valorAtual; });
      if (atual && lista.indexOf(atual) < 0) lista = lista.concat([atual]);
    }

    select.innerHTML = '<option value="">— Selecione o professor —</option>';
    var opLivre = document.createElement("option");
    opLivre.value = "__livre__";
    opLivre.textContent = "Aula livre (código 99)";
    select.appendChild(opLivre);
    lista.forEach(function (p) {
      var opcao = document.createElement("option");
      opcao.value = p.id;
      opcao.textContent = p.nome + " — " + p.disciplina;
      select.appendChild(opcao);
    });
    if (valorAtual === "__livre__" ||
        (valorAtual && lista.some(function (p) { return p.id === valorAtual; }))) {
      select.value = valorAtual;
    }

    porId("dica-sem-professores").hidden = professores.length > 0;
    var dicaFiltro = porId("dica-filtro-professor");
    dicaFiltro.textContent = aviso;
    dicaFiltro.hidden = !aviso;
    atualizarCpfProfessor();
  }

  function eventualSelecionado() {
    var id = porId("sel-eventual").value;
    return eventuais.find(function (e) { return e.id === id; }) || null;
  }

  function professorSelecionado() {
    var id = porId("sel-professor").value;
    return professores.find(function (p) { return p.id === id; }) || null;
  }

  function atualizarCpfEventual() {
    var eventual = eventualSelecionado();
    porId("cpf-eventual-exibicao").value = eventual ? eventual.cpf : "";
  }

  function aulaLivreSelecionada() {
    return porId("sel-professor").value === "__livre__";
  }

  function atualizarCpfProfessor() {
    if (aulaLivreSelecionada()) {
      porId("cpf-professor-exibicao").value = "— Aula livre (99) —";
      return;
    }
    var professor = professorSelecionado();
    porId("cpf-professor-exibicao").value = professor ? professor.cpf : "";
  }

  porId("sel-eventual").addEventListener("change", atualizarCpfEventual);

  // Ao escolher a disciplina, filtra a lista de professores
  porId("disciplina").addEventListener("change", atualizarSelectProfessores);

  porId("sel-professor").addEventListener("change", function () {
    atualizarCpfProfessor();
    // sugestão: ao escolher o professor, pré-seleciona a disciplina dele
    var professor = professorSelecionado();
    if (professor && !idEmEdicao && DISCIPLINAS.indexOf(professor.disciplina) >= 0 &&
        !porId("disciplina").value) {
      porId("disciplina").value = professor.disciplina;
      atualizarSelectProfessores();
    }
  });

  function limparFormularioAula() {
    formAula.reset();
    porId("data-aula").value = new Date().toISOString().slice(0, 10);
    atualizarCpfEventual();
    atualizarSelectProfessores(); // volta a mostrar todos os professores
  }

  // Data padrão: hoje
  porId("data-aula").value = new Date().toISOString().slice(0, 10);
  porId("filtro-mes").value = new Date().toISOString().slice(0, 7);

  formAula.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    var eventual = eventualSelecionado();
    var aulaLivre = aulaLivreSelecionada();
    var professor = professorSelecionado();
    if (!eventual) {
      alert("Selecione o professor eventual. Se a lista estiver vazia, cadastre na aba Eventuais.");
      return;
    }
    if (!aulaLivre && !professor) {
      alert("Selecione o professor substituído, ou escolha \"Aula livre (código 99)\".");
      return;
    }
    if (aulaLivre && !porId("disciplina").value) {
      alert("Na aula livre (99), informe a disciplina.");
      return;
    }

    var registro = {
      id: idEmEdicao || novoId(),
      nomeEventual: eventual.nome,
      cpfEventual: eventual.cpf,
      data: porId("data-aula").value,
      serie: porId("serie").value,
      disciplina: porId("disciplina").value,
      qtdAulas: parseInt(porId("qtd-aulas").value, 10) || 1,
      nomeProfessor: aulaLivre ? "Aula livre (99)" : professor.nome,
      cpfProfessor: aulaLivre ? "" : professor.cpf,
      rgProfessor: aulaLivre ? "" : (professor.rg || "")
    };

    var botao = porId("btn-salvar");
    botao.disabled = true;
    try {
      await requisicaoApi("POST", "/api/registros", registro);
      if (idEmEdicao) encerrarEdicao();
      limparFormularioAula();
      await recarregarDados();
    } catch (erro) {
      alert("Não foi possível salvar: " + erro.message);
    } finally {
      botao.disabled = false;
    }
  });

  porId("btn-cancelar-edicao").addEventListener("click", function () {
    encerrarEdicao();
    limparFormularioAula();
  });

  function garantirOpcao(select, valor, rotulo) {
    // usada ao editar registros antigos cujo eventual/professor/turma
    // não está mais no cadastro: cria uma opção temporária
    var existe = Array.prototype.some.call(select.options, function (opcao) {
      return opcao.value === valor;
    });
    if (!existe && valor) {
      var opcao = document.createElement("option");
      opcao.value = valor;
      opcao.textContent = rotulo || valor;
      select.appendChild(opcao);
    }
    select.value = valor;
  }

  function iniciarEdicao(registro) {
    idEmEdicao = registro.id;

    var eventual = eventuais.find(function (e) { return e.cpf === registro.cpfEventual; });
    var ehAulaLivre = !registro.cpfProfessor || registro.nomeProfessor === "Aula livre (99)";
    var professor = ehAulaLivre ? null :
      professores.find(function (p) { return p.cpf === registro.cpfProfessor; });

    if (eventual) {
      porId("sel-eventual").value = eventual.id;
    } else {
      // registro antigo sem cadastro correspondente: cria opção temporária
      var idTemporario = "antigo:" + registro.cpfEventual;
      eventuais.push({ id: idTemporario, nome: registro.nomeEventual, cpf: registro.cpfEventual });
      atualizarSelectEventuais();
      porId("sel-eventual").value = idTemporario;
    }
    atualizarCpfEventual();

    if (ehAulaLivre) {
      porId("sel-professor").value = "__livre__";
    } else if (professor) {
      porId("sel-professor").value = professor.id;
    } else {
      var idTempProf = "antigo:" + registro.cpfProfessor;
      professores.push({
        id: idTempProf, nome: registro.nomeProfessor,
        cpf: registro.cpfProfessor, rg: registro.rgProfessor || "",
        disciplina: registro.disciplina, series: []
      });
      atualizarSelectProfessores();
      porId("sel-professor").value = idTempProf;
    }
    atualizarCpfProfessor();

    porId("data-aula").value = registro.data;
    garantirOpcao(porId("serie"), registro.serie);
    garantirOpcao(porId("disciplina"), registro.disciplina);
    atualizarSelectProfessores(); // aplica o filtro mantendo o professor do registro
    porId("qtd-aulas").value = String(Math.min(10, Math.max(1, registro.qtdAulas)));

    porId("btn-salvar").textContent = "Atualizar registro";
    porId("btn-cancelar-edicao").hidden = false;
    porId("secao-cadastro").scrollIntoView({ behavior: "smooth" });
  }

  function encerrarEdicao() {
    idEmEdicao = null;
    porId("btn-salvar").textContent = "Salvar registro";
    porId("btn-cancelar-edicao").hidden = true;
  }

  // ===================== Tabela de registros =====================

  function atualizarTabela() {
    var corpo = porId("tabela-registros").querySelector("tbody");
    corpo.innerHTML = "";

    var ordenados = registros.slice().sort(function (a, b) {
      return b.data.localeCompare(a.data);
    });

    ordenados.forEach(function (r) {
      var linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + formatarData(r.data) + "</td>" +
        "<td>" + escapeHtml(r.nomeEventual) + "</td>" +
        "<td>" + escapeHtml(r.cpfEventual) + "</td>" +
        "<td>" + escapeHtml(r.serie) + "</td>" +
        "<td>" + escapeHtml(r.disciplina) + "</td>" +
        "<td>" + r.qtdAulas + "</td>" +
        "<td>" + escapeHtml(r.nomeProfessor) + "</td>" +
        "<td>" + escapeHtml(r.cpfProfessor) + "</td>" +
        botoesAcao(r.id);
      corpo.appendChild(linha);
    });

    porId("msg-sem-registros").hidden = registros.length > 0;
  }

  porId("tabela-registros").addEventListener("click", async function (evento) {
    var botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    var registro = registros.find(function (r) { return r.id === botao.dataset.id; });
    if (!registro) return;

    if (botao.dataset.acao === "editar") {
      iniciarEdicao(registro);
    } else if (botao.dataset.acao === "excluir") {
      var confirmar = confirm("Excluir a aula de " + registro.disciplina + " em " +
        formatarData(registro.data) + " (" + registro.nomeEventual + ")?");
      if (!confirmar) return;
      try {
        await requisicaoApi("DELETE", "/api/registros/" + registro.id);
        if (idEmEdicao === registro.id) encerrarEdicao();
        await recarregarDados();
      } catch (erro) {
        alert("Não foi possível excluir: " + erro.message);
      }
    }
  });

  // ===================== Relatório =====================

  function atualizarFiltroEventuais() {
    var seletor = porId("filtro-eventual");
    var valorAtual = seletor.value;
    seletor.innerHTML = '<option value="">— Selecione o eventual —</option>';

    // Eventuais cadastrados + os que aparecem em registros antigos
    var vistos = {};
    eventuais.forEach(function (e) { vistos[e.cpf] = e.nome; });
    registros.forEach(function (r) {
      if (!vistos[r.cpfEventual]) vistos[r.cpfEventual] = r.nomeEventual;
    });

    Object.keys(vistos)
      .sort(function (a, b) { return vistos[a].localeCompare(vistos[b], "pt-BR"); })
      .forEach(function (cpf) {
        var opcao = document.createElement("option");
        opcao.value = cpf;
        opcao.textContent = vistos[cpf] + " — " + cpf;
        seletor.appendChild(opcao);
      });

    if (valorAtual && vistos[valorAtual]) seletor.value = valorAtual;
  }

  function filtrarAulasDoMes(cpf, mes) {
    return registros
      .filter(function (r) {
        return r.cpfEventual === cpf && r.data.slice(0, 7) === mes;
      })
      .sort(function (a, b) { return a.data.localeCompare(b.data); });
  }

  function nomeDoMes(mes) {
    var partes = mes.split("-"); // "2026-07"
    return MESES[parseInt(partes[1], 10) - 1] + " de " + partes[0];
  }

  function totalAulas(aulas) {
    return aulas.reduce(function (soma, r) { return soma + (r.qtdAulas || 1); }, 0);
  }

  function nomeDoEventualPorCpf(cpf, aulas) {
    var cadastrado = eventuais.find(function (e) { return e.cpf === cpf; });
    if (cadastrado) return cadastrado.nome;
    return aulas.length ? aulas[0].nomeEventual : "";
  }

  function atualizarPrevia() {
    var cpf = porId("filtro-eventual").value;
    var mes = porId("filtro-mes").value;
    var previa = porId("previa-relatorio");
    var msgVazio = porId("msg-relatorio-vazio");

    previa.hidden = true;
    msgVazio.hidden = true;
    if (!cpf || !mes) return;

    var aulas = filtrarAulasDoMes(cpf, mes);
    if (!aulas.length) {
      msgVazio.hidden = false;
      return;
    }

    porId("titulo-previa").textContent =
      "Aulas de " + nomeDoEventualPorCpf(cpf, aulas) + " em " + nomeDoMes(mes);

    var corpo = porId("tabela-relatorio").querySelector("tbody");
    corpo.innerHTML = "";
    aulas.forEach(function (r) {
      var linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + formatarData(r.data) + "</td>" +
        "<td>" + escapeHtml(r.serie) + "</td>" +
        "<td>" + escapeHtml(r.disciplina) + "</td>" +
        "<td>" + r.qtdAulas + "</td>" +
        "<td>" + escapeHtml(r.nomeProfessor) + "</td>" +
        "<td>" + escapeHtml(r.cpfProfessor) + "</td>";
      corpo.appendChild(linha);
    });

    porId("total-previa").textContent =
      "Total de aulas no mês: " + totalAulas(aulas);
    previa.hidden = false;
  }

  porId("filtro-eventual").addEventListener("change", atualizarPrevia);
  porId("filtro-mes").addEventListener("change", atualizarPrevia);

  // ===================== Geração do PDF =====================

  porId("btn-gerar-pdf").addEventListener("click", function () {
    var cpf = porId("filtro-eventual").value;
    var mes = porId("filtro-mes").value;

    if (!cpf) {
      alert("Selecione o eventual para gerar o relatório.");
      return;
    }
    if (!mes) {
      alert("Selecione o mês de referência.");
      return;
    }

    var aulas = filtrarAulasDoMes(cpf, mes);
    if (!aulas.length) {
      alert("Nenhuma aula registrada para esse eventual no mês selecionado.");
      return;
    }

    var nomeEventual = nomeDoEventualPorCpf(cpf, aulas);
    var blob = gerarRelatorioPdf({
      titulo: "Relatório Mensal de Aulas Eventuais",
      subtitulo: "Referência: " + nomeDoMes(mes),
      infos: [
        ["Professor eventual", nomeEventual],
        ["CPF", cpf],
        ["Aulas registradas", String(aulas.length) + " registro(s)"]
      ],
      colunas: [
        { titulo: "Data", largura: 60 },
        { titulo: "Turma", largura: 85 },
        { titulo: "Disciplina", largura: 105 },
        { titulo: "Aulas", largura: 40 },
        { titulo: "Professor substituído", largura: 130 },
        { titulo: "CPF do professor", largura: 95 }
      ],
      linhas: aulas.map(function (r) {
        return [formatarData(r.data), r.serie, r.disciplina,
          String(r.qtdAulas), r.nomeProfessor, r.cpfProfessor];
      }),
      totalTexto: "TOTAL DE AULAS MINISTRADAS NO MÊS: " + totalAulas(aulas),
      assinaturas: ["Assinatura do eventual", "Assinatura da direção"]
    });

    var nomeArquivo = "relatorio-" +
      nomeEventual.toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
      "-" + mes + ".pdf";

    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
  });

  // ===================== Folha de controle =====================

  porId("folha-mes").value = new Date().toISOString().slice(0, 7);

  porId("btn-gerar-folha").addEventListener("click", function () {
    var id = porId("folha-eventual").value;
    var mes = porId("folha-mes").value;

    if (!mes) {
      alert("Selecione o mês de referência.");
      return;
    }

    // Folha em branco para o eventual de emergência ainda não cadastrado:
    // o nome e o CPF viram linhas para preencher à mão.
    var emBranco = id === "__branco__";
    var eventual = emBranco
      ? { nome: "____________________________________", cpf: "__________________" }
      : eventuais.find(function (e) { return e.id === id; });

    if (!eventual) {
      alert("Selecione o eventual, ou escolha a opção de folha em branco para emergência.");
      return;
    }

    // Linhas em branco para cada dia do mês; com mais de uma linha por
    // dia, o eventual pode anotar disciplinas diferentes no mesmo dia
    var linhasPorDia = parseInt(porId("folha-linhas").value, 10) || 1;
    var linhas = [];
    for (var dia = 1; dia <= 31; dia++) {
      for (var extra = 0; extra < linhasPorDia; extra++) {
        linhas.push([extra === 0 ? (dia < 10 ? "0" : "") + dia : "", "", "", "", ""]);
      }
    }

    var blob = gerarRelatorioPdf({
      titulo: "Folha de Controle de Aulas Eventuais",
      subtitulo: "Referência: " + nomeDoMes(mes) +
        "  —  Anote as aulas dadas no dia e o professor substituído.",
      infos: [
        ["Professor eventual", eventual.nome],
        ["CPF", eventual.cpf]
      ],
      colunas: [
        { titulo: "Dia", largura: 35 },
        { titulo: "Turma", largura: 90 },
        { titulo: "Disciplina", largura: 115 },
        { titulo: "Qtd. aulas", largura: 55 },
        { titulo: "Professor substituído", largura: 220 }
      ],
      linhas: linhas,
      alturaLinha: 18,
      reservaFinal: 95,
      linhasVerticais: true,
      totalTexto: "TOTAL DE AULAS NO MÊS: ______________          " +
        "(confira antes de entregar para digitação)",
      assinaturas: ["Assinatura do eventual", "Assinatura da direção"]
    });

    var baseNome = emBranco ? "em-branco" :
      eventual.nome.toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    var nomeArquivo = "folha-controle-" + baseNome + "-" + mes + ".pdf";

    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
  });

  // ===================== Boletim de Ocorrências (B.O.) =====================

  var CHAVE_BO = "controle-aula-eventual:bo";
  var BO_PADRAO = {
    estabelecimento: "E.E. PROFª MALBA THEREZA F. CAMPANER",
    regiao: "Região de São José dos Campos",
    ua: "57400", cie: "042316", tel: "3931.6322"
  };
  var DIAS_SEMANA = ["D", "2ª", "3ª", "4ª", "5ª", "6ª", "S"];

  function carregarConfigBo() {
    var cfg;
    try { cfg = JSON.parse(localStorage.getItem(CHAVE_BO)); } catch (e) { cfg = null; }
    cfg = cfg || {};
    return {
      estabelecimento: cfg.estabelecimento || BO_PADRAO.estabelecimento,
      regiao: cfg.regiao || BO_PADRAO.regiao,
      ua: cfg.ua || BO_PADRAO.ua,
      cie: cfg.cie || BO_PADRAO.cie,
      tel: cfg.tel || BO_PADRAO.tel
    };
  }

  (function prefillBo() {
    var cfg = carregarConfigBo();
    porId("bo-estabelecimento").value = cfg.estabelecimento;
    porId("bo-regiao").value = cfg.regiao;
    porId("bo-ua").value = cfg.ua;
    porId("bo-cie").value = cfg.cie;
    porId("bo-tel").value = cfg.tel;
    porId("bo-sitcat").value = "EVENTUAL";
    porId("bo-mes").value = new Date().toISOString().slice(0, 7);
  })();

  function diasNoMes(mes) {
    var ano = parseInt(mes.slice(0, 4), 10);
    var m = parseInt(mes.slice(5, 7), 10);
    return new Date(ano, m, 0).getDate();
  }

  porId("btn-gerar-bo").addEventListener("click", function () {
    var id = porId("bo-eventual").value;
    var mes = porId("bo-mes").value;
    if (!mes) { alert("Selecione o mês de referência."); return; }

    var emBranco = id === "__branco__";
    var eventual = emBranco
      ? { nome: "______________________________________", cpf: "" }
      : eventuais.find(function (e) { return e.id === id; });
    if (!eventual) {
      alert("Selecione o eventual, ou escolha a opção em branco.");
      return;
    }

    // salva os dados da escola para as próximas vezes
    var cfg = {
      estabelecimento: porId("bo-estabelecimento").value.trim(),
      regiao: porId("bo-regiao").value.trim(),
      ua: porId("bo-ua").value.trim(),
      cie: porId("bo-cie").value.trim(),
      tel: porId("bo-tel").value.trim()
    };
    try { localStorage.setItem(CHAVE_BO, JSON.stringify(cfg)); } catch (e) {}

    var sitcat = porId("bo-sitcat").value.trim() || "EVENTUAL";
    var escolaSede = emBranco ? "______________________________"
      : (eventual.escolaSede || "____________________");
    var ano = parseInt(mes.slice(0, 4), 10);
    var mesNum = parseInt(mes.slice(5, 7), 10);
    var nDias = diasNoMes(mes);

    function distintos(lista) {
      var vistos = {}, out = [];
      lista.forEach(function (v) {
        v = (v || "").trim();
        if (v && !vistos[v]) { vistos[v] = 1; out.push(v); }
      });
      return out.join("; ");
    }

    // grade dia a dia: cada dia mostra o(s) titular(es) substituído(s),
    // o R.G. deles e a disciplina; a coluna Subst. traz a quantidade
    var linhas = [];
    var totalMes = 0;
    for (var dia = 1; dia <= nDias; dia++) {
      var dataIso = mes + "-" + (dia < 10 ? "0" : "") + dia;
      var sem = DIAS_SEMANA[new Date(ano, mesNum - 1, dia).getDay()];
      var doDia = emBranco ? [] : registros.filter(function (r) {
        return r.cpfEventual === eventual.cpf && r.data === dataIso;
      });
      var qtd = doDia.reduce(function (s, r) { return s + (r.qtdAulas || 1); }, 0);
      totalMes += qtd;
      var prof = distintos(doDia.map(function (r) { return r.nomeProfessor; }));
      var rgs = distintos(doDia.map(function (r) { return r.rgProfessor; }));
      var discs = distintos(doDia.map(function (r) { return r.disciplina; }));
      var marca = qtd > 0 ? String(qtd) : "";
      linhas.push([String(dia), sem, prof, rgs, discs, marca, marca]);
    }

    var periodo = "01/" + (mesNum < 10 ? "0" : "") + mesNum + "/" + ano +
      " a " + nDias + "/" + (mesNum < 10 ? "0" : "") + mesNum + "/" + ano;

    var infos = [
      ["Professor(a) eventual", eventual.nome],
      ["Escola sede", escolaSede],
      ["Sit. / Cat.", sitcat],
      ["Período de apuração", periodo]
    ];
    if (!emBranco && eventual.cpf) {
      infos.splice(1, 0, ["CPF", eventual.cpf]);
    }

    var blob = gerarRelatorioPdf({
      titulo: "Boletim de Ocorrências — B.O.",
      subtitulo: cfg.estabelecimento + (cfg.regiao ? "   —   " + cfg.regiao : "") +
        "     ·     U.A. " + cfg.ua + "  ·  CIE " + cfg.cie + "  ·  Tel. " + cfg.tel,
      infos: infos,
      colunas: [
        { titulo: "Dia", largura: 26 },
        { titulo: "Sem.", largura: 30 },
        { titulo: "Prof. substituído", largura: 140 },
        { titulo: "R.G.", largura: 80 },
        { titulo: "Disciplina", largura: 112 },
        { titulo: "Subst.", largura: 45 },
        { titulo: "Total Geral", largura: 82 }
      ],
      linhas: linhas,
      alturaLinha: 15,
      reservaFinal: 100,
      linhasVerticais: true,
      totalTexto: "TOTAL DE AULAS (SUBSTITUIÇÕES) NO MÊS: " +
        (emBranco ? "____________" : totalMes),
      assinaturas: ["Assinatura do responsável", "Recebi em ____/____/______   —   Assinatura"]
    });

    var baseNome = emBranco ? "em-branco" :
      eventual.nome.toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "bo-" + baseNome + "-" + mes + ".pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
  });

  // ===================== Exportar / importar =====================

  porId("btn-exportar").addEventListener("click", function () {
    var dados = {
      versao: 2,
      registros: registros,
      eventuais: eventuais.filter(function (e) { return String(e.id).indexOf("antigo:") !== 0; }),
      professores: professores.filter(function (p) { return String(p.id).indexOf("antigo:") !== 0; })
    };
    var blob = new Blob([JSON.stringify(dados, null, 2)],
      { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "controle-aula-eventual-" +
      new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
  });

  porId("btn-importar").addEventListener("click", function () {
    porId("arquivo-importar").click();
  });

  porId("arquivo-importar").addEventListener("change", function (evento) {
    var arquivo = evento.target.files[0];
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = async function () {
      try {
        var dados = JSON.parse(leitor.result);
        var corpo;
        if (Array.isArray(dados)) {
          corpo = { registros: dados }; // formato antigo
        } else if (dados && typeof dados === "object") {
          corpo = dados;
        } else {
          throw new Error("o arquivo não é uma exportação válida deste app.");
        }

        var substituir = confirm(
          "Importar os dados do arquivo?\n\n" +
          "OK = substituir os dados atuais\n" +
          "Cancelar = adicionar aos dados existentes");
        corpo.substituir = substituir;
        var resultado = await requisicaoApi("POST", "/api/importar", corpo);
        await recarregarDados();
        alert(resultado.importados + " item(ns) importado(s) com sucesso.");
      } catch (erro) {
        alert("Não foi possível importar: " + erro.message);
      }
      evento.target.value = "";
    };
    leitor.readAsText(arquivo);
  });

  // ===================== Usuários =====================

  var formUsuario = porId("form-usuario");
  var usuarios = [];
  var idUsuarioEmEdicao = null;

  formUsuario.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    var senha = porId("senha-usuario-cad").value;
    if (!idUsuarioEmEdicao && senha.length < 4) {
      alert("A senha precisa ter pelo menos 4 caracteres.");
      return;
    }
    var dados = {
      id: idUsuarioEmEdicao || undefined,
      nome: porId("nome-usuario-cad").value.trim(),
      usuario: porId("login-usuario-cad").value.trim(),
      perfil: porId("perfil-usuario-cad").value,
      senha: senha
    };
    var botao = porId("btn-salvar-usuario");
    botao.disabled = true;
    try {
      await requisicaoApi("POST", "/api/usuarios", dados);
      encerrarEdicaoUsuario();
      formUsuario.reset();
      await carregarUsuarios();
    } catch (erro) {
      alert("Não foi possível salvar: " + erro.message);
    } finally {
      botao.disabled = false;
    }
  });

  porId("btn-cancelar-usuario").addEventListener("click", function () {
    encerrarEdicaoUsuario();
    formUsuario.reset();
  });

  function encerrarEdicaoUsuario() {
    idUsuarioEmEdicao = null;
    porId("btn-salvar-usuario").textContent = "Cadastrar usuário";
    porId("btn-cancelar-usuario").hidden = true;
    porId("dica-senha-usuario").hidden = true;
    porId("senha-usuario-cad").placeholder = "mín. 4 caracteres";
  }

  async function carregarUsuarios() {
    if (!permissoes.gerenciarUsuarios) return;
    usuarios = await requisicaoApi("GET", "/api/usuarios");
    var corpo = porId("tabela-usuarios").querySelector("tbody");
    corpo.innerHTML = "";
    usuarios.forEach(function (u) {
      var linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + escapeHtml(u.nome) + "</td>" +
        "<td>" + escapeHtml(u.usuario) + "</td>" +
        '<td><span class="perfil-etiqueta perfil-' + escapeHtml(u.perfil) + '">' +
          escapeHtml(u.perfil) + "</span></td>" +
        "<td>" +
        '<button type="button" class="btn-linha" title="Editar" data-acao="editar" data-id="' + u.id + '">' + SVG_EDITAR + '</button>' +
        (u.id === usuarioAtual.id ? "" :
          '<button type="button" class="btn-linha perigo" title="Excluir" data-acao="excluir" data-id="' + u.id + '">' + SVG_EXCLUIR + '</button>') +
        "</td>";
      corpo.appendChild(linha);
    });
  }

  porId("tabela-usuarios").addEventListener("click", async function (evento) {
    var botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    var usuario = usuarios.find(function (u) { return u.id === botao.dataset.id; });
    if (!usuario) return;

    if (botao.dataset.acao === "editar") {
      idUsuarioEmEdicao = usuario.id;
      porId("nome-usuario-cad").value = usuario.nome;
      porId("login-usuario-cad").value = usuario.usuario;
      porId("perfil-usuario-cad").value = usuario.perfil;
      porId("senha-usuario-cad").value = "";
      porId("senha-usuario-cad").placeholder = "deixe em branco para manter";
      porId("dica-senha-usuario").hidden = false;
      porId("btn-salvar-usuario").textContent = "Atualizar usuário";
      porId("btn-cancelar-usuario").hidden = false;
      porId("nome-usuario-cad").focus();
    } else if (botao.dataset.acao === "excluir") {
      if (!confirm("Excluir o usuário " + usuario.nome + " (" + usuario.perfil + ")?")) return;
      try {
        await requisicaoApi("DELETE", "/api/usuarios/" + usuario.id);
        await carregarUsuarios();
      } catch (erro) {
        alert("Não foi possível excluir: " + erro.message);
      }
    }
  });

  // ===================== Auditoria =====================

  async function carregarAuditoria() {
    if (!permissoes.verAuditoria) return;
    var eventos = await requisicaoApi("GET", "/api/auditoria");
    var corpo = porId("tabela-auditoria").querySelector("tbody");
    corpo.innerHTML = "";
    eventos.forEach(function (e) {
      var quando = new Date(e.dataHora);
      var linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + quando.toLocaleString("pt-BR") + "</td>" +
        "<td>" + escapeHtml(e.usuario) + "</td>" +
        "<td>" + escapeHtml(e.acao) + "</td>" +
        "<td>" + escapeHtml(e.detalhe) + "</td>";
      corpo.appendChild(linha);
    });
    porId("msg-sem-auditoria").hidden = eventos.length > 0;
  }

  porId("btn-atualizar-auditoria").addEventListener("click", function () {
    carregarAuditoria().catch(function (e) { alert(e.message); });
  });

  // ===================== Login / sessão =====================

  function mostrarApp() {
    porId("tela-acesso").hidden = true;
    porId("app").hidden = false;
  }

  function mostrarLogin(modoSetup) {
    porId("app").hidden = true;
    porId("tela-acesso").hidden = false;
    porId("form-login").hidden = !!modoSetup;
    porId("form-setup").hidden = !modoSetup;
    if (!modoSetup) porId("login-usuario").focus();
  }

  function iniciais(nome) {
    var p = String(nome || "").trim().split(/\s+/);
    var a = p[0] ? p[0][0] : "";
    var b = p.length > 1 ? p[p.length - 1][0] : "";
    return ((a + b) || "?").toUpperCase();
  }

  function aplicarPermissoes() {
    var ini = iniciais(usuarioAtual.nome);
    porId("usuario-nome").textContent = usuarioAtual.nome;
    porId("usuario-perfil-topbar").textContent = usuarioAtual.perfil;
    porId("avatar-topbar").textContent = ini;
    porId("avatar-sidebar").textContent = ini;
    porId("sidebar-usuario-nome").textContent = usuarioAtual.nome;
    porId("sidebar-usuario-perfil").textContent = usuarioAtual.perfil;
    porId("menu-usuario-nome").textContent = usuarioAtual.nome;
    porId("menu-usuario-perfil").textContent = usuarioAtual.perfil;

    // Mostra/esconde abas e itens de menu conforme a permissão
    document.querySelectorAll("#barra-abas .aba[data-perm]").forEach(function (aba) {
      aba.hidden = !permissoes[aba.dataset.perm];
    });
    document.querySelectorAll("#menu-usuario [data-perm]").forEach(function (it) {
      it.hidden = !permissoes[it.dataset.perm];
    });

    // Sempre começa pelo Dashboard
    irParaAba("dashboard");

    // AOE não edita/exclui dados: as tabelas escondem os botões (feito na renderização)
    atualizarTudo();
  }

  porId("form-login").addEventListener("submit", async function (evento) {
    evento.preventDefault();
    porId("erro-login").textContent = "";
    porId("btn-login").disabled = true;
    try {
      var resposta = await requisicaoApi("POST", "/api/login", {
        usuario: porId("login-usuario").value.trim(),
        senha: porId("login-senha").value
      });
      localStorage.setItem(CHAVE_TOKEN, resposta.token);
      porId("form-login").reset();
      await entrarNoSistema();
    } catch (erro) {
      porId("erro-login").textContent = erro.message;
    } finally {
      porId("btn-login").disabled = false;
    }
  });

  porId("form-setup").addEventListener("submit", async function (evento) {
    evento.preventDefault();
    porId("erro-setup").textContent = "";
    porId("btn-setup").disabled = true;
    try {
      var resposta = await requisicaoApi("POST", "/api/setup", {
        nome: porId("setup-nome").value.trim(),
        usuario: porId("setup-usuario").value.trim(),
        senha: porId("setup-senha").value
      });
      localStorage.setItem(CHAVE_TOKEN, resposta.token);
      porId("form-setup").reset();
      await entrarNoSistema();
    } catch (erro) {
      porId("erro-setup").textContent = erro.message;
    } finally {
      porId("btn-setup").disabled = false;
    }
  });

  porId("btn-sair").addEventListener("click", function () {
    localStorage.removeItem(CHAVE_TOKEN);
    usuarioAtual = null;
    permissoes = {};
    mostrarLogin(false);
  });

  // ===================== Dashboard =====================

  var PALETA = ["#1e3a8a", "#2563eb", "#0891b2", "#0d9488", "#7c3aed", "#94a3b8"];

  function saudacao() {
    var h = new Date().getHours();
    return h < 12 ? "Bom dia" : (h < 18 ? "Boa tarde" : "Boa noite");
  }

  function primeiroNome(nome) {
    return String(nome || "").trim().split(/\s+/)[0] || "";
  }

  function iconeSvg(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
  }

  function roscaSvg(segmentos, total) {
    // donut com circunferência 100 (truque do r = 15.915)
    var off = 25; // começa no topo
    var circulos = segmentos.map(function (s) {
      var pct = total ? (s.valor / total) * 100 : 0;
      var c = '<circle cx="21" cy="21" r="15.915" fill="none" stroke="' + s.cor +
        '" stroke-width="5" stroke-dasharray="' + pct.toFixed(2) + " " + (100 - pct).toFixed(2) +
        '" stroke-dashoffset="' + off.toFixed(2) + '"></circle>';
      off = (off - pct + 100) % 100;
      return c;
    }).join("");
    return '<svg class="rosca-svg" viewBox="0 0 42 42">' +
      '<circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" stroke-width="5"></circle>' +
      circulos +
      '<text class="rosca-centro-num" x="21" y="20.5" text-anchor="middle" dominant-baseline="middle">' + total + "</text>" +
      '<text class="rosca-centro-tx" x="21" y="26" text-anchor="middle" dominant-baseline="middle">aulas</text>' +
      "</svg>";
  }

  function renderizarDashboard() {
    if (!usuarioAtual) return;
    var alvo = porId("dashboard");
    if (!alvo) return;

    var mesAtual = new Date().toISOString().slice(0, 7);
    var regMes = registros.filter(function (r) { return r.data.slice(0, 7) === mesAtual; });
    var totalMes = totalAulas(regMes);

    // KPIs
    var kpis = [
      { num: regMes.length, label: "Aulas registradas no mês", cap: nomeDoMes(mesAtual), cls: "ki-azul",
        icone: iconeSvg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>') },
      { num: totalMes, label: "Total de aulas ministradas", cap: "Soma do mês", cls: "ki-verde",
        icone: iconeSvg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>') },
      { num: eventuais.length, label: "Eventuais cadastrados", cap: "No sistema", cls: "ki-ambar",
        icone: iconeSvg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>') },
      { num: professores.length, label: "Professores cadastrados", cap: "Com aula atribuída", cls: "ki-roxo",
        icone: iconeSvg('<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>') }
    ];
    var htmlKpis = kpis.map(function (k) {
      return '<div class="kpi"><div class="kpi-icone ' + k.cls + '">' + k.icone + "</div>" +
        '<div><div class="kpi-num">' + k.num + '</div><div class="kpi-label">' + k.label +
        '</div><div class="kpi-cap">' + escapeHtml(k.cap) + "</div></div></div>";
    }).join("");

    // Distribuição por disciplina (mês atual)
    var porDisc = {};
    regMes.forEach(function (r) { porDisc[r.disciplina] = (porDisc[r.disciplina] || 0) + (r.qtdAulas || 1); });
    var lista = Object.keys(porDisc).map(function (d) { return { nome: d, valor: porDisc[d] }; })
      .sort(function (a, b) { return b.valor - a.valor; });
    var segmentos = lista.slice(0, 5);
    if (lista.length > 6) {
      var resto = lista.slice(5).reduce(function (s, x) { return s + x.valor; }, 0);
      segmentos.push({ nome: "Outras", valor: resto });
    } else {
      segmentos = lista;
    }
    segmentos.forEach(function (s, i) { s.cor = PALETA[i % PALETA.length]; });

    var htmlGrafico;
    if (!segmentos.length) {
      htmlGrafico = '<p class="vazio">Nenhuma aula registrada em ' + nomeDoMes(mesAtual) + ".</p>";
    } else {
      var legenda = segmentos.map(function (s) {
        var pct = totalMes ? Math.round((s.valor / totalMes) * 100) : 0;
        return '<div class="rosca-item"><span class="rosca-cor" style="background:' + s.cor + '"></span>' +
          '<span class="rosca-nome">' + escapeHtml(s.nome) + '</span><span class="rosca-val">' + pct + "%</span></div>";
      }).join("");
      htmlGrafico = '<div class="rosca-bloco">' + roscaSvg(segmentos, totalMes) +
        '<div class="rosca-legenda">' + legenda + "</div></div>";
    }

    // Aulas recentes
    var recentes = registros.slice().sort(function (a, b) { return b.data.localeCompare(a.data); }).slice(0, 6);
    var htmlRecentes;
    if (!recentes.length) {
      htmlRecentes = '<p class="vazio">Nenhuma aula registrada ainda.</p>';
    } else {
      var linhas = recentes.map(function (r) {
        return "<tr><td>" + formatarData(r.data) + "</td><td>" + escapeHtml(r.nomeEventual) +
          "</td><td>" + escapeHtml(r.serie) + "</td><td>" + escapeHtml(r.disciplina) +
          "</td><td>" + r.qtdAulas + "</td><td>" + escapeHtml(r.nomeProfessor) +
          '</td><td><span class="status status-ok">Registrada</span></td></tr>';
      }).join("");
      htmlRecentes = '<div class="tabela-rolagem"><table><thead><tr>' +
        "<th>Data</th><th>Eventual</th><th>Turma</th><th>Disciplina</th><th>Aulas</th><th>Prof. substituído</th><th>Status</th>" +
        "</tr></thead><tbody>" + linhas + "</tbody></table></div>";
    }

    // Atalhos
    var atalhos = [
      { ir: "aulas", t: "Registrar nova aula", s: "Lançar uma aula eventual",
        i: iconeSvg('<path d="M12 5v14M5 12h14"/>') },
      { ir: "relatorio", t: "Gerar relatório mensal", s: "Exportar PDF por eventual",
        i: iconeSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>') },
      { ir: "folha", t: "Folha de controle", s: "Imprimir folha para o eventual",
        i: iconeSvg('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>') }
    ];
    var htmlAtalhos = atalhos.map(function (a) {
      return '<button type="button" class="atalho" data-ir="' + a.ir + '">' +
        '<span class="atalho-icone">' + a.i + '</span>' +
        '<span class="atalho-texto">' + a.t + "<small>" + a.s + "</small></span>" +
        iconeSvg('<path d="m9 18 6-6-6-6"/>') + "</button>";
    }).join("");

    alvo.innerHTML =
      '<div class="dash-ola"><h2>' + saudacao() + ", " + escapeHtml(primeiroNome(usuarioAtual.nome)) + "!</h2>" +
      "<p>Veja o resumo das aulas eventuais deste mês.</p></div>" +
      '<div class="kpis">' + htmlKpis + "</div>" +
      '<div class="dash-grid">' +
        '<section class="cartao"><div class="cabecalho-secao"><h2>Aulas recentes</h2>' +
          '<button type="button" class="link-ver" data-ir="aulas">Ver todas</button></div>' + htmlRecentes + "</section>" +
        '<div style="display:flex;flex-direction:column;gap:var(--e5)">' +
          '<section class="cartao"><h2>Distribuição por disciplina</h2>' + htmlGrafico + "</section>" +
          '<section class="cartao"><h2>Atalhos</h2><div class="atalhos">' + htmlAtalhos + "</div></section>" +
        "</div>" +
      "</div>";
  }

  porId("dashboard").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ir]");
    if (b) irParaAba(b.dataset.ir);
  });

  function renderizarNotificacoes() {
    var itens = [];
    if (!porId("aviso-banco").hidden) {
      itens.push({ cor: "var(--dang)", t: "Banco de dados não configurado", s: "Configure a variável DATABASE_URL no Railway." });
    }
    if (professores.length === 0) {
      itens.push({ cor: "var(--warn-tx)", t: "Nenhum professor cadastrado", s: "Cadastre professores para lançar aulas." });
    }
    if (eventuais.length === 0) {
      itens.push({ cor: "var(--warn-tx)", t: "Nenhum eventual cadastrado", s: "Cadastre os professores eventuais." });
    }
    var mesAtual = new Date().toISOString().slice(0, 7);
    var n = registros.filter(function (r) { return r.data.slice(0, 7) === mesAtual; }).length;
    itens.push({ cor: "var(--primary-700)", t: n + " aula(s) registrada(s) no mês", s: nomeDoMes(mesAtual) });

    var temAlerta = itens.some(function (i) { return i.cor !== "var(--primary-700)"; });
    porId("badge-notificacoes").hidden = !temAlerta;

    porId("lista-notificacoes").innerHTML = itens.map(function (i) {
      return '<div class="notif-item"><span class="notif-ponto" style="background:' + i.cor + '"></span>' +
        "<div>" + escapeHtml(i.t) + "<small>" + escapeHtml(i.s) + "</small></div></div>";
    }).join("");
  }

  // ===================== Inicialização =====================

  function atualizarTudo() {
    atualizarTabela();
    atualizarTabelaEventuais();
    atualizarTabelaProfessores();
    atualizarSelectEventuais();
    atualizarSelectProfessores();
    atualizarFiltroEventuais();
    atualizarPrevia();
    renderizarDashboard();
    renderizarNotificacoes();
  }

  async function entrarNoSistema() {
    var sessao = await requisicaoApi("GET", "/api/sessao");
    usuarioAtual = sessao.usuario;
    permissoes = sessao.permissoes || {};
    porId("aviso-banco").hidden = sessao.armazenamento !== "arquivo";
    mostrarApp();
    aplicarPermissoes();
    await recarregarDados();
    if (permissoes.gerenciarUsuarios) await carregarUsuarios();
    if (permissoes.verAuditoria) await carregarAuditoria();
    if (permissoes.alterarDados) await migrarDadosAntigos();
  }

  (async function iniciar() {
    var estado;
    try {
      estado = await requisicaoApi("GET", "/api/estado");
    } catch (erro) {
      alert(erro.message);
      return;
    }
    if (estado.precisaConfigurar) {
      mostrarLogin(true); // primeiro acesso: cria o GOE
      return;
    }
    if (!token()) {
      mostrarLogin(false);
      return;
    }
    try {
      await entrarNoSistema();
    } catch (erro) {
      // token inválido/expirado ou sem sessão: volta ao login
      localStorage.removeItem(CHAVE_TOKEN);
      mostrarLogin(false);
      if (!erro.semSessao) alert(erro.message);
    }
  })();
})();

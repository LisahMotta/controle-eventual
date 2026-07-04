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

  // ===================== Comunicação com o servidor =====================

  function codigoAcesso() {
    return localStorage.getItem(CHAVE_CODIGO) || "";
  }

  function pedirCodigo(mensagem) {
    var codigo = prompt(mensagem ||
      "Digite o código de acesso do Controle de Aula Eventual:");
    if (codigo === null) return false;
    localStorage.setItem(CHAVE_CODIGO, codigo.trim());
    return true;
  }

  async function requisicaoApi(metodo, caminho, corpo) {
    for (var tentativa = 0; tentativa < 5; tentativa++) {
      var opcoes = {
        method: metodo,
        headers: { "Content-Type": "application/json" }
      };
      var codigo = codigoAcesso();
      if (codigo) opcoes.headers["X-Codigo-Acesso"] = codigo;
      if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);

      var resposta;
      try {
        resposta = await fetch(caminho, opcoes);
      } catch (e) {
        throw new Error("Sem conexão com o servidor. Verifique a internet e tente novamente.");
      }

      if (resposta.status === 401) {
        var continuar = pedirCodigo(tentativa === 0
          ? "Digite o código de acesso do Controle de Aula Eventual:"
          : "Código incorreto. Tente novamente:");
        if (!continuar) throw new Error("É preciso informar o código de acesso para usar o app.");
        continue;
      }

      var dados = await resposta.json().catch(function () { return {}; });
      if (!resposta.ok) {
        throw new Error(dados.erro || "Erro no servidor (" + resposta.status + ").");
      }
      return dados;
    }
    throw new Error("É preciso informar o código de acesso para usar o app.");
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

  // ===================== Abas =====================

  porId("barra-abas").addEventListener("click", function (evento) {
    var botao = evento.target.closest("button[data-aba]");
    if (!botao) return;
    document.querySelectorAll("#barra-abas .aba").forEach(function (aba) {
      aba.classList.toggle("ativa", aba === botao);
    });
    document.querySelectorAll("main .painel").forEach(function (painel) {
      painel.hidden = painel.id !== "aba-" + botao.dataset.aba;
    });
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
      cpf: formatarCpf(campoCpfEventualCad.value)
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

  function atualizarTabelaEventuais() {
    var corpo = porId("tabela-eventuais").querySelector("tbody");
    corpo.innerHTML = "";
    eventuais.forEach(function (e) {
      var linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + escapeHtml(e.nome) + "</td>" +
        "<td>" + escapeHtml(e.cpf) + "</td>" +
        "<td>" +
        '<button type="button" class="btn-linha" title="Editar" data-acao="editar" data-id="' + e.id + '">✏️</button>' +
        '<button type="button" class="btn-linha" title="Excluir" data-acao="excluir" data-id="' + e.id + '">🗑️</button>' +
        "</td>";
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
        "<td>" + escapeHtml(p.disciplina) + "</td>" +
        '<td class="celula-turmas">' + escapeHtml((p.series || []).join(", ")) + "</td>" +
        "<td>" +
        '<button type="button" class="btn-linha" title="Editar" data-acao="editar" data-id="' + p.id + '">✏️</button>' +
        '<button type="button" class="btn-linha" title="Excluir" data-acao="excluir" data-id="' + p.id + '">🗑️</button>' +
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

  function preencherSelectComEventuais(select) {
    var valorAtual = select.value;
    select.innerHTML = '<option value="">— Selecione o eventual —</option>';
    eventuais.forEach(function (e) {
      var opcao = document.createElement("option");
      opcao.value = e.id;
      opcao.textContent = e.nome + " — " + e.cpf;
      select.appendChild(opcao);
    });
    if (valorAtual && eventuais.some(function (e) { return e.id === valorAtual; })) {
      select.value = valorAtual;
    }
  }

  function atualizarSelectEventuais() {
    preencherSelectComEventuais(porId("sel-eventual"));
    preencherSelectComEventuais(porId("folha-eventual"));
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
    lista.forEach(function (p) {
      var opcao = document.createElement("option");
      opcao.value = p.id;
      opcao.textContent = p.nome + " — " + p.disciplina;
      select.appendChild(opcao);
    });
    if (valorAtual && lista.some(function (p) { return p.id === valorAtual; })) {
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

  function atualizarCpfProfessor() {
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
    var professor = professorSelecionado();
    if (!eventual) {
      alert("Selecione o professor eventual. Se a lista estiver vazia, cadastre na aba Eventuais.");
      return;
    }
    if (!professor) {
      alert("Selecione o professor substituído. Se a lista estiver vazia, cadastre na aba Professores.");
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
      nomeProfessor: professor.nome,
      cpfProfessor: professor.cpf
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
    var professor = professores.find(function (p) { return p.cpf === registro.cpfProfessor; });

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

    if (professor) {
      porId("sel-professor").value = professor.id;
    } else {
      var idTempProf = "antigo:" + registro.cpfProfessor;
      professores.push({
        id: idTempProf, nome: registro.nomeProfessor,
        cpf: registro.cpfProfessor, disciplina: registro.disciplina, series: []
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
        "<td>" +
        '<button type="button" class="btn-linha" title="Editar" data-acao="editar" data-id="' + r.id + '">✏️</button>' +
        '<button type="button" class="btn-linha" title="Excluir" data-acao="excluir" data-id="' + r.id + '">🗑️</button>' +
        "</td>";
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

    var eventual = eventuais.find(function (e) { return e.id === id; });
    if (!eventual) {
      alert("Selecione o eventual. Se a lista estiver vazia, cadastre na aba Eventuais.");
      return;
    }
    if (!mes) {
      alert("Selecione o mês de referência.");
      return;
    }

    // 31 linhas em branco, uma para cada dia do mês
    var linhas = [];
    for (var dia = 1; dia <= 31; dia++) {
      linhas.push([(dia < 10 ? "0" : "") + dia, "", "", "", ""]);
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

    var nomeArquivo = "folha-controle-" +
      eventual.nome.toLowerCase().normalize("NFD")
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

  // ===================== Inicialização =====================

  function atualizarTudo() {
    atualizarTabela();
    atualizarTabelaEventuais();
    atualizarTabelaProfessores();
    atualizarSelectEventuais();
    atualizarSelectProfessores();
    atualizarFiltroEventuais();
    atualizarPrevia();
  }

  async function verificarBanco() {
    try {
      var sessao = await requisicaoApi("GET", "/api/sessao");
      // Avisa quando o servidor está sem banco de dados (modo arquivo),
      // pois nesse modo os dados são apagados a cada atualização do app
      porId("aviso-banco").hidden = sessao.armazenamento !== "arquivo";
    } catch (e) {
      // sem conexão: o carregamento inicial já mostra o erro
    }
  }

  (async function iniciar() {
    try {
      await verificarBanco();
      await recarregarDados();
      await migrarDadosAntigos();
    } catch (erro) {
      alert(erro.message);
    }
  })();
})();

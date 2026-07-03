(function () {
  "use strict";

  var CHAVE_ARMAZENAMENTO = "controle-aula-eventual:registros";

  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

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

  // ===================== Persistência =====================

  function carregarRegistros() {
    try {
      var dados = JSON.parse(localStorage.getItem(CHAVE_ARMAZENAMENTO));
      return Array.isArray(dados) ? dados : [];
    } catch (e) {
      return [];
    }
  }

  function salvarRegistros(registros) {
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(registros));
  }

  var registros = carregarRegistros();
  var idEmEdicao = null;

  // ===================== Formulário =====================

  var form = porId("form-aula");
  var campoCpfEventual = porId("cpf-eventual");
  var campoCpfProfessor = porId("cpf-professor");

  [campoCpfEventual, campoCpfProfessor].forEach(function (campo) {
    campo.addEventListener("input", function () {
      campo.value = formatarCpf(campo.value);
      validarCampoCpf(campo);
    });
  });

  function validarCampoCpf(campo) {
    var spanErro = porId("erro-" + campo.id);
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

  // Data padrão: hoje
  porId("data-aula").value = new Date().toISOString().slice(0, 10);
  porId("filtro-mes").value = new Date().toISOString().slice(0, 7);

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();

    var cpfEventualOk = validarCampoCpf(campoCpfEventual);
    var cpfProfessorOk = validarCampoCpf(campoCpfProfessor);
    if (!cpfEventualOk) {
      porId("erro-cpf-eventual").textContent = "Informe um CPF válido (11 dígitos).";
      campoCpfEventual.classList.add("invalido");
    }
    if (!cpfProfessorOk) {
      porId("erro-cpf-professor").textContent = "Informe um CPF válido (11 dígitos).";
      campoCpfProfessor.classList.add("invalido");
    }
    if (!cpfEventualOk || !cpfProfessorOk) return;

    var registro = {
      id: idEmEdicao || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      nomeEventual: porId("nome-eventual").value.trim(),
      cpfEventual: formatarCpf(campoCpfEventual.value),
      data: porId("data-aula").value,
      serie: porId("serie").value.trim(),
      disciplina: porId("disciplina").value.trim(),
      qtdAulas: Math.max(1, parseInt(porId("qtd-aulas").value, 10) || 1),
      nomeProfessor: porId("nome-professor").value.trim(),
      cpfProfessor: formatarCpf(campoCpfProfessor.value)
    };

    if (idEmEdicao) {
      var indice = registros.findIndex(function (r) { return r.id === idEmEdicao; });
      if (indice >= 0) registros[indice] = registro;
      encerrarEdicao();
    } else {
      registros.push(registro);
    }

    salvarRegistros(registros);
    form.reset();
    porId("data-aula").value = new Date().toISOString().slice(0, 10);
    porId("qtd-aulas").value = 1;
    atualizarTudo();
    porId("nome-eventual").focus();
  });

  porId("btn-cancelar-edicao").addEventListener("click", function () {
    encerrarEdicao();
    form.reset();
    porId("data-aula").value = new Date().toISOString().slice(0, 10);
    porId("qtd-aulas").value = 1;
  });

  function iniciarEdicao(registro) {
    idEmEdicao = registro.id;
    porId("nome-eventual").value = registro.nomeEventual;
    campoCpfEventual.value = registro.cpfEventual;
    porId("data-aula").value = registro.data;
    porId("serie").value = registro.serie;
    porId("disciplina").value = registro.disciplina;
    porId("qtd-aulas").value = registro.qtdAulas;
    porId("nome-professor").value = registro.nomeProfessor;
    campoCpfProfessor.value = registro.cpfProfessor;
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

  porId("tabela-registros").addEventListener("click", function (evento) {
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
      registros = registros.filter(function (r) { return r.id !== registro.id; });
      if (idEmEdicao === registro.id) encerrarEdicao();
      salvarRegistros(registros);
      atualizarTudo();
    }
  });

  // ===================== Filtro do relatório =====================

  function atualizarFiltroEventuais() {
    var seletor = porId("filtro-eventual");
    var valorAtual = seletor.value;
    seletor.innerHTML = '<option value="">— Selecione o eventual —</option>';

    var vistos = {};
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

  function atualizarSugestoesSeries() {
    var lista = porId("lista-series");
    lista.innerHTML = "";
    var vistas = {};
    registros.forEach(function (r) { vistas[r.serie] = true; });
    Object.keys(vistas).sort().forEach(function (serie) {
      var opcao = document.createElement("option");
      opcao.value = serie;
      lista.appendChild(opcao);
    });
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
      "Aulas de " + aulas[0].nomeEventual + " em " + nomeDoMes(mes);

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

    var nomeEventual = aulas[0].nomeEventual;
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
        { titulo: "Série/Turma", largura: 85 },
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

  // ===================== Exportar / importar =====================

  porId("btn-exportar").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(registros, null, 2)],
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
    leitor.onload = function () {
      try {
        var dados = JSON.parse(leitor.result);
        if (!Array.isArray(dados)) throw new Error("formato inválido");
        var validos = dados.filter(function (r) {
          return r && r.nomeEventual && r.cpfEventual && r.data;
        });
        if (!validos.length) throw new Error("nenhum registro válido");

        var substituir = confirm(
          "Importar " + validos.length + " registro(s)?\n\n" +
          "OK = substituir os dados atuais\n" +
          "Cancelar = adicionar aos dados existentes");
        if (substituir) {
          registros = validos;
        } else {
          var idsExistentes = {};
          registros.forEach(function (r) { idsExistentes[r.id] = true; });
          validos.forEach(function (r) {
            if (!idsExistentes[r.id]) registros.push(r);
          });
        }
        salvarRegistros(registros);
        atualizarTudo();
        alert("Dados importados com sucesso.");
      } catch (e) {
        alert("Não foi possível importar: o arquivo não é uma exportação válida deste app.");
      }
      evento.target.value = "";
    };
    leitor.readAsText(arquivo);
  });

  // ===================== Inicialização =====================

  function atualizarTudo() {
    atualizarTabela();
    atualizarFiltroEventuais();
    atualizarSugestoesSeries();
    atualizarPrevia();
  }

  atualizarTudo();
})();

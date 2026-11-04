/*
 * Mini gerador de PDF, sem dependências externas.
 * Produz um documento A4 com título, linhas de informação, tabela
 * paginada, total e campos de assinatura. Usa as fontes padrão
 * Helvetica/Helvetica-Bold com codificação WinAnsi, que cobre os
 * caracteres acentuados do português.
 */
(function () {
  "use strict";

  var LARGURA_PAGINA = 595.28; // A4 em pontos
  var ALTURA_PAGINA = 841.89;
  var MARGEM = 40;

  // Converte texto JS (UTF-16) para bytes WinAnsi (cp1252), escapando
  // os caracteres reservados de string do PDF.
  function paraWinAnsi(texto) {
    var mapa = {
      0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133,
      0x2020: 134, 0x2021: 135, 0x02c6: 136, 0x2030: 137, 0x0160: 138,
      0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146,
      0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151,
      0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155, 0x0153: 156,
      0x017e: 158, 0x0178: 159
    };
    var saida = [];
    for (var i = 0; i < texto.length; i++) {
      var codigo = texto.charCodeAt(i);
      if (codigo > 255) codigo = mapa[codigo] || 63; // "?" para não mapeáveis
      if (codigo === 0x5c) { saida.push(0x5c, 0x5c); continue; }   // \
      if (codigo === 0x28) { saida.push(0x5c, 0x28); continue; }   // (
      if (codigo === 0x29) { saida.push(0x5c, 0x29); continue; }   // )
      saida.push(codigo);
    }
    return saida;
  }

  // Estimativa de largura de texto em Helvetica (suficiente para truncar).
  function larguraTexto(texto, tamanho) {
    return texto.length * tamanho * 0.5;
  }

  function truncar(texto, larguraMax, tamanho) {
    texto = String(texto == null ? "" : texto);
    if (larguraTexto(texto, tamanho) <= larguraMax) return texto;
    while (texto.length > 1 && larguraTexto(texto + "…", tamanho) > larguraMax) {
      texto = texto.slice(0, -1);
    }
    return texto + "…";
  }

  function num(v) {
    return Math.round(v * 100) / 100;
  }

  // Monta o fluxo de conteúdo de uma página como array de bytes.
  function ConteudoPagina() {
    this.ops = [];
  }
  ConteudoPagina.prototype.texto = function (x, y, tam, negrito, str) {
    this.ops.push("BT /" + (negrito ? "F2" : "F1") + " " + tam + " Tf " +
      num(x) + " " + num(y) + " Td (");
    this.ops.push(paraWinAnsi(str));
    this.ops.push(") Tj ET\n");
  };
  ConteudoPagina.prototype.linha = function (x1, y1, x2, y2, cinza) {
    this.ops.push(num(cinza) + " G " + num(x1) + " " + num(y1) + " m " +
      num(x2) + " " + num(y2) + " l S\n");
  };
  ConteudoPagina.prototype.retangulo = function (x, y, l, a, cinza) {
    this.ops.push(num(cinza) + " g " + num(x) + " " + num(y) + " " +
      num(l) + " " + num(a) + " re f 0 g\n");
  };
  ConteudoPagina.prototype.bytes = function () {
    var saida = [];
    for (var i = 0; i < this.ops.length; i++) {
      var op = this.ops[i];
      if (typeof op === "string") {
        for (var j = 0; j < op.length; j++) saida.push(op.charCodeAt(j) & 0xff);
      } else {
        saida.push.apply(saida, op);
      }
    }
    return saida;
  };

  // Serializa o documento inteiro e devolve um Blob.
  function montarDocumento(paginas) {
    var objetos = []; // cada item: array de bytes do corpo do objeto

    function textoParaBytes(s) {
      var b = [];
      for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 0xff);
      return b;
    }

    // obj 1: catálogo | obj 2: pages | obj 3: F1 | obj 4: F2
    var totalPaginas = paginas.length;
    var refsPaginas = [];
    for (var p = 0; p < totalPaginas; p++) {
      refsPaginas.push((5 + p * 2) + " 0 R");
    }

    objetos.push(textoParaBytes("<< /Type /Catalog /Pages 2 0 R >>"));
    objetos.push(textoParaBytes("<< /Type /Pages /Kids [" + refsPaginas.join(" ") +
      "] /Count " + totalPaginas + " >>"));
    objetos.push(textoParaBytes(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
    objetos.push(textoParaBytes(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));

    for (var k = 0; k < totalPaginas; k++) {
      var numObjConteudo = 6 + k * 2;
      objetos.push(textoParaBytes(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + LARGURA_PAGINA + " " +
        ALTURA_PAGINA + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " +
        numObjConteudo + " 0 R >>"));
      var corpo = paginas[k].bytes();
      var stream = textoParaBytes("<< /Length " + corpo.length + " >>\nstream\n")
        .concat(corpo, textoParaBytes("\nendstream"));
      objetos.push(stream);
    }

    var bytes = textoParaBytes("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    var deslocamentos = [];
    for (var o = 0; o < objetos.length; o++) {
      deslocamentos.push(bytes.length);
      bytes = bytes.concat(
        textoParaBytes((o + 1) + " 0 obj\n"),
        objetos[o],
        textoParaBytes("\nendobj\n"));
    }

    var inicioXref = bytes.length;
    var xref = "xref\n0 " + (objetos.length + 1) + "\n0000000000 65535 f \n";
    for (var d = 0; d < deslocamentos.length; d++) {
      xref += ("0000000000" + deslocamentos[d]).slice(-10) + " 00000 n \n";
    }
    xref += "trailer\n<< /Size " + (objetos.length + 1) +
      " /Root 1 0 R >>\nstartxref\n" + inicioXref + "\n%%EOF";
    bytes = bytes.concat(textoParaBytes(xref));

    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  }

  /*
   * API pública.
   * opcoes = {
   *   titulo: string,
   *   subtitulo: string,
   *   infos: [ [rotulo, valor], ... ],
   *   colunas: [ { titulo, largura }, ... ]  (larguras somando <= 515),
   *   linhas: [ [cel, cel, ...], ... ],
   *   totalTexto: string,
   *   assinaturas: [rotulo1, rotulo2]  (opcional)
   * }
   */
  window.gerarRelatorioPdf = function (opcoes) {
    var xInicial = MARGEM;
    var alturaLinha = opcoes.alturaLinha || 20;
    var reservaFinal = opcoes.reservaFinal || 120;
    var tamFonteTabela = 9;
    var paginas = [];
    var pagina = null;
    var y = 0;

    function bordasColunas() {
      var xs = [xInicial];
      var x = xInicial;
      for (var c = 0; c < opcoes.colunas.length; c++) {
        x += opcoes.colunas[c].largura;
        xs.push(x);
      }
      return xs;
    }

    function linhasVerticais(yTopo, yBase) {
      if (!opcoes.linhasVerticais) return;
      bordasColunas().forEach(function (x) {
        pagina.linha(x, yTopo, x, yBase, 0.6);
      });
    }

    function novaPagina() {
      pagina = new ConteudoPagina();
      paginas.push(pagina);
      y = ALTURA_PAGINA - MARGEM;

      pagina.texto(xInicial, y - 6, 14, true, opcoes.titulo);
      y -= 24;
      if (opcoes.subtitulo) {
        pagina.texto(xInicial, y, 10, false, opcoes.subtitulo);
        y -= 18;
      }
      if (paginas.length === 1 && opcoes.infos) {
        y -= 4;
        for (var i = 0; i < opcoes.infos.length; i++) {
          pagina.texto(xInicial, y, 10, true, opcoes.infos[i][0] + ": ");
          pagina.texto(xInicial + larguraTexto(opcoes.infos[i][0] + ":  ", 10) + 8,
            y, 10, false, opcoes.infos[i][1]);
          y -= 16;
        }
      }
      y -= 8;
      desenharCabecalhoTabela();
    }

    function desenharCabecalhoTabela() {
      pagina.retangulo(xInicial, y - alturaLinha + 5, larguraTabela(), alturaLinha, 0.9);
      var x = xInicial;
      for (var c = 0; c < opcoes.colunas.length; c++) {
        pagina.texto(x + 4, y - 9, tamFonteTabela, true, opcoes.colunas[c].titulo);
        x += opcoes.colunas[c].largura;
      }
      var yTopo = y + 5;
      y -= alturaLinha;
      pagina.linha(xInicial, yTopo, xInicial + larguraTabela(), yTopo, 0.6);
      pagina.linha(xInicial, y + 5, xInicial + larguraTabela(), y + 5, 0.6);
      linhasVerticais(yTopo, y + 5);
    }

    function larguraTabela() {
      var total = 0;
      for (var c = 0; c < opcoes.colunas.length; c++) total += opcoes.colunas[c].largura;
      return total;
    }

    novaPagina();

    for (var l = 0; l < opcoes.linhas.length; l++) {
      if (y < MARGEM + reservaFinal) novaPagina(); // reserva espaço p/ total e assinaturas
      var x = xInicial;
      for (var c = 0; c < opcoes.colunas.length; c++) {
        var celula = truncar(opcoes.linhas[l][c], opcoes.colunas[c].largura - 8, tamFonteTabela);
        pagina.texto(x + 4, y - 9, tamFonteTabela, false, celula);
        x += opcoes.colunas[c].largura;
      }
      var yTopoLinha = y + 5;
      y -= alturaLinha;
      pagina.linha(xInicial, y + 5, xInicial + larguraTabela(), y + 5, 0.85);
      linhasVerticais(yTopoLinha, y + 5);
    }

    // Total
    y -= 14;
    pagina.texto(xInicial, y, 11, true, opcoes.totalTexto);

    // Assinaturas
    if (opcoes.assinaturas && opcoes.assinaturas.length) {
      var yAss = Math.max(MARGEM + 30, y - 70);
      var larguraAss = 210;
      var espaco = (LARGURA_PAGINA - 2 * MARGEM - larguraAss * opcoes.assinaturas.length) /
        Math.max(1, opcoes.assinaturas.length - 1);
      for (var a = 0; a < opcoes.assinaturas.length; a++) {
        var xAss = xInicial + a * (larguraAss + espaco);
        pagina.linha(xAss, yAss, xAss + larguraAss, yAss, 0.2);
        pagina.texto(xAss + 30, yAss - 14, 9, false, opcoes.assinaturas[a]);
      }
    }

    // Numeração e data de emissão em todas as páginas
    var agora = new Date();
    var emissao = "Emitido em " + agora.toLocaleDateString("pt-BR") + " às " +
      agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    for (var p = 0; p < paginas.length; p++) {
      paginas[p].texto(xInicial, MARGEM - 15, 8, false, emissao);
      paginas[p].texto(LARGURA_PAGINA - MARGEM - 80, MARGEM - 15, 8, false,
        "Página " + (p + 1) + " de " + paginas.length);
    }

    return montarDocumento(paginas);
  };
})();

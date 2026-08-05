/*
 * Controle Eventual — autenticação leve (client-side).
 *
 * Guarda as contas no localStorage do navegador e faz login, cadastro e
 * reset de senha SEM servidor externo — o suficiente para usar o app em
 * desenvolvimento. As senhas nunca são guardadas em texto puro: usamos
 * PBKDF2 (SHA-256) com salt por usuário via Web Crypto.
 *
 * ATENÇÃO: por ser client-side, os dados ficam só neste navegador e isto
 * NÃO é seguro para produção. Quando quiser contas reais, com e-mail e
 * acesso de vários dispositivos, o próximo passo é trocar este arquivo por
 * um back-end de verdade (ex.: Supabase). A API pública abaixo foi pensada
 * para essa troca ser simples.
 */
(function (global) {
  'use strict';

  var USERS_KEY = 'ce_users';
  var SESSION_KEY = 'ce_session';
  var ITERATIONS = 100000;

  function readUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  function normEmail(email) {
    return String(email || '').trim().toLowerCase();
  }
  function bufToHex(buf) {
    return Array.prototype.map
      .call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); })
      .join('');
  }
  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }
  function randomSaltHex() {
    return bufToHex(crypto.getRandomValues(new Uint8Array(16)));
  }
  async function derive(password, saltBytes) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: 'SHA-256' },
      keyMaterial, 256);
    return bufToHex(bits);
  }

  var CEAuth = {
    // Cria a conta e já deixa a pessoa logada. Rejeita se o e-mail já existir.
    register: async function (opts) {
      var email = normEmail(opts.email);
      var password = opts.password || '';
      if (!email) throw new Error('Informe um e-mail válido.');
      if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
      var users = readUsers();
      if (users[email]) throw new Error('Já existe uma conta com esse e-mail.');
      var salt = randomSaltHex();
      users[email] = {
        name: (opts.name || '').trim(),
        salt: salt,
        hash: await derive(password, hexToBytes(salt))
      };
      writeUsers(users);
      localStorage.setItem(SESSION_KEY, email);
      return { email: email };
    },

    // Valida e-mail + senha. Mensagem genérica de propósito (não revela qual falhou).
    login: async function (email, password) {
      email = normEmail(email);
      var users = readUsers();
      var user = users[email];
      if (!user) throw new Error('E-mail ou senha incorretos.');
      var hash = await derive(password || '', hexToBytes(user.salt));
      if (hash !== user.hash) throw new Error('E-mail ou senha incorretos.');
      localStorage.setItem(SESSION_KEY, email);
      return { email: email };
    },

    // Define uma nova senha para uma conta existente.
    resetPassword: async function (email, newPassword) {
      email = normEmail(email);
      var users = readUsers();
      var user = users[email];
      if (!user) throw new Error('Não encontramos uma conta com esse e-mail.');
      if ((newPassword || '').length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
      var salt = randomSaltHex();
      user.salt = salt;
      user.hash = await derive(newPassword, hexToBytes(salt));
      writeUsers(users);
      return { email: email };
    },

    accountExists: function (email) {
      return !!readUsers()[normEmail(email)];
    },

    currentUser: function () {
      var email = localStorage.getItem(SESSION_KEY);
      return email && readUsers()[email] ? email : null;
    },

    logout: function () {
      localStorage.removeItem(SESSION_KEY);
    },

    // Redireciona para o login se ninguém estiver autenticado.
    requireAuth: function () {
      if (!CEAuth.currentUser()) { location.replace('login.html'); return false; }
      return true;
    }
  };

  global.CEAuth = CEAuth;
})(window);

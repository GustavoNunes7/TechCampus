/* =====================================================
   TROCA DE SENHA */

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { db, positiveId } = require("../models");
const autenticar = require("../middlewares/auth");
const { admin } = require("../middlewares/auth");

const r = express.Router();
const wrap = (fn) => (req, res, next) =>
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
const bad = (res, msg = "Dados inválidos.") => res.status(400).json({ erro: msg });

// Migração: marca quem entrou com senha provisória e precisa trocá-la
if (!db.prepare("PRAGMA table_info(usuarios)").all().some((c) => c.name === "trocar_senha"))
  db.exec("ALTER TABLE usuarios ADD COLUMN trocar_senha INTEGER NOT NULL DEFAULT 0");

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Tente novamente mais tarde." },
});

const senhaValida = (s) => typeof s === "string" && s.length >= 5 && s.length <= 128;

// Sem caracteres ambíguos (0/O, 1/l/I) para facilitar o ditado/anotação
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const gerarSenha = (n = 12) =>
  Array.from({ length: n }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");

// O usuário precisa trocar a senha provisória?
r.get("/perfil/senha/status", autenticar, (req, res) => {
  const u = db.prepare("SELECT trocar_senha FROM usuarios WHERE id=?").get(req.usuario.id);
  if (!u) return res.sendStatus(401);
  res.json({ trocar_senha: u.trocar_senha ? 1 : 0 });
});

// Trocar a própria senha (exige a senha atual)
r.patch(
  "/perfil/senha",
  autenticar,
  limite,
  wrap(async (req, res) => {
    const { senha_atual, senha_nova } = req.body || {};
    if (typeof senha_atual !== "string" || !senhaValida(senha_nova))
      return bad(res, "A nova senha deve ter de 5 a 128 caracteres.");
    const u = db.prepare("SELECT * FROM usuarios WHERE id=?").get(req.usuario.id);
    if (!u) return res.sendStatus(401);
    // 400 (e não 401) para o front não confundir com sessão expirada
    if (!(await bcrypt.compare(senha_atual, u.senha_hash)))
      return bad(res, "Senha atual incorreta.");
    if (senha_atual === senha_nova)
      return bad(res, "A nova senha precisa ser diferente da atual.");
    const hash = await bcrypt.hash(senha_nova, 12);
    db.prepare("UPDATE usuarios SET senha_hash=?, trocar_senha=0 WHERE id=?").run(hash, u.id);
    res.json({ mensagem: "Senha alterada com sucesso." });
  }),
);

// Gerente gera senha provisória (somente para alunos). A senha aparece UMA vez.
r.post(
  "/admin/usuarios/:id/senha-provisoria",
  autenticar,
  admin,
  wrap(async (req, res) => {
    const u = db.prepare("SELECT id,nome,email,papel FROM usuarios WHERE id=?").get(positiveId(req.params.id));
    if (!u) return res.sendStatus(404);
    if (u.papel !== "aluno")
      return bad(res, "Só é possível gerar senha provisória para alunos.");
    const senha = gerarSenha();
    const hash = await bcrypt.hash(senha, 12);
    db.prepare("UPDATE usuarios SET senha_hash=?, trocar_senha=1 WHERE id=?").run(hash, u.id);
    res.set("Cache-Control", "no-store");
    res.json({ senha_provisoria: senha, usuario: { id: u.id, nome: u.nome, email: u.email } });
  }),
);

module.exports = r;
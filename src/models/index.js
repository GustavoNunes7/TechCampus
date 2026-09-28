const { db } = require("../database/sqlite");
const publicUser = (u) =>
  u && {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    turma: u.turma,
    telefone: u.telefone,
    criado_em: u.criado_em,
  };
const validEmail = (email) =>
  typeof email === "string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
  email.length <= 254;
const clean = (s, max = 255) =>
  typeof s === "string" ? s.trim().slice(0, max) : "";
const positiveId = (x) =>
  Number.isSafeInteger(Number(x)) && Number(x) > 0 ? Number(x) : null;
module.exports = { db, publicUser, validEmail, clean, positiveId };

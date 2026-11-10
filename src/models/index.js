const { db } = require("../database/sqlite");
const publicUser = (u) =>
  u && {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    admin_lider: u.admin_lider === 1,
    turma: u.turma,
    matricula: u.matricula || "",
    telefone: u.telefone,
    cpf: u.cpf || "",
    data_nascimento: u.data_nascimento || "",
    genero: u.genero || "",
    observacao: u.observacao || "",
    ativo: u.ativo,
    foto_url: u.foto_url || null,
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

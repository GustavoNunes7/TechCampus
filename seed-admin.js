require("dotenv").config();
const bcrypt = require("bcryptjs");
const { db } = require("./src/database/sqlite");

async function main() {
  const nome = String(process.env.ADMIN_NAME || "Administrador TechCampus").trim();
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const senha = process.env.ADMIN_PASSWORD;
  if (!email || !senha || senha.length < 12) {
    console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) no ambiente antes de executar este script.");
    process.exitCode = 1;
    return;
  }
  const hash = await bcrypt.hash(senha, 12);
  const existente = db.prepare("SELECT id FROM usuarios WHERE email=?").get(email);
  if (existente) {
    db.prepare("UPDATE usuarios SET nome=?,senha_hash=?,papel='admin',ativo=1 WHERE id=?").run(nome, hash, existente.id);
    console.log("Conta administrativa atualizada.");
  } else {
    db.prepare("INSERT INTO usuarios(nome,email,senha_hash,papel,ativo) VALUES(?,?,?,'admin',1)").run(nome, email, hash);
    console.log("Conta administrativa criada.");
  }
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });

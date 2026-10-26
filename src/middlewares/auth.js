const jwt = require("jsonwebtoken");
const { db } = require("../database/sqlite");

function autenticar(req, res, next) {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ erro: "Token não fornecido." });
  try {
    req.usuario = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const usuario = db.prepare("SELECT id, papel, ativo FROM usuarios WHERE id=?").get(req.usuario.id);
    if (!usuario || usuario.ativo === 0 || usuario.papel !== req.usuario.papel) {
      return res.status(401).json({ erro: "Conta indisponível. Entre novamente ou contate a administração." });
    }
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}
function admin(req, res, next) {
  if (req.usuario?.papel !== "admin")
    return res.status(403).json({ erro: "Acesso restrito a administradores." });
  next();
}
module.exports = autenticar;
module.exports.admin = admin;

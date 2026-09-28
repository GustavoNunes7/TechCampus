require("dotenv").config();
const express = require("express"),
  path = require("path");
const { ready } = require("./src/database/sqlite");
const app = express(),
  PORT = Number(process.env.PORT) || 3001;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("Configure JWT_SECRET (mínimo 32 caracteres) no .env");
  process.exit(1);
}
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use("/api", require("./src/routes"));
app.use(express.static(path.join(__dirname, "public")));
app.get("/teste", (_req, res) =>
  res.json({
    mensagem: "API da AAPM funcionando!",
    status: "online",
    porta: PORT,
  }),
);
app.get("/", (_req, res) => res.redirect("/landing/index.html"));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err)
    return res.status(400).json({ erro: "JSON inválido." });
  console.error(err);
  res.status(500).json({ erro: "Erro interno." });
});
ready
  .then(() => {
    if (require.main === module)
      app.listen(PORT, () =>
        console.log(`TechCampus: http://localhost:${PORT}`),
      );
  })
  .catch(console.error);
module.exports = app;

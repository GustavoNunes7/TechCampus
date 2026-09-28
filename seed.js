
require("dotenv").config();

const bcrypt = require("bcryptjs");
const { db } = require("./src/database/sqlite");

async function main() {
  // ======================================================
  // USUÁRIO DE TESTE
  // ======================================================

  const email = "teste@techcampus.com";
  const senha = "123456!";

  const hash = await bcrypt.hash(senha, 12);

  const existe = db
    .prepare("SELECT id FROM usuarios WHERE email = ?")
    .get(email);

  if (!existe) {
    // Cria o usuário de teste
    db.prepare(`
      INSERT INTO usuarios
      (nome, email, senha_hash, papel, turma, telefone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "Aluno Teste",
      email,
      hash,
      "aluno",
      "Turma de Teste",
      ""
    );

    console.log("Usuário de teste criado.");
  } else {
    // Atualiza a senha caso o usuário já exista
    db.prepare(`
      UPDATE usuarios
      SET senha_hash = ?
      WHERE email = ?
    `).run(hash, email);

    console.log("Usuário de teste já existia. Senha atualizada.");
  }

  // ======================================================
  // PRODUTOS
  // ======================================================

  const products = [
    [
      "Uniforme Escolar Branco",
      "Camiseta escolar branca",
      "uniformes",
      0,
      30,
      "/landing/images/camisa.png",
    ],
    [
      "Uniforme Escolar Preto",
      "Camiseta escolar preta",
      "uniformes",
      0,
      30,
      "/landing/images/uniforme_preto.png",
    ],
    [
      "Bolas de Ping Pong",
      "Conjunto de bolas",
      "esportes",
      0,
      20,
      "/landing/images/pingpong.png",
    ],
    [
      "Bola de Futebol",
      "Bola para prática esportiva",
      "esportes",
      0,
      10,
      "/landing/images/boladefutebol.png",
    ],
    [
      "Bola de Vôlei",
      "Bola para prática esportiva",
      "esportes",
      0,
      10,
      "/landing/images/boladevolei.png",
    ],
    [
      "Raquete de Ping Pong",
      "Raquete para uso na escola",
      "jogos",
      0,
      12,
      "/landing/images/raquete.png",
    ],
  ];

  const stmt = db.prepare(`
    INSERT INTO produtos
    (nome, descricao, categoria, preco_centavos, estoque, imagem)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const count = db
    .prepare("SELECT COUNT(*) AS n FROM produtos")
    .get().n;

  if (!count) {
    db.transaction(() => {
      products.forEach((product) => {
        stmt.run(...product);
      });
    })();

    console.log("Produtos de teste inseridos.");
  } else {
    console.log("Produtos já existem. Nenhum produto foi duplicado.");
  }

  // ======================================================
  // RESULTADO
  // ======================================================

  console.log("");
  console.log("======================================");
  console.log("       SEED CONCLUÍDO COM SUCESSO");
  console.log("======================================");
  console.log("");
  console.log("Login de teste:");
  console.log("  E-mail: teste@techcampus.com");
  console.log("  Senha:  123456!");
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error("Erro no seed:", err);
  process.exit(1);
});


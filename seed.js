
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
    ["Uniforme Escolar (Branco)", "Camisa oficial da rede. Conforto e identidade para o dia a dia escolar.", "uniformes", 2499, 30, "/landing/images/camisa.png"],
    ["Caixa de Bolinhas de Ping Pong", "Conjunto de bolinhas para tênis de mesa.", "jogos", 999, 20, "/landing/images/pingpong.png"],
    ["Bola de Futebol", "Bola para prática esportiva.", "esportes", 2999, 10, "/landing/images/boladefutebol.png"],
    ["Bola de Vôlei", "Bola para prática esportiva.", "esportes", 2999, 10, "/landing/images/boladevolei.png"],
    ["Raquete de Ping Pong", "Raquete para uso na escola.", "jogos", 1999, 12, "/landing/images/raquete.png"],
    ["Crachá com Cordão", "Crachá escolar com cordão.", "acessorios", 599, 50, "/landing/images/cracha.png"],
    ["Uniforme Escolar (Preto)", "Camiseta escolar preta.", "uniformes", 3499, 30, "/landing/images/uniforme_preto.png"],
    ["Óculos de Proteção", "Equipamento de proteção individual.", "epi", 799, 30, "/landing/images/oculosprotecao.png"],
    ["Capacete de Proteção", "Equipamento de proteção individual.", "epi", 2799, 15, "/landing/images/capacete.png"],
    ["Protetor Auricular", "Equipamento de proteção individual.", "epi", 699, 30, "/landing/images/protetor-auricular.png"],
    ["Jaleco Mecânica", "Jaleco para atividades práticas.", "uniformes", 5799, 20, "/landing/images/Jaleco.png"],
  ];

  const normalizarNome = (valor) =>
    String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = {
    caixadebolinhasdepingpong: ["bolasdepingpong"],
    "uniformeescolarbranco": ["uniformeescolarbranco"],
    "uniformeescolarpreto": ["uniformeescolarpreto"],
  };
  const existentes = db.prepare("SELECT id, nome FROM produtos").all();
  const inserir = db.prepare(`
    INSERT INTO produtos (nome, descricao, categoria, preco_centavos, estoque, imagem, ativo)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const atualizar = db.prepare(`
    UPDATE produtos
    SET nome=?, descricao=?, categoria=?, preco_centavos=?, estoque=?, imagem=?, ativo=1
    WHERE id=?
  `);
  const idsAtualizados = new Set();
  db.transaction(() => {
    // Desativa registros antigos que não correspondem mais à vitrine.
    db.prepare("UPDATE produtos SET ativo=0").run();
    for (const product of products) {
      const alvo = normalizarNome(product[0]);
      const nomesAceitos = new Set([alvo, ...(aliases[alvo] || [])]);
      const existente = existentes.find((p) =>
        !idsAtualizados.has(p.id) && nomesAceitos.has(normalizarNome(p.nome))
      );
      if (existente) {
        atualizar.run(...product, existente.id);
        idsAtualizados.add(existente.id);
      } else {
        const info = inserir.run(...product);
        idsAtualizados.add(Number(info.lastInsertRowid));
      }
    }
  })();
  console.log("Produtos de demonstração sincronizados com a vitrine e preços atualizados.");


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


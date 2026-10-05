/* Cadastra/atualiza os produtos da vitrine com os PREÇOS REAIS (em centavos).
   Uso: node seed-produtos.js */
require("dotenv").config();
const { db } = require("./src/database/sqlite");

const ESTOQUE_INICIAL = 30;
const IMG = "/landing/images/";

// [nome, descricao, categoria, preco_centavos, imagem]
const produtos = [
  ["Uniforme Escolar (Branco)", "Camisa oficial da rede. Conforto e identidade para o dia a dia escolar.", "uniformes", 2499, "camisa.png"],
  ["Caixa de Bolinhas de Ping Pong", "Bolinhas para treinos e campeonatos internos.", "jogos", 999, "pingpong.png"],
  ["Bola de Futebol", "Bola oficial para jogos e treinamentos.", "esportes", 2999, "boladefutebol.png"],
  ["Bola de Vôlei", "Bola para jogos e atividades esportivas.", "esportes", 2999, "boladevolei.png"],
  ["Raquete de Ping Pong", "Raquete para treinos e atividades recreativas.", "jogos", 1999, "raquete.png"],
  ["Crachá com Cordão", "Identificação para utilização no ambiente escolar.", "acessorios", 599, "cracha.png"],
  ["Uniforme Escolar (Preto)", "Modelo de uniforme escolar.", "uniformes", 3499, "uniforme_preto.png"],
  ["Óculos de Proteção", "Equipamento de proteção individual.", "epi", 799, "oculosprotecao.png"],
  ["Capacete de Proteção", "Equipamento de proteção individual.", "epi", 2799, "capacete.png"],
  ["Protetor Auricular", "Equipamento de proteção individual.", "epi", 699, "protetor-auricular.png"],
  ["Jaleco Mecânica", "Modelo de jaleco para a área da Mecânica.", "uniformes", 5799, "Jaleco.png"],
];

const achar = db.prepare("SELECT id FROM produtos WHERE nome=?");
const inserir = db.prepare(
  "INSERT INTO produtos(nome,descricao,categoria,preco_centavos,estoque,imagem) VALUES(?,?,?,?,?,?)",
);
const atualizar = db.prepare(
  "UPDATE produtos SET descricao=?,categoria=?,preco_centavos=?,imagem=?,ativo=1 WHERE id=?",
);

db.transaction(() => {
  let novos = 0, atualizados = 0;
  for (const [nome, desc, cat, preco, img] of produtos) {
    const existente = achar.get(nome);
    if (existente) {
      atualizar.run(desc, cat, preco, IMG + img, existente.id);
      atualizados++;
    } else {
      inserir.run(nome, desc, cat, preco, ESTOQUE_INICIAL, IMG + img);
      novos++;
    }
  }
  const nomes = produtos.map((p) => p[0]);
  const marcas = nomes.map(() => "?").join(",");
  const off = db
    .prepare(
      `UPDATE produtos SET ativo=0 WHERE preco_centavos=0 AND nome NOT IN (${marcas})`,
    )
    .run(...nomes);
  console.log(`Produtos novos: ${novos} | atualizados: ${atualizados} | antigos desativados: ${off.changes}`);
})();
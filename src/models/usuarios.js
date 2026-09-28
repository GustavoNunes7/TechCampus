/* =====================================================
   TECHCAMPUS - GERENCIAMENTO DE USUÁRIOS
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const tabela = document.getElementById("tabelaUsuarios");
  const busca = document.getElementById("buscarUsuario");
  const filtroTipo = document.getElementById("filtroTipoUsuario");
  const filtroStatus = document.getElementById("filtroStatusUsuario");

  const totalAlunos = document.getElementById("totalAlunos");
  const totalProfessores = document.getElementById("totalProfessores");
  const totalAtivos = document.getElementById("totalAtivos");

  const modalElement = document.getElementById("modalUsuario");

  if (!tabela || !modalElement) {
    return;
  }

  let usuarios = [
    {
      id: 1,
      nome: "João da Silva",
      matricula: "202600001",
      email: "joao@aluno.com",
      tipo: "aluno",
      status: "ativo",
    },
    {
      id: 2,
      nome: "Maria Oliveira",
      matricula: "202600002",
      email: "maria@aluno.com",
      tipo: "aluno",
      status: "ativo",
    },
    {
      id: 3,
      nome: "Carlos Souza",
      matricula: "PROF001",
      email: "carlos@escola.com",
      tipo: "professor",
      status: "ativo",
    },
  ];

  let usuarioEditando = null;

  const modal = new bootstrap.Modal(modalElement);

  function atualizarResumo() {
    const alunos = usuarios.filter((usuario) => usuario.tipo === "aluno");

    const professores = usuarios.filter(
      (usuario) => usuario.tipo === "professor",
    );

    const ativos = usuarios.filter((usuario) => usuario.status === "ativo");

    totalAlunos.textContent = alunos.length;
    totalProfessores.textContent = professores.length;
    totalAtivos.textContent = ativos.length;
  }

  function renderizarUsuarios() {
    const termo = busca.value.toLowerCase().trim();

    const tipo = filtroTipo.value;
    const status = filtroStatus.value;

    const filtrados = usuarios.filter((usuario) => {
      const correspondeBusca =
        usuario.nome.toLowerCase().includes(termo) ||
        usuario.email.toLowerCase().includes(termo) ||
        usuario.matricula.toLowerCase().includes(termo);

      const correspondeTipo = tipo === "todos" || usuario.tipo === tipo;

      const correspondeStatus = status === "todos" || usuario.status === status;

      return correspondeBusca && correspondeTipo && correspondeStatus;
    });

    tabela.innerHTML = "";

    const vazio = document.getElementById("usuariosVazio");

    if (filtrados.length === 0) {
      vazio.style.display = "block";

      atualizarResumo();

      return;
    }

    vazio.style.display = "none";

    filtrados.forEach((usuario) => {
      const tr = document.createElement("tr");

      const tipoTexto = usuario.tipo === "aluno" ? "Aluno" : "Professor";

      tr.innerHTML = `

                <td>
                    <div class="usuario-nome">
                        ${usuario.nome}
                    </div>
                </td>

                <td>
                    ${usuario.matricula || "-"}
                </td>

                <td>
                    <span class="usuario-email">
                        ${usuario.email}
                    </span>
                </td>

                <td>
                    <span class="usuario-badge ${usuario.tipo}">
                        <i class="bi ${
                          usuario.tipo === "aluno"
                            ? "bi-mortarboard-fill"
                            : "bi-person-workspace"
                        }"></i>

                        ${tipoTexto}
                    </span>
                </td>

                <td>
                    <span class="usuario-status ${usuario.status}">
                        ${usuario.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                </td>

                <td>

                    <div class="usuario-acoes">

                        <button
                            type="button"
                            class="btn btn-outline-secondary btn-sm"
                            title="Editar"
                            data-editar="${usuario.id}">

                            <i class="bi bi-pencil"></i>

                        </button>


                        <button
                            type="button"
                            class="btn btn-outline-danger btn-sm"
                            title="Excluir"
                            data-excluir="${usuario.id}">

                            <i class="bi bi-trash"></i>

                        </button>

                    </div>

                </td>

            `;

      tabela.appendChild(tr);
    });

    atualizarResumo();
  }

  function abrirNovoUsuario() {
    usuarioEditando = null;

    document.getElementById("tituloModalUsuario").textContent = "Novo cadastro";

    document.getElementById("formUsuario").reset();

    document.getElementById("usuarioId").value = "";

    modal.show();
  }

  function editarUsuario(id) {
    const usuario = usuarios.find((item) => item.id === id);

    if (!usuario) {
      return;
    }

    usuarioEditando = usuario;

    document.getElementById("tituloModalUsuario").textContent =
      "Editar cadastro";

    document.getElementById("usuarioId").value = usuario.id;

    document.getElementById("usuarioNome").value = usuario.nome;

    document.getElementById("usuarioTipo").value = usuario.tipo;

    document.getElementById("usuarioMatricula").value = usuario.matricula;

    document.getElementById("usuarioEmail").value = usuario.email;

    document.getElementById("usuarioSenha").value = "";

    document.getElementById("usuarioStatus").value = usuario.status;

    modal.show();
  }

  function excluirUsuario(id) {
    const usuario = usuarios.find((item) => item.id === id);

    if (!usuario) {
      return;
    }

    const confirmar = confirm(
      `Deseja realmente excluir o cadastro de ${usuario.nome}?`,
    );

    if (!confirmar) {
      return;
    }

    usuarios = usuarios.filter((item) => item.id !== id);

    renderizarUsuarios();
  }

  document
    .getElementById("btnNovoUsuario")
    ?.addEventListener("click", abrirNovoUsuario);

  document
    .getElementById("formUsuario")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();

      const dados = {
        nome: document.getElementById("usuarioNome").value.trim(),

        matricula: document.getElementById("usuarioMatricula").value.trim(),

        email: document.getElementById("usuarioEmail").value.trim(),

        tipo: document.getElementById("usuarioTipo").value,

        status: document.getElementById("usuarioStatus").value,
      };

      if (usuarioEditando) {
        usuarioEditando.nome = dados.nome;
        usuarioEditando.matricula = dados.matricula;
        usuarioEditando.email = dados.email;
        usuarioEditando.tipo = dados.tipo;
        usuarioEditando.status = dados.status;
      } else {
        usuarios.push({
          id: Date.now(),

          ...dados,
        });
      }

      modal.hide();

      renderizarUsuarios();
    });

  tabela.addEventListener("click", (event) => {
    const editar = event.target.closest("[data-editar]");

    const excluir = event.target.closest("[data-excluir]");

    if (editar) {
      editarUsuario(Number(editar.dataset.editar));
    }

    if (excluir) {
      excluirUsuario(Number(excluir.dataset.excluir));
    }
  });

  busca.addEventListener("input", renderizarUsuarios);

  filtroTipo.addEventListener("change", renderizarUsuarios);

  filtroStatus.addEventListener("change", renderizarUsuarios);

  renderizarUsuarios();
});

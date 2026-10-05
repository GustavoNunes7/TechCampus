document.addEventListener("DOMContentLoaded", () => {

    const tabela = document.getElementById("tabelaUsuarios");
    const vazio = document.getElementById("usuariosVazio");

    const totalAlunos = document.getElementById("totalAlunos");
    const totalProfessores = document.getElementById("totalProfessores");
    const totalAtivos = document.getElementById("totalAtivos");

    const busca = document.getElementById("buscarUsuario");
    const filtroTipo = document.getElementById("filtroTipoUsuario");
    const filtroStatus = document.getElementById("filtroStatusUsuario");

    if (!tabela) {
        return;
    }

    let usuarios = [];


    // ==========================================
    // CARREGAR USUÁRIOS
    // ==========================================

    async function carregarUsuarios() {

        try {

            const resposta = await fetch("/api/usuarios", {
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (!resposta.ok) {

                if (resposta.status === 403) {
                    throw new Error(
                        "Você não possui permissão para acessar esta área."
                    );
                }

                throw new Error("Erro ao carregar usuários.");
            }

            usuarios = await resposta.json();

            atualizarResumo();
            renderizarUsuarios();

        } catch (erro) {

            console.error(erro);

            tabela.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger py-4">
                        <i class="bi bi-exclamation-triangle"></i>
                        ${erro.message}
                    </td>
                </tr>
            `;

        }
    }


    // ==========================================
    // RESUMO
    // ==========================================

    function atualizarResumo() {

        const alunos = usuarios.filter(
            usuario =>
                String(usuario.tipo).toLowerCase() === "aluno"
        );

        const professores = usuarios.filter(
            usuario =>
                String(usuario.tipo).toLowerCase() === "professor"
        );

        const ativos = usuarios.filter(
            usuario =>
                String(usuario.status).toLowerCase() === "ativo"
        );

        totalAlunos.textContent = alunos.length;
        totalProfessores.textContent = professores.length;
        totalAtivos.textContent = ativos.length;
    }


    // ==========================================
    // RENDERIZAR TABELA
    // ==========================================

    function renderizarUsuarios() {

        const termo = busca.value
            .trim()
            .toLowerCase();

        const tipo = filtroTipo.value;
        const status = filtroStatus.value;


        const filtrados = usuarios.filter(usuario => {

            const nome = String(usuario.nome || "").toLowerCase();
            const email = String(usuario.email || "").toLowerCase();
            const matricula = String(usuario.matricula || "").toLowerCase();

            const correspondeBusca =
                !termo ||
                nome.includes(termo) ||
                email.includes(termo) ||
                matricula.includes(termo);

            const correspondeTipo =
                tipo === "todos" ||
                String(usuario.tipo).toLowerCase() === tipo;

            const correspondeStatus =
                status === "todos" ||
                String(usuario.status).toLowerCase() === status;

            return (
                correspondeBusca &&
                correspondeTipo &&
                correspondeStatus
            );
        });


        tabela.innerHTML = "";


        if (filtrados.length === 0) {

            vazio.style.display = "block";

            return;
        }


        vazio.style.display = "none";


        filtrados.forEach(usuario => {

            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>
                    <strong>
                        ${usuario.nome || "-"}
                    </strong>
                </td>

                <td>
                    ${usuario.matricula || "-"}
                </td>

                <td>
                    ${usuario.email || "-"}
                </td>

                <td>
                    <span class="badge bg-primary">
                        ${usuario.tipo || "-"}
                    </span>
                </td>

                <td>
                    <span class="badge ${
                        String(usuario.status).toLowerCase() === "ativo"
                            ? "bg-success"
                            : "bg-secondary"
                    }">
                        ${usuario.status || "-"}
                    </span>
                </td>

                <td class="text-end">

                    <button
                        class="btn btn-sm btn-outline-primary"
                        onclick="editarUsuario(${usuario.id})"
                        title="Editar"
                    >
                        <i class="bi bi-pencil"></i>
                    </button>

                    <button
                        class="btn btn-sm btn-outline-danger"
                        onclick="excluirUsuario(${usuario.id})"
                        title="Excluir"
                    >
                        <i class="bi bi-trash"></i>
                    </button>

                </td>
            `;

            tabela.appendChild(tr);
        });
    }


    // ==========================================
    // FILTROS
    // ==========================================

    busca.addEventListener("input", renderizarUsuarios);

    filtroTipo.addEventListener("change", renderizarUsuarios);

    filtroStatus.addEventListener("change", renderizarUsuarios);


    // ==========================================
    // INICIALIZA
    // ==========================================

    carregarUsuarios();

});
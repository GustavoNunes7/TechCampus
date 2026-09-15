const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.getElementById("sidebar");
const mainContent = document.querySelector(".main-content");

if (sidebarToggle && sidebar && mainContent) {
    sidebarToggle.addEventListener("click", function () {
        const sidebarFechada = sidebar.classList.toggle("fechado");

        mainContent.classList.toggle("expandido", sidebarFechada);

        document.body.classList.toggle(
            "sidebar-fechada",
            sidebarFechada
        );

        sidebarToggle.setAttribute(
            "aria-expanded",
            String(!sidebarFechada)
        );
    });
}
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const forgotPasswordSection = document.getElementById("forgotPasswordSection");
const loginForm = document.querySelector("#loginForm");
const backToLogin = document.getElementById("backToLogin");

if (forgotPasswordLink && forgotPasswordSection) {
    forgotPasswordLink.addEventListener("click", function (event) {
        event.preventDefault();

        loginForm.classList.add("d-none");
        forgotPasswordSection.classList.remove("d-none");
    });
}

if (backToLogin && forgotPasswordSection) {
    backToLogin.addEventListener("click", function (event) {
        event.preventDefault();

        forgotPasswordSection.classList.add("d-none");
        loginForm.classList.remove("d-none");
    });
}



    //  =====================================================
    //      RECUPERAÇÃO DE SENHA
    // ====================================================== 

      document.addEventListener("DOMContentLoaded", function () {

        const loginSection =
          document.getElementById("loginSection");

        const forgotPasswordSection =
          document.getElementById("forgotPasswordSection");

        const forgotPasswordLink =
          document.getElementById("forgotPasswordLink");

        const backToLogin =
          document.getElementById("backToLogin");

        const forgotPasswordForm =
          document.getElementById("forgotPasswordForm");


        /* Abrir recuperação */

        forgotPasswordLink.addEventListener("click", function (event) {

          event.preventDefault();

          loginSection.hidden = true;

          forgotPasswordSection.hidden = false;

        });


        /* Voltar para login */

        backToLogin.addEventListener("click", function (event) {

          event.preventDefault();

          forgotPasswordSection.hidden = true;

          loginSection.hidden = false;

        });


        /* Formulário */

        forgotPasswordForm.addEventListener("submit", function (event) {

          event.preventDefault();

          alert(
            "A recuperação de senha será conectada ao Back-end posteriormente."
          );

        });

      });


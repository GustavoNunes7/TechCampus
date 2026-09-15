const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.getElementById("sidebar");
const mainContent = document.querySelector(".main-content");

if (sidebarToggle && sidebar && mainContent) {
    sidebarToggle.addEventListener("click", function () {
        const sidebarFechada = sidebar.classList.toggle("fechado");

        mainContent.classList.toggle("expandido", sidebarFechada);

        sidebarToggle.setAttribute(
            "aria-expanded",
            String(!sidebarFechada)
        );
    });
}
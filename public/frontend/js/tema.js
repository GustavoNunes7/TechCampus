/* =========================================================
   TECHCAMPUS — GERENCIADOR DE TEMA
   Claro / Escuro / Sistema
   ========================================================= */

(() => {
    'use strict';

    const STORAGE_KEY = 'techcampus_tema';

    const VALID = new Set([
        'claro',
        'escuro',
        'sistema'
    ]);

    const media = window.matchMedia(
        '(prefers-color-scheme: dark)'
    );

    function readPreference() {
        try {
            const value = localStorage.getItem(STORAGE_KEY);

            return VALID.has(value)
                ? value
                : 'escuro';

        } catch {
            return 'escuro';
        }
    }

    let preference = readPreference();

    function getActualTheme() {

        if (preference === 'sistema') {
            return media.matches
                ? 'dark'
                : 'light';
        }

        return preference === 'claro'
            ? 'light'
            : 'dark';
    }

    function apply() {

        const actualTheme = getActualTheme();

        const html = document.documentElement;

        html.setAttribute(
            'data-bs-theme',
            actualTheme
        );

        html.dataset.tcTheme = preference;

        const select =
            document.getElementById('tema');

        if (
            select &&
            select.value !== preference
        ) {
            select.value = preference;
        }
    }

    function setTheme(value) {

        if (!VALID.has(value)) {
            return;
        }

        preference = value;

        try {
            localStorage.setItem(
                STORAGE_KEY,
                value
            );
        } catch {}

        apply();
        document.dispatchEvent(new Event('techcampus:themechange'));
    }

    /* Aplicação imediata */
    apply();

    /* Após carregar o HTML */
    document.addEventListener(
        'DOMContentLoaded',
        () => {

            apply();

            const quickToggle = document.getElementById('themeQuickToggle');

            function updateQuickToggle() {
                if (!quickToggle) return;
                const actual = getActualTheme();
                const next = actual === 'dark' ? 'claro' : 'escuro';
                const label = next === 'claro' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
                quickToggle.title = label;
                quickToggle.setAttribute('aria-label', label);
                quickToggle.setAttribute('aria-pressed', String(actual === 'light'));
                const icon = quickToggle.querySelector('i');
                if (icon) icon.className = actual === 'dark'
                    ? 'bi bi-sun-fill fs-5'
                    : 'bi bi-moon-stars-fill fs-5';
            }

            if (quickToggle) {
                quickToggle.addEventListener('click', () => {
                    const next = getActualTheme() === 'dark' ? 'claro' : 'escuro';
                    setTheme(next);
                    updateQuickToggle();
                });
            }

            const originalApply = apply;
            // Atualiza o ícone sempre que o tema for alterado pelas configurações.
            const select =
                document.getElementById('tema');

            if (select) {

                select.addEventListener(
                    'change',
                    () => {
                        setTheme(select.value);
                        updateQuickToggle();
                    }
                );
            }

            updateQuickToggle();
            document.addEventListener('techcampus:themechange', updateQuickToggle);
        }
    );

    /* Preferência do sistema */
    if (media.addEventListener) {

        media.addEventListener(
            'change',
            () => {

                if (preference === 'sistema') {
                    apply();
                }

            }
        );

    } else if (media.addListener) {

        media.addListener(
            () => {

                if (preference === 'sistema') {
                    apply();
                }

            }
        );
    }

    /* API global */
    window.TechCampusTema = {
        set: setTheme,
        get: () => preference,
        apply
    };

})();
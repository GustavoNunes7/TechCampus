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
    }

    /* Aplicação imediata */
    apply();

    /* Após carregar o HTML */
    document.addEventListener(
        'DOMContentLoaded',
        () => {

            apply();

            const select =
                document.getElementById('tema');

            if (select) {

                select.addEventListener(
                    'change',
                    () => {
                        setTheme(select.value);
                    }
                );
            }
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
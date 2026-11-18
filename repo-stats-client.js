(function () {
    /**
     * Initializes the 3-state theme switcher (System -> Dark -> Light).
     */
    function initThemeToggle() {
        const html = document.documentElement;
        const themeBtn = document.querySelector('.theme-toggle');
        if (!themeBtn) return;

        themeBtn.addEventListener('click', function () {
            const isDark = html.classList.contains('theme-dark');
            const isLight = html.classList.contains('theme-light');

            html.classList.remove('theme-light', 'theme-dark');

            if (isDark) {
                // Dark --> Light
                html.classList.add('theme-light');
                localStorage.setItem('repo-stats-theme', 'light');
                themeBtn.textContent = '🌙 Dark';
            } else if (isLight) {
                // Light --> System
                localStorage.removeItem('repo-stats-theme');
                themeBtn.textContent = '🌓 Theme';
            } else {
                // System --> Dark
                html.classList.add('theme-dark');
                localStorage.setItem('repo-stats-theme', 'dark');
                themeBtn.textContent = '☀️ Light';
            }
        });

        // Set initial button label
        if (html.classList.contains('theme-dark')) themeBtn.textContent = '☀️ Light';
        else if (html.classList.contains('theme-light')) themeBtn.textContent = '🌙 Dark';
        else themeBtn.textContent = '🌓 Theme';
    }

    /**
     * Initializes live debounced search filtering and clear controls.
     * Returns a resetSearch(shouldFocus) helper for external callers.
     */
    function initSearch() {
        const searchInput = document.querySelector('.search-input');
        const clearBtn = document.querySelector('.search-clear');
        const rows = document.querySelectorAll('.commit-row');
        const days = document.querySelectorAll('.changelog-day');
        const counter = document.querySelector('.search-counter');
        let debounceTimer = null;

        function applyFilter(rawVal) {
            if (clearBtn) {
                clearBtn.classList.toggle('visible', rawVal.length > 0);
            }

            const query = rawVal.toLowerCase().trim();
            let visibleCount = 0;

            rows.forEach(row => {
                const match = !query || row.textContent.toLowerCase().includes(query);
                row.classList.toggle('hidden', !match);
                if (match) visibleCount++;
            });

            days.forEach(day => {
                const hasVisible = day.querySelector('.commit-row:not(.hidden)');
                day.classList.toggle('hidden', !hasVisible && query);
                if (query && hasVisible) {
                    day.setAttribute('open', '');
                }
            });

            if (counter) {
                counter.textContent = query ? visibleCount + ' result' + (visibleCount !== 1 ? 's' : '') : '';
            }
        }

        function resetSearch(shouldFocus) {
            if (!searchInput) return;
            clearTimeout(debounceTimer);
            searchInput.value = '';
            applyFilter('');
            if (shouldFocus) searchInput.focus();
        }

        if (searchInput) {
            searchInput.addEventListener('input', function () {
                const rawVal = this.value;
                if (clearBtn) {
                    clearBtn.classList.toggle('visible', rawVal.length > 0);
                }

                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => applyFilter(rawVal), 150);
            });

            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && this.value.length > 0) {
                    resetSearch(true);
                }
            });

            if (clearBtn) {
                clearBtn.addEventListener('click', () => resetSearch(true));
            }
        }

        return resetSearch;
    }

    /**
     * Initializes Collapse All / Expand All buttons for daily sections.
     */
    function initCollapseControls() {
        const collapseBtn = document.querySelector('[data-action="collapse-all"]');
        const expandBtn = document.querySelector('[data-action="expand-all"]');
        const allDays = document.querySelectorAll('.changelog-day');

        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                allDays.forEach(day => day.removeAttribute('open'));
            });
        }

        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                allDays.forEach(day => day.setAttribute('open', ''));
            });
        }
    }

    /**
     * Initializes floating Back to Top button visibility and smooth scroll.
     */
    function initBackToTop() {
        const backToTopBtn = document.querySelector('.back-to-top');
        if (!backToTopBtn) return;

        window.addEventListener('scroll', function () {
            backToTopBtn.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });

        backToTopBtn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /**
     * Initializes click-to-scroll navigation on active heatmap cells.
     */
    function initHeatmapNavigation(resetSearch) {
        const heatmapGrid = document.querySelector('.heatmap-grid');
        if (!heatmapGrid) return;

        heatmapGrid.addEventListener('click', function (e) {
            const cell = e.target.closest('.heatmap-cell[data-date]');
            if (!cell) return;

            const date = cell.getAttribute('data-date');
            const targetDay = document.getElementById('day-' + date);
            if (!targetDay) return;

            // Immediately reset active search filter if target day is hidden
            if (targetDay.classList.contains('hidden') && resetSearch) {
                resetSearch(false);
            }

            targetDay.setAttribute('open', '');
            targetDay.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // === Bootstrap ===
    initThemeToggle();
    const resetSearch = initSearch();
    initCollapseControls();
    initBackToTop();
    initHeatmapNavigation(resetSearch);
})();

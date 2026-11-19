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

        function filterByQuery(queryText) {
            if (!searchInput) return;
            clearTimeout(debounceTimer);
            searchInput.value = queryText;
            applyFilter(queryText);
        }

        function resetSearch(shouldFocus) {
            filterByQuery('');
            if (shouldFocus && searchInput) searchInput.focus();
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

        return { resetSearch, filterByQuery };
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
     * Highlights an element temporarily with a CSS pulse animation.
     */
    function flashHighlight(el) {
        if (!el) return;
        el.classList.remove('highlight-flash');
        void el.offsetWidth; // Force reflow to restart animation
        el.classList.add('highlight-flash');
    }

    /**
     * Initializes click - to - scroll navigation on heatmap cells and clickable KPI cards.
     */
    function initDateNavigation(searchApi) {
        document.addEventListener('click', function (e) {
            if (window.getSelection()?.toString()) return;

            const trigger = e.target.closest('[data-date]');
            if (!trigger) return;

            if (trigger.classList.contains('tag-pill')) {
                e.preventDefault(); // Prevent <summary> from toggling when clicking a tag pill
            }

            const date = trigger.getAttribute('data-date');
            const commitSubject = trigger.getAttribute('data-commit');
            const rowId = trigger.getAttribute('data-row-id');
            const targetDay = document.getElementById('day-' + date);
            if (!targetDay) return;

            if (commitSubject && searchApi?.filterByQuery) {
                // Filter specifically by this commit's subject (Largest / Widest commit cards)
                searchApi.filterByQuery(commitSubject);
            } else if (searchApi?.resetSearch) {
                // Clear active search filter so full day context is visible (Heatmap, Day records, Tag pills)
                searchApi.resetSearch(false);
            }

            document.documentElement.classList.add('is-jumping');
            targetDay.setAttribute('open', '');

            // Force immediate layout calculation with real heights
            void targetDay.offsetHeight;

            requestAnimationFrame(() => {
                let scrollTarget = targetDay;
                if (rowId) {
                    const targetRow = document.getElementById(rowId);
                    if (targetRow) scrollTarget = targetRow;
                } else if (commitSubject) {
                    const visibleRow = targetDay.querySelector('.commit-row:not(.hidden)');
                    if (visibleRow) scrollTarget = visibleRow;
                }

                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
                flashHighlight(scrollTarget);

                setTimeout(() => {
                    document.documentElement.classList.remove('is-jumping');
                }, 800);
            });
        });
    }

    /**
    * Highlights the active section in the floating Sticky TOC while scrolling.
    */
    function initStickyTOC() {
        const tocLinks = Array.from(document.querySelectorAll('.toc-link'));
        if (tocLinks.length === 0) return;

        const sections = tocLinks
            .map(link => document.getElementById(link.getAttribute('data-target')))
            .filter(Boolean);

        if (sections.length === 0) return;

        function updateActiveSection() {
            const scrollPos = window.scrollY + 140;
            let currentId = sections[0].id;

            for (const sec of sections) {
                if (sec.offsetTop <= scrollPos) {
                    currentId = sec.id;
                }
            }

            // Highlight the last section if scrolled to the very bottom
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 20) {
                currentId = sections[sections.length - 1].id;
            }

            tocLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('data-target') === currentId);
            });
        }

        window.addEventListener('scroll', updateActiveSection, { passive: true });
        updateActiveSection();
    }

    /**
    * Initializes tab switchers inside cards marked with [data-tab-card].
    */
    function initCardTabs() {
        document.addEventListener('click', function (e) {
            const tabBtn = e.target.closest('.card-tab[data-tab]');
            if (!tabBtn) return;

            const card = tabBtn.closest('[data-tab-card]');
            if (!card) return;

            const targetTab = tabBtn.getAttribute('data-tab');

            card.querySelectorAll('.card-tab').forEach(btn => {
                btn.classList.toggle('active', btn === tabBtn);
            });

            card.querySelectorAll('.tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.getAttribute('data-panel') === targetTab);
            });
        });
    }

    /**
     * Filters changelog by file path when clicking a file badge in overview cards.
     */
    function initFileFilterNavigation(searchApi) {
        document.addEventListener('click', function (e) {
            const fileTrigger = e.target.closest('[data-filter-file]');
            if (!fileTrigger || !searchApi?.filterByQuery) return;

            const filePath = fileTrigger.getAttribute('data-filter-file');
            searchApi.filterByQuery(filePath);

            const changelogSection = document.getElementById('sec-changelog');
            if (changelogSection) {
                changelogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    /**
    * Hides the expand arrow on the Releases ribbon if all tag pills fit on a single row.
    */
    function initTagsRibbon() {
        const tagsBar = document.querySelector('.tags-bar');
        const summary = tagsBar?.querySelector('.tags-summary');
        const pills = tagsBar?.querySelector('.tags-pills');
        if (!tagsBar || !summary || !pills) return;

        summary.addEventListener('click', function (e) {
            if (tagsBar.classList.contains('is-single-line')) {
                e.preventDefault();
            }
        });

        function checkOverflow() {
            const wasOpen = tagsBar.hasAttribute('open');
            if (wasOpen) tagsBar.removeAttribute('open');

            const isOverflowing = pills.scrollHeight > pills.clientHeight + 2;
            tagsBar.classList.toggle('is-single-line', !isOverflowing);

            if (wasOpen && isOverflowing) tagsBar.setAttribute('open', '');
        }

        checkOverflow();
        window.addEventListener('resize', checkOverflow, { passive: true });
    }

    /**
     * Initializes one-click copy of release notes to clipboard.
     */
    function initReleaseCopy() {
        document.addEventListener('click', function (e) {
            const copyBtn = e.target.closest('.release-copy-btn');
            if (!copyBtn) return;

            e.preventDefault(); // Prevent <details> from toggling
            e.stopPropagation();

            const card = copyBtn.closest('.release-card');
            if (!card) return;

            const titleRaw = card.querySelector('.release-title')?.textContent?.trim() || 'Release';
            const versionName = titleRaw.replace(/^[^\w\d]+/, '').trim();
            const dateRaw = card.querySelector('.day-weekday')?.textContent?.replace(/[()]/g, '').trim() || '';
            const formattedDate = dateRaw ? dateRaw.replace(/-/g, '/') : '';

            const subjects = Array.from(card.querySelectorAll('.release-commit-subject'))
                .map(el => `- ${el.textContent.trim()}`);

            if (subjects.length === 0) return;

            const headerLines = [versionName];
            if (formattedDate) {
                headerLines.push(`Released on ${formattedDate}`);
            }

            const payload = `${headerLines.join('\n')}\n\nChanges:\n${subjects.join('\n')}`;

            navigator.clipboard?.writeText(payload).then(() => {
                const prevText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = prevText;
                    copyBtn.classList.remove('copied');
                }, 1500);
            });
        });
    }

    /**
    * Switches visible heatmap period when changing the dropdown in the card header.
    */
    function initHeatmapPeriodSelect() {
        const select = document.querySelector('.heatmap-select');
        const card = select?.closest('[data-heatmap-card]');
        if (!select || !card) return;

        select.addEventListener('change', function () {
            const targetView = this.value;
            card.querySelectorAll('.heatmap-view').forEach(view => {
                view.classList.toggle('active', view.getAttribute('data-heatmap-view') === targetView);
            });
        });
    }

    // === Bootstrap ===
    initThemeToggle();
    const searchApi = initSearch();
    initCollapseControls();
    initBackToTop();
    initDateNavigation(searchApi);
    initStickyTOC();
    initCardTabs();
    initFileFilterNavigation(searchApi);
    initTagsRibbon();
    initReleaseCopy();
    initHeatmapPeriodSelect()
})();

(function () {
    /**
     * Escapes HTML special characters to prevent markup breaking / XSS.
     */
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    /**
     * Initializes the 3-state theme switcher (System -> Dark -> Light).
     */
    function initThemeToggle() {
        function safeStorageSet(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch {
                console.warn(`localStorage: Couldn't set "${key}"="${value}"`);
            }
        }

        function safeStorageRemove(key) {
            try {
                localStorage.removeItem(key);
            } catch {
                console.warn(`localStorage: Couldn't remove key "${key}"`);
            }
        }

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
                safeStorageSet('repo-stats-theme', 'light');
                themeBtn.textContent = '🌙 Dark';
            } else if (isLight) {
                // Light --> System
                safeStorageRemove('repo-stats-theme');
                themeBtn.textContent = '🌓 Theme';
            } else {
                // System --> Dark
                html.classList.add('theme-dark');
                safeStorageSet('repo-stats-theme', 'dark');
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
        const days = document.querySelectorAll('.changelog-day:not(.release-card)');
        const counter = document.querySelector('.search-counter');
        let debounceTimer = null;

        function applyFilter(rawVal) {
            if (clearBtn) {
                clearBtn.classList.toggle('visible', rawVal.length > 0);
            }

            const query = rawVal.toLowerCase().trim();
            let visibleCount = 0;

            rows.forEach(row => {
                const textMatch = row.textContent.toLowerCase().includes(query);
                const filesAttr = row.getAttribute('data-files');
                const fileMatch = filesAttr ? filesAttr.toLowerCase().includes(query) : false;
                const match = !query || textMatch || fileMatch;
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
        const allDays = document.querySelectorAll('.changelog-day:not(.release-card)');

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
                const isSelected = btn === tabBtn;
                btn.classList.toggle('active', isSelected);
                btn.setAttribute('aria-selected', String(isSelected));
            });

            card.querySelectorAll('.tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.getAttribute('data-panel') === targetTab);
            });

            if (card.querySelector('.churn-scroll-wrapper')) scrollChurnTimelinesToEnd();
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
            if (e.target.closest('.tag-pill') || tagsBar.classList.contains('is-single-line')) {
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
        function fallbackCopy(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
            } finally {
                document.body.removeChild(textarea);
            }
        }

        document.addEventListener('click', function (e) {
            const copyBtn = e.target.closest('.release-copy-btn');
            if (!copyBtn) return;

            e.preventDefault();
            e.stopPropagation();

            const card = copyBtn.closest('.release-card');
            if (!card) return;

            const titleRaw = card.querySelector('.release-title')?.textContent?.trim() || 'Release';
            const versionName = titleRaw.replace(/^[^\w\d]+/, '').trim();
            const dateRaw = card.querySelector('.day-weekday')?.textContent?.replace(/[()]/g, '').trim() || '';
            const dateParts = dateRaw.split('—');
            const finalDate = dateParts[dateParts.length - 1].trim();
            const formattedDate = finalDate ? finalDate.replace(/-/g, '/') : '';

            const subjects = Array.from(card.querySelectorAll('.release-commit-subject'))
                .map(el => `- ${el.textContent.trim()}`);

            if (subjects.length === 0) return;

            let headerLines;
            const isUnreleased = titleRaw.includes('Unreleased') || versionName.toLowerCase() === 'unreleased';
            if (!isUnreleased && formattedDate) {
                headerLines = [versionName];
                headerLines.push('', `Released on ${formattedDate}\n\nChanges:\n\n`);
            } else {
                headerLines = ['Unreleased changes:\n\n'];
            }

            const payload = `${headerLines.join('\n')}${subjects.join('\n')}`;

            const showCopiedFeedback = () => {
                const prevText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = prevText;
                    copyBtn.classList.remove('copied');
                }, 1500);
            };

            try {
                navigator.clipboard.writeText(payload).then(showCopiedFeedback).catch(() => {
                    fallbackCopy(payload);
                    showCopiedFeedback();
                });
            } catch {
                fallbackCopy(payload);
                showCopiedFeedback();
            }
        });
    }

    /**
     * Switches visible heatmap period when selecting an option in the custom dropdown.
     */
    function initHeatmapPeriodSelect() {
        const dropdown = document.querySelector('.heatmap-dropdown');
        const trigger = dropdown?.querySelector('.heatmap-select');
        const label = dropdown?.querySelector('.heatmap-select-label');
        const card = dropdown?.closest('[data-heatmap-card]');
        if (!dropdown || !trigger || !card) return;

        const closeMenu = () => {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.toggle('open');
            trigger.setAttribute('aria-expanded', String(isOpen));
        });

        dropdown.querySelectorAll('.heatmap-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const targetView = opt.getAttribute('data-value');
                if (label) label.textContent = opt.textContent.trim();

                dropdown.querySelectorAll('.heatmap-option').forEach(btn => {
                    const isSelected = btn === opt;
                    btn.classList.toggle('active', isSelected);
                    btn.setAttribute('aria-selected', String(isSelected));
                });

                card.querySelectorAll('.heatmap-view').forEach(view => {
                    view.classList.toggle('active', view.getAttribute('data-heatmap-view') === targetView);
                });

                closeMenu();
            });
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) closeMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.classList.contains('open')) {
                closeMenu();
                trigger.focus();
            }
        });
    }

    /**
     * Initializes interactive hover tooltip for the SVG Code Churn Timeline.
     */
    function initChurnTooltip() {
        let hideTimer = null;
        function scheduleHide() {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(hideTooltip, 60);
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'churn-tooltip';
        document.body.appendChild(tooltip);

        let activeGroup = null;

        function hideTooltip() {
            clearTimeout(hideTimer);
            if (!activeGroup) return;
            activeGroup = null;
            tooltip.classList.remove('visible');
        }

        document.addEventListener('mouseover', function (e) {
            const group = e.target.closest('.churn-bar-group');
            if (!group) return;

            activeGroup = group;
            const date = group.getAttribute('data-date');
            const time = group.getAttribute('data-time');
            const dateTimeStr = time ? `${date} ${time}` : date;
            const subject = group.getAttribute('data-subject');
            const author = group.getAttribute('data-author');
            const ins = Number(group.getAttribute('data-ins') || 0).toLocaleString('en-US');
            const del = Number(group.getAttribute('data-del') || 0).toLocaleString('en-US');
            const bin = group.getAttribute('data-bin');
            const tags = group.getAttribute('data-tags');
            const binHtml = bin ? ` · <span class="churn-tt-bin">${escapeHtml(bin)} bin</span>` : '';

            tooltip.innerHTML = `
              <div class="churn-tt-subject">${escapeHtml(subject)}</div>
              <div class="churn-tt-meta">${escapeHtml(dateTimeStr)} by ${escapeHtml(author)}</div>
              ${tags ? `<div class="churn-tt-tag">🏷️ ${escapeHtml(tags)}</div>` : ''}
              <div class="churn-tt-stats"><span class="positive">+${ins}</span> / <span class="negative">-${del}</span>${binHtml}</div>
            `;
            tooltip.classList.add('visible');
            clearTimeout(hideTimer);
        });

        document.addEventListener('mousemove', function (e) {
            if (!activeGroup) return;
            const pad = 14;
            const rect = tooltip.getBoundingClientRect();
            let left = e.clientX + pad;
            let top = e.clientY - rect.height - pad;

            if (left + rect.width > window.innerWidth - 10) {
                left = e.clientX - rect.width - pad;
            }
            if (top < 10) {
                top = e.clientY + pad;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        }, { passive: true });

        document.addEventListener('mouseout', function (e) {
            const group = e.target.closest('.churn-bar-group');
            if (!group || group !== activeGroup) return;
            if (e.relatedTarget && group.contains(e.relatedTarget)) return;
            scheduleHide();
        });

        window.addEventListener('scroll', hideTooltip, { passive: true });

        document.addEventListener('click', hideTooltip);
    }

    /**
     * Scrolls wide churn timeline charts to the rightmost (latest) commits.
     */
    function scrollChurnTimelinesToEnd() {
        document.querySelectorAll('.churn-scroll-wrapper').forEach(wrapper => {
            wrapper.scrollLeft = wrapper.scrollWidth;
        });
    }

    /**
     * Jumps to and expands the target release card when clicking a release pill on the timeline.
     */
    function initReleaseJumpNavigation(searchApi) {
        document.addEventListener('click', function (e) {
            const pill = e.target.closest('[data-release-id]');
            if (!pill) return;

            const releaseId = pill.getAttribute('data-release-id');
            const targetRelease = document.getElementById(releaseId);
            if (!targetRelease) return;

            if (searchApi?.resetSearch) {
                searchApi.resetSearch(false);
            }

            targetRelease.setAttribute('open', '');
            targetRelease.scrollIntoView({ behavior: 'smooth', block: 'start' });
            flashHighlight(targetRelease);
        });
    }

    /**
     * Expands all <details> elements before printing so the PDF/paper
     * contains full content, then restores original state afterwards.
     */
    function initPrintExpansion() {
        let touched = [];

        window.addEventListener('beforeprint', function () {
            if (touched.length > 0) return;
            document.documentElement.classList.add('is-jumping');
            document.querySelectorAll('details:not([open])').forEach(function (el) {
                el.setAttribute('open', '');
                touched.push(el);
            });
        });

        window.addEventListener('afterprint', function () {
            touched.forEach(function (el) {
                el.removeAttribute('open');
            });
            touched.length = 0;
            document.documentElement.classList.remove('is-jumping');
        });
    }

    /**
     * Expands parent <details> and scrolls to target element when URL has a hash
     * (e.g. #day-2026-11-20, #commit-2026-11-20-0, #release-v1-0-0-2026-11-20).
     */
    function initDeepLinks() {
        function handleHash() {
            const rawHash = window.location.hash;
            if (!rawHash || rawHash.length < 2) return;

            let targetId;
            try {
                targetId = decodeURIComponent(rawHash.slice(1));
            } catch {
                targetId = rawHash.slice(1);
            }

            const target = document.getElementById(targetId);
            if (!target) return;

            const parentDetails = target.tagName === 'DETAILS' ? target : target.closest('details');
            if (parentDetails) {
                document.documentElement.classList.add('is-jumping');
                parentDetails.setAttribute('open', '');
                void parentDetails.offsetHeight;
            }

            requestAnimationFrame(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (parentDetails || target.classList.contains('commit-row')) {
                    flashHighlight(target);
                }
                if (parentDetails) {
                    setTimeout(() => {
                        document.documentElement.classList.remove('is-jumping');
                    }, 800);
                }
            });
        }

        handleHash();
        window.addEventListener('hashchange', handleHash);
    }

    /**
    * Enables Enter/Space keyboard activation for custom [role="button"] elements
    * (heatmap cells, timeline release pills).
    */
    function initKeyboardButtons() {
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const btn = e.target.closest('[role="button"][tabindex="0"]');
            if (!btn) return;
            e.preventDefault();
            btn.click();
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
    initHeatmapPeriodSelect();
    initChurnTooltip();
    scrollChurnTimelinesToEnd();
    initReleaseJumpNavigation(searchApi);
    initPrintExpansion();
    initDeepLinks();
    initKeyboardButtons();
})();

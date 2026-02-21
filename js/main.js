// src/js/main.js

const AppState = {
    allData: [],
    selectedData: [],
    colorMode: 'mode',
    views: {}
};

// BUG 1 FIX: was "rangeFilter: {}" — the 's' was missing so Object.entries() iterated nothing
const FilterState = {
    lassoSelection: null,
    modeFilter: null,
    rangeFilters: {},       // ← FIXED (was rangeFilter)
    artistFilter: null
};

const FEATURE_COLORS = {
    'energy_%': '#CB181D',
    'danceability_%': '#6A51A3',
    'valence_%': '#238B45',
    'acousticness_%': '#2171B5',
    'liveness_%': '#E6550D',
    'speechiness_%': '#6A5ACD',
    'mode': '#764ba2'
};

function getFeatureColor(featureKey) {
    return FEATURE_COLORS[featureKey] || '#666';
}

// ============================================================================
// CENTRAL FILTER — all filters combined
// ============================================================================

function applyAllFilters() {
    if (!AppState.views.universe) return;

    let filtered = FilterState.lassoSelection !== null
        ? FilterState.lassoSelection
        : AppState.allData;

    // FIX: use object reference Set (not track_name strings)
    // This prevents duplicate track_names from lighting up wrong songs
    if (FilterState.artistFilter !== null) {
        const artistSet = new Set(FilterState.artistFilter);
        filtered = filtered.filter(d => artistSet.has(d));
    }

    if (FilterState.modeFilter !== null) {
        filtered = filtered.filter(d => d.mode === FilterState.modeFilter);
    }

    for (const [feature, range] of Object.entries(FilterState.rangeFilters)) {
        if (range) {
            filtered = filtered.filter(d => d[feature] >= range.min && d[feature] <= range.max);
        }
    }

    // FIX: Set of object refs, not strings
    const filteredSet = new Set(filtered);

    AppState.views.universe.circles
        .transition().duration(300)
        .attr('opacity', d => filteredSet.has(d) ? 0.9 : 0.05)
        .attr('stroke-width', d => filteredSet.has(d) ? 2 : 1);

    handleSelection(filtered);
    console.log(`✓ TOTAL: ${filtered.length} songs`);
}

// ============================================================================
// INIT
// ============================================================================

async function init() {
    console.log('Initializing dashboard...');

    try {
        const data = await d3.json('data/visualization_data.json');
        console.log(`✓ Loaded ${data.length} songs`);

        AppState.allData = data;
        AppState.selectedData = data;

        // BUG 4 FIX: initialize views FIRST so applyAllFilters() can find them
        AppState.views.universe    = new UniverseView('#universe-view', data);
        AppState.views.fingerprint = new FingerprintView('#fingerprint-view', data);
        AppState.views.battleground = new BattlegroundView('#battleground-view', data);

        // ── CONTROLS ─────────────────────────────────────────────────────────

        const colorSelect  = document.getElementById('color-mode');
        const rangeFilter  = document.getElementById('range-filter');
        const rangeLabel   = document.getElementById('range-label');
        const rangeMin     = document.getElementById('range-min');
        const rangeMax     = document.getElementById('range-max');
        const rangeValues  = document.getElementById('range-values');
        const modeFilter   = document.getElementById('mode-filter');
        const btnMajor     = document.getElementById('btn-major');
        const btnMinor     = document.getElementById('btn-minor');
        const btnBoth      = document.getElementById('btn-both');

        modeFilter.style.display = 'flex';
        rangeFilter.style.display = 'none';

        const featureLabels = {
            'energy_%': 'Energy:', 'danceability_%': 'Dance:',
            'valence_%': 'Happy:', 'acousticness_%': 'Acoustic:',
            'speechiness_%': 'Speech:', 'liveness_%': 'Live:'
        };

        colorSelect.addEventListener('change', function () {
            const mode = this.value;
            AppState.colorMode = mode;
            AppState.views.universe.updateColorMode(mode);

            if (mode === 'mode') {
                modeFilter.style.display = 'flex';
                rangeFilter.style.display = 'none';
            } else {
                modeFilter.style.display = 'none';
                rangeFilter.style.display = 'flex';
                rangeLabel.textContent = featureLabels[mode] || 'Range:';

                if (FilterState.rangeFilters[mode]) {
                    rangeMin.value = FilterState.rangeFilters[mode].min;
                    rangeMax.value = FilterState.rangeFilters[mode].max;
                    rangeValues.textContent = `${FilterState.rangeFilters[mode].min} - ${FilterState.rangeFilters[mode].max}`;
                } else {
                    rangeMin.value = 0;
                    rangeMax.value = 100;
                    rangeValues.textContent = '0 - 100';
                }
            }
        });
        // ── FILTER PANEL ──────────────────────────────────────────────────────────

        const filterTrigger  = document.getElementById('filter-panel-trigger');
        const filterDropdown = document.getElementById('filter-panel-dropdown');
        const filterList     = document.getElementById('filter-panel-list');
        const filterBadge    = document.getElementById('filter-count-badge');
        const filterClearAll = document.getElementById('filter-clear-all');

        const FEATURE_LABELS = {
            'energy_%': 'Energy', 'danceability_%': 'Danceability',
            'valence_%': 'Valence', 'acousticness_%': 'Acousticness',
            'liveness_%': 'Liveness', 'speechiness_%': 'Speechiness'
        };

        // Toggle open/close
        filterTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('open');
            if (filterDropdown.classList.contains('open')) renderFilterPanel();
        });
        document.addEventListener('click', (e) => {
            if (!filterTrigger.contains(e.target)) filterDropdown.classList.remove('open');
        });
        filterClearAll.addEventListener('click', () => {
            clearAllFilters();
            filterDropdown.classList.remove('open');
        });

        function updateFilterBadge() {
            let count = 0;
            if (FilterState.artistFilter !== null)   count++;
            if (FilterState.modeFilter !== null)     count++;
            if (FilterState.lassoSelection !== null) count++;
            count += Object.keys(FilterState.rangeFilters).length;

            filterBadge.textContent = count;
            filterBadge.className = 'filter-badge' + (count === 0 ? ' zero' : '');
            if (filterDropdown.classList.contains('open')) renderFilterPanel();
        }

        function renderFilterPanel() {
            const items = [];

            if (FilterState.lassoSelection !== null) {
                items.push({
                    type: 'lasso', label: 'Lasso Selection',
                    value: `${FilterState.lassoSelection.length} songs`, color: '#667eea',
                    remove: () => { FilterState.lassoSelection = null; applyAllFilters(); }
                });
            }

            if (FilterState.artistFilter !== null) {
                const name = document.getElementById('artist-search').value || 'Artist';
                items.push({
                    type: 'artist', label: 'Artist', value: name, color: '#ffd700',
                    remove: () => clearArtistFilter()
                });
            }

            if (FilterState.modeFilter !== null) {
                items.push({
                    type: 'mode', label: 'Mode', value: FilterState.modeFilter,
                    color: FilterState.modeFilter === 'Major' ? '#FF8C00' : '#4169E1',
                    remove: () => setModeFilter('both')
                });
            }

            Object.entries(FilterState.rangeFilters).forEach(([feature, range]) => {
                items.push({
                    type: 'range', label: FEATURE_LABELS[feature] || feature,
                    feature, min: range.min, max: range.max,
                    color: FEATURE_COLORS[feature] || '#667eea',
                    remove: () => {
                        delete FilterState.rangeFilters[feature];
                        if (colorSelect.value === feature) {
                            rangeMin.value = 0; rangeMax.value = 100;
                            rangeValues.textContent = '0 - 100';
                        }
                        applyAllFilters(); updateFilterBadge();
                    }
                });
            });

            if (items.length === 0) {
                filterList.innerHTML = `
                    <div class="filter-empty">
                        <span class="filter-empty-icon">🎛️</span>
                        No active filters.<br>Use the controls above to filter songs.
                    </div>`;
                return;
            }

            filterList.innerHTML = items.map((item, idx) => {
                if (item.type === 'range') {
                    return `
                        <div class="filter-item">
                            <div class="filter-item-top">
                                <span class="filter-item-label">
                                    <span class="filter-item-dot" style="background:${item.color}"></span>
                                    ${item.label}
                                </span>
                                <span class="filter-item-value">${item.min} – ${item.max}</span>
                                <button class="filter-item-remove" data-remove="${idx}">✕</button>
                            </div>
                            <div class="filter-range-row">
                                <span class="filter-range-num" id="fp-min-${idx}">${item.min}</span>
                                <input type="range" class="filter-mini-slider" id="fp-slider-min-${idx}"
                                    min="0" max="100" value="${item.min}"
                                    data-feature="${item.feature}" data-side="min" data-idx="${idx}"
                                    style="background:linear-gradient(to right,${item.color}40,${item.color})">
                                <input type="range" class="filter-mini-slider" id="fp-slider-max-${idx}"
                                    min="0" max="100" value="${item.max}"
                                    data-feature="${item.feature}" data-side="max" data-idx="${idx}"
                                    style="background:linear-gradient(to right,${item.color},${item.color}40)">
                                <span class="filter-range-num" id="fp-max-${idx}">${item.max}</span>
                            </div>
                        </div>`;
                } else {
                    return `
                        <div class="filter-item">
                            <div class="filter-item-top">
                                <span class="filter-item-label">
                                    <span class="filter-item-dot" style="background:${item.color}"></span>
                                    ${item.label}
                                </span>
                                <span class="filter-item-value">${item.value}</span>
                                <button class="filter-item-remove" data-remove="${idx}">✕</button>
                            </div>
                        </div>`;
                }
            }).join('');

            // Remove buttons
            filterList.querySelectorAll('[data-remove]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    items[parseInt(btn.getAttribute('data-remove'))].remove();
                    updateFilterBadge();
                });
            });

            // Mini sliders
            filterList.querySelectorAll('.filter-mini-slider').forEach(slider => {
                slider.addEventListener('input', function () {
                    const feature = this.dataset.feature;
                    const idx     = this.dataset.idx;
                    let min = parseInt(document.getElementById(`fp-slider-min-${idx}`).value);
                    let max = parseInt(document.getElementById(`fp-slider-max-${idx}`).value);
                    if (min > max) { if (this.dataset.side === 'min') min = max; else max = min; }

                    document.getElementById(`fp-min-${idx}`).textContent = min;
                    document.getElementById(`fp-max-${idx}`).textContent = max;

                    if (min === 0 && max === 100) delete FilterState.rangeFilters[feature];
                    else FilterState.rangeFilters[feature] = { min, max };

                    if (colorSelect.value === feature) {
                        rangeMin.value = min; rangeMax.value = max;
                        rangeValues.textContent = `${min} - ${max}`;
                    }
                    applyAllFilters(); updateFilterBadge();
                });
            });
        }

        function clearAllFilters() {
            // Clear lasso
            FilterState.lassoSelection = null;
            if (AppState.views.universe) {
                AppState.views.universe.brushGroup.call(AppState.views.universe.brush.move, null);
            }

            // Clear artist — DIRECTLY update state and UI without calling applyAllFilters
            FilterState.artistFilter = null;
            const _searchInput   = document.getElementById('artist-search');
            const _searchClear   = document.getElementById('search-clear');
            const _searchWrapper = _searchInput.closest('.search-wrapper');
            _searchInput.value = '';
            _searchClear.style.display = 'none';
            _searchWrapper.classList.remove('has-filter');
            // NOTE: do NOT call clearArtistFilter() here — it triggers applyAllFilters internally

            // Clear mode
            FilterState.modeFilter = null;
            btnMajor.classList.remove('active');
            btnMinor.classList.remove('active');
            btnBoth.classList.add('active');

            // Clear range
            FilterState.rangeFilters = {};
            rangeMin.value = 0;
            rangeMax.value = 100;
            rangeValues.textContent = '0 - 100';

            // ONE single call at the end
            applyAllFilters();
            updateFilterBadge();
            console.log('✓ All filters cleared');
        }

        // Wrap applyAllFilters so badge always stays in sync
        const _baseApplyAllFilters = applyAllFilters;
        applyAllFilters = function () { _baseApplyAllFilters(); updateFilterBadge(); };

        // Initial badge
        updateFilterBadge();

        // ── MODE BUTTONS ─────────────────────────────────────────────────────

        function setModeFilter(mode) {
            FilterState.modeFilter = (mode === 'both') ? null : mode;

            btnMajor.classList.remove('active');
            btnMinor.classList.remove('active');
            btnBoth.classList.remove('active');
            if (mode === 'Major') btnMajor.classList.add('active');
            else if (mode === 'Minor') btnMinor.classList.add('active');
            else btnBoth.classList.add('active');

            applyAllFilters();
        }

        btnMajor.addEventListener('click', () => setModeFilter('Major'));
        btnMinor.addEventListener('click', () => setModeFilter('Minor'));
        btnBoth.addEventListener('click',  () => setModeFilter('both'));

        // ── RANGE SLIDER ─────────────────────────────────────────────────────

        function updateRangeFilter() {
            let min = parseInt(rangeMin.value);
            let max = parseInt(rangeMax.value);
            if (min > max) { [min, max] = [max, min]; rangeMin.value = min; rangeMax.value = max; }

            rangeValues.textContent = `${min} - ${max}`;

            // BUG 2 FIX: was "FilterState.rangeFilters[feature]" — 'feature' was undefined
            // must use colorSelect.value to get the current feature key
            const feature = colorSelect.value;
            if (feature === 'mode') return;

            if (min === 0 && max === 100) {
                delete FilterState.rangeFilters[feature];
            } else {
                FilterState.rangeFilters[feature] = { min, max };
            }

            applyAllFilters();
        }

        rangeMin.addEventListener('input', updateRangeFilter);
        rangeMax.addEventListener('input', updateRangeFilter);

        // ── ARTIST SEARCH ─────────────────────────────────────────────────────

        const searchInput        = document.getElementById('artist-search');
        const searchDropdown     = document.getElementById('search-dropdown');
        const searchDropdownList = document.getElementById('search-dropdown-list');
        const searchResultsCount = document.getElementById('search-results-count');
        const searchClear        = document.getElementById('search-clear');
        const searchWrapper      = searchInput.closest('.search-wrapper');

        const artistMap = new Map();
        AppState.allData.forEach(song => {
            song['artist(s)_name'].split(',').map(a => a.trim()).forEach(artist => {
                if (!artistMap.has(artist)) artistMap.set(artist, []);
                artistMap.get(artist).push(song);
            });
        });

        const allArtists = Array.from(artistMap.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([name, songs]) => ({ name, count: songs.length }));

        let activeIndex = -1;

        function highlightMatch(text, query) {
            if (!query) return text;
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
        }

        function showSuggestions(query) {
            if (!query) { searchDropdown.style.display = 'none'; return; }

            const matches = allArtists
                .filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 8);

            if (matches.length === 0) {
                searchDropdownList.innerHTML = `
                    <div class="search-suggestion" style="cursor:default">
                        <span class="search-suggestion-name" style="color:rgba(255,255,255,0.4)">No artists found</span>
                    </div>`;
                searchResultsCount.textContent = '';
            } else {
                searchDropdownList.innerHTML = matches.map((a, i) => `
                    <div class="search-suggestion" data-artist="${a.name}" data-index="${i}">
                        <span class="search-suggestion-name">${highlightMatch(a.name, query)}</span>
                        <span class="search-suggestion-meta">${a.count} song${a.count !== 1 ? 's' : ''}</span>
                    </div>`).join('');
                searchResultsCount.textContent = `${matches.length} artist${matches.length !== 1 ? 's' : ''} found`;

                searchDropdownList.querySelectorAll('.search-suggestion').forEach(el => {
                    el.addEventListener('mousedown', e => {
                        e.preventDefault();
                        selectArtist(el.getAttribute('data-artist'));
                    });
                });
            }

            searchDropdown.style.display = 'flex';
            activeIndex = -1;
        }

        function selectArtist(artistName) {
            searchInput.value = artistName;
            searchDropdown.style.display = 'none';
            searchClear.style.display = 'block';
            searchWrapper.classList.add('has-filter');

            FilterState.artistFilter = artistMap.get(artistName) || [];
            applyAllFilters();

            console.log(`✓ Artist: "${artistName}" → ${FilterState.artistFilter.length} songs`);
        }

        function clearArtistFilter(suppressApply = false) {
            FilterState.artistFilter = null;
            const _searchInput   = document.getElementById('artist-search');
            const _searchClear   = document.getElementById('search-clear');
            const _searchWrapper = _searchInput.closest('.search-wrapper');
            _searchInput.value = '';
            _searchClear.style.display = 'none';
            _searchWrapper.classList.remove('has-filter');
            document.getElementById('search-dropdown').style.display = 'none';

            if (!suppressApply) {
                applyAllFilters();
            }
        }

        searchInput.addEventListener('input', function () {
            const q = this.value.trim();
            if (q === '') clearArtistFilter();
            else { showSuggestions(q); searchClear.style.display = 'block'; }
        });

        searchInput.addEventListener('focus', function () {
            if (this.value.trim()) showSuggestions(this.value.trim());
        });

        searchInput.addEventListener('blur', function () {
            setTimeout(() => { searchDropdown.style.display = 'none'; }, 150);
        });

        searchInput.addEventListener('keydown', function (e) {
            const suggestions = searchDropdownList.querySelectorAll('.search-suggestion');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
                suggestions.forEach((s, i) => s.classList.toggle('active', i === activeIndex));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, -1);
                suggestions.forEach((s, i) => s.classList.toggle('active', i === activeIndex));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const t = activeIndex >= 0 ? suggestions[activeIndex]
                        : suggestions.length === 1 ? suggestions[0] : null;
                if (t) selectArtist(t.getAttribute('data-artist'));
            } else if (e.key === 'Escape') {
                searchDropdown.style.display = 'none';
                searchInput.blur();
            }
        });

        searchClear.addEventListener('click', clearArtistFilter);

        document.getElementById('loading').classList.add('hidden');
        console.log('✓ Dashboard initialized');

    } catch (error) {
        console.error('Error:', error);
        alert('Error loading data. Check console.');
    }
}

// ============================================================================
// HANDLERS (global — called from universe / fingerprint / battleground)
// ============================================================================

function handleSelection(selectedSongs) {
    AppState.selectedData = selectedSongs;
    document.getElementById('selection-count').textContent =
        `${selectedSongs.length} song${selectedSongs.length !== 1 ? 's' : ''} selected`;
    AppState.views.fingerprint.update(selectedSongs);
    AppState.views.battleground.update(selectedSongs);
}

function handleFeatureClick(feature) {
    AppState.colorMode = feature;
    const colorSelect = document.getElementById('color-mode');
    if (colorSelect) {
        colorSelect.value = feature;
        colorSelect.dispatchEvent(new Event('change'));
    }
    AppState.views.universe.updateColorMode(feature);
}

function handlePlatformClick(platform) {
    const col = {
        'Spotify': 'in_spotify_playlists',
        'Apple Music': 'in_apple_playlists',
        'Deezer': 'in_deezer_playlists'
    }[platform];
    const top = [...AppState.allData]
        .sort((a, b) => b[col] - a[col])
        .slice(0, Math.floor(AppState.allData.length * 0.1));
    AppState.views.universe.highlightSongs(top);
}

document.addEventListener('DOMContentLoaded', init);
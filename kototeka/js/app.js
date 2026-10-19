/**
 * Kototeka 2.0 — Main Application Logic
 * Premium Mobile Cat Collection App
 * Created by slawastr
 */

class KototekaApp {
  constructor() {
    this.currentTab = 'gallery';
    this.cats = [];
    this.searchQuery = '';
    
    // Filter & Sorting State
    this.selectedSort = 'newest'; // 'newest' | 'oldest' | 'nameAsc' | 'nameDesc'
    this.selectedFilterColor = 'all';
    this.selectedFilterMood = 'all';
    this.selectedFilterGeo = 'all'; // 'all' | 'auto' | 'manual'

    // View layout: 'grid' (2 columns) | 'cards' (1 column)
    this.currentViewLayout = localStorage.getItem('kototeka_view_layout') || 'grid';

    // Add Cat Form State
    this.currentPhotoData = null;
    this.currentThumbData = null;
    this.selectedColor = 'Рыжий';
    this.selectedMood = 'Ласковый';
    this.currentGeoMode = 'manual'; // Default to manual for reliable city GPS anti-spoofing
    this.selectedLocation = {
      lat: 55.751244,
      lng: 37.618423,
      address: 'Центр города',
      district: '',
      type: 'manual',
      accuracy: null
    };

    // Active detail & edit states
    this.currentViewingCatId = null;
    this.currentEditingCatId = null;
    this.editSelectedColor = 'Рыжий';
    this.editSelectedMood = 'Ласковый';

    // Postcard generation state
    this.currentPostcardDataUrl = null;
    this.currentPostcardCat = null;

    // User settings
    this.username = localStorage.getItem('kototeka_username') || 'slawastr';
  }

  async init() {
    // 1. Initialize Dark/Light Theme
    const savedTheme = localStorage.getItem('kototeka_theme') || 
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.setTheme(savedTheme);

    // 2. Initialize Layout View (Grid vs Cards)
    this.applyViewLayout(this.currentViewLayout);

    // 3. Bind UI Events
    this.bindEvents();
    this.renderUsername();

    // 4. Load cats from IndexedDB
    await this.loadCats();

    // 5. First-launch prompt for username if never set
    if (!localStorage.getItem('kototeka_username')) {
      setTimeout(() => this.openWelcomeModal(), 500);
    }

    // 6. Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    }

    // 7. Check achievements initially
    if (window.achievementManager) {
      window.achievementManager.checkAll(this.cats);
    }
  }

  // --- Theme Management ---
  setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('kototeka_theme', theme);
    
    const themeIcon = document.getElementById('themeToggleIcon');
    if (themeIcon) {
      themeIcon.textContent = isDark ? '☀️' : '🌙';
    }

    const metaColor = document.getElementById('themeColorMeta');
    if (metaColor) {
      metaColor.setAttribute('content', isDark ? '#121316' : '#F7F5F0');
    }
  }

  toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    this.setTheme(isDark ? 'light' : 'dark');
  }

  // --- Layout Toggle (Grid vs Cards) ---
  toggleViewLayout() {
    const nextLayout = this.currentViewLayout === 'grid' ? 'cards' : 'grid';
    this.applyViewLayout(nextLayout);
  }

  applyViewLayout(layout) {
    this.currentViewLayout = layout;
    localStorage.setItem('kototeka_view_layout', layout);

    const grid = document.getElementById('catsGrid');
    const gridIcon = document.getElementById('viewGridIcon');
    const listIcon = document.getElementById('viewListIcon');

    if (grid) {
      grid.classList.toggle('view-grid', layout === 'grid');
      grid.classList.toggle('view-cards', layout === 'cards');
    }

    if (gridIcon && listIcon) {
      if (layout === 'grid') {
        gridIcon.style.display = 'block';
        listIcon.style.display = 'none';
      } else {
        gridIcon.style.display = 'none';
        listIcon.style.display = 'block';
      }
    }
  }

  // --- Event Binding ---
  bindEvents() {
    // Bottom nav tabs
    document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    // FAB Add Cat button
    const fab = document.getElementById('fabAddCat');
    if (fab) {
      fab.addEventListener('click', () => this.openAddCatModal());
    }

    // Theme toggle button
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Sound toggle button
    const soundBtn = document.getElementById('soundToggleBtn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        window.soundMuted = !window.soundMuted;
        const icon = document.getElementById('soundIcon');
        if (icon) icon.textContent = window.soundMuted ? '🔇' : '🔊';
      });
    }

    // Search input & clear button
    const searchInput = document.getElementById('catSearchInput');
    const searchClear = document.getElementById('searchClearBtn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        if (searchClear) {
          searchClear.style.display = this.searchQuery ? 'block' : 'none';
        }
        this.renderGallery();
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        searchClear.style.display = 'none';
        this.searchQuery = '';
        this.renderGallery();
      });
    }

    // Filter Sheet Chip Interactions
    this.bindFilterSheetChips();

    // Camera and File pickers
    const cameraInput = document.getElementById('cameraInput');
    const galleryInput = document.getElementById('galleryInput');
    if (cameraInput) {
      cameraInput.addEventListener('change', (e) => this.handleImageSelected(e));
    }
    if (galleryInput) {
      galleryInput.addEventListener('change', (e) => this.handleImageSelected(e));
    }

    // Photo Box Click -> Camera Picker
    const photoBox = document.getElementById('photoUploaderBox');
    if (photoBox && cameraInput) {
      photoBox.addEventListener('click', () => cameraInput.click());
    }

    // Add Cat Form Tag Chips (Color)
    document.querySelectorAll('#colorChips .tag-select-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#colorChips .tag-select-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        this.selectedColor = chip.dataset.val;
      });
    });

    // Add Cat Form Tag Chips (Mood)
    document.querySelectorAll('#moodChips .tag-select-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#moodChips .tag-select-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        this.selectedMood = chip.dataset.val;
      });
    });

    // Edit Cat Form Tag Chips (Color)
    document.querySelectorAll('#editColorChips .tag-select-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#editColorChips .tag-select-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        this.editSelectedColor = chip.dataset.val;
      });
    });

    // Edit Cat Form Tag Chips (Mood)
    document.querySelectorAll('#editMoodChips .tag-select-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#editMoodChips .tag-select-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        this.editSelectedMood = chip.dataset.val;
      });
    });

    // Geolocation mode buttons (Auto vs Manual)
    const geoAutoBtn = document.getElementById('geoModeAutoBtn');
    const geoManualBtn = document.getElementById('geoModeManualBtn');
    if (geoAutoBtn) geoAutoBtn.addEventListener('click', () => this.setGeoMode('auto'));
    if (geoManualBtn) geoManualBtn.addEventListener('click', () => this.setGeoMode('manual'));

    // Manual address search button
    const searchAddrBtn = document.getElementById('searchAddressBtn');
    if (searchAddrBtn) {
      searchAddrBtn.addEventListener('click', () => this.searchAddressOnMap());
    }
    const searchAddrInput = document.getElementById('manualAddressInput');
    if (searchAddrInput) {
      searchAddrInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchAddressOnMap();
        }
      });
    }

    // GPS Trigger button
    const getGpsBtn = document.getElementById('getGpsBtn');
    if (getGpsBtn) {
      getGpsBtn.addEventListener('click', () => this.requestAutoGps());
    }

    // Add Cat Form Submit
    const addCatForm = document.getElementById('addCatForm');
    if (addCatForm) {
      addCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCurrentCat();
      });
    }

    // Edit Cat Form Submit
    const editCatForm = document.getElementById('editCatForm');
    if (editCatForm) {
      editCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEditedCat();
      });
    }

    // Locate Me on Main Map button
    const locateBtn = document.getElementById('mainMapLocateBtn');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => {
        if (window.kototekaMap) window.kototekaMap.locateUserOnMainMap();
      });
    }

    // Backup Import input
    const importInput = document.getElementById('importBackupInput');
    if (importInput) {
      importInput.addEventListener('change', (e) => this.importBackup(e));
    }

    // Welcome user form
    const welcomeForm = document.getElementById('welcomeUserForm');
    if (welcomeForm) {
      welcomeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('welcomeUsernameInput');
        this.saveWelcomeUsername(input ? input.value : '');
      });
    }

    // Close modals when clicking backdrop overlay
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });
    });
  }

  // Bind single-select chips inside Filter Modal
  bindFilterSheetChips() {
    const bindGroup = (containerId, onSelect) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll('.filter-select-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.filter-select-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          onSelect(btn);
        });
      });
    };

    bindGroup('sortFilterChips', (btn) => {
      this.selectedSort = btn.dataset.sort || 'newest';
    });

    bindGroup('colorFilterChips', (btn) => {
      this.selectedFilterColor = btn.dataset.color || 'all';
    });

    bindGroup('moodFilterChips', (btn) => {
      this.selectedFilterMood = btn.dataset.mood || 'all';
    });

    bindGroup('geoFilterChips', (btn) => {
      this.selectedFilterGeo = btn.dataset.geo || 'all';
    });
  }

  // --- Filter Bottom Sheet Open / Close / Apply / Reset ---
  openFilterModal() {
    const modal = document.getElementById('filterModal');
    if (!modal) return;

    // Sync chip selection state with current values
    this.syncFilterChipUI('sortFilterChips', 'data-sort', this.selectedSort);
    this.syncFilterChipUI('colorFilterChips', 'data-color', this.selectedFilterColor);
    this.syncFilterChipUI('moodFilterChips', 'data-mood', this.selectedFilterMood);
    this.syncFilterChipUI('geoFilterChips', 'data-geo', this.selectedFilterGeo);

    modal.classList.add('open');
  }

  closeFilterModal() {
    const modal = document.getElementById('filterModal');
    if (modal) modal.classList.remove('open');
  }

  syncFilterChipUI(containerId, attrName, activeValue) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.filter-select-chip').forEach(btn => {
      btn.classList.toggle('selected', btn.getAttribute(attrName) === activeValue);
    });
  }

  applyFiltersAndClose() {
    this.closeFilterModal();
    this.updateFilterBadge();
    this.renderGallery();
  }

  resetFilters() {
    this.selectedSort = 'newest';
    this.selectedFilterColor = 'all';
    this.selectedFilterMood = 'all';
    this.selectedFilterGeo = 'all';

    this.syncFilterChipUI('sortFilterChips', 'data-sort', 'newest');
    this.syncFilterChipUI('colorFilterChips', 'data-color', 'all');
    this.syncFilterChipUI('moodFilterChips', 'data-mood', 'all');
    this.syncFilterChipUI('geoFilterChips', 'data-geo', 'all');

    this.closeFilterModal();
    this.updateFilterBadge();
    this.renderGallery();
  }

  updateFilterBadge() {
    let activeCount = 0;
    const descParts = [];

    if (this.selectedSort !== 'newest') {
      activeCount++;
      const sortNames = {
        oldest: 'Сначала старые',
        nameAsc: 'Кличка А-Я',
        nameDesc: 'Кличка Я-А'
      };
      descParts.push(sortNames[this.selectedSort] || 'Сортировка');
    }

    if (this.selectedFilterColor !== 'all') {
      activeCount++;
      descParts.push(this.selectedFilterColor);
    }

    if (this.selectedFilterMood !== 'all') {
      activeCount++;
      descParts.push(this.selectedFilterMood);
    }

    if (this.selectedFilterGeo !== 'all') {
      activeCount++;
      descParts.push(this.selectedFilterGeo === 'auto' ? 'По GPS' : 'Вручную');
    }

    const badge = document.getElementById('activeFilterBadge');
    const tagsRow = document.getElementById('activeFilterTagsWrap');
    const tagsDesc = document.getElementById('activeFilterDesc');

    if (badge) {
      if (activeCount > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = activeCount;
      } else {
        badge.style.display = 'none';
      }
    }

    if (tagsRow && tagsDesc) {
      if (activeCount > 0) {
        tagsRow.style.display = 'flex';
        tagsDesc.textContent = descParts.join(' • ');
      } else {
        tagsRow.style.display = 'none';
      }
    }
  }

  // --- Data Loading & Navigation ---
  async loadCats() {
    try {
      this.cats = await window.catDb.getAllCats();
      this.renderGallery();
      this.updateStats();

      if (this.currentTab === 'map' && window.kototekaMap) {
        window.kototekaMap.updateCatMarkers(this.cats, (cat) => this.openCatModal(cat.id));
      }
    } catch (e) {
      console.error('Failed to load cats from KototekaDB:', e);
    }
  }

  switchTab(tab) {
    this.currentTab = tab;

    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav .nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Show active screen
    document.querySelectorAll('.tab-screen').forEach((screen) => {
      screen.classList.remove('active');
    });

    const activeScreen = document.getElementById(tab + 'Screen');
    if (activeScreen) {
      activeScreen.classList.add('active');
    }

    if (tab === 'map') {
      if (window.kototekaMap) {
        window.kototekaMap.initMainMap('mainMapContainer', (cat) => this.openCatModal(cat.id));
        window.kototekaMap.updateCatMarkers(this.cats, (cat) => this.openCatModal(cat.id));
      }
      const mapCount = document.getElementById('mapCatsCountSub');
      if (mapCount) {
        mapCount.textContent = `Котиков на карте: ${this.cats.filter(c => c.location && c.location.lat).length}`;
      }
    } else if (tab === 'achievements') {
      this.renderAchievements();
    } else if (tab === 'gallery') {
      this.renderGallery();
    }
  }

  // --- Gallery Rendering with Filters & Sorting ---
  renderGallery() {
    const grid = document.getElementById('catsGrid');
    const emptyState = document.getElementById('emptyState');
    const countLabel = document.getElementById('catsCountLabel');

    if (!grid) return;

    let filtered = this.cats.slice();

    // 1. Filter by Color
    if (this.selectedFilterColor !== 'all') {
      filtered = filtered.filter(c => c.color === this.selectedFilterColor);
    }

    // 2. Filter by Mood
    if (this.selectedFilterMood !== 'all') {
      filtered = filtered.filter(c => c.mood === this.selectedFilterMood);
    }

    // 3. Filter by Geolocation type
    if (this.selectedFilterGeo !== 'all') {
      filtered = filtered.filter(c => c.location && c.location.type === this.selectedFilterGeo);
    }

    // 4. Filter by Search Query
    if (this.searchQuery) {
      filtered = filtered.filter(c => {
        const nameMatch = c.name && c.name.toLowerCase().includes(this.searchQuery);
        const notesMatch = c.notes && c.notes.toLowerCase().includes(this.searchQuery);
        const addrMatch = c.location && c.location.address && c.location.address.toLowerCase().includes(this.searchQuery);
        return nameMatch || notesMatch || addrMatch;
      });
    }

    // 5. Apply Sorting
    filtered.sort((a, b) => {
      if (this.selectedSort === 'newest') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      } else if (this.selectedSort === 'oldest') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      } else if (this.selectedSort === 'nameAsc') {
        return (a.name || '').localeCompare(b.name || '', 'ru');
      } else if (this.selectedSort === 'nameDesc') {
        return (b.name || '').localeCompare(a.name || '', 'ru');
      }
      return 0;
    });

    // Update collection count label
    if (countLabel) {
      if (filtered.length === this.cats.length) {
        countLabel.textContent = `Котиков в коллекции: ${this.cats.length}`;
      } else {
        countLabel.textContent = `Показано котиков: ${filtered.length} из ${this.cats.length}`;
      }
    }

    // Handle Empty State
    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Render Native Cards
    grid.innerHTML = filtered.map(cat => {
      const isManual = cat.location && cat.location.type === 'manual';
      const locText = cat.location ? (cat.location.address || 'Точка на карте') : 'Без адреса';
      const dateStr = new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      const photoSrc = cat.thumb || cat.photo || './icons/cat-icon.svg';

      return `
        <div class="cat-card" onclick="window.app.openCatModal('${cat.id}')">
          <div class="cat-card-img-wrap">
            <img class="cat-card-img" src="${photoSrc}" alt="${this.escapeHtml(cat.name)}" loading="lazy" />
            <div class="cat-card-geo-tag">
              ${isManual ? '🗺️ Вручную' : '📡 GPS'}
            </div>
          </div>
          <div class="cat-card-body">
            <div class="cat-card-name">${this.escapeHtml(cat.name)}</div>
            <div class="cat-card-pill-row">
              ${cat.color ? `<span class="cat-pill color-pill">${this.escapeHtml(cat.color)}</span>` : ''}
              ${cat.mood ? `<span class="cat-pill">${this.escapeHtml(cat.mood)}</span>` : ''}
            </div>
            <div class="cat-card-footer-meta">
              <span class="cat-card-address" title="${this.escapeHtml(locText)}">📍 ${this.escapeHtml(locText)}</span>
              <span>${dateStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Add Cat Flow ---
  openAddCatModal() {
    this.resetAddForm();
    const modal = document.getElementById('addCatModal');
    if (modal) {
      modal.classList.add('open');
      this.setGeoMode('manual');
    }
  }

  closeAddCatModal() {
    const modal = document.getElementById('addCatModal');
    if (modal) modal.classList.remove('open');
  }

  resetAddForm() {
    this.currentPhotoData = null;
    this.currentThumbData = null;
    document.getElementById('catNameInput').value = '';
    document.getElementById('catNotesInput').value = '';
    document.getElementById('previewPhotoImg').style.display = 'none';
    document.getElementById('photoUploaderContent').style.display = 'flex';
    document.getElementById('manualAddressInput').value = '';

    // Set date-time picker to current moment
    const dateInput = document.getElementById('catDateInput');
    if (dateInput) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateInput.value = now.toISOString().slice(0, 16);
    }

    // Reset chips to defaults
    this.selectedColor = 'Рыжий';
    this.selectedMood = 'Ласковый';
    document.querySelectorAll('#colorChips .tag-select-chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.val === 'Рыжий');
    });
    document.querySelectorAll('#moodChips .tag-select-chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.val === 'Ласковый');
    });

    // Reset date detected notice
    const notice = document.getElementById('catDateDetectedNotice');
    if (notice) {
      notice.textContent = '';
      notice.style.display = 'none';
    }

    // Reset GPS detected notice
    const gpsNotice = document.getElementById('catGpsDetectedNotice');
    if (gpsNotice) {
      gpsNotice.textContent = '';
      gpsNotice.style.display = 'none';
    }

    const statusEl = document.getElementById('gpsStatusText');
    if (statusEl) statusEl.textContent = 'Нажмите кнопку выше для запроса геолокации';
  }

  async handleImageSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const result = await window.PhotoProcessor.processFile(file);
      this.currentPhotoData = result.photo;
      this.currentThumbData = result.thumb;

      const previewImg = document.getElementById('previewPhotoImg');
      previewImg.src = result.photo;
      previewImg.style.display = 'block';
      document.getElementById('photoUploaderContent').style.display = 'none';

      // 1. Auto-detect and set date if available from EXIF or file
      if (result.detectedDate) {
        const d = result.detectedDate;
        const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const dateInput = document.getElementById('catDateInput');
        if (dateInput) dateInput.value = localIso;

        const notice = document.getElementById('catDateDetectedNotice');
        if (notice) {
          const readable = d.toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          const sourceText = result.detectedDateSource === 'exif' ? 'EXIF камеры' : 'метаданные файла';
          notice.textContent = `📅 Дата определена по фото: ${readable} (${sourceText})`;
          notice.style.display = 'block';
        }
      }

      // 2. Auto-detect and set Geolocation if available in photo EXIF
      if (result.detectedGps) {
        const { lat, lng } = result.detectedGps;
        this.selectedLocation.lat = lat;
        this.selectedLocation.lng = lng;
        this.selectedLocation.type = 'manual';

        this.setGeoMode('manual');

        if (window.kototekaMap) {
          window.kototekaMap.setPickerLocation(lat, lng, 'manual');
        }

        const geoInfo = await window.kototekaMap.reverseGeocode(lat, lng);
        if (geoInfo && geoInfo.address) {
          this.selectedLocation.address = geoInfo.address;
          this.selectedLocation.district = geoInfo.district || '';
          const addrInput = document.getElementById('manualAddressInput');
          if (addrInput) addrInput.value = geoInfo.address;
        }

        const gpsNotice = document.getElementById('catGpsDetectedNotice');
        if (gpsNotice) {
          const locText = this.selectedLocation.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          gpsNotice.innerHTML = `📍 Геолокация найдена в метаданных фото: <b>${this.escapeHtml(locText)}</b>`;
          gpsNotice.style.display = 'block';
        }
      }

      if (!window.soundMuted && window.achievementManager) {
        window.achievementManager.playMeowSound();
      }
    } catch (err) {
      alert('Ошибка обработки фото: ' + err.message);
    }
  }

  setGeoMode(mode) {
    this.currentGeoMode = mode;
    this.selectedLocation.type = mode;

    document.getElementById('geoModeAutoBtn').classList.toggle('active', mode === 'auto');
    document.getElementById('geoModeManualBtn').classList.toggle('active', mode === 'manual');

    const autoBox = document.getElementById('geoAutoControls');
    const manualBox = document.getElementById('geoManualControls');

    if (mode === 'auto') {
      autoBox.style.display = 'block';
      manualBox.style.display = 'none';
    } else {
      autoBox.style.display = 'none';
      manualBox.style.display = 'block';

      setTimeout(() => {
        if (window.kototekaMap) {
          window.kototekaMap.initPickerMap(
            'pickerMapContainer',
            [this.selectedLocation.lat, this.selectedLocation.lng],
            async (coords) => {
              this.selectedLocation.lat = coords.lat;
              this.selectedLocation.lng = coords.lng;
              this.selectedLocation.type = 'manual';
              const geoInfo = await window.kototekaMap.reverseGeocode(coords.lat, coords.lng);
              if (geoInfo && geoInfo.address) {
                document.getElementById('manualAddressInput').value = geoInfo.address;
                this.selectedLocation.address = geoInfo.address;
                this.selectedLocation.district = geoInfo.district || '';
              }
            }
          );
        }
      }, 150);
    }
  }

  requestAutoGps() {
    const statusEl = document.getElementById('gpsStatusText');
    if (!statusEl) return;
    statusEl.innerHTML = '⏳ Поиск спутников GPS... Пожалуйста, подождите.';

    if (!navigator.geolocation) {
      statusEl.innerHTML = '❌ Геолокация не поддерживается вашим устройством. Используйте карту вручную.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const acc = Math.round(pos.coords.accuracy);
        this.selectedLocation = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          type: 'auto',
          accuracy: acc,
          address: '',
          district: ''
        };

        const accBadge = acc < 35 ? '🟢 Высокая' : (acc < 150 ? '🟡 Средняя' : '🔴 Низкая (возможен сбой/спуфинг)');
        statusEl.innerHTML = `✅ Координаты получены! <br>📍 ${this.selectedLocation.lat}, ${this.selectedLocation.lng} (точность: ~${acc}м, ${accBadge})`;

        const geoInfo = await window.kototekaMap.reverseGeocode(this.selectedLocation.lat, this.selectedLocation.lng);
        if (geoInfo && geoInfo.address) {
          this.selectedLocation.address = geoInfo.address;
          this.selectedLocation.district = geoInfo.district || '';
          statusEl.innerHTML += `<br>🏠 Адрес: <b>${this.escapeHtml(geoInfo.address)}</b>`;
        } else {
          this.selectedLocation.address = `Координаты: ${this.selectedLocation.lat}, ${this.selectedLocation.lng}`;
        }
      },
      (err) => {
        let msg = 'Ошибка получения GPS';
        if (err.code === 1) msg = 'Доступ к геопозиции запрещен в настройках';
        else if (err.code === 2) msg = 'Сигнал спутников недоступен (глушится или в помещении)';
        else if (err.code === 3) msg = 'Превышено время ожидания GPS';

        statusEl.innerHTML = `⚠️ ${msg}. <br><button type="button" class="btn-subtle-action" style="margin-top:6px;" onclick="window.app.setGeoMode('manual')">🗺️ Указать точку на карте вручную</button>`;
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  async searchAddressOnMap() {
    const query = document.getElementById('manualAddressInput').value.trim();
    if (!query || !window.kototekaMap) return;

    const results = await window.kototekaMap.searchAddress(query);
    if (results && results.length > 0) {
      const first = results[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      window.kototekaMap.setPickerLocation(lat, lng, 'manual', (coords) => {
        this.selectedLocation.lat = coords.lat;
        this.selectedLocation.lng = coords.lng;
        this.selectedLocation.type = 'manual';
        this.selectedLocation.address = query;
      });
    } else {
      this.selectedLocation.address = query;
    }
  }

  async saveCurrentCat() {
    const name = document.getElementById('catNameInput').value.trim();
    if (!name) {
      alert('Пожалуйста, укажите кличку или описание котика');
      return;
    }

    const notes = document.getElementById('catNotesInput').value.trim();
    const manualAddr = document.getElementById('manualAddressInput').value.trim();

    if (this.currentGeoMode === 'manual' && manualAddr) {
      this.selectedLocation.address = manualAddr;
    }

    const dateVal = document.getElementById('catDateInput') ? document.getElementById('catDateInput').value : '';
    const createdAt = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();

    const cat = {
      id: 'cat_' + Date.now(),
      name: name,
      photo: this.currentPhotoData || null,
      thumb: this.currentThumbData || null,
      color: this.selectedColor,
      mood: this.selectedMood,
      tags: [this.selectedColor, this.selectedMood].filter(Boolean),
      notes: notes,
      location: { ...this.selectedLocation },
      createdAt: createdAt
    };

    try {
      await window.catDb.saveCat(cat);
      this.cats.unshift(cat);

      this.closeAddCatModal();
      this.renderGallery();
      this.updateStats();

      // Check achievements & sound
      if (window.achievementManager) {
        window.achievementManager.checkAll(this.cats);
        if (!window.soundMuted) window.achievementManager.playCelebrationSound();
      }

      // If map active, refresh markers
      if (this.currentTab === 'map' && window.kototekaMap) {
        window.kototekaMap.updateCatMarkers(this.cats, (c) => this.openCatModal(c.id));
      }
    } catch (e) {
      alert('Ошибка при сохранении котика: ' + e.message);
    }
  }

  // --- Cat Detail Modal ---
  openCatModal(id) {
    const cat = this.cats.find(c => c.id === id);
    if (!cat) return;

    this.currentViewingCatId = id;
    const modal = document.getElementById('catDetailModal');
    if (!modal) return;

    document.getElementById('detailCatName').textContent = cat.name;
    document.getElementById('detailCatPhoto').src = cat.photo || cat.thumb || './icons/cat-icon.svg';
    
    document.getElementById('detailCatDate').textContent = 'Встречен: ' + new Date(cat.createdAt).toLocaleString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const isManual = cat.location && cat.location.type === 'manual';
    const locText = cat.location ? (cat.location.address || `${cat.location.lat}, ${cat.location.lng}`) : 'Не указана';
    document.getElementById('detailCatLocation').innerHTML = `
      📍 ${this.escapeHtml(locText)} 
      <span class="cat-pill" style="margin-left:6px;">${isManual ? '🗺️ Вручную' : '📡 GPS'}</span>
    `;

    const geoBadge = document.getElementById('detailPhotoGeoBadge');
    if (geoBadge) {
      geoBadge.textContent = isManual ? '🗺️ Карта' : '📍 GPS';
    }

    // Map link
    const mapLinkBtn = document.getElementById('detailOpenMapBtn');
    if (cat.location && cat.location.lat && cat.location.lng) {
      mapLinkBtn.style.display = 'inline-flex';
      mapLinkBtn.href = `https://yandex.ru/maps/?pt=${cat.location.lng},${cat.location.lat}&z=17&l=map`;
    } else {
      mapLinkBtn.style.display = 'none';
    }

    // Tags
    const tagsBox = document.getElementById('detailCatTags');
    tagsBox.innerHTML = `
      ${cat.color ? `<span class="cat-pill color-pill">${this.escapeHtml(cat.color)}</span>` : ''}
      ${cat.mood ? `<span class="cat-pill">${this.escapeHtml(cat.mood)}</span>` : ''}
    `;

    // Notes
    const notesBox = document.getElementById('detailCatNotes');
    if (cat.notes) {
      notesBox.style.display = 'block';
      notesBox.textContent = `«${cat.notes}»`;
    } else {
      notesBox.style.display = 'none';
    }

    modal.classList.add('open');
  }

  closeCatDetailModal() {
    const modal = document.getElementById('catDetailModal');
    if (modal) modal.classList.remove('open');
  }

  // --- Fullscreen Photo Viewer ---
  openFullscreenPhoto() {
    const cat = this.cats.find(c => c.id === this.currentViewingCatId);
    if (!cat) return;

    const modal = document.getElementById('fullscreenPhotoModal');
    const img = document.getElementById('fullscreenImg');
    const title = document.getElementById('fullscreenCatTitle');

    if (modal && img) {
      img.src = cat.photo || cat.thumb || './icons/cat-icon.svg';
      if (title) title.textContent = cat.name || 'Фото котика';
      modal.classList.add('open');
    }
  }

  closeFullscreenPhoto() {
    const modal = document.getElementById('fullscreenPhotoModal');
    if (modal) modal.classList.remove('open');
  }

  // --- Edit Cat Modal ---
  openEditCatModal() {
    const cat = this.cats.find(c => c.id === this.currentViewingCatId);
    if (!cat) return;

    this.currentEditingCatId = cat.id;
    this.editSelectedColor = cat.color || 'Рыжий';
    this.editSelectedMood = cat.mood || 'Ласковый';

    document.getElementById('editCatNameInput').value = cat.name || '';
    
    // Format date for datetime-local
    const d = new Date(cat.createdAt || Date.now());
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('editCatDateInput').value = d.toISOString().slice(0, 16);

    document.getElementById('editCatAddressInput').value = cat.location ? (cat.location.address || '') : '';
    document.getElementById('editCatNotesInput').value = cat.notes || '';

    // Update chips
    document.querySelectorAll('#editColorChips .tag-select-chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.val === this.editSelectedColor);
    });
    document.querySelectorAll('#editMoodChips .tag-select-chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.val === this.editSelectedMood);
    });

    const modal = document.getElementById('editCatModal');
    if (modal) modal.classList.add('open');
  }

  closeEditCatModal() {
    const modal = document.getElementById('editCatModal');
    if (modal) modal.classList.remove('open');
  }

  async saveEditedCat() {
    const cat = this.cats.find(c => c.id === this.currentEditingCatId);
    if (!cat) return;

    const newName = document.getElementById('editCatNameInput').value.trim();
    if (!newName) {
      alert('Пожалуйста, укажите кличку котика');
      return;
    }

    const dateVal = document.getElementById('editCatDateInput').value;
    const addrVal = document.getElementById('editCatAddressInput').value.trim();
    const notesVal = document.getElementById('editCatNotesInput').value.trim();

    cat.name = newName;
    if (dateVal) cat.createdAt = new Date(dateVal).toISOString();
    cat.color = this.editSelectedColor;
    cat.mood = this.editSelectedMood;
    cat.tags = [cat.color, cat.mood].filter(Boolean);
    cat.notes = notesVal;

    if (!cat.location) cat.location = {};
    if (addrVal) cat.location.address = addrVal;

    try {
      await window.catDb.saveCat(cat);
      this.closeEditCatModal();
      this.openCatModal(cat.id);
      this.renderGallery();
      this.updateStats();

      if (window.achievementManager) {
        window.achievementManager.checkAll(this.cats);
      }
      if (this.currentTab === 'map' && window.kototekaMap) {
        window.kototekaMap.updateCatMarkers(this.cats, (c) => this.openCatModal(c.id));
      }
    } catch (e) {
      alert('Ошибка при сохранении изменений: ' + e.message);
    }
  }

  async deleteCurrentCat() {
    if (!this.currentViewingCatId) return;
    if (!confirm('Вы действительно хотите удалить этого котика из вашей коллекции?')) return;

    try {
      await window.catDb.deleteCat(this.currentViewingCatId);
      this.cats = this.cats.filter(c => c.id !== this.currentViewingCatId);
      this.closeCatDetailModal();
      this.renderGallery();
      this.updateStats();

      if (this.currentTab === 'map' && window.kototekaMap) {
        window.kototekaMap.updateCatMarkers(this.cats, (c) => this.openCatModal(c.id));
      }
    } catch (e) {
      alert('Ошибка при удалении: ' + e.message);
    }
  }

  // --- Telegram Share ---
  async shareToTelegram() {
    try {
      const cat = this.cats.find(c => c.id === this.currentViewingCatId);
      if (!cat) return;

      const appUrl = 'https://github.com/SLAWASTR/kototeka/releases/tag/v2.0.0';
      const dateStr = new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      const locStr = cat.location ? (cat.location.address || `${cat.location.lat}, ${cat.location.lng}`) : 'Городские улицы';
      const noteText = cat.notes ? `\n📝 Заметка: «${cat.notes}»` : '';

      const text = 
        `🐾 Я встретил котика и сохранил в личную «Кототеку 2.0»!\n\n` +
        `🐱 Кличка: ${cat.name}\n` +
        `🎨 Окрас: ${cat.color || 'Особенный'} | Характер: ${cat.mood || 'Милый'}\n` +
        `📍 Где: ${locStr}\n` +
        `📅 Дата встречи: ${dateStr}` +
        noteText + `\n` +
        `👤 Котолов: ${this.username}\n\n` +
        `📲 Скачивай приложение «Кототека» на Android и собирай котиков:`;

      const photoToShare = cat.photo || cat.thumb;

      // 1. Android APK native bridge: send with image
      if (window.AndroidBridge) {
        if (photoToShare && window.AndroidBridge.shareImageToTelegram) {
          window.AndroidBridge.shareImageToTelegram(photoToShare, text, appUrl);
          return;
        }
        if (window.AndroidBridge.shareToTelegram) {
          window.AndroidBridge.shareToTelegram(text, appUrl);
          return;
        }
      }

      // 2. Web Share API with image file
      if (photoToShare && navigator.canShare) {
        try {
          const res = await fetch(photoToShare);
          const blob = await res.blob();
          const file = new File([blob], `${cat.name || 'cat'}.jpg`, { type: blob.type || 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Кототека: ${cat.name}`,
              text: `${text}\n${appUrl}`
            });
            return;
          }
        } catch (shareErr) {
          console.log('Web share note:', shareErr);
        }
      }

      // 3. Fallback to Telegram Web link
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(text)}`;
      window.open(tgUrl, '_blank') || (window.location.href = tgUrl);
    } catch (e) {
      alert('Ошибка при отправке в Telegram: ' + e.message);
    }
  }

  // --- Postcard Generation (Canvas 2.0) ---
  async downloadCatCard() {
    const cat = this.cats.find(c => c.id === this.currentViewingCatId);
    if (!cat) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1260;
      const ctx = canvas.getContext('2d');

      const isDark = document.body.classList.contains('dark-mode');
      
      // Card Background
      ctx.fillStyle = isDark ? '#121316' : '#F7F5F0';
      ctx.fillRect(0, 0, 1000, 1260);

      // Elevated Surface Container
      ctx.fillStyle = isDark ? '#1B1D22' : '#FFFFFF';
      this.drawRoundedRect(ctx, 40, 40, 920, 1180, 36);
      ctx.fill();

      // Subtle Outer Border
      ctx.strokeStyle = isDark ? '#272A32' : '#E9E7E2';
      ctx.lineWidth = 2;
      this.drawRoundedRect(ctx, 40, 40, 920, 1180, 36);
      ctx.stroke();

      // Top Brand Header
      ctx.fillStyle = '#FF7138';
      ctx.font = 'bold 36px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🐾 КОТОТЕКА 2.0', 500, 105);

      ctx.fillStyle = isDark ? '#8E929E' : '#858995';
      ctx.font = '22px -apple-system, sans-serif';
      ctx.fillText(`Личная карточка котика • Котолов: ${this.username}`, 500, 142);

      const drawContent = () => {
        // Cat Name
        ctx.fillStyle = isDark ? '#F5F6F8' : '#191B20';
        ctx.font = 'bold 54px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cat.name, 500, 835);

        // Date & Location
        const dateStr = new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const locStr = cat.location ? (cat.location.address || `${cat.location.lat}, ${cat.location.lng}`) : 'Городские улицы';

        ctx.fillStyle = isDark ? '#8E929E' : '#858995';
        ctx.font = '26px -apple-system, sans-serif';
        ctx.fillText(`📅 ${dateStr}`, 500, 885);
        ctx.fillText(`📍 ${locStr.slice(0, 44)}`, 500, 930);

        // Badges: Color & Mood
        const tagText = `${cat.color || 'Особенный'}  •  ${cat.mood || 'Милый'}`;
        ctx.fillStyle = '#FF7138';
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.fillText(tagText, 500, 985);

        // Notes Excerpt
        if (cat.notes) {
          ctx.fillStyle = isDark ? '#DCD8D0' : '#4A4D57';
          ctx.font = 'italic 25px -apple-system, sans-serif';
          const excerpt = cat.notes.length > 68 ? cat.notes.slice(0, 65) + '...' : cat.notes;
          ctx.fillText(`«${excerpt}»`, 500, 1055);
        }

        // Footer
        ctx.fillStyle = isDark ? '#606470' : '#A6ABB7';
        ctx.font = '20px -apple-system, sans-serif';
        ctx.fillText('Приложение «Кототека» • Скачать на Android: github.com/SLAWASTR/kototeka', 500, 1175);

        const dataUrl = canvas.toDataURL('image/png');
        this.currentPostcardDataUrl = dataUrl;
        this.currentPostcardCat = cat;

        const previewModal = document.getElementById('postcardModal');
        const previewImg = document.getElementById('postcardPreviewImg');
        if (previewModal && previewImg) {
          previewImg.src = dataUrl;
          previewModal.classList.add('open');
        }

        // Android automatic gallery saving
        if (window.AndroidBridge && window.AndroidBridge.saveBase64Image) {
          const cleanName = cat.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
          window.AndroidBridge.saveBase64Image(dataUrl, `Кот_${cleanName}.png`);
        }
      };

      const photoSource = cat.photo || cat.thumb;
      if (photoSource) {
        const img = new Image();
        if (photoSource.startsWith('http')) img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.save();
          this.drawRoundedRect(ctx, 100, 175, 800, 580, 24);
          ctx.clip();

          const imgRatio = img.width / img.height;
          const boxRatio = 800 / 580;
          let dw, dh, dx, dy;
          if (imgRatio > boxRatio) {
            dh = 580;
            dw = 580 * imgRatio;
            dx = 100 - (dw - 800) / 2;
            dy = 175;
          } else {
            dw = 800;
            dh = 800 / imgRatio;
            dx = 100;
            dy = 175 - (dh - 580) / 2;
          }
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.restore();
          drawContent();
        };
        img.onerror = () => drawContent();
        img.src = photoSource;
      } else {
        ctx.fillStyle = '#FFF1EB';
        this.drawRoundedRect(ctx, 100, 175, 800, 580, 24);
        ctx.fill();
        ctx.font = '160px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🐾', 500, 500);
        drawContent();
      }
    } catch (err) {
      alert('Ошибка создания открытки: ' + err.message);
    }
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  savePostcardToDevice() {
    if (!this.currentPostcardDataUrl) return;
    const cat = this.currentPostcardCat;
    const cleanName = cat ? cat.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') : 'kot';
    const filename = `Кототека_${cleanName}.png`;

    if (window.AndroidBridge && window.AndroidBridge.saveBase64Image) {
      window.AndroidBridge.saveBase64Image(this.currentPostcardDataUrl, filename);
    } else {
      const a = document.createElement('a');
      a.href = this.currentPostcardDataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      alert('Открытка сохранена!');
    }
  }

  async sharePostcardToTelegram() {
    if (!this.currentPostcardDataUrl) return;
    const cat = this.currentPostcardCat;
    const appUrl = 'https://github.com/SLAWASTR/kototeka/releases/tag/v2.0.0';
    const dateStr = cat ? new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const locStr = cat && cat.location ? (cat.location.address || `${cat.location.lat}, ${cat.location.lng}`) : 'Городские улицы';
    const noteText = cat && cat.notes ? `\n📝 Заметка: «${cat.notes}»` : '';

    const text = 
      `🐾 Я встретил котика и сохранил в «Кототеку 2.0»!\n\n` +
      `🐱 Кличка: ${cat ? cat.name : 'Котик'}\n` +
      `🎨 Окрас: ${cat ? (cat.color || 'Особенный') : ''} | Характер: ${cat ? (cat.mood || 'Милый') : ''}\n` +
      `📍 Где: ${locStr}\n` +
      `📅 Дата: ${dateStr}` +
      noteText + `\n` +
      `👤 Котолов: ${this.username}\n\n` +
      `📲 Скачивай приложение «Кототека» на Android и собирай котиков:`;

    if (window.AndroidBridge) {
      if (window.AndroidBridge.shareImageToTelegram) {
        window.AndroidBridge.shareImageToTelegram(this.currentPostcardDataUrl, text, appUrl);
        return;
      }
      if (window.AndroidBridge.shareImage) {
        window.AndroidBridge.shareImage(this.currentPostcardDataUrl, text + '\n' + appUrl);
        return;
      }
    }

    if (navigator.canShare) {
      try {
        const res = await fetch(this.currentPostcardDataUrl);
        const blob = await res.blob();
        const file = new File([blob], `Открытка_${cat ? cat.name : 'котик'}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Кототека: ${cat ? cat.name : 'Открытка'}`,
            text: `${text}\n${appUrl}`
          });
          return;
        }
      } catch (shareErr) {
        console.log('Postcard web share note:', shareErr);
      }
    }

    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(text)}`;
    window.open(tgUrl, '_blank') || (window.location.href = tgUrl);
  }

  // --- Achievements & Stats ---
  renderAchievements() {
    const listContainer = document.getElementById('achievementsList');
    if (!listContainer || !window.achievementManager) return;

    const unlocked = window.achievementManager.getUnlockedList();
    const countEl = document.getElementById('achUnlockedCount');
    if (countEl) countEl.textContent = `${unlocked.length}/${window.ACHIEVEMENTS_DEF.length}`;

    listContainer.innerHTML = window.ACHIEVEMENTS_DEF.map(ach => {
      const isDone = window.achievementManager.isUnlocked(ach.id);
      const prog = ach.progress(this.cats);

      return `
        <div class="ach-card ${isDone ? 'unlocked' : 'locked'}">
          <div class="ach-card-icon">${ach.icon}</div>
          <div class="ach-card-info">
            <div class="ach-card-title">
              <span>${ach.title}</span>
              <span class="ach-card-progress">${isDone ? '✅ Получено' : prog}</span>
            </div>
            <div class="ach-card-desc">${ach.desc}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  updateStats() {
    const totalCatsEl = document.getElementById('statTotalCats');
    if (totalCatsEl) totalCatsEl.textContent = this.cats.length;

    const colorCounts = {};
    this.cats.forEach(c => {
      if (c.color) colorCounts[c.color] = (colorCounts[c.color] || 0) + 1;
    });
    let topColor = '—';
    let maxC = 0;
    for (const [col, count] of Object.entries(colorCounts)) {
      if (count > maxC) {
        maxC = count;
        topColor = col;
      }
    }
    const topColorEl = document.getElementById('statTopColor');
    if (topColorEl) topColorEl.textContent = topColor;
  }

  // --- Backup & Restore ---
  openBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) modal.classList.add('open');
  }

  closeBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) modal.classList.remove('open');
  }

  async exportBackup() {
    try {
      const jsonStr = await window.catDb.exportAll();

      // 1. If running inside native Android APK, use AndroidBridge
      if (window.AndroidBridge) {
        if (window.AndroidBridge.saveBackupJson) {
          window.AndroidBridge.saveBackupJson(jsonStr);
          return;
        }
        if (window.AndroidBridge.shareBackupFile) {
          window.AndroidBridge.shareBackupFile(jsonStr);
          return;
        }
      }

      // 2. Browser fallback
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kototeka_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка экспорта: ' + e.message);
    }
  }

  async importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const count = await window.catDb.importAll(e.target.result);
        alert(`Успешно восстановлено ${count} котиков!`);
        this.closeBackupModal();
        await this.loadCats();
      } catch (err) {
        alert('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // --- Sample Demo Cats ---
  async loadSampleCats() {
    const samples = [
      {
        id: 'cat_sample_1',
        name: 'Рыжик у пекарни',
        color: 'Рыжий',
        mood: 'Ласковый',
        tags: ['Рыжий', 'Ласковый'],
        notes: 'Любит сидеть у тёплой витрины, угостили сосиской, сразу замурчал!',
        photo: null,
        thumb: null,
        location: {
          lat: 55.753930,
          lng: 37.620795,
          address: 'Никольская ул., д. 8',
          district: 'Центральный',
          type: 'manual'
        },
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
      },
      {
        id: 'cat_sample_2',
        name: 'Барон Черныш',
        color: 'Чёрный',
        mood: 'Бандит',
        tags: ['Чёрный', 'Бандит'],
        notes: 'Охраняет тихий двор в арке, важный взгляд, настоящий хозяин района.',
        photo: null,
        thumb: null,
        location: {
          lat: 55.760241,
          lng: 37.643194,
          address: 'Покровка, д. 21',
          district: 'Басманный',
          type: 'auto',
          accuracy: 14
        },
        createdAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'cat_sample_3',
        name: 'Соня на лавочке',
        color: 'Трёхцветный',
        mood: 'Спит',
        tags: ['Трёхцветный', 'Спит'],
        notes: 'Греется на весеннем солнышке, сладко спит клубком на скамейке.',
        photo: null,
        thumb: null,
        location: {
          lat: 55.741556,
          lng: 37.604472,
          address: 'Парк Музеон, у набережной',
          district: 'Якиманка',
          type: 'manual'
        },
        createdAt: new Date().toISOString()
      }
    ];

    for (const c of samples) {
      await window.catDb.saveCat(c);
    }
    await this.loadCats();
    if (window.achievementManager) window.achievementManager.checkAll(this.cats);
  }

  // --- Username Flow ---
  renderUsername() {
    const el = document.getElementById('usernameDisplay');
    if (el) {
      el.textContent = this.username;
    }
  }

  openWelcomeModal() {
    const modal = document.getElementById('welcomeUserModal');
    if (modal) {
      modal.classList.add('open');
      const input = document.getElementById('welcomeUsernameInput');
      if (input) {
        input.value = (this.username && this.username !== 'Котолов') ? this.username : '';
        setTimeout(() => input.focus(), 300);
      }
    }
  }

  closeWelcomeModal() {
    const modal = document.getElementById('welcomeUserModal');
    if (modal) modal.classList.remove('open');
  }

  saveWelcomeUsername(name) {
    const clean = (name || '').trim();
    this.username = clean || 'slawastr';
    localStorage.setItem('kototeka_username', this.username);
    this.renderUsername();
    this.closeWelcomeModal();
    if (!window.soundMuted && window.achievementManager) {
      window.achievementManager.playMeowSound();
    }
  }

  promptChangeUsername() {
    this.openWelcomeModal();
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// Global App Instance
window.app = new KototekaApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});

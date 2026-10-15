/**
 * Main Application Logic for Kototeka
 */

class KototekaApp {
  constructor() {
    this.currentTab = 'gallery';
    this.cats = [];
    this.activeFilter = 'all';
    this.searchQuery = '';
    
    // Add cat form state
    this.currentPhotoData = null;
    this.currentThumbData = null;
    this.selectedColor = 'Рыжий';
    this.selectedMood = 'Ласковый';
    this.currentGeoMode = 'manual'; // Default to manual for reliable Russia anti-spoofing
    this.selectedLocation = {
      lat: 55.751244,
      lng: 37.618423,
      address: 'Центр города',
      district: '',
      type: 'manual',
      accuracy: null
    };
    this.currentViewingCatId = null;
    this.username = localStorage.getItem('kototeka_username') || 'slawastr';
  }

  async init() {
    // Initialize Dark/Light Theme
    const savedTheme = localStorage.getItem('kototeka_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.setTheme(savedTheme);

    this.bindEvents();
    this.renderUsername();
    await this.loadCats();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    }

    // Check achievements initially
    window.achievementManager.checkAll(this.cats);
  }

  setTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('kototeka_theme', theme);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.textContent = isDark ? '☀️' : '🌙';
    }
  }

  bindEvents() {
    // Bottom nav tabs
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    // FAB Add Cat button
    document.getElementById('fabAddCat').addEventListener('click', () => {
      this.openAddCatModal();
    });

    // Search input
    const searchInput = document.getElementById('catSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderGallery();
      });
    }

    // Filter chips
    document.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFilter = chip.dataset.filter;
        this.renderGallery();
      });
    });

    // Camera and File pickers
    const cameraInput = document.getElementById('cameraInput');
    const galleryInput = document.getElementById('galleryInput');

    if (cameraInput) {
      cameraInput.addEventListener('change', (e) => this.handleImageSelected(e));
    }
    if (galleryInput) {
      galleryInput.addEventListener('change', (e) => this.handleImageSelected(e));
    }

    // Photo box click triggers camera or gallery
    const photoBox = document.getElementById('photoUploaderBox');
    if (photoBox) {
      photoBox.addEventListener('click', () => {
        // Default to camera on mobile or gallery
        cameraInput.click();
      });
    }

    // Form tag chips (Color)
    document.querySelectorAll('#colorChips .tag-select-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#colorChips .tag-select-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        this.selectedColor = chip.dataset.val;
      });
    });

    // Form tag chips (Mood)
    document.querySelectorAll('#moodChips .tag-select-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#moodChips .tag-select-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        this.selectedMood = chip.dataset.val;
      });
    });

    // Geolocation mode buttons (Auto vs Manual)
    document.getElementById('geoModeAutoBtn').addEventListener('click', () => this.setGeoMode('auto'));
    document.getElementById('geoModeManualBtn').addEventListener('click', () => this.setGeoMode('manual'));

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

    // Save Cat Form
    const addCatForm = document.getElementById('addCatForm');
    if (addCatForm) {
      addCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCurrentCat();
      });
    }

    // Locate Me on Main Map button
    const locateBtn = document.getElementById('mainMapLocateBtn');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => window.kototekaMap.locateUserOnMainMap());
    }

    // Backup Export / Import buttons
    const exportBtn = document.getElementById('exportBackupBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportBackup());
    }

    const importInput = document.getElementById('importBackupInput');
    if (importInput) {
      importInput.addEventListener('change', (e) => this.importBackup(e));
    }

    // Sound toggle
    const soundBtn = document.getElementById('soundToggleBtn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        window.soundMuted = !window.soundMuted;
        soundBtn.textContent = window.soundMuted ? '🔇' : '🔊';
      });
    }

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = document.body.classList.contains('dark-mode');
        this.setTheme(isDark ? 'light' : 'dark');
      });
    }
  }

  async loadCats() {
    try {
      this.cats = await window.catDb.getAllCats();
      this.renderGallery();
      this.updateStats();
      if (this.currentTab === 'map') {
        window.kototekaMap.updateCatMarkers(this.cats, (cat) => this.openCatModal(cat.id));
      }
    } catch (e) {
      console.error('Failed to load cats:', e);
    }
  }

  switchTab(tab) {
    this.currentTab = tab;

    // Update bottom nav active state
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Show selected screen
    document.querySelectorAll('.tab-screen').forEach((screen) => {
      screen.classList.remove('active');
    });

    const activeScreen = document.getElementById(tab + 'Screen');
    if (activeScreen) {
      activeScreen.classList.add('active');
    }

    if (tab === 'map') {
      window.kototekaMap.initMainMap('mainMapContainer', (cat) => this.openCatModal(cat.id));
      window.kototekaMap.updateCatMarkers(this.cats, (cat) => this.openCatModal(cat.id));
    } else if (tab === 'achievements') {
      this.renderAchievements();
    } else if (tab === 'gallery') {
      this.renderGallery();
    }
  }

  // --- Gallery Rendering ---
  renderGallery() {
    const grid = document.getElementById('catsGrid');
    const emptyState = document.getElementById('emptyState');
    const countLabel = document.getElementById('catsCountLabel');

    if (!grid) return;

    let filtered = this.cats;

    // Filter by tag/category
    if (this.activeFilter !== 'all') {
      if (this.activeFilter === 'manual') {
        filtered = filtered.filter(c => c.location && c.location.type === 'manual');
      } else {
        filtered = filtered.filter(c => 
          c.color === this.activeFilter || 
          c.mood === this.activeFilter || 
          (c.tags && c.tags.includes(this.activeFilter))
        );
      }
    }

    // Filter by search query
    if (this.searchQuery) {
      filtered = filtered.filter(c => 
        (c.name && c.name.toLowerCase().includes(this.searchQuery)) ||
        (c.notes && c.notes.toLowerCase().includes(this.searchQuery)) ||
        (c.location && c.location.address && c.location.address.toLowerCase().includes(this.searchQuery))
      );
    }

    if (countLabel) {
      countLabel.textContent = `Котиков в коллекции: ${this.cats.length}`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    grid.innerHTML = filtered.map(cat => {
      const isManual = cat.location && cat.location.type === 'manual';
      const locText = cat.location ? (cat.location.address || 'Точка на карте') : 'Без адреса';
      const dateStr = new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

      return `
        <div class="cat-card" onclick="window.app.openCatModal('${cat.id}')">
          <div class="cat-card-img-wrap">
            <img class="cat-card-img" src="${cat.thumb || cat.photo || './icons/cat-icon.svg'}" alt="${this.escapeHtml(cat.name)}" loading="lazy" />
            <div class="cat-card-mode-badge" title="${isManual ? 'Указано вручную' : 'По GPS'}">
              ${isManual ? '🗺️ Вручную' : '📡 GPS'}
            </div>
          </div>
          <div class="cat-card-info">
            <div class="cat-card-name">${this.escapeHtml(cat.name)}</div>
            <div class="cat-card-tags">
              ${cat.color ? `<span class="tag-badge">${this.escapeHtml(cat.color)}</span>` : ''}
              ${cat.mood ? `<span class="tag-badge" style="background:#fef3c7;color:#b45309;">${this.escapeHtml(cat.mood)}</span>` : ''}
            </div>
            <div class="cat-card-meta">
              <span class="cat-card-loc" title="${this.escapeHtml(locText)}">📍 ${this.escapeHtml(locText)}</span>
              <span>${dateStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Add Cat Modal & Flow ---
  openAddCatModal() {
    this.resetAddForm();
    const modal = document.getElementById('addCatModal');
    if (modal) {
      modal.classList.add('open');
      // Set default geolocation mode to manual
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
    
    // Set date-time picker to now
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

    const statusEl = document.getElementById('gpsStatusText');
    if (statusEl) statusEl.textContent = 'Нажмите «Определить где я», чтобы запросить координаты';
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
      
      if (!window.soundMuted) window.achievementManager.playMeowSound();
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

      // Initialize or refresh picker map
      setTimeout(() => {
        window.kototekaMap.initPickerMap(
          'pickerMapContainer',
          [this.selectedLocation.lat, this.selectedLocation.lng],
          async (coords) => {
            this.selectedLocation.lat = coords.lat;
            this.selectedLocation.lng = coords.lng;
            this.selectedLocation.type = 'manual';
            // Reverse geocode to suggest address text
            const geoInfo = await window.kototekaMap.reverseGeocode(coords.lat, coords.lng);
            if (geoInfo && geoInfo.address) {
              document.getElementById('manualAddressInput').value = geoInfo.address;
              this.selectedLocation.address = geoInfo.address;
              this.selectedLocation.district = geoInfo.district || '';
            }
          }
        );
      }, 150);
    }
  }

  requestAutoGps() {
    const statusEl = document.getElementById('gpsStatusText');
    statusEl.innerHTML = '⏳ Поиск спутников GPS... Пожалуйста, подождите.';

    if (!navigator.geolocation) {
      statusEl.innerHTML = '❌ Геолокация не поддерживается вашим устройством. Используйте ручной режим.';
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

        let accBadge = acc < 35 ? '🟢 Высокая' : (acc < 150 ? '🟡 Средняя' : '🔴 Низкая (возможен сбой/спуфинг)');
        statusEl.innerHTML = `✅ Координаты получены! <br>📍 ${this.selectedLocation.lat}, ${this.selectedLocation.lng} (точность: ~${acc}м, ${accBadge})`;

        // Try getting street name
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
        if (err.code === 1) msg = 'Доступ к геопозиции запрещен в браузере';
        else if (err.code === 2) msg = 'Сигнал спутников недоступен (глушится или в помещении)';
        else if (err.code === 3) msg = 'Превышено время ожидания GPS';

        statusEl.innerHTML = `⚠️ ${msg}. <br><button type="button" class="btn-secondary" style="margin-top:6px;" onclick="window.app.setGeoMode('manual')">🗺️ Указать точку на карте вручную</button>`;
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  async searchAddressOnMap() {
    const query = document.getElementById('manualAddressInput').value.trim();
    if (!query) return;

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
      // Just keep address text
      this.selectedLocation.address = query;
    }
  }

  async saveCurrentCat() {
    const name = document.getElementById('catNameInput').value.trim();
    if (!name) {
      alert('Пожалуйста, напишите кличку или название котика');
      return;
    }

    const notes = document.getElementById('catNotesInput').value.trim();
    const manualAddr = document.getElementById('manualAddressInput').value.trim();

    if (this.currentGeoMode === 'manual' && manualAddr) {
      this.selectedLocation.address = manualAddr;
    }

    const dateVal = document.getElementById('catDateInput') ? document.getElementById('catDateInput').value : '';
    const createdAt = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();

    // Prepare cat object
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

      // Check achievements and trigger celebration!
      window.achievementManager.checkAll(this.cats);
      if (!window.soundMuted) window.achievementManager.playCelebrationSound();

      // If on map, refresh markers
      if (this.currentTab === 'map') {
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
      <span class="tag-badge" style="margin-left:6px;">${isManual ? '🗺️ Указано вручную' : '📡 По GPS'}</span>
    `;

    // External map link (Yandex Maps / Google)
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
      ${cat.color ? `<span class="tag-badge">${this.escapeHtml(cat.color)}</span>` : ''}
      ${cat.mood ? `<span class="tag-badge" style="background:#fef3c7;color:#b45309;">${this.escapeHtml(cat.mood)}</span>` : ''}
    `;

    // Notes
    const notesBox = document.getElementById('detailCatNotes');
    if (cat.notes) {
      notesBox.style.display = 'block';
      notesBox.textContent = cat.notes;
    } else {
      notesBox.style.display = 'none';
    }

    modal.classList.add('open');
  }

  closeCatDetailModal() {
    const modal = document.getElementById('catDetailModal');
    if (modal) modal.classList.remove('open');
  }

  async deleteCurrentCat() {
    if (!this.currentViewingCatId) return;
    if (!confirm('Вы действительно хотите убрать этого котика из коллекции?')) return;

    try {
      await window.catDb.deleteCat(this.currentViewingCatId);
      this.cats = this.cats.filter(c => c.id !== this.currentViewingCatId);
      this.closeCatDetailModal();
      this.renderGallery();
      this.updateStats();

      if (this.currentTab === 'map') {
        window.kototekaMap.updateCatMarkers(this.cats, (c) => this.openCatModal(c.id));
      }
    } catch (e) {
      alert('Ошибка при удалении: ' + e.message);
    }
  }

  async editCatDate() {
    const cat = this.cats.find(c => c.id === this.currentViewingCatId);
    if (!cat) return;
    
    const d = new Date(cat.createdAt);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const currentFormatted = d.toISOString().slice(0, 16).replace('T', ' ');

    const newDateStr = prompt('Введите новую дату и время встречи (ГГГГ-ММ-ДД ЧЧ:ММ):', currentFormatted);
    if (!newDateStr) return;

    const parsed = new Date(newDateStr.replace(' ', 'T'));
    if (isNaN(parsed.getTime())) {
      alert('Неверный формат даты. Пример: 2026-10-15 14:30');
      return;
    }

    try {
      cat.createdAt = parsed.toISOString();
      await window.catDb.saveCat(cat);
      this.openCatModal(cat.id);
      this.renderGallery();
      window.achievementManager.checkAll(this.cats);
      alert('Дата котика успешно изменена!');
    } catch (e) {
      alert('Ошибка обновления даты: ' + e.message);
    }
  }

  // --- Achievements & Stats ---
  renderAchievements() {
    const listContainer = document.getElementById('achievementsList');
    if (!listContainer) return;

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

    // Top color
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

  // --- Backup & Demo Data ---
  async exportBackup() {
    const jsonStr = await window.catDb.exportAll();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kototeka_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const count = await window.catDb.importAll(e.target.result);
        alert(`Успешно импортировано ${count} котиков!`);
        await this.loadCats();
      } catch (err) {
        alert('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

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
    window.achievementManager.checkAll(this.cats);
  }

  renderUsername() {
    const el = document.getElementById('usernameDisplay');
    if (el) {
      el.textContent = `👤 Котолов: ${this.username} ✏️`;
    }
  }

  promptChangeUsername() {
    const newName = prompt('Введите ваше имя котолова (будет отображаться в карточках и при отправке в Telegram):', this.username);
    if (newName && newName.trim()) {
      this.username = newName.trim();
      localStorage.setItem('kototeka_username', this.username);
      this.renderUsername();
      alert(`Имя котолова изменено на: ${this.username}`);
    }
  }

  shareToTelegram() {
    try {
      const cat = this.cats.find(c => c.id === this.currentViewingCatId);
      if (!cat) return;

      const appUrl = 'https://github.com/SLAWASTR/kototeka/releases/tag/v1.0.0';
      const dateStr = new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      const locStr = cat.location ? (cat.location.address || `${cat.location.lat}, ${cat.location.lng}`) : 'Городские улицы';
      const noteText = cat.notes ? `\n📝 Заметка: «${cat.notes}»` : '';

      const text = 
        `🐾 Я встретил котика и добавил в свою «Кототеку»!\n\n` +
        `🐱 Кличка: ${cat.name}\n` +
        `🎨 Окрас: ${cat.color || 'Особенный'} | Настроение: ${cat.mood || 'Милый'}\n` +
        `📍 Где: ${locStr}\n` +
        `📅 Дата: ${dateStr}` +
        noteText + `\n` +
        `👤 Котолов: ${this.username}\n\n` +
        `📲 Скачивай приложение «Кототека» на Android и собирай котиков:`;

      // 1. If in native Android APK container
      if (window.AndroidBridge && window.AndroidBridge.shareToTelegram) {
        window.AndroidBridge.shareToTelegram(text, appUrl);
        return;
      }

      // 2. Fallback to Telegram Web / App URL
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(text)}`;
      window.location.href = tgUrl;
    } catch (e) {
      alert('Ошибка при отправке в Telegram: ' + e.message);
    }
  }

  async downloadCatCard() {
    const cat = this.cats.find(c => c.id === this.currentViewingCatId);
    if (!cat) return;

    try {
      // Create high-res canvas (1000x1200)
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');

      const isDark = document.body.classList.contains('dark-mode');
      const bgGradient = ctx.createLinearGradient(0, 0, 0, 1200);
      if (isDark) {
        bgGradient.addColorStop(0, '#1e293b');
        bgGradient.addColorStop(1, '#0f172a');
      } else {
        bgGradient.addColorStop(0, '#fff7ed');
        bgGradient.addColorStop(1, '#ffedd5');
      }
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, 1000, 1200);

      // Decorative border
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 10;
      ctx.strokeRect(20, 20, 960, 1160);

      // Header badge
      ctx.fillStyle = '#ea580c';
      ctx.font = 'bold 36px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🐾 КОТОТЕКА • КАРТОЧКА КОТИКА', 500, 80);

      ctx.fillStyle = isDark ? '#cbd5e1' : '#64748b';
      ctx.font = '24px -apple-system, sans-serif';
      ctx.fillText(`Котолов: ${this.username}`, 500, 120);

      const drawContent = () => {
        // Cat name
        ctx.fillStyle = isDark ? '#ffffff' : '#1e293b';
        ctx.font = 'bold 50px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cat.name, 500, 800);

        // Meta info (Date & Location)
        const dateStr = new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const locStr = cat.location ? (cat.location.address || `${cat.location.lat}, ${cat.location.lng}`) : 'Городские улицы';
        
        ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
        ctx.font = '28px -apple-system, sans-serif';
        ctx.fillText(`📅 ${dateStr}`, 500, 850);
        ctx.fillText(`📍 ${locStr.slice(0, 48)}`, 500, 895);

        // Tag pills
        const tagText = `[ ${cat.color || 'Кот'} ]  [ ${cat.mood || 'Ласковый'} ]`;
        ctx.fillStyle = '#ea580c';
        ctx.font = 'bold 30px -apple-system, sans-serif';
        ctx.fillText(tagText, 500, 950);

        // Notes
        if (cat.notes) {
          ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
          ctx.font = 'italic 26px -apple-system, sans-serif';
          const noteExcerpt = cat.notes.length > 70 ? cat.notes.slice(0, 67) + '...' : cat.notes;
          ctx.fillText(`«${noteExcerpt}»`, 500, 1020);
        }

        // Footer
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '22px -apple-system, sans-serif';
        ctx.fillText('Приложение «Кототека» • Скачать на Android: github.com/SLAWASTR/kototeka', 500, 1130);

        const dataUrl = canvas.toDataURL('image/png');
        this.currentPostcardDataUrl = dataUrl;
        this.currentPostcardCat = cat;

        // Display in postcard preview modal
        const previewModal = document.getElementById('postcardModal');
        const previewImg = document.getElementById('postcardPreviewImg');
        if (previewModal && previewImg) {
          previewImg.src = dataUrl;
          previewModal.classList.add('open');
        }

        // If in Android app with native bridge, automatically save to gallery
        if (window.AndroidBridge && window.AndroidBridge.saveBase64Image) {
          const cleanName = cat.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
          window.AndroidBridge.saveBase64Image(dataUrl, `Кот_${cleanName}.png`);
        }
      };

      if (cat.photo) {
        const img = new Image();
        if (cat.photo.startsWith('http')) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
          ctx.save();
          ctx.beginPath();
          const rx = 100, ry = 150, rw = 800, rh = 580, rad = 24;
          ctx.moveTo(rx + rad, ry);
          ctx.lineTo(rx + rw - rad, ry);
          ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
          ctx.lineTo(rx + rw, ry + rh - rad);
          ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
          ctx.lineTo(rx + rad, ry + rh);
          ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
          ctx.lineTo(rx, ry + rad);
          ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
          ctx.closePath();
          ctx.clip();

          const imgRatio = img.width / img.height;
          const boxRatio = rw / rh;
          let dw, dh, dx, dy;
          if (imgRatio > boxRatio) {
            dh = rh;
            dw = rh * imgRatio;
            dx = rx - (dw - rw) / 2;
            dy = ry;
          } else {
            dw = rw;
            dh = rw / imgRatio;
            dx = rx;
            dy = ry - (dh - rh) / 2;
          }
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.restore();
          drawContent();
        };
        img.onerror = () => {
          drawContent();
        };
        img.src = cat.photo;
      } else {
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(100, 150, 800, 580);
        ctx.font = '160px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🐾', 500, 480);
        drawContent();
      }
    } catch (err) {
      alert('Ошибка при создании открытки: ' + err.message);
    }
  }

  savePostcardToDevice() {
    if (!this.currentPostcardDataUrl) return;
    const cat = this.currentPostcardCat;
    const cleanName = cat ? cat.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') : 'kot';
    const filename = `Кот_${cleanName}.png`;

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

  sharePostcardToTelegram() {
    if (!this.currentPostcardDataUrl) return;
    const cat = this.currentPostcardCat;
    const appUrl = 'https://github.com/SLAWASTR/kototeka/releases/tag/v1.0.0';
    const dateStr = cat ? new Date(cat.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const locStr = cat && cat.location ? (cat.location.address || `${cat.location.lat}, ${cat.location.lng}`) : 'Городские улицы';
    const noteText = cat && cat.notes ? `\n📝 Заметка: «${cat.notes}»` : '';

    const text = 
      `🐾 Я встретил котика и добавил в свою «Кототеку»!\n\n` +
      `🐱 Кличка: ${cat ? cat.name : 'Котик'}\n` +
      `🎨 Окрас: ${cat ? (cat.color || 'Особенный') : ''} | Настроение: ${cat ? (cat.mood || 'Милый') : ''}\n` +
      `📍 Где: ${locStr}\n` +
      `📅 Дата: ${dateStr}` +
      noteText + `\n` +
      `👤 Котолов: ${this.username}\n\n` +
      `📲 Скачивай приложение «Кототека» на Android и собирай котиков:`;

    if (window.AndroidBridge && window.AndroidBridge.shareImage) {
      window.AndroidBridge.shareImage(this.currentPostcardDataUrl, text + '\n' + appUrl);
    } else if (window.AndroidBridge && window.AndroidBridge.shareToTelegram) {
      window.AndroidBridge.shareToTelegram(text, appUrl);
    } else {
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(text)}`;
      window.location.href = tgUrl;
    }
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

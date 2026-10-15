/**
 * Map Manager for Kototeka
 * Integrates Leaflet, handles GPS and manual anti-spoofing pin dropping
 */

class KototekaMap {
  constructor() {
    this.mainMap = null;
    this.pickerMap = null;
    this.catMarkersGroup = null;
    this.pickerMarker = null;
    this.currentPickerCoords = null;
    this.pickerMode = 'manual'; // 'manual' | 'auto'
    this.defaultCenter = [55.751244, 37.618423]; // Default: Moscow
    this.defaultZoom = 13;
  }

  // --- Main Fullscreen Map Tab ---
  initMainMap(containerId = 'mainMapContainer', onCatSelect = null) {
    if (this.mainMap) {
      setTimeout(() => this.mainMap.invalidateSize(), 200);
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    this.mainMap = L.map(containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView(this.defaultCenter, this.defaultZoom);

    // Beautiful OpenStreetMap tiles with friendly user agent
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true
    }).addTo(this.mainMap);

    L.control.zoom({ position: 'bottomright' }).addTo(this.mainMap);
    this.catMarkersGroup = L.layerGroup().addTo(this.mainMap);

    // Try centering on last known or current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.defaultCenter = [pos.coords.latitude, pos.coords.longitude];
          // Only pan if user hasn't zoomed in or if no markers
          if (this.catMarkersGroup.getLayers().length === 0) {
            this.mainMap.setView(this.defaultCenter, 14);
          }
        },
        () => {},
        { timeout: 4000, maximumAge: 300000 }
      );
    }
  }

  updateCatMarkers(cats, onCatClick) {
    if (!this.mainMap || !this.catMarkersGroup) return;
    this.catMarkersGroup.clearLayers();

    const bounds = [];

    cats.forEach((cat) => {
      if (!cat.location || !cat.location.lat || !cat.location.lng) return;

      const lat = Number(cat.location.lat);
      const lng = Number(cat.location.lng);
      bounds.push([lat, lng]);

      // Create cute custom HTML marker with cat thumb or paw
      const markerHtml = `
        <div class="cat-map-pin animate-pop" data-cat-id="${cat.id}">
          <div class="pin-inner">
            ${cat.thumb ? `<img src="${cat.thumb}" alt="${cat.name}"/>` : `<span>🐾</span>`}
          </div>
          <div class="pin-tip"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-cat-icon',
        html: markerHtml,
        iconSize: [44, 52],
        iconAnchor: [22, 50],
        popupAnchor: [0, -45]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const popupContent = `
        <div class="cat-map-popup">
          <div class="popup-thumb" style="background-image: url('${cat.thumb || cat.photo || ''}')"></div>
          <div class="popup-info">
            <h4 class="popup-name">${this.escapeHtml(cat.name)}</h4>
            <div class="popup-date">📅 ${new Date(cat.createdAt).toLocaleDateString('ru-RU')}</div>
            <div class="popup-addr">📍 ${this.escapeHtml(cat.location.address || 'Точка на карте')}</div>
            <button class="popup-btn" onclick="window.app.openCatModal('${cat.id}')">Открыть карточку 🐾</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 260, className: 'cat-bubble-popup' });
      marker.on('click', () => {
        if (onCatClick) onCatClick(cat);
      });

      this.catMarkersGroup.addLayer(marker);
    });

    // Fit view to markers if we have cats
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        this.mainMap.setView(bounds[0], 15);
      } else {
        this.mainMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }
  }

  locateUserOnMainMap() {
    if (!this.mainMap) return;

    if (!navigator.geolocation) {
      alert('Геолокация не поддерживается вашим браузером');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        this.mainMap.setView(coords, 16);

        // Flash pulsating user circle
        const userDot = L.circleMarker(coords, {
          radius: 8,
          fillColor: '#EA580C',
          fillOpacity: 0.9,
          color: '#FFFFFF',
          weight: 3
        }).addTo(this.mainMap);

        setTimeout(() => userDot.remove(), 4000);
      },
      (err) => {
        alert('Не удалось получить координаты: ' + (err.message || 'Ошибка GPS'));
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // --- Picker Map for Adding / Editing a Cat ---
  initPickerMap(containerId = 'pickerMapContainer', initialCoords = null, onLocationChange = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const startCoords = initialCoords || this.defaultCenter;

    if (!this.pickerMap) {
      this.pickerMap = L.map(containerId, {
        zoomControl: true,
        attributionControl: false
      }).setView(startCoords, 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        crossOrigin: true
      }).addTo(this.pickerMap);

      // Handle click to manually set/move pin anywhere
      this.pickerMap.on('click', (e) => {
        this.setPickerLocation(e.latlng.lat, e.latlng.lng, 'manual', onLocationChange);
      });
    } else {
      this.pickerMap.setView(startCoords, 15);
      setTimeout(() => this.pickerMap.invalidateSize(), 250);
    }

    if (initialCoords) {
      this.setPickerLocation(initialCoords[0], initialCoords[1], 'manual', onLocationChange);
    }
  }

  setPickerLocation(lat, lng, mode = 'manual', callback = null) {
    this.currentPickerCoords = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), mode };
    this.pickerMode = mode;

    const pinHtml = `
      <div class="picker-custom-pin">
        <div class="picker-pin-paw">🐾</div>
        <div class="picker-pin-shadow"></div>
      </div>
    `;

    const pinIcon = L.divIcon({
      className: 'picker-pin-wrapper',
      html: pinHtml,
      iconSize: [40, 48],
      iconAnchor: [20, 46]
    });

    if (this.pickerMarker) {
      this.pickerMarker.setLatLng([lat, lng]);
    } else if (this.pickerMap) {
      this.pickerMarker = L.marker([lat, lng], {
        icon: pinIcon,
        draggable: true
      }).addTo(this.pickerMap);

      this.pickerMarker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        this.setPickerLocation(newPos.lat, newPos.lng, 'manual', callback);
      });
    }

    if (this.pickerMap) {
      this.pickerMap.panTo([lat, lng]);
    }

    if (callback) {
      callback(this.currentPickerCoords);
    }
  }

  async reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.address) return null;

      const a = data.address;
      const road = a.road || a.pedestrian || a.street || '';
      const house = a.house_number || '';
      const suburb = a.suburb || a.city_district || a.quarter || '';
      const city = a.city || a.town || a.village || '';

      let formatted = [road, house].filter(Boolean).join(', ');
      if (!formatted) formatted = [suburb, city].filter(Boolean).join(', ');
      if (!formatted) formatted = data.display_name ? data.display_name.split(',').slice(0, 3).join(',') : '';

      return {
        address: formatted || 'Точка на карте',
        district: suburb || city || '',
        raw: data
      };
    } catch (e) {
      return null;
    }
  }

  async searchAddress(query) {
    if (!query || query.trim().length < 3) return [];
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=5&accept-language=ru`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

window.kototekaMap = new KototekaMap();

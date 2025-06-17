/**
 * Peta Sungai Jabodetabek
 *
 * COMMAND LINE USAGE (Indonesian):
 *
 * 1. Setup awal:
 * git clone <repo> && cd river-map
 * npm install leaflet
 *
 * 2. Struktur file yang dibutuhkan:
 * - index.html (dengan div map dan controls)
 * - river.geojson (data sungai)
 * - IDN_adm_2_kabkota.json (data batas kabupaten/kota yang lebih bagus, fokus Jabodetabek)
 * - enhanced_css_boundaries.css (styling)
 * - file ini sebagai main.js
 *
 * 3. Jalankan local server:
 * python -m http.server 8000
 * # atau
 * npx serve .
 *
 * 4. Buka browser:
 * http://localhost:8000
 *
 * FITUR UTAMA:
 * - Peta sungai interaktif dengan Leaflet
 * - Batas kabupaten/kota yang bisa di-toggle
 * - Search sungai berdasarkan nama
 * - Filter sungai berdasarkan wilayah administratif (kab/kota)
 * - Responsive design untuk mobile
 * - Loading spinner dan error handling
 * - Ketebalan dan warna garis sungai dinamis dan lebih terlihat
 */

const EnhancedRiverApp = {
  // === CORE PROPERTIES ===
  map: null,
  sungaiLayer: null,
  kabkotaLayer: null,  // Layer untuk kabupaten/kota

  // Data storage
  allFeatures: [], // Data sungai
  kabkotaFeatures: [],  // Data fitur kabupaten/kota
  normalizedNames: new Map(), // Nama sungai yang dinormalisasi untuk pencarian

  // UI elements cache
  elements: {
    map: null,
    search: null,
    searchBtn: null,
    loadingSpinner: null,
    boundarySelector: null,
    filterIndicator: null
  },

  // Interaction state
  isHovering: false,
  hoverTimeout: null,
  currentHighlighted: null, // Sungai yang sedang di-highlight
  selectedBoundaryLayer: null, // Properti untuk layer batas yang sedang terpilih

  // Boundary system settings
  boundarySettings: {
    showBoundaries: true,
    selectedBoundaryId: null,
    styles: {
      default: { // Style untuk batas kabupaten/kota (merah cerah)
        color: '#dc3545',
        weight: 3, // Default weight 3 untuk kab/kota
        opacity: 0.6, // UBAH: Opasitas dikurangi dari 0.8 menjadi 0.6 agar tulisan di bawahnya sedikit terlihat
        fillColor: 'transparent',
        fillOpacity: 0.1,
        dashArray: null // Garis solid untuk kab/kota
      },
      selected: { // Style saat boundary terpilih (oranye)
        color: '#ff6600',
        weight: 5, // Lebih tebal saat dipilih
        opacity: 1, // Full opasitas saat terpilih agar jelas
        fillColor: '#ff6600',
        fillOpacity: 0.2,
        dashArray: null
      },
      filtered: { // Style untuk boundary yang tidak terpilih saat filter aktif
        color: '#6c757d', // Abu-abu
        weight: 1,
        opacity: 0.3,
        fillColor: 'transparent',
        fillOpacity: 0.05
      }
    }
  },

  // River display settings
  riverSettings: {
    showRivers: true,
    styles: {
      default: { // Warna sungai default menjadi biru terang
        color: '#007bff', // Biru terang (default Leaflet)
        weight: 3, // Ditebalkan agar lebih terlihat
        opacity: 0.7 // UBAH: Opasitas dikurangi dari 0.8 menjadi 0.7 agar tulisan di bawahnya sedikit terlihat
      },
      highlighted: { // Warna sungai saat di-highlight menjadi biru gelap
        color: '#004085', // Biru gelap (navy blue)
        weight: 5, // Ditebalkan saat di-highlight
        opacity: 1 // Full opasitas saat di-highlight agar jelas
      },
      filtered: { // Style sungai saat terfilter (abu-abu, lebih tipis)
        color: '#6c757d',
        weight: 1,
        opacity: 0.3
      }
    }
  },

  // === INITIALIZATION ===

  /**
   * Inisialisasi aplikasi utama
   * Dipanggil ketika DOM sudah ready
   */
  async init() {
    console.log('🚀 Memulai Peta Sungai Jabodetabek...');

    try {
      this.showLoading(true, 'Memuat aplikasi...');

      this.cacheElements(); // Menyimpan referensi elemen DOM
      this.initMap(); // Menginisialisasi peta Leaflet
      this.setupControls(); // Menyiapkan kontrol UI (tombol, dropdown)
      this.setupEventListeners(); // Mengatur event listener untuk interaksi user

      await this.loadAllData(); // Memuat semua data sungai dan batas wilayah

      this.showLoading(false); // Menyembunyikan loading spinner setelah semua dimuat
      console.log('✅ Aplikasi berhasil dimuat');

    } catch (error) {
      console.error('❌ Error saat inisialisasi:', error);
      this.showError('Gagal memuat aplikasi. Silakan refresh halaman.');
    }
  },

  /**
   * Cache semua elemen DOM yang sering digunakan
   */
  cacheElements() {
    console.log('📋 Menyimpan referensi elemen DOM...');

    this.elements = {
      map: document.getElementById('map'),
      search: document.getElementById('search'),
      searchBtn: document.getElementById('search-btn'),
      loadingSpinner: document.getElementById('loading-spinner')
    };

    const required = ['map', 'search', 'searchBtn', 'loadingSpinner'];
    const missing = required.filter(key => !this.elements[key]);

    if (missing.length > 0) {
      throw new Error(`Elemen DOM tidak ditemukan: ${missing.join(', ')}`);
    }
  },

  /**
   * Inisialisasi peta Leaflet dengan konfigurasi dasar
   */
  initMap() {
    console.log('🗺️  Menyiapkan peta...');

    this.map = L.map(this.elements.map, {
      center: [-6.4, 106.8], // Koordinat tengah peta (Depok/Jakarta)
      zoom: 10,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Peta Sungai Jabodetabek'
    }).addTo(this.map);

    this.setupMapEvents();

    console.log('✅ Peta berhasil diinisialisasi');
  },

  /**
   * Setup event handlers untuk interaksi peta
   */
  setupMapEvents() {
    this.map.on('zoomend', () => {
      const zoom = this.map.getZoom();
      console.log(`🔍 Zoom level: ${zoom}`);
      this.adjustStylesForZoom(zoom);
    });

    this.map.on('click', (e) => {
      if (e.originalEvent.target === this.map.getContainer()) {
        this.clearAllSelections();
      }
    });
  },

  /**
   * Sesuaikan style layer berdasarkan zoom level
   */
  adjustStylesForZoom(zoom) {
    if (!this.sungaiLayer) return;

    // Menentukan ketebalan garis sungai berdasarkan level zoom
    const riverWeight = zoom < 12 ? this.riverSettings.styles.default.weight : (zoom < 15 ? (this.riverSettings.styles.default.weight + 1) : (this.riverSettings.styles.default.weight + 2)); 

    this.sungaiLayer.eachLayer(layer => {
      if (!layer.isFiltered && !layer.isHighlighted) {
        // Hanya sesuaikan weight; opacity tetap dari default style
        layer.setStyle({ ...layer.options, weight: riverWeight });
      } else if (layer.isHighlighted) {
          // Jika sedang di-highlight, pastikan weight dan color-nya sesuai highlighted
          layer.setStyle({ ...this.riverSettings.styles.highlighted });
      } else if (layer.isFiltered) {
          // Jika terfilter, pertahankan style filtered
          layer.setStyle(this.riverSettings.styles.filtered);
      }
    });

    // Menentukan ketebalan garis batas wilayah kabupaten/kota berdasarkan level zoom
    const kabkotaWeight = zoom < 10 ? 2 : zoom < 13 ? 3 : 4;

    if (this.kabkotaLayer && this.boundarySettings.showBoundaries) {
      this.kabkotaLayer.eachLayer(layer => {
        if (layer.feature.properties.id === this.boundarySettings.selectedBoundaryId) {
            layer.setStyle(this.boundarySettings.styles.selected);
        } else if (layer.isFiltered) {
            layer.setStyle(this.boundarySettings.styles.filtered);
        }
        else {
            // Terapkan style default dengan weight dinamis; opacity tetap dari default style
            layer.setStyle({ ...this.boundarySettings.styles.default, weight: kabkotaWeight });
        }
      });
    }
  },

  // === DATA LOADING ===

  /**
   * Load semua data yang dibutuhkan (rivers + boundaries)
   */
  async loadAllData() {
    console.log('📂 Memuat data sungai dan batas wilayah...');

    try {
      this.showLoading(true, 'Memuat data sungai...');
      await this.loadRiverData();

      this.showLoading(true, 'Memuat data batas wilayah...');
      await this.loadBoundaryData();

      this.createAllLayers();

      console.log(`✅ Berhasil memuat ${this.allFeatures.length} sungai dan ${this.kabkotaFeatures.length} kab/kota`);

    } catch (error) {
      console.error('❌ Error loading data:', error);
      this.showError('Gagal memuat data utama. Silakan refresh halaman.');
      throw error;
    }
  },

  /**
   * Load data sungai dari GeoJSON file
   */
  async loadRiverData() {
    try {
      const response = await fetch('river.geojson');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.features || !Array.isArray(data.features)) {
        throw new Error('Format data sungai tidak valid');
      }

      this.allFeatures = data.features;
      this.processRiverFeatures();

      console.log(`📊 Berhasil memuat ${this.allFeatures.length} feature sungai`);

    } catch (error) {
      console.warn('⚠️ Gagal memuat data sungai dari file, menggunakan data demo. Error:', error);
      this.allFeatures = this.generateDemoRiverData();
      this.processRiverFeatures();
    }
  },

  /**
   * Process dan normalize data sungai untuk pencarian
   */
  processRiverFeatures() {
    console.log('🔄 Memproses feature sungai...');

    this.normalizedNames.clear();

    this.allFeatures.forEach((feature, index) => {
      const name = feature.properties?.name || feature.properties?.NAME || `Sungai ${index + 1}`;
      const normalizedName = this.normalizeName(name);

      this.normalizedNames.set(normalizedName, name);

      feature.properties = {
        ...feature.properties,
        name: name,
        normalizedName: normalizedName,
        searchableText: `${name} ${feature.properties?.description || ''}`.toLowerCase()
      };
    });

    console.log(`✅ Berhasil memproses ${this.allFeatures.length} sungai dengan ${this.normalizedNames.size} nama unik`);
  },

  /**
   * Load data batas wilayah administratif (sekarang hanya Kabkota)
   */
  async loadBoundaryData() {
    console.log('📍 Memuat data batas wilayah kabupaten/kota...');

    try {
      const kabkotaResponse = await fetch('IDN_adm_2_kabkota.json');

      this.kabkotaFeatures = [];

      if (kabkotaResponse.ok) {
        try {
          const kabkotaData = await kabkotaResponse.json();
          if (kabkotaData.features && Array.isArray(kabkotaData.features)) {
            kabkotaData.features.forEach(feature => {
              feature.properties.name = feature.properties.ADM2_EN || feature.properties.ADM1_EN; 
              feature.properties.type = 'city';
              feature.properties.admin_level = feature.properties.admin_level || 5;
              feature.properties.id = feature.properties.ADM2_PCODE || feature.properties.name?.toLowerCase().replace(/\s/g, '-') || `kabkota-${feature.properties.ADM1_PCODE}`;
            });
            this.kabkotaFeatures.push(...kabkotaData.features);
            console.log(`✅ Dimuat ${this.kabkotaFeatures.length} kab/kota dari IDN_adm_2_kabkota.json`);
          } else {
            console.warn('⚠️ Format data kabupaten/kota tidak valid dari IDN_adm_2_kabkota.json');
          }
        } catch (error) {
          console.warn('⚠️ Error parsing data kab/kota dari IDN_adm_2_kabkota.json:', error);
        }
      } else {
        console.warn('⚠️ Gagal memuat data kab/kota dari IDN_adm_2_kabkota.json:', kabkotaResponse.statusText || 'Network error');
      }

      if (this.kabkotaFeatures.length === 0) {
        console.warn('⚠️ Tidak ada data batas wilayah kab/kota yang berhasil dimuat dari file. Menggunakan demo data sebagai fallback.');
        this.kabkotaFeatures = this.generateDemoBoundaryData();
      } else {
        console.log(`✅ Total batas wilayah dimuat: ${this.kabkotaFeatures.length}`);
      }

    } catch (error) {
      console.error('❌ Error umum saat memuat data batas wilayah kab/kota:', error);
      console.warn('⚠️ Menggunakan demo data batas wilayah sebagai fallback karena error umum.');
      this.kabkotaFeatures = this.generateDemoBoundaryData();
    }
  },

  /**
   * Generate demo data sungai (fallback)
   */
  generateDemoRiverData() {
    return [
      {
        type: 'Feature',
        properties: {
          name: 'Ciliwung',
          description: 'Sungai utama yang melewati Jakarta'
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.8456, -6.1744], [106.8234, -6.2088], [106.8123, -6.2456]
          ]
        }
      },
      {
        type: 'Feature',
        properties: {
          name: 'Cisadane',
          description: 'Sungai di wilayah Tangerang'
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.7456, -6.1234], [106.7234, -6.1456], [106.7123, -6.1789]
          ]
        }
      }
    ];
  },

  /**
   * Generate demo data batas wilayah (fallback)
   */
  generateDemoBoundaryData() {
    return [
      {
        type: 'Feature',
        properties: {
          name: 'Kota Depok (Demo)',
          id: 'depok-demo',
          type: 'city',
          admin_level: 5
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [106.75, -6.35], [106.82, -6.35], [106.82, -6.45], [106.75, -6.45], [106.75, -6.35]
          ]]
        }
      },
      {
        type: 'Feature',
        properties: {
          name: 'Jakarta Selatan (Demo)',
          id: 'jaksel-demo',
          type: 'city',
          admin_level: 5,
          parent: 'jakarta-demo'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [106.78, -6.20], [106.86, -6.20], [106.86, -6.35], [106.78, -6.35], [106.78, -6.20]
          ]]
        }
      }
    ];
  },

  // === LAYER CREATION ===

  /**
   * Buat semua layer (rivers, kabkotas)
   */
  createAllLayers() {
    console.log('🎨 Membuat layer peta...');

    this.createRiverLayer(); // Membuat layer sungai

    // Membuat layer untuk kabupaten/kota
    this.kabkotaLayer = L.geoJSON({
      type: 'FeatureCollection',
      features: this.kabkotaFeatures
    }, {
      style: (feature) => {
        return this.boundarySettings.styles.default;
      },
      onEachFeature: (feature, layer) => {
        layer.feature.properties.layerType = 'city'; // Menandai layer ini sebagai 'city'
        this.setupBoundaryInteractions(feature, layer); // Mengatur interaksi klik/hover
      }
    });

    if (this.boundarySettings.showBoundaries) {
      this.kabkotaLayer.addTo(this.map); // Tambahkan layer kab/kota ke peta
    }

    if (this.riverSettings.showRivers) {
      this.sungaiLayer.addTo(this.map); // Pastikan layer sungai paling atas
    }

    // Mengatur z-index atau urutan layer secara eksplisit
    this.sungaiLayer.bringToFront();
    if (this.kabkotaLayer) {
        this.kabkotaLayer.bringToBack(); // Kab/kota di bawah sungai
        this.adjustStylesForZoom(this.map.getZoom()); // Panggil adjustStylesForZoom setelah layer ditambahkan dan diatur z-indexnya
    }

    console.log(`✅ Layer peta dibuat: Sungai, Kab/Kota (${this.kabkotaFeatures.length})`);
  },

  /**
   * Buat layer sungai dengan styling dan interaksi
   */
  createRiverLayer() {
    console.log('🌊 Membuat layer sungai...');

    this.sungaiLayer = L.geoJSON({
      type: 'FeatureCollection',
      features: this.allFeatures
    }, {
      style: (feature) => {
        const riverType = feature.properties?.type || 'normal';
        return {
          ...this.riverSettings.styles.default,
          weight: riverType === 'major' ? this.riverSettings.styles.default.weight + 1 : this.riverSettings.styles.default.weight,
          color: riverType === 'major' ? '#0056b3' : this.riverSettings.styles.default.color
        };
      },
      onEachFeature: (feature, layer) => {
        this.setupRiverInteractions(feature, layer);
      }
    });

    console.log(`✅ Layer sungai dibuat dengan ${this.allFeatures.length} feature`);
  },

  /**
   * Setup interaksi untuk setiap feature sungai
   */
  setupRiverInteractions(feature, layer) {
    const name = feature.properties?.name || 'Unnamed River';
    const description = feature.properties?.description || '';

    const popupContent = `
      <div class="river-popup">
        <h4>🌊 ${name}</h4>
        ${description ? `<p>${description}</p>` : ''}
        <small>Klik untuk highlight | Klik dua kali untuk zoom</small>
      </div>
    `;

    layer.bindPopup(popupContent);

    layer.on({
      click: (e) => this.onRiverClick(e, feature, layer),
      dblclick: (e) => this.onRiverDoubleClick(e, feature, layer),
      mouseover: (e) => this.onRiverMouseOver(e, feature, layer),
      mouseout: (e) => this.onRiverMouseOut(e, feature, layer)
    });
  },

  /**
   * Setup interaksi untuk batas wilayah (sekarang hanya kab/kota)
   */
  setupBoundaryInteractions(feature, layer) {
    // Tidak ada popup yang muncul saat mengklik boundary
    layer.on({
      click: (e) => this.onBoundaryClick(e, feature, layer),
      mouseover: (e) => this.onBoundaryMouseOver(e, feature, layer),
      mouseout: (e) => this.onBoundaryMouseOut(e, feature, layer)
    });
  },

  // === CONTROLS & UI ===

  /**
   * Setup semua kontrol UI
   */
  setupControls() {
    console.log('🎛️  Menyiapkan kontrol UI...');

    this.createMapControls();
    this.createBoundarySelector();
    this.createFilterIndicator();
    this.createInfoPanel();
  },

  /**
   * Buat kontrol peta custom
   */
  createMapControls() {
    const ResetViewControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '🏠';
        container.title = 'Reset ke view awal';
        container.onclick = () => this.resetMapView();
        return container;
      }
    });

    const BoundaryToggleControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '🗺️';
        container.title = 'Toggle batas wilayah';
        container.onclick = () => this.toggleBoundaries();
        this.boundaryToggleBtn = container;
        return container;
      }
    });

    const RiverToggleControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '🌊';
        container.title = 'Toggle layer sungai';
        container.onclick = () => this.toggleRiverLayer();
        this.riverToggleBtn = container;
        return container;
      }
    });

    this.map.addControl(new ResetViewControl());
    this.map.addControl(new BoundaryToggleControl());
    this.map.addControl(new RiverToggleControl());
    
    this.updateControlStates();
  },

  /**
   * Buat dropdown selector untuk batas wilayah (sekarang hanya kab/kota)
   */
  createBoundarySelector() {
    const controlsContainer = document.querySelector('.controls-container');
    if (!controlsContainer) {
      console.warn('⚠️ Container kontrol tidak ditemukan');
      return;
    }
    
    const selectorContainer = document.createElement('div');
    selectorContainer.className = 'boundary-selector-container';
    
    const options = []; // UBAH: Menghapus opsi "<option value="">Semua Wilayah</option>"
    
    // Hanya menambahkan kabupaten/kota ke dropdown
    if (this.kabkotaFeatures.length > 0) {
      options.push('<optgroup label="Kota/Kabupaten">'); // Label grup untuk kab/kota
      this.kabkotaFeatures.sort((a, b) => a.properties.name.localeCompare(b.properties.name)).forEach(f => {
        options.push(`<option value="${f.properties.id}">${f.properties.name}</option>`); 
      });
      options.push('</optgroup>');
    }
    
    selectorContainer.innerHTML = `
      <select id="boundary-selector" class="boundary-selector" title="Pilih wilayah untuk filter">
        ${options.join('')}
      </select>
    `;
    
    controlsContainer.appendChild(selectorContainer);
    this.elements.boundarySelector = document.getElementById('boundary-selector');
  },

  /**
   * Buat indikator filter yang aktif
   */
  createFilterIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'filter-indicator';
    indicator.className = 'filter-indicator';
    document.body.appendChild(indicator);
    this.elements.filterIndicator = indicator;
  },

  /**
   * Buat panel info/legenda (disesuaikan untuk hanya kab/kota)
   */
  createInfoPanel() {
    const panel = document.createElement('div');
    panel.className = 'info-panel';
    panel.innerHTML = `
      <h4>Legenda</h4>
      <div class="legend-item">
        <div class="legend-color river-legend"></div>
        <span>Sungai</span>
      </div>
      <div class="legend-item">
        <div class="legend-color boundary-legend"></div>
        <span>Batas Wilayah Kab/Kota</span>
      </div>
      <div class="legend-item">
        <div class="legend-color selected-boundary-legend"></div>
        <span>Wilayah Terpilih</span>
      </div>
    `;
    document.body.appendChild(panel);
  },

  // === EVENT HANDLERS ===

  /**
   * Setup semua event listener
   */
  setupEventListeners() {
    console.log('🔗 Menyiapkan event listeners...');

    this.elements.searchBtn.addEventListener('click', () => this.performSearch());
    this.elements.search.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.performSearch();
    });
    this.elements.search.addEventListener('input', (e) => {
      this.updateAutocomplete(e.target.value);
    });
    
    if (this.elements.boundarySelector) {
      this.elements.boundarySelector.addEventListener('change', (e) => {
        this.selectBoundary(e.target.value);
      });
    }

    document.addEventListener('keydown', (e) => this.onKeyboardShortcut(e));
  },

  /**
   * Handler untuk keyboard shortcuts
   */
  onKeyboardShortcut(e) {
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      this.elements.search.focus();
    }
    
    if (e.key === 'Escape') {
      this.clearAllSelections();
    }
  },

  // === RIVER INTERACTIONS ===

  onRiverClick(e, feature, layer) {
    console.log(`🌊 River clicked: ${feature.properties.name}`);
    this.highlightRiver(layer); // Memanggil highlightRiver untuk menangani highlight tunggal
    L.DomEvent.stopPropagation(e);
  },

  onRiverDoubleClick(e, feature, layer) {
    console.log(`🔍 Zooming to river: ${feature.properties.name}`);
    this.map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    L.DomEvent.stopPropagation(e);
  },

  onRiverMouseOver(e, feature, layer) {
    // Jika sungai sudah di-highlight dari klik, jangan ubah style saat mouse over
    if (layer.isHighlighted) return;
    if (!this.isHovering) {
      this.hoverTimeout = setTimeout(() => {
        layer.setStyle(this.riverSettings.styles.highlighted);
        this.isHovering = true;
      }, 100);
    }
  },

  onRiverMouseOut(e, feature, layer) {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    // Jika sungai sedang di-highlight dari klik, jangan reset style saat mouse out
    if (layer.isHighlighted) return;

    if (this.currentHighlighted !== layer) {
      this.resetRiverStyle(layer); // Reset style jika bukan yang sedang di-highlight
    }
    this.isHovering = false;
  },

  // === BOUNDARY INTERACTIONS ===

  onBoundaryClick(e, feature, layer) {
    console.log(`🏛️ Boundary clicked: ${feature.properties.name}`);
    // Tidak ada popup yang muncul saat mengklik boundary
    L.DomEvent.stopPropagation(e);
  },

  onBoundaryMouseOver(e, feature, layer) {
    if (layer.feature.properties.id === this.boundarySettings.selectedBoundaryId) {
        return;
    }
    
    let originalStyle = this.boundarySettings.styles.default;

    layer.setStyle({
        ...originalStyle,
        weight: originalStyle.weight + 1,
        fillOpacity: originalStyle.fillOpacity + 0.1
    });
  },

  onBoundaryMouseOut(e, feature, layer) {
    if (layer.feature.properties.id !== this.boundarySettings.selectedBoundaryId) {
        const currentZoom = this.map.getZoom();
        const kabkotaWeight = currentZoom < 10 ? 2 : currentZoom < 13 ? 3 : 4;
        layer.setStyle({ ...this.boundarySettings.styles.default, weight: kabkotaWeight });
    }
  },

  // === CORE FUNCTIONALITIES ===

  /**
   * Lakukan pencarian sungai berdasarkan nama
   */
  performSearch() {
    const searchTerm = this.elements.search.value.trim();
    
    if (!searchTerm) {
      this.clearSearch();
      return;
    }

    console.log(`🔍 Mencari: "${searchTerm}"`);
    this.showLoading(true, 'Mencari sungai...');

    const normalizedSearch = this.normalizeName(searchTerm);
    const matchedFeatures = [];
    let exactMatch = null;

    this.sungaiLayer.eachLayer(layer => {
      const feature = layer.feature;
      const searchableText = feature.properties.searchableText || '';
      
      if (searchableText.includes(normalizedSearch)) {
        matchedFeatures.push({ feature, layer });
        
        if (feature.properties.normalizedName === normalizedSearch) {
          exactMatch = { feature, layer };
        }
      }
    });

    this.showLoading(false);

    if (matchedFeatures.length === 0) {
      this.showError(`Tidak ditemukan sungai dengan nama "${searchTerm}"`);
      return;
    }

    const targetResult = exactMatch || matchedFeatures[0];
    
    this.highlightRiver(targetResult.layer); // Memanggil highlightRiver untuk single highlight
    this.map.fitBounds(targetResult.layer.getBounds(), { padding: [50, 50] });
    
    this.showSearchResults(matchedFeatures, searchTerm);
    
    console.log(`✅ Ditemukan ${matchedFeatures.length} hasil untuk "${searchTerm}"`);
  },

  /**
   * Highlight hasil pencarian (Sekarang hanya akan highlight satu hasil utama)
   */
  highlightSearchResults(matchedFeatures) {
    console.log('ℹ️ highlightSearchResults dipanggil, namun logic highlight utama kini di highlightRiver.');
  },

  /**
   * Tampilkan info hasil pencarian
   */
  showSearchResults(matchedFeatures, searchTerm) {
    const resultCount = matchedFeatures.length;
    const resultText = resultCount === 1 ? 'sungai' : 'sungai';
    
    this.showInfo(`Ditemukan ${resultCount} ${resultText} untuk "${searchTerm}"`);
    
    if (matchedFeatures.length > 0) {
      matchedFeatures[0].layer.openPopup();
    }
  },

  /**
   * Clear pencarian dan reset
   */
  clearSearch() {
    console.log('🧹 Clearing search...');
    this.elements.search.value = '';
    this.clearAllHighlights();
    this.hideInfo();
  },

  /**
   * Highlight sungai tertentu (sekarang hanya satu sungai yang akan di-highlight)
   */
  highlightRiver(layer) {
    // Jika sudah ada sungai yang di-highlight dan itu bukan layer yang sama
    if (this.currentHighlighted && this.currentHighlighted !== layer) {
      this.resetRiverStyle(this.currentHighlighted); // Reset style sungai yang lama
      this.currentHighlighted.isHighlighted = false; // Pastikan status isHighlighted direset
    }
    
    // Set highlight baru
    layer.setStyle(this.riverSettings.styles.highlighted);
    layer.isHighlighted = true; // Menandai layer ini sedang di-highlight
    this.currentHighlighted = layer; // Menyimpan referensi sungai yang baru di-highlight
  },

  /**
   * Reset style sungai ke default (dinamis berdasarkan zoom)
   */
  resetRiverStyle(layer) {
    // Dapatkan weight dinamis saat ini berdasarkan zoom
    const currentZoom = this.map.getZoom();
    const riverWeight = currentZoom < 12 ? this.riverSettings.styles.default.weight : (currentZoom < 15 ? (this.riverSettings.styles.default.weight + 1) : (this.riverSettings.styles.default.weight + 2));

    if (layer.isFiltered) {
      layer.setStyle(this.riverSettings.styles.filtered);
    } else {
      // Terapkan style default dengan weight dinamis saat ini
      // Menggunakan spread operator agar properti lain dari default style (misal color, opacity) tetap terjaga
      layer.setStyle({ ...this.riverSettings.styles.default, weight: riverWeight });
    }
    layer.isHighlighted = false; // Pastikan status isHighlighted direset
  },

  /**
   * Reset style boundary ke default (sekarang hanya untuk kab/kota)
   */
  resetBoundaryStyle(layer) {
    const currentZoom = this.map.getZoom();
    const kabkotaWeight = currentZoom < 10 ? 2 : currentZoom < 13 ? 3 : 4;
    layer.setStyle({ ...this.boundarySettings.styles.default, weight: kabkotaWeight });
  },

  /**
   * Clear semua highlight dari sungai
   */
  clearAllHighlights() {
    if (!this.sungaiLayer) return;
    
    this.sungaiLayer.eachLayer(layer => {
      this.resetRiverStyle(layer); // Memanggil resetRiverStyle untuk setiap sungai
    });
    
    this.currentHighlighted = null;
  },

  /**
   * Clear semua seleksi (highlight sungai, seleksi batas wilayah, pencarian)
   */
  clearAllSelections() {
    this.clearAllHighlights();
    this.clearBoundarySelection();
    this.clearSearch();
    this.map.closePopup();
  },

  // === BOUNDARY MANAGEMENT ===

  /**
   * Pilih boundary berdasarkan ID (sekarang hanya kab/kota)
   */
  selectBoundary(boundaryId) {
    console.log(`🏛️ Selecting boundary: ${boundaryId}`);
    
    this.clearBoundarySelection(); // Membersihkan seleksi sebelumnya
    
    // Jika ID kosong, ini berarti tidak ada wilayah yang dipilih, maka reset filter
    // Catatan: Karena opsi "Semua Wilayah" dihapus, ini hanya akan terpanggil jika boundaryId sengaja kosong
    if (!boundaryId) { 
      this.clearRiverFilter();
      this.boundarySettings.selectedBoundaryId = null;
      // Perbarui dropdown menjadi tidak ada pilihan (jika memungkinkan)
      if (this.elements.boundarySelector) {
        this.elements.boundarySelector.selectedIndex = -1; // -1 untuk tidak ada pilihan
      }
      return;
    }
    
    let selectedFeature = null;
    let selectedLayer = null;

    // Mencari layer di kabkotaLayer
    this.kabkotaLayer.eachLayer(layer => {
        if (layer.feature.properties.id === boundaryId) {
            selectedFeature = layer.feature;
            selectedLayer = layer;
            return true; // Keluar dari eachLayer setelah ditemukan
        }
    });
    
    if (!selectedLayer) {
      console.warn(`⚠️ Boundary tidak ditemukan: ${boundaryId}`);
      return;
    }
    
    selectedLayer.setStyle(this.boundarySettings.styles.selected);
    this.selectedBoundaryLayer = selectedLayer;
    this.boundarySettings.selectedBoundaryId = boundaryId;
    
    this.filterRiversByBoundary(selectedFeature);
    
    this.map.fitBounds(selectedLayer.getBounds(), { padding: [20, 20] });
    
    this.updateFilterIndicator(selectedFeature.properties.name);
    
    if (this.elements.boundarySelector) {
      this.elements.boundarySelector.value = boundaryId; // Update dropdown
    }
  },

  /**
   * Clear boundary selection
   */
  clearBoundarySelection() {
    if (this.kabkotaLayer) {
        this.kabkotaLayer.eachLayer(layer => {
            this.resetBoundaryStyle(layer); // Reset style tiap layer kab/kota
        });
    }

    this.selectedBoundaryLayer = null;
    this.boundarySettings.selectedBoundaryId = null;
    this.hideFilterIndicator();
    
    if (this.elements.boundarySelector) {
      // Mengatur ulang dropdown menjadi pilihan kosong (tidak ada)
      this.elements.boundarySelector.selectedIndex = -1; // UBAH: Pilih index -1 untuk tidak ada yang terpilih
    }
    this.clearRiverFilter();
  },

  /**
   * Filter sungai berdasarkan boundary (batas wilayah kab/kota)
   */
  filterRiversByBoundary(boundaryFeature) {
    if (!this.sungaiLayer || !boundaryFeature) return;
    
    console.log(`🔄 Filtering rivers by boundary: ${boundaryFeature.properties.name}`);
    
    const boundaryGeom = boundaryFeature.geometry;
    let insideCount = 0;
    let totalCount = 0;
    
    this.sungaiLayer.eachLayer(layer => {
      totalCount++;
      const riverGeom = layer.feature.geometry;
      
      const isInside = this.checkGeometryIntersection(riverGeom, boundaryGeom);
      
      if (isInside) {
        layer.setStyle(this.riverSettings.styles.default); // Sungai di dalam area filter
        layer.isFiltered = false;
        insideCount++;
      } else {
        layer.setStyle(this.riverSettings.styles.filtered); // Sungai di luar area filter (samar)
        layer.isFiltered = true;
      }
    });
    
    // Samarkan kab/kota lain yang tidak terpilih
    this.kabkotaLayer.eachLayer(layer => {
        if (layer.feature.properties.id !== boundaryFeature.properties.id) {
            layer.setStyle(this.boundarySettings.styles.filtered); // Samarkan kab/kota lain
        } else {
            layer.setStyle(this.boundarySettings.styles.selected); // Biarkan yang terpilih tetap highlight
        }
    });

    this.showInfo(`Menampilkan ${insideCount} sungai dalam ${boundaryFeature.properties.name}`);
  },

  /**
   * Clear filter sungai, mengembalikan semua sungai ke style default
   */
  clearRiverFilter() {
    if (!this.sungaiLayer) return;
    
    console.log('🧹 Clearing river filter...');
    
    this.sungaiLayer.eachLayer(layer => {
      this.resetRiverStyle(layer);
      layer.isFiltered = false;
    });

    // Reset style semua boundary layer kabkota
    if (this.kabkotaLayer) {
        this.kabkotaLayer.eachLayer(layer => {
            this.resetBoundaryStyle(layer);
        });
    }
    
    this.hideInfo();
  },

  /**
   * Check apakah geometry intersect (simplified)
   */
  checkGeometryIntersection(lineGeom, polygonGeom) {
    if (lineGeom.type !== 'LineString' || polygonGeom.type !== 'Polygon') {
      return false;
    }
    
    const polyCoords = polygonGeom.coordinates[0];
    const lineCoords = lineGeom.coordinates;
    
    return lineCoords.some(coord => this.pointInPolygon(coord, polyCoords));
  },

  /**
   * Point in polygon test (ray casting algorithm)
   */
  pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  },

  // === LAYER TOGGLES ===

  /**
   * Toggle visibility (sembunyikan/tampilkan) boundary layer (sekarang hanya mengontrol layer kab/kota)
   */
  toggleBoundaries() {
    this.boundarySettings.showBoundaries = !this.boundarySettings.showBoundaries;
    
    if (this.boundarySettings.showBoundaries) {
      if (this.kabkotaLayer) this.map.addLayer(this.kabkotaLayer);
      console.log('👁️ Boundary layer (Kab/Kota) shown');
    } else {
      if (this.kabkotaLayer) this.map.removeLayer(this.kabkotaLayer);
      console.log('👁️‍🗨️ Boundary layer (Kab/Kota) hidden');
    }
    
    this.updateControlStates();
  },

  /**
   * Toggle visibility (sembunyikan/tampilkan) river layer
   */
  toggleRiverLayer() {
    this.riverSettings.showRivers = !this.riverSettings.showRivers;
    
    if (this.riverSettings.showRivers) {
      this.map.addLayer(this.sungaiLayer);
      console.log('👁️ River layer shown');
    } else {
      this.map.removeLayer(this.sungaiLayer);
      console.log('👁️‍🗨️ River layer hidden');
    }
    
    this.updateControlStates();
  },

  /**
   * Reset map view ke posisi awal
   */
  resetMapView() {
      console.log('🏠 Resetting map view...');
      this.map.setView([-6.4, 106.8], 10);
      this.clearAllSelections();
  },

  /**
   * Update state tombol kontrol (mengubah opacity berdasarkan visibility layer)
   */
  updateControlStates() {
    if (this.boundaryToggleBtn) {
      this.boundaryToggleBtn.style.opacity = this.boundarySettings.showBoundaries ? '1' : '0.5';
    }
    
    if (this.riverToggleBtn) {
      this.riverToggleBtn.style.opacity = this.riverSettings.showRivers ? '1' : '0.5';
    }
  },

  // === EXPORT FUNCTIONALITY ===
  // DIHAPUS: Fungsi exportGeoJSON dan semua referensinya tidak lagi dibutuhkan

  // === AUTOCOMPLETE ===

  /**
   * Update autocomplete suggestions untuk input pencarian
   */
  updateAutocomplete(searchValue) {
    if (!searchValue || searchValue.length < 2) {
      this.hideAutocomplete();
      return;
    }
    
    const normalizedSearch = this.normalizeName(searchValue);
    const suggestions = [];
    
    this.normalizedNames.forEach((originalName, normalizedName) => {
      if (normalizedName.includes(normalizedSearch) && suggestions.length < 5) {
        suggestions.push(originalName);
      }
    });
    
    if (suggestions.length > 0) {
      this.showAutocomplete(suggestions);
    } else {
      this.hideAutocomplete();
    }
  },

  /**
   * Show autocomplete dropdown
   */
  showAutocomplete(suggestions) {
    let dropdown = document.getElementById('search-autocomplete');
    
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'search-autocomplete';
      dropdown.className = 'search-autocomplete';
      this.elements.search.parentNode.appendChild(dropdown);
    }
    
    const items = suggestions.map(name => 
      `<div class="autocomplete-item" onclick="EnhancedRiverApp.selectAutocomplete('${name}')">${name}</div>`
    ).join('');
    
    dropdown.innerHTML = items;
    dropdown.style.display = 'block';
  },

  /**
   * Hide autocomplete dropdown
   */
  hideAutocomplete() {
    const dropdown = document.getElementById('search-autocomplete');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  },

  /**
   * Select item dari autocomplete, mengisi input dan menjalankan pencarian
   */
  selectAutocomplete(name) {
    this.elements.search.value = name;
    this.hideAutocomplete();
    this.performSearch();
  },

  // === UI FEEDBACK ===

  /**
   * Show loading indicator
   */
  showLoading(show, message = 'Loading...') {
    if (this.elements.loadingSpinner) {
      this.elements.loadingSpinner.style.display = show ? 'flex' : 'none';
      if (show && message) {
        this.elements.loadingSpinner.textContent = message;
      }
    }
  },

  /**
   * Show error message (notifikasi)
   */
  showError(message) {
    console.error('❌', message);
    this.showNotification(message, 'error');
  },

  /**
   * Show info message (notifikasi)
   */
  showInfo(message) {
    console.log('ℹ️', message);
    this.showNotification(message, 'info');
  },

  /**
   * Show notification (pesan singkat di layar)
   */
  showNotification(message, type = 'info') {
    let notification = document.getElementById('notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'notification';
      notification.className = 'notification';
      document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  },

  /**
   * Hide info message (notifikasi)
   */
  hideInfo() {
    const notification = document.getElementById('notification');
    if (notification) {
      notification.classList.remove('show');
    }
  },

  /**
   * Update filter indicator (pesan di bawah search box yang menunjukkan filter aktif)
   */
  updateFilterIndicator(boundaryName) {
    if (this.elements.filterIndicator) {
      this.elements.filterIndicator.innerHTML = `
        <span>🔍 Filter aktif: ${boundaryName}</span>
        <button onclick="EnhancedRiverApp.clearBoundarySelection()" class="clear-filter-btn">✕</button>
      `;
      this.elements.filterIndicator.style.display = 'flex';
    }
  },

  /**
   * Hide filter indicator
   */
  hideFilterIndicator() {
    if (this.elements.filterIndicator) {
      this.elements.filterIndicator.style.display = 'none';
    }
  },

  // === UTILITIES ===

  /**
   * Normalize nama untuk pencarian (menghilangkan karakter non-alfanumerik, mengubah ke lowercase)
   */
  normalizeName(name) {
    return name.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
};

// === INITIALIZATION ===

document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 DOM ready, initializing Peta Sungai Jabodetabek...');
  EnhancedRiverApp.init().catch(error => {
    console.error('💥 Failed to initialize app:', error);
  });
});

window.EnhancedRiverApp = EnhancedRiverApp;
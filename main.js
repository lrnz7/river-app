// Objek utama aplikasi peta sungai
const EnhancedRiverApp = {
  // Properti untuk menyimpan instance peta Leaflet
  map: null,
  // Layer untuk menampilkan sungai
  sungaiLayer: null,
  // Layer untuk menampilkan batas wilayah (kabupaten/kota)
  boundariesLayer: null,
  // Layer untuk menyimpan sungai yang sedang di-highlight (hasil pencarian/klik)
  highlightedRiverLayer: null,
  // Layer untuk menyimpan batas wilayah yang sedang di-highlight/dipilih
  selectedBoundaryLayer: null,

  // Data mentah sungai dari GeoJSON
  allRiverData: null,
  // Data mentah batas wilayah dari GeoJSON
  allBoundaryData: null,
  // Timeout untuk debounce pencarian (mengurangi panggilan fungsi berlebihan)
  searchTimeout: null,
  // List nama sungai untuk autocomplete
  riverNames: [],

  // Variabel untuk menyimpan fitur batas wilayah yang sedang aktif difilter
  activeFilterBoundary: null, // Null jika tidak ada filter aktif

  // NEW: Status visibilitas layer
  isRiverLayerVisible: true,
  isBoundaryLayerVisible: true,

  // Objek untuk menyimpan referensi elemen DOM yang sering diakses
  elements: {
    map: null,
    search: null,
    searchBtn: null,
    loadingSpinner: null,
    boundarySelector: null,
    filterIndicator: null,
    autocompleteResults: null,
    riverSidebar: null,
    sidebarRiverName: null,
    sidebarRiverDescription: null,
    sidebarRiverLength: null,
    sidebarRiverCities: null,
    sidebarCloseBtn: null,
    // NEW: Elemen Layer Control Panel
    controlsContainer: null, // Untuk pengecekan klik di luar
    resetViewBtn: null,
    toggleRiverLayerCheckbox: null,
    toggleBoundaryLayerCheckbox: null
  },

  // === INITIALIZATION ===

  // Fungsi inisialisasi utama aplikasi
  async init() {
    console.log('🚀 Memulai Peta Sungai Jabodetabek...');

    try {
      // Tampilkan loading spinner saat aplikasi dimuat
      this.showLoading(true, 'Memuat aplikasi...');

      // Cache semua elemen DOM yang dibutuhkan
      this.cacheElements();
      // Inisialisasi peta Leaflet
      this.initMap();
      // Setup kontrol UI (dropdown filter)
      this.setupControls();
      // Setup event listeners untuk interaksi user
      this.setupEventListeners();

      // Muat semua data (sungai dan batas wilayah) secara asynchronous
      await this.loadAllData();

      // Sembunyikan loading spinner setelah data dimuat
      this.showLoading(false);
      console.log('✅ Aplikasi berhasil dimuat');

    } catch (error) {
      // Tangani error saat inisialisasi
      console.error('❌ Error saat inisialisasi:', error);
      this.showError('Gagal memuat aplikasi. Silakan refresh halaman.');
    }
  },

  // Fungsi untuk menyimpan referensi elemen DOM
  cacheElements() {
    console.log('📋 Menyimpan referensi elemen DOM...');

    this.elements = {
      map: document.getElementById('map'),
      search: document.getElementById('search'),
      searchBtn: document.getElementById('search-btn'),
      loadingSpinner: document.getElementById('loading-spinner'),
      boundarySelector: document.getElementById('boundary-selector'),
      filterIndicator: document.getElementById('filter-indicator'),
      autocompleteResults: document.getElementById('autocomplete-results'),
      riverSidebar: document.getElementById('river-sidebar'),
      sidebarRiverName: document.getElementById('sidebar-river-name'),
      sidebarRiverDescription: document.getElementById('sidebar-river-description'),
      sidebarRiverLength: document.getElementById('sidebar-river-length'),
      sidebarRiverCities: document.getElementById('sidebar-river-cities'),
      sidebarCloseBtn: document.querySelector('.sidebar-close-btn'),
      // Elemen Layer Control Panel
      controlsContainer: document.querySelector('.controls-container'), // Untuk pengecekan klik di luar
      resetViewBtn: document.getElementById('reset-view-btn'),
      toggleRiverLayerCheckbox: document.getElementById('toggle-river-layer'),
      toggleBoundaryLayerCheckbox: document.getElementById('toggle-boundary-layer')
    };

    // Periksa apakah semua elemen penting ditemukan
    const required = [
      'map', 'search', 'searchBtn', 'loadingSpinner', 'boundarySelector',
      'filterIndicator', 'autocompleteResults', 'riverSidebar', 'sidebarCloseBtn',
      'sidebarRiverName', 'sidebarRiverDescription', 'sidebarRiverLength', 'sidebarRiverCities',
      'controlsContainer', 'resetViewBtn', 'toggleRiverLayerCheckbox', 'toggleBoundaryLayerCheckbox'
    ];
    const missing = required.filter(key => !this.elements[key]);

    if (missing.length > 0) {
      // Lempar error jika ada elemen yang tidak ditemukan
      throw new Error(`Elemen DOM tidak ditemukan: ${missing.join(', ')}`);
    }
  },

  // Fungsi untuk inisialisasi peta Leaflet
  initMap() {
    console.log('🗺️ Menginisialisasi peta Leaflet...');
    // Buat instance peta, set koordinat awal (sekitar Jabodetabek) dan zoom level
    this.map = L.map(this.elements.map).setView([-6.2, 106.8], 10);

    // Tambahkan tile layer (peta dasar) dari OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // Atribusi default Leaflet + OpenStreetMap + Copyright Lorenzo Calvin
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | &copy; 2025 Lorenzo Calvin'
    }).addTo(this.map);

    // NEW: Tambahkan skala interaktif ke peta
    // imperial: false berarti menggunakan satuan metrik (meter, kilometer)
    L.control.scale({ imperial: false }).addTo(this.map);

    // Setup event listener untuk perubahan zoom peta
    this.map.on('zoomend', () => this.adjustStylesForZoom());
    // Setup event listener untuk klik di peta (untuk clear selection)
    this.map.on('click', (event) => {
      // Hanya clear all jika klik bukan di sidebar atau kontrol UI
      if (!this.elements.riverSidebar.contains(event.target) && !this.elements.controlsContainer.contains(event.target)) {
         this.clearAllSelections();
      }
    });
  },

  // Fungsi untuk menyesuaikan style layer (sungai, batas wilayah) berdasarkan zoom level
  adjustStylesForZoom() {
    // Dapatkan zoom level saat ini
    const currentZoom = this.map.getZoom();
    console.log(`🔍 Zoom level: ${currentZoom}`);

    // --- Update style sungai ---
    if (this.sungaiLayer) {
      this.sungaiLayer.eachLayer(layer => {
        // Cek apakah sungai sedang di-highlight oleh pencarian/klik
        if (layer === this.highlightedRiverLayer) {
          layer.setStyle({
            color: '#dc3545', // Warna merah untuk highlight dari search/klik
            weight: 6,
            opacity: 1.0,
            dashArray: '5, 5'
          });
        } else if (this.activeFilterBoundary) { // Jika ada filter wilayah aktif
          // Sungai yang beririsan dengan filter tetap normal
          if (layer.isIntersectingWithActiveFilter) {
            let riverWeight = 1;
            let riverOpacity = 0.7;
            if (currentZoom >= 12) {
              riverWeight = 2;
              riverOpacity = 0.8;
            } else if (currentZoom >= 14) {
              riverWeight = 3;
              riverOpacity = 0.9;
            } else if (currentZoom >= 16) {
              riverWeight = 4;
              riverOpacity = 1.0;
            }
            layer.setStyle({
              color: '#007bff', // Tetap biru (normal)
              weight: riverWeight,
              opacity: riverOpacity
            });
          } else {
            // Sungai yang tidak beririsan dengan filter, disamarkan
            layer.setStyle({
                color: '#cccccc',
                weight: 1,
                opacity: 0.3
            });
          }
        } else { // Style default jika tidak di-highlight dan tidak terfilter
          let riverWeight = 1;
          let riverOpacity = 0.7;
          if (currentZoom >= 12) {
            riverWeight = 2;
            riverOpacity = 0.8;
          } else if (currentZoom >= 14) {
            riverWeight = 3;
            riverOpacity = 0.9;
          } else if (currentZoom >= 16) {
            riverWeight = 4;
            riverOpacity = 1.0;
          }
          layer.setStyle({
            color: '#007bff',
            weight: riverWeight,
            opacity: riverOpacity
          });
        }
      });
    }

    // --- Update style batas wilayah ---
    if (this.boundariesLayer) {
      this.boundariesLayer.eachLayer(layer => {
        // Cek apakah batas wilayah ini adalah yang sedang dipilih/highlight
        if (layer === this.selectedBoundaryLayer) {
          layer.setStyle({
            color: '#28a745', // Warna hijau untuk highlight batas yang dipilih
            weight: 3,
            fillOpacity: 0.2,
            opacity: 0.8,
            dashArray: '3, 3'
          });
        } else if (this.activeFilterBoundary) { // Jika ada filter wilayah aktif
          // Batas wilayah lain akan disamarkan
          layer.setStyle({
            color: '#bbbbbb',
            weight: 0.5,
            fillOpacity: 0.05,
            opacity: 0.2
          });
        } else { // Style default jika tidak di-highlight dan tidak terfilter
          let boundaryWeight = 1;
          let boundaryOpacity = 0.5;
          if (currentZoom >= 11) {
            boundaryWeight = 1.5;
            boundaryOpacity = 0.6;
          } else if (currentZoom >= 13) {
            boundaryWeight = 2;
            boundaryOpacity = 0.7;
          }
          layer.setStyle({
            color: '#6c757d',
            weight: boundaryWeight,
            fillOpacity: 0.1,
            opacity: boundaryOpacity
          });
        }
      });
    }
    
    // Pastikan layer sungai asli di atas boundariesLayer
    if (this.sungaiLayer) this.sungaiLayer.bringToFront();
  },

  // Fungsi untuk setup kontrol UI (dropdown filter dan layer control)
  setupControls() {
    console.log('⚙️ Menyiapkan kontrol UI...');
    // Menambahkan referensi controlsContainer ke elements cache (sudah ada di cacheElements)

    // Event listener untuk tombol Reset View
    this.elements.resetViewBtn.addEventListener('click', () => this.resetMapView());

    // Event listener untuk checkbox toggle layer sungai
    this.elements.toggleRiverLayerCheckbox.addEventListener('change', (e) => {
      this.toggleRiverLayer(e.target.checked);
    });

    // Event listener untuk checkbox toggle layer batas wilayah
    this.elements.toggleBoundaryLayerCheckbox.addEventListener('change', (e) => {
      this.toggleBoundaryLayer(e.target.checked);
    });
  },

  // Fungsi untuk memuat semua data (sungai dan batas wilayah)
  async loadAllData() {
    this.showLoading(true, 'Memuat data sungai dan batas wilayah...');
    try {
      // Muat data sungai dari river.geojson
      const riverResponse = await fetch('river.geojson');
      if (!riverResponse.ok) throw new Error('Gagal memuat river.geojson');
      this.allRiverData = await riverResponse.json();
      // Awalnya tambahkan layer sungai ke peta jika checkbox default checked
      this.createRiverLayer(this.allRiverData); 
      if (!this.elements.toggleRiverLayerCheckbox.checked) {
        this.map.removeLayer(this.sungaiLayer);
      }

      // Muat data batas wilayah dari IDN_adm_2_kabkota.json
      const boundaryResponse = await fetch('IDN_adm_2_kabkota.json');
      if (!boundaryResponse.ok) throw new Error('Gagal memuat IDN_adm_2_kabkota.json');
      this.allBoundaryData = await boundaryResponse.json();
      // Awalnya tambahkan layer batas wilayah ke peta jika checkbox default checked
      this.createBoundaryLayer(this.allBoundaryData);
      if (!this.elements.toggleBoundaryLayerCheckbox.checked) {
        this.map.removeLayer(this.boundariesLayer);
      }
      this.populateBoundarySelector(this.allBoundaryData); // Isi dropdown filter wilayah

      // Ambil nama-nama sungai untuk autocomplete
      this.riverNames = this.allRiverData.features.map(f => f.properties.name || f.properties.NAME || 'Unnamed River');

      // Pastikan layer sungai selalu di depan layer batas wilayah agar bisa diklik
      if (this.boundariesLayer) this.boundariesLayer.bringToBack();
      if (this.sungaiLayer) this.sungaiLayer.bringToFront();
      
      console.log('✅ Data sungai dan batas wilayah berhasil dimuat.');
    } catch (error) {
      console.error('❌ Gagal memuat data:', error);
      this.showError('Gagal memuat data peta. Beberapa fitur mungkin tidak berfungsi.');
    }
  },

  // === LAYER CREATION ===

  // Fungsi untuk membuat layer sungai dari data GeoJSON
  createRiverLayer(geojson) {
    // Hapus layer lama jika ada
    if (this.sungaiLayer && this.map.hasLayer(this.sungaiLayer)) {
      this.map.removeLayer(this.sungaiLayer);
    }
    this.sungaiLayer = L.geoJSON(geojson, {
      style: (feature) => {
        // Style default untuk sungai
        return {
          color: '#007bff', // Warna biru
          weight: 1,
          opacity: 0.7
        };
      },
      onEachFeature: (feature, layer) => {
        // Pastikan setiap fitur punya properti 'name'
        if (!feature.properties.name) {
          feature.properties.name = feature.properties.NAME || 'Unnamed River';
        }
        // Pastikan setiap fitur punya ID untuk referensi
        layer.feature.properties.id = feature.properties.id || feature.properties.name.replace(/\s/g, '_');
        layer.isIntersectingWithActiveFilter = false; // Properti untuk status irisan dengan filter aktif

        // Bind event listener untuk setiap fitur sungai
        layer.on({
          click: (e) => this.onRiverClick(e, feature, layer),
          dblclick: (e) => this.onRiverDoubleClick(e, feature, layer),
          mouseover: (e) => this.onRiverMouseOver(e, feature, layer),
          mouseout: (e) => this.onRiverMouseOut(e, feature, layer)
        });
      }
    });
    // Hanya tambahkan ke peta jika isRiverLayerVisible
    if (this.isRiverLayerVisible) {
      this.sungaiLayer.addTo(this.map);
    }
    this.adjustStylesForZoom(); // Sesuaikan style awal setelah layer dibuat
  },

  // Fungsi untuk membuat layer batas wilayah dari data GeoJSON
  createBoundaryLayer(geojson) {
    // Hapus layer lama jika ada
    if (this.boundariesLayer && this.map.hasLayer(this.boundariesLayer)) {
      this.map.removeLayer(this.boundariesLayer);
    }
    this.boundariesLayer = L.geoJSON(geojson, {
      style: (feature) => {
        // Style default untuk batas wilayah
        return {
          color: '#6c757d',
          weight: 1,
          fillOpacity: 0.1,
          opacity: 0.5
        };
      },
      onEachFeature: (feature, layer) => {
        // Gunakan NAMOBJ sebagai nama wilayah
        if (!feature.properties.NAMOBJ) {
          feature.properties.NAMOBJ = feature.properties.name || 'Unnamed Boundary';
        }
        // Pastikan setiap fitur punya ID untuk referensi
        layer.feature.properties.id = feature.properties.ADM2_PCODE || feature.properties.NAMOBJ.replace(/\s/g, '_');
        layer.isFiltered = false; // Status awal tidak terfilter

        // Bind event listener untuk setiap batas wilayah
        layer.on({
          click: (e) => this.onBoundaryClick(e, feature, layer),
          mouseover: (e) => this.onBoundaryMouseOver(e, feature, layer),
          mouseout: (e) => this.onBoundaryMouseOut(e, feature, layer)
        });
        // Bind tooltip untuk menampilkan nama wilayah saat hover
        layer.bindTooltip(feature.properties.NAMOBJ, {
          permanent: false,
          direction: 'auto',
          className: 'boundary-tooltip'
        });
      }
    });
    // Hanya tambahkan ke peta jika isBoundaryLayerVisible
    if (this.isBoundaryLayerVisible) {
      this.boundariesLayer.addTo(this.map);
    }
    this.adjustStylesForZoom(); // Sesuaikan style awal setelah layer dibuat
  },

  // === EVENT HANDLERS ===

  // Setup event listeners untuk input pencarian dan tombol
  setupEventListeners() {
    console.log('🔗 Menyiapkan event listeners...');

    this.elements.searchBtn.addEventListener('click', () => this.performSearch());
    this.elements.search.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.performSearch();
    });
    // Event listener untuk input pencarian (untuk autocomplete)
    this.elements.search.addEventListener('input', (e) => {
      this.updateAutocomplete(e.target.value);
    });
    
    // Event listener untuk perubahan pilihan di dropdown filter wilayah
    if (this.elements.boundarySelector) {
      this.elements.boundarySelector.addEventListener('change', (e) => {
        this.selectBoundary(e.target.value);
      });
    }

    // Event listener untuk shortcut keyboard (misal: Esc untuk clear selection)
    document.addEventListener('keydown', (e) => this.onKeyboardShortcut(e));

    // Event listener untuk tombol tutup sidebar
    this.elements.sidebarCloseBtn.addEventListener('click', () => this.hideSidebar());
    // Event listener untuk tombol Reset View
    this.elements.resetViewBtn.addEventListener('click', () => this.resetMapView());
    // Event listener untuk checkbox toggle layer sungai
    this.elements.toggleRiverLayerCheckbox.addEventListener('change', (e) => {
      this.toggleRiverLayer(e.target.checked);
    });
    // Event listener untuk checkbox toggle layer batas wilayah
    this.elements.toggleBoundaryLayerCheckbox.addEventListener('change', (e) => {
      this.toggleBoundaryLayer(e.target.checked);
    });
  },

  // Handler untuk shortcut keyboard
  onKeyboardShortcut(e) {
    if (e.key === 'Escape') {
      this.clearAllSelections();
    }
  },

  // === RIVER INTERACTIONS ===

  // Handler saat sungai diklik
  onRiverClick(e, feature, layer) {
    console.log(`🌊 Sungai diklik: ${feature.properties.name}`);
    // Hanya reset highlight sungai sebelumnya jika ada dan berbeda
    if (this.highlightedRiverLayer && this.highlightedRiverLayer !== layer) {
        this.sungaiLayer.resetStyle(this.highlightedRiverLayer);
    }
    this.highlightRiver(layer); // Highlight seluruh sungai
    this.showRiverDetailsInSidebar(feature.properties); // Tampilkan detail di sidebar
    L.DomEvent.stopPropagation(e); // Hentikan propagasi event agar tidak memicu map click
  },

  // Handler saat sungai di-double click (zoom ke sungai)
  onRiverDoubleClick(e, feature, layer) {
    console.log(`🎯 Double-klik sungai: ${feature.properties.name}`);
    // Zoom ke bounds sungai dengan animasi "terbang"
    this.map.flyToBounds(layer.getBounds(), {
      padding: L.point(50, 50),
      duration: 1.5
    });
    L.DomEvent.stopPropagation(e);
  },

  // Handler saat mouse over di atas sungai
  onRiverMouseOver(e, feature, layer) {
    // Hanya highlight jika sungai ini bukan yang sedang di-highlight permanen
    // dan tidak sedang dalam mode filter wilayah (style sudah diatur di adjustStylesForZoom)
    if (layer !== this.highlightedRiverLayer && !this.activeFilterBoundary) {
      layer.setStyle({
        weight: 5,
        color: '#0056b3',
        opacity: 1.0
      });
    }
  },

  // Handler saat mouse out dari sungai
  onRiverMouseOut(e, feature, layer) {
    // Kembalikan style sungai ke default jika bukan yang sedang di-highlight permanen
    if (layer !== this.highlightedRiverLayer) {
      this.adjustStylesForZoom(); // Panggil adjustStylesForZoom untuk reset style
    }
  },

  // === BOUNDARY INTERACTIONS ===

  // Handler saat batas wilayah diklik
  onBoundaryClick(e, feature, layer) {
    console.log(`📍 Batas wilayah diklik: ${feature.properties.NAMOBJ}`);
    this.selectBoundary(feature.properties.NAMOBJ); // Panggil selectBoundary untuk mengaktifkan filter
    L.DomEvent.stopPropagation(e);
  },

  // Handler saat mouse over di atas batas wilayah (untuk tooltip)
  onBoundaryMouseOver(e, feature, layer) {
    // Tidak perlu mengubah style, cukup biarkan tooltip muncul
  },

  // Handler saat mouse out dari batas wilayah (untuk tooltip)
  onBoundaryMouseOut(e, feature, layer) {
    // Tidak perlu mengubah style, cukup biarkan tooltip hilang
  },

  // === CORE FUNCTIONALITIES ===

  // Fungsi untuk mengisi dropdown filter wilayah
  populateBoundarySelector(geojson) {
    console.log('📊 Mengisi dropdown wilayah...');
    const selector = this.elements.boundarySelector;
    // Ambil nama-nama wilayah unik dan urutkan abjad
    const names = geojson.features
      .map(f => f.properties.NAMOBJ)
      .filter(name => typeof name === 'string' && name.trim() !== '')
      .sort((a, b) => a.localeCompare(b));

    // Tambahkan kembali opsi "Pilih Wilayah" di awal
    selector.innerHTML = '<option value="">Pilih Wilayah</option>';

    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      selector.appendChild(option);
    });
  },

  // Fungsi untuk melakukan pencarian sungai
  performSearch() {
    const searchTerm = this.elements.search.value.trim();
    // Kita hanya akan mereset highlight sungai, bukan wilayah
    this.clearRiverHighlight(); 
    this.hideSidebar(); // Tutup sidebar saat pencarian baru

    if (!searchTerm) {
      this.showError('Masukkan nama sungai untuk mencari.');
      return;
    }

    console.log(`🔎 Mencari sungai: "${searchTerm}"`);
    const normalizedSearchTerm = searchTerm.toLowerCase();

    const matchingLayers = this.sungaiLayer.getLayers().filter(layer =>
      layer.feature.properties.name && layer.feature.properties.name.toLowerCase().includes(normalizedSearchTerm)
    );

    if (matchingLayers.length > 0) {
      this.showSearchResults(matchingLayers);
      
      const targetLayer = matchingLayers[0]; 
      
      this.map.flyToBounds(targetLayer.getBounds(), {
        padding: L.point(50, 50),
        duration: 1.5
      });
      this.highlightRiver(targetLayer); // Highlight sungai
      this.showRiverDetailsInSidebar(targetLayer.feature.properties);
    } else {
      this.showError(`Sungai "${searchTerm}" tidak ditemukan.`);
    }
  },

  // Fungsi untuk update hasil autocomplete saat user mengetik
  updateAutocomplete(query) {
    clearTimeout(this.searchTimeout);
    if (query.length < 2) {
      this.elements.autocompleteResults.innerHTML = '';
      this.elements.autocompleteResults.style.display = 'none';
      return;
    }

    this.searchTimeout = setTimeout(() => {
      const normalizedQuery = query.toLowerCase();
      const filteredNames = this.riverNames.filter(name =>
        name.toLowerCase().includes(normalizedQuery)
      ).slice(0, 10);

      this.elements.autocompleteResults.innerHTML = '';
      if (filteredNames.length > 0) {
        filteredNames.forEach(name => {
          const div = document.createElement('div');
          div.textContent = name;
          div.addEventListener('click', () => {
            this.elements.search.value = name;
            this.performSearch();
            this.elements.autocompleteResults.innerHTML = '';
            this.elements.autocompleteResults.style.display = 'none';
          });
          this.elements.autocompleteResults.appendChild(div);
        });
        this.elements.autocompleteResults.style.display = 'block';
      } else {
        this.elements.autocompleteResults.style.display = 'none';
      }
    }, 200);
  },

  // Fungsi untuk menampilkan hasil pencarian (misal: di popup atau list)
  showSearchResults(results) {
    console.log(`✅ Ditemukan ${results.length} sungai.`);
  },

  // Fungsi untuk menghapus hasil pencarian dan input
  clearSearch() {
    this.elements.search.value = '';
    this.elements.autocompleteResults.innerHTML = '';
    this.elements.autocompleteResults.style.display = 'none';
    this.clearRiverHighlight(); // Hanya clear highlight sungai
    console.log('🗑️ Pencarian dibersihkan.');
  },

  // Fungsi untuk highlight sungai di peta
  highlightRiver(layer) {
    // Hanya clear highlight sungai sebelumnya
    this.clearRiverHighlight();

    this.highlightedRiverLayer = layer;
    layer.setStyle({
      color: '#dc3545',
      weight: 6,
      opacity: 1.0,
      dashArray: '5, 5'
    });
    layer.bringToFront();
  },

  // Fungsi untuk membersihkan highlight sungai saja
  clearRiverHighlight() {
    if (this.highlightedRiverLayer) {
      this.sungaiLayer.resetStyle(this.highlightedRiverLayer);
      this.highlightedRiverLayer = null;
      this.adjustStylesForZoom(); // Panggil untuk reset style sungai yang sebelumnya di-highlight
    }
  },

  // Fungsi untuk highlight batas wilayah di peta
  highlightBoundary(layer) {
    // Hanya clear highlight batas wilayah sebelumnya
    this.clearBoundaryHighlight();

    this.selectedBoundaryLayer = layer;
    layer.setStyle({
      color: '#28a745',
      weight: 3,
      fillOpacity: 0.2,
      opacity: 0.8,
      dashArray: '3, 3'
    });
    // Tidak perlu bringToFront() di sini, order layer diatur di loadAllData() dan adjustStylesForZoom()
  },

  // Fungsi untuk membersihkan highlight batas wilayah saja
  clearBoundaryHighlight() {
    if (this.selectedBoundaryLayer) {
        this.boundariesLayer.resetStyle(this.selectedBoundaryLayer);
        this.selectedBoundaryLayer = null;
        this.adjustStylesForZoom(); // Panggil untuk reset style batas wilayah yang sebelumnya di-highlight
    }
  },

  // Fungsi untuk membersihkan semua highlight (sungai dan batas)
  clearAllHighlights() { // Fungsi ini akan dipanggil oleh clearAllSelections()
    this.clearRiverHighlight();
    this.clearBoundaryHighlight();
    this.adjustStylesForZoom();
    console.log('✨ Semua highlight dibersihkan.');
  },

  // Fungsi untuk memilih batas wilayah dari dropdown atau klik peta
  selectBoundary(boundaryName) {
    // Hanya clear highlight sungai dan sidebar, tidak semua
    this.clearRiverHighlight();
    this.hideSidebar();

    // Reset dropdown value jika user memilih ulang wilayah yang sama
    if (this.selectedBoundaryLayer && this.selectedBoundaryLayer.feature.properties.NAMOBJ === boundaryName) {
        this.clearBoundarySelection(); // Jika klik wilayah yang sama, unselect
        return;
    }
    
    // Set dropdown value (jika belum terpilih atau beda)
    this.elements.boundarySelector.value = boundaryName;

    if (!boundaryName) { // Jika "Pilih Wilayah" dipilih (value="")
      this.clearBoundarySelection();
      return;
    }

    console.log(`🗺️ Memilih batas wilayah: ${boundaryName}`);
    // Cari fitur batas wilayah yang cocok
    const selectedFeature = this.allBoundaryData.features.find(
      f => f.properties.NAMOBJ === boundaryName
    );

    if (selectedFeature) {
      const layer = this.boundariesLayer.getLayers().find(
        l => l.feature.properties.NAMOBJ === boundaryName
      );
      if (layer) {
        this.highlightBoundary(layer); // Highlight batas wilayah yang dipilih
        this.activeFilterBoundary = selectedFeature; // Set batas wilayah aktif
        this.filterRiversByBoundary(selectedFeature); // Filter sungai
        this.map.flyToBounds(layer.getBounds(), {
          padding: L.point(50, 50),
          duration: 1.5
        });
      }
    } else {
      this.showError(`Wilayah "${boundaryName}" tidak ditemukan.`);
    }
  },

  // Fungsi untuk membersihkan seleksi batas wilayah
  clearBoundarySelection() {
    this.elements.boundarySelector.value = '';
    this.elements.filterIndicator.classList.remove('active');
    this.elements.filterIndicator.textContent = '';
    
    this.activeFilterBoundary = null; // Hapus batas wilayah aktif
    this.clearBoundaryHighlight(); // Hanya clear highlight batas wilayah
    // Reset isIntersectingWithActiveFilter untuk semua sungai
    if (this.sungaiLayer) {
        this.sungaiLayer.eachLayer(layer => {
            layer.isIntersectingWithActiveFilter = false;
        });
    }

    this.adjustStylesForZoom(); // Pastikan semua layer kembali ke style normal

    console.log('🗑️ Filter wilayah dibersihkan.');
  },

  // Fungsi untuk memfilter sungai berdasarkan batas wilayah yang dipilih
  filterRiversByBoundary(boundaryFeature) {
    if (!this.sungaiLayer || !boundaryFeature) return;

    console.log(`💧 Memfilter sungai di ${boundaryFeature.properties.NAMOBJ}...`);
    let riversInBoundaryCount = 0;

    // Iterasi setiap layer sungai
    this.sungaiLayer.eachLayer(riverLayer => {
      const riverGeom = riverLayer.feature.geometry;
      
      // Cek apakah sungai (LineString) berpotongan atau berada di dalam poligon batas wilayah
      const intersects = turf.booleanIntersects(riverGeom, boundaryFeature.geometry);
      
      riverLayer.isIntersectingWithActiveFilter = intersects; // Set status irisan

      if (intersects) {
        riversInBoundaryCount++;
      }
    });

    // Set status isFiltered untuk layer batas wilayah lainnya
    this.boundariesLayer.eachLayer(boundaryLayer => {
        if (boundaryLayer.feature.properties.NAMOBJ !== boundaryFeature.properties.NAMOBJ) {
            boundaryLayer.isFiltered = true; // Batas wilayah lain disamarkan
        } else {
            boundaryLayer.isFiltered = false; // Batas wilayah yang dipilih tetap jelas
        }
    });

    // Panggil adjustStylesForZoom untuk menerapkan style filter pada sungai asli dan batas wilayah
    this.adjustStylesForZoom();

    // Perbarui indikator filter
    this.elements.filterIndicator.textContent =
      `Menampilkan ${riversInBoundaryCount} sungai di ${boundaryFeature.properties.NAMOBJ}`;
    this.elements.filterIndicator.classList.add('active');
    console.log(`✅ Ditemukan ${riversInBoundaryCount} sungai di ${boundaryFeature.properties.NAMOBJ}.`);
  },

  // Fungsi untuk membersihkan semua seleksi (highlight, filter, search, sidebar)
  clearAllSelections() {
    this.clearRiverHighlight();
    this.clearBoundaryHighlight();
    this.clearBoundarySelection(); // Ini juga membersihkan activeFilterBoundary
    this.clearSearch();
    this.map.closePopup();
    this.hideSidebar();
    // Pastikan semua isIntersectingWithActiveFilter direset
    if (this.sungaiLayer) {
        this.sungaiLayer.eachLayer(layer => {
            layer.isIntersectingWithActiveFilter = false;
        });
    }
    this.adjustStylesForZoom(); // Panggil terakhir untuk memastikan semua style kembali normal
    console.log('🧹 Semua seleksi dibersihkan.');
  },

  // === LAYER CONTROL FUNCTIONS ===
  // Fungsi untuk mereset tampilan peta ke awal
  resetMapView() {
    console.log('🏠 Mereset tampilan peta...');
    this.map.setView([-6.2, 106.8], 10); // Koordinat tengah dan zoom awal
    this.clearAllSelections(); // Bersihkan semua seleksi dan filter
    // Pastikan checkbox layer kembali checked dan layer terlihat
    this.elements.toggleRiverLayerCheckbox.checked = true;
    this.toggleRiverLayer(true);
    this.elements.toggleBoundaryLayerCheckbox.checked = true;
    this.toggleBoundaryLayer(true);
  },

  // Fungsi untuk menampilkan/menyembunyikan layer sungai
  toggleRiverLayer(show) {
    this.isRiverLayerVisible = show;
    if (this.sungaiLayer) {
      if (show && !this.map.hasLayer(this.sungaiLayer)) {
        this.sungaiLayer.addTo(this.map);
        this.sungaiLayer.bringToFront(); // Pastikan sungai di depan
      } else if (!show && this.map.hasLayer(this.sungaiLayer)) {
        this.map.removeLayer(this.sungaiLayer);
      }
    }
    // Jika layer sungai disembunyikan, otomatis clear highlight sungai
    if (!show) {
        this.clearRiverHighlight();
        this.hideSidebar(); // Sembunyikan sidebar juga jika sungai tidak terlihat
    }
    this.adjustStylesForZoom(); // Pastikan style terupdate jika visibilitas berubah
    console.log(`👁️ Layer Sungai: ${show ? 'Tampil' : 'Sembunyi'}`);
  },

  // Fungsi untuk menampilkan/menyembunyikan layer batas wilayah
  toggleBoundaryLayer(show) {
    this.isBoundaryLayerVisible = show;
    if (this.boundariesLayer) {
      if (show && !this.map.hasLayer(this.boundariesLayer)) {
        this.boundariesLayer.addTo(this.map);
        this.boundariesLayer.bringToBack(); // Pastikan batas wilayah di belakang
      } else if (!show && this.map.hasLayer(this.boundariesLayer)) {
        this.map.removeLayer(this.boundariesLayer);
      }
    }
    // Jika layer batas wilayah disembunyikan, otomatis clear filter wilayah
    if (!show) {
        this.clearBoundarySelection(); // Ini juga membersihkan highlight boundary
    }
    this.adjustStylesForZoom(); // Pastikan style terupdate jika visibilitas berubah
    console.log(`👁️ Layer Batas Wilayah: ${show ? 'Tampil' : 'Sembunyi'}`);
  },

  // === UI FEEDBACK ===

  // Fungsi untuk menampilkan/menyembunyikan loading spinner
  showLoading(show, message = 'Memuat...') {
    if (this.elements.loadingSpinner) {
        this.elements.loadingSpinner.style.display = show ? 'flex' : 'none';
        const spinnerMessage = this.elements.loadingSpinner.querySelector('p');
        if (spinnerMessage) {
            spinnerMessage.textContent = message;
        }
    }
  },

  // Fungsi untuk menampilkan pesan error (bisa diganti dengan toast notification)
  showError(message) {
    console.error(`🚨 Error: ${message}`);
    alert(`Error: ${message}`);
  },

  // === SIDEBAR FUNCTIONS ===
  // Fungsi untuk menampilkan detail sungai di sidebar
  showRiverDetailsInSidebar(properties) {
    const sidebar = this.elements.riverSidebar;
    const nameElem = this.elements.sidebarRiverName;
    const descElem = this.elements.sidebarRiverDescription;
    const lengthElem = this.elements.sidebarRiverLength;
    const citiesElem = this.elements.sidebarRiverCities;

    if (sidebar && nameElem && descElem && lengthElem && citiesElem) {
      nameElem.textContent = properties.name || 'Nama Tidak Diketahui';
      descElem.textContent = properties.deskripsi_detail || properties.description || 'Tidak ada deskripsi.';

      lengthElem.textContent = properties.panjang_km ? `Panjang: ${properties.panjang_km} km` : 'Panjang: Tidak diketahui';
      citiesElem.textContent = properties.kota_dilalui ? `Melewati Kota: ${properties.kota_dilalui}` : 'Melewati Kota: Tidak diketahui';

      lengthElem.style.display = properties.panjang_km ? 'block' : 'none';
      citiesElem.style.display = properties.kota_dilalui ? 'block' : 'none';

      sidebar.classList.add('open');
      document.body.classList.add('sidebar-open');
    } else {
        console.warn('⚠️ Elemen sidebar tidak lengkap. Cek ID di index.html.');
    }
  },

  // Fungsi untuk menyembunyikan sidebar
  hideSidebar() {
    if (this.elements.riverSidebar) {
        this.elements.riverSidebar.classList.remove('open');
        document.body.classList.remove('sidebar-open');
    }
  },

  // === UTILITIES ===

  // Fungsi untuk menormalisasi string (misal: menghilangkan spasi ekstra)
  normalizeString(str) {
    return str.replace(/\s+/g, ' ').trim();
  }
};

// Pastikan aplikasi diinisialisasi setelah DOM selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
  EnhancedRiverApp.init();
});

// Expose EnhancedRiverApp ke window agar bisa diakses dari konsol browser (untuk debugging)
window.EnhancedRiverApp = EnhancedRiverApp;
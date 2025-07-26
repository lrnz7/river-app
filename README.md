# 🌊 Peta Sungai Interaktif Jabodetabek

**by Lorenzo Calvin – RiverApp**

## 🔍 Deskripsi Proyek

Ini adalah aplikasi web interaktif berbasis **Leaflet.js** yang menampilkan data sungai dan batas wilayah administratif di kawasan Jabodetabek. Proyek ini dibuat sebagai bagian dari portofolio pribadi saya untuk menunjukkan potensi penggunaan teknologi dalam menyelesaikan masalah lingkungan dan tata kota secara real-time.

Proyek ini menampilkan:
- **Peta interaktif**
- **Pencarian nama sungai**
- **Highlight sungai**
- **Filtering berdasarkan wilayah administratif**
- **Sidebar detail informasi sungai**
- **Layer kontrol**
- **Tombol reset view**
- **Atribusi dan copyright pribadi**

---

## 🧠 Tujuan & Konteks

Dibuat sebagai langkah awal saya menuju impian menjadi ... Proyek ini memadukan pemetaan geospasial dengan desain antarmuka web untuk menyelesaikan isu lingkungan secara data-driven dan transparan.

---

## 🧱 Tools yang Digunakan

- 🌍 **Leaflet.js** – Pustaka pemetaan ringan dan mobile-friendly
- 🧠 **Turf.js** – Operasi analisis geospasial client-side
- 🧾 **GeoJSON** – Format standar untuk data geografis
- 🖥️ **HTML, CSS, JavaScript** – Untuk tampilan dan logika interaktif
- 🧩 **QGIS** – Untuk preprocessing dan kurasi data geospasial
- 🐙 **Git & GitHub** – Version control dan deployment via GitHub Pages

---

## 📁 Struktur Proyek

river-app/
├── index.html # Tampilan utama peta
├── style.css # Styling responsif
├── main.js # Logika interaktif peta
├── river.geojson # Data jalur sungai Jabodetabek
├── IDN_adm_2_kabkota.json# Data batas wilayah kabupaten/kota
└── README.md # Deskripsi proyek ini


---

## ⚙️ Fitur Aplikasi

- ✅ **Pencarian Sungai**
  - Autocomplete pencarian
  - Zoom otomatis & highlight sungai

- ✅ **Filtering Wilayah Administratif**
  - Dropdown wilayah (Kab/Kota)
  - Sungai luar wilayah disamarkan

- ✅ **Sidebar Interaktif**
  - Info lengkap tiap sungai: panjang, kota dilalui, deskripsi

- ✅ **Kontrol Layer & Reset View**
  - Toggle layer Sungai & Batas Wilayah
  - Tombol untuk mengembalikan ke tampilan awal

- ✅ **Multi-highlight Sungai + Wilayah**
  - Bisa memilih wilayah dan sungai bersamaan

- ✅ **Copyright**
  - “© Lorenzo Calvin – RiverApp(2025) | All data protected.”

---

## 🛠️ Status Proyek

- ✅ Versi dasar sudah live & jalan
- ⚠️ Jalur sungai masih ada yang terputus di `river.geojson`
  - Solusi sementara: manual tracing via QGIS
  - Alternatif: penggabungan polyline otomatis dengan Python (`geopandas` + `linemerge`)

---

## 🌐 Live Demo

> 🔗 [Klik di sini untuk akses versi live](https://lrnz7.github.io/river-app/)

---

## 📜 Lisensi & Atribusi

Proyek ini **tidak open source bebas**. Jika ingin menggunakan atau memodifikasi data dan logika aplikasi, harap hubungi langsung saya, Lorenzo Calvin.

> “© Lorenzo Calvin – RiverApp | All data protected.”

---

## 📞 Kontak

📧 Email: lorenzocalvin7@gmail.com  
📍 Depok, Indonesia  
🏛️ Program Studi Sistem Informasi, Universitas Indraprasta PGRI Jakarta  

---

## 💡 Catatan Tambahan

- Proyek ini sedang dikembangkan lebih lanjut agar layak untuk pitching ke instansi terkait seperti:
  - Dinas Lingkungan Hidup
  - Dinas Tata Ruang
  - Badan Informasi Geospasial
- Semua data dan struktur sudah disederhanakan agar bisa digunakan secara efisien oleh publik maupun badan pemerintah.



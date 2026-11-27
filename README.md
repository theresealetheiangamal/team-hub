# 🚀 Team-Hub — All-in-One Team Collaboration Workspace

**Team-Hub** adalah aplikasi ruang kerja kolaborasi tim terpadu (*all-in-one workspace*) yang dirancang untuk menyederhanakan koordinasi harian, pendelegasian tugas terstruktur, rapat daring/luring, serta pencatatan notulensi dengan jejak riwayat permanen.

🔗 **Live Demo:** [https://pages.dev](https://pages.dev)

---

## ✨ Fitur Utama

* **📊 Beranda Ringkasan (*Overview Dashboard*):** Menampilkan statistik tugas aktif, tugas selesai, agenda rapat terdekat, serta pemantauan anggota tim binaan secara sekilas.
* **👥 Hierarki Peran *Leader & Member*:** Sistem registrasi mandiri yang menghubungkan *Member* langsung ke *Leader* pembimbingnya sehingga distribusi tugas dan notifikasi berjalan otomatis sesuai struktur tim.
* **📋 Manajemen Tugas & Delegasi Dokumen:**
  * Penugasan fleksibel untuk **Seluruh Tim Binaan** maupun **Personal (@Mention)**.
  * Mendukung perintah detail, tautan referensi eksternal, **unggah lampiran dokumen tugas** dari *Leader*, serta **unggah bukti hasil pengerjaan** dari *Member*.
  * Papan status interaktif (*To Do*, *In Progress*, *Done*) dengan notifikasi otomatis ke *Leader* saat tugas selesai.
* **💬 Obrolan Tim (*Team Messenger*):** Ruang komunikasi langsung dengan sinkronisasi *real-time* dan *auto-sync* untuk jaringan seluler maupun desktop, daftar anggota online, indikator mengetik, serta centang baca pada pesan.
* **📅 Kalender Agenda (Online & Offline) & Video Conference:**
  * Mendukung penjadwalan **Rapat Online** (terintegrasi ruang video rapat instan Jitsi Meet) maupun **Rapat Offline / Tatap Muka** lengkap dengan rincian lokasi/tempat.
* **📝 Notulensi dengan Jejak Riwayat Permanen (*Version History*):**
  * Editor catatan kolaboratif yang menyimpan salinan *snapshot* versi secara permanen setiap kali perubahan disimpan, lengkap dengan fitur pratinjau dan pemulihan versi (*Restore*) untuk menjaga akuntabilitas penelusuran arsip.
* **🗂️ History Aktivitas & Ekspor Laporan (.CSV):**
  * Pusat arsip seluruh tugas selesai beserta tautan unduhan dokumen hasil kerja dan riwayat rapat, dilengkapi fitur **Unduh Laporan (.CSV)** siap olah di Microsoft Excel / WPS Office.
* **📱 Responsif & Dukungan PWA:** Antarmuka *dark mode* modern yang menyesuaikan layar smartphone maupun desktop.

---

## 🛠️ Teknologi yang Digunakan (*Tech Stack*)

* **Frontend:** React, TypeScript, Vite, Tailwind CSS, Lucide Icons
* **Backend & Database:** Supabase (PostgreSQL, Authentication, Row Level Security, Realtime, Storage)
* **Video Conference:** Jitsi Meet Integration
* **Deployment & Hosting:** Cloudflare Pages (CI/CD otomatis dari GitHub)

### Pengaturan tanda baca pesan

Fitur centang baca memerlukan kolom `read_by` pada tabel `public.messages` dengan tipe `uuid[]`. Tambahkan kolom ini di Supabase jika belum tersedia:

```sql
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS read_by uuid[] NOT NULL DEFAULT '{}';
```

Pastikan juga kebijakan Row Level Security mengizinkan anggota workspace membaca dan memperbarui tanda baca pesan di kanal workspace mereka.

---

## ⚙️ Cara Menjalankan di Lokal (*Local Development*)

1. **Clone repositori ini:**
   ```bash
   git clone https://github.com
   cd team-hub
   ```

2. **Instal seluruh dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment Variables:**
   Buat file `.env` di folder utama (*root*) proyek dan masukkan kredensial Supabase Anda:
   ```env
   VITE_SUPABASE_URL=url_proyek_supabase_anda
   VITE_SUPABASE_ANON_KEY=kunci_anon_public_supabase_anda
   ```

4. **Jalankan server pengembangan:**
   ```bash
   npm run dev
   ```

---

## 📄 Lisensi & Pengembang

Dikembangkan oleh **Derry Ngamal Kulas** © 2026.

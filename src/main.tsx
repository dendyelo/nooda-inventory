// File: src/main.tsx (Versi Final dengan Penanganan Error)

import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';

import './index.css';

// Import komponen halaman kita
import LoginPage from './LoginPage';
import App from './App';

function Gatekeeper() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // State baru untuk menangani kesalahan saat pemeriksaan sesi
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Ambil sesi awal saat aplikasi dimuat, dengan penanganan error
    supabase.auth.getSession()
      .then(({ data: { session }, error: sessionError }) => {
        if (sessionError) throw sessionError; // Lemparkan error jika ada untuk ditangkap oleh .catch()
        setSession(session);
      })
      .catch((err: any) => {
        // Tangkap semua kemungkinan error (misal, koneksi gagal)
        console.error("Error during initial session fetch:", err);
        setError("Gagal memuat sesi pengguna. Silakan periksa koneksi internet Anda dan muat ulang halaman.");
      })
      .finally(() => {
        // Selalu hentikan loading, baik berhasil maupun gagal
        setLoading(false);
      });

    // "Dengarkan" perubahan status otentikasi (saat login atau logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Jika ada perubahan (misal, setelah login berhasil), hapus pesan error lama
      setError(null); 
    });

    // Berhenti "mendengarkan" saat komponen tidak lagi digunakan untuk mencegah memory leak
    return () => subscription.unsubscribe();
  }, []);

  // Prioritas #1: Tampilkan layar error jika ada masalah
  if (error) {
    return (
      <div className="fullscreen-centered-container error-layout">
        <h2 className="error-title">Koneksi Gagal</h2>
        <p className="error-message">{error}</p>
        <button 
          className="reload-button"
          onClick={() => window.location.reload()} 
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  // Prioritas #2: Tampilkan pesan loading saat sesi sedang diperiksa
  if (loading) {
    return <div className="fullscreen-centered-container">Memuat...</div>;
  }

  // Prioritas #3: Tentukan halaman mana yang akan ditampilkan
  // Jika tidak ada sesi (pengguna belum login), tampilkan halaman login
  if (!session) {
    return <LoginPage />;
  } 
  // Jika ada sesi (pengguna sudah login), tampilkan aplikasi inventaris
  else {
    return <App user={session.user} />;
  }
}

// Render komponen "Gatekeeper" sebagai titik masuk utama aplikasi
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gatekeeper />
  </StrictMode>,
);

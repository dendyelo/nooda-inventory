// File: src/main.tsx (Versi Final dengan Gatekeeper Manual)

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

  useEffect(() => {
    // Ambil sesi awal saat aplikasi dimuat
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // "Dengarkan" perubahan status otentikasi (saat login atau logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Berhenti "mendengarkan" saat komponen tidak lagi digunakan untuk mencegah memory leak
    return () => subscription.unsubscribe();
  }, []);

  // Tampilkan pesan loading saat sesi sedang diperiksa
  if (loading) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Memuat...</div>;
  }

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

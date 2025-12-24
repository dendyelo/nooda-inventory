// File: src/LoginPage.tsx (Versi Final 2.1 - Dengan Sinkronisasi Username ke Metadata)

import { useState } from 'react';
import { supabase } from './lib/supabaseClient';
import './LoginPage.css';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(''); 
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      // LANGKAH A & B: Terjemahkan username menjadi email
      const { data: emailData, error: rpcError } = await supabase.rpc('get_email_from_username', {
        p_username: username
      });

      if (rpcError || !emailData) {
        throw new Error("Username atau password salah.");
      }

      const email = emailData as string;

      // LANGKAH C: Lakukan login menggunakan email yang sudah didapat
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ 
        email: email,
        password: password 
      });

      if (signInError) {
        throw new Error("Username atau password salah.");
      }
      if (!signInData.user) {
        throw new Error("Login berhasil tetapi data pengguna tidak ditemukan.");
      }

      // ========================================================================
      //      LANGKAH D: (BARU & PENTING) SINKRONISASI USERNAME KE METADATA
      // ========================================================================
      // Setelah login berhasil, kita perbarui 'user_metadata' dengan username
      // yang digunakan untuk login. Ini memastikan App.tsx bisa membacanya.
      const { error: updateError } = await supabase.auth.updateUser({
        data: { username: username } // Simpan username yang diketik pengguna
      });

      // Jika gagal update, tidak apa-apa, aplikasi tetap berjalan.
      // Cukup catat sebagai peringatan di konsol untuk debugging.
      if (updateError) {
        console.warn("Peringatan: Gagal menyimpan username ke metadata:", updateError.message);
      }
      // ========================================================================

      // Jika semua berhasil, onAuthStateChange di main.tsx akan mengambil alih
      // dan me-refresh halaman secara otomatis.

    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Inventaris Nooda</h2>
        <p>Silakan masuk untuk melanjutkan</p>
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input 
              id="username" 
              type="text"
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input 
              id="password" 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
          {message && <p className="error-message">{message}</p>}
        </form>
      </div>
    </div>
  );
}

// File: src/LoginPage.tsx (Versi Final - Login dengan Username)

import { useState } from 'react';
import { supabase } from './lib/supabaseClient';
import './LoginPage.css';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  // Ganti state dari 'email' menjadi 'username'
  const [username, setUsername] = useState(''); 
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      // LANGKAH A & B: Terjemahkan username menjadi email
      // 1. Panggil fungsi 'get_email_from_username' yang baru kita buat
      const { data: emailData, error: rpcError } = await supabase.rpc('get_email_from_username', {
        p_username: username
      });

      // 2. Jika ada error saat memanggil fungsi atau username tidak ditemukan
      if (rpcError || !emailData) {
        throw new Error("Username atau password salah.");
      }

      const email = emailData as string;

      // LANGKAH C: Lakukan login menggunakan email yang sudah didapat
      const { error: signInError } = await supabase.auth.signInWithPassword({ 
        email: email, // Gunakan email yang kita dapatkan
        password: password 
      });

      // Jika ada error saat login (artinya password salah)
      if (signInError) {
        throw new Error("Username atau password salah.");
      }

      // Jika semua berhasil, onAuthStateChange di main.tsx akan mengambil alih

    } catch (error: any) {
      // Tangkap semua kemungkinan error dan tampilkan pesannya
      setMessage(error.message);
    } finally {
      // Pastikan loading selalu berhenti
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Inventaris Nooda</h2>
        <p>Silakan masuk untuk melanjutkan</p>
        <form onSubmit={handleLogin}>
          {/* Ubah input dari 'email' menjadi 'username' */}
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input 
              id="username" 
              type="text" // Ubah tipe menjadi 'text'
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

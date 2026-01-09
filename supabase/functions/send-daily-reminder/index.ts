// File: supabase/functions/send-daily-reminder/index.ts (Versi Tanpa Domain)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from 'npm:resend';

const resendApiKey = Deno.env.get('RESEND_API_KEY' );
if (!resendApiKey) {
  throw new Error("RESEND_API_KEY is not set in Supabase secrets.");
}

const resend = new Resend(resendApiKey);

// Ganti dengan email yang Anda gunakan untuk mendaftar di Resend
const YOUR_EMAIL_ADDRESS = 'dendyelo@gmail.com'; 
// Gunakan alamat pengirim default dari Resend
const SENDER_EMAIL_ADDRESS = 'onboarding@resend.dev'; 
// URL aplikasi Vercel Anda
const APP_URL = 'https://nooda-inventory.vercel.app/'; 

serve(async (req ) => {
  try {
    console.log("Fungsi pengingat harian dipicu.");

    const { data, error } = await resend.emails.send({
      from: `Nooda Inventaris <${SENDER_EMAIL_ADDRESS}>`,
      to: [YOUR_EMAIL_ADDRESS], // Hanya bisa mengirim ke email ini
      subject: '🔔 Pengingat: Sudah Catat Penjualan Hari Ini?',
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>Halo!</h2>
          <p>Ini adalah pengingat harian Anda untuk memastikan semua penjualan hari ini sudah tercatat di sistem.</p>
          <a 
            href="${APP_URL}" 
            style="display: inline-block; padding: 12px 20px; margin-top: 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;"
          >
            Buka Aplikasi Inventaris
          </a>
          <p style="margin-top: 25px; font-size: 0.9em; color: #888;">
            Ini adalah email otomatis. Anda akan menerima pengingat ini setiap hari pada jam 9 malam.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Gagal mengirim email:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log("Email pengingat berhasil dikirim:", data);
    return new Response(JSON.stringify({ message: "Email sent successfully" }), { status: 200 });

  } catch (err) {
    console.error("Terjadi kesalahan tak terduga:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

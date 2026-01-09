// File: supabase/functions/send-daily-reminder/index.ts (Versi 3.0 - Laporan Super Detail)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend';

// --- KONFIGURASI (Sudah disesuaikan dengan info Anda ) ---
const YOUR_EMAIL_ADDRESS = 'dendyelo@gmail.com';
const APP_URL = 'https://nooda-inventory.vercel.app/';
const TIMEZONE = 'Asia/Jakarta';
// --- AKHIR KONFIGURASI ---

const SENDER_EMAIL_ADDRESS = 'onboarding@resend.dev';

serve(async (req ) => {
  try {
    // Mengambil kredensial dari Supabase Secrets
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Satu atau lebih secret (RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) tidak ditemukan.");
    }

    // Inisialisasi klien
    const resend = new Resend(resendApiKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    console.log("Fungsi laporan harian super detail dipicu.");

    // Menentukan rentang waktu "hari ini"
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    const startOfDay = `${today}T00:00:00.000+07:00`;
    const endOfDay = `${today}T23:59:59.999+07:00`;

    // --- Kueri dan Pemrosesan Data ---

    // 1. Penjualan
    const { data: salesLogs, error: salesError } = await supabaseAdmin
      .from('activity_logs').select('details->sale_summary').eq('action_type', 'SALE')
      .gte('created_at', startOfDay).lte('created_at', endOfDay);
    if (salesError) throw salesError;
    const soldItemsList = salesLogs.flatMap(log => log.sale_summary || []);
    const totalItemsSold = soldItemsList.length;

    // 2. Produksi
    const { data: productionLogs, error: productionError } = await supabaseAdmin
      .from('activity_logs').select('details->production_summary').eq('action_type', 'PRODUCTION')
      .gte('created_at', startOfDay).lte('created_at', endOfDay);
    if (productionError) throw productionError;
    const producedItemsList = productionLogs.flatMap(log => log.production_summary || []);
    const totalItemsProduced = producedItemsList.reduce((sum, item) => sum + parseInt(item.split('x')[0].trim(), 10), 0);

    // 3. Stok Kritis
    const { data: criticalStockItems, error: stockError } = await supabaseAdmin.rpc('get_critical_stock_items');
    if (stockError) throw stockError;

    // --- Membangun Email HTML ---

    // Bagian Peringatan
    let warningHtml = '';
    const hasNoSales = totalItemsSold === 0;
    const hasCriticalStock = criticalStockItems.length > 0;
    if (hasNoSales || hasCriticalStock) {
      let warningTitle = hasNoSales && hasCriticalStock ? '🚨 PERINGATAN KRITIS!' : '⚠️ Perhatian!';
      let warningMessages = [];
      if (hasNoSales) warningMessages.push('Sepertinya belum ada aktivitas penjualan yang tercatat hari ini.');
      if (hasCriticalStock) warningMessages.push('Ada beberapa item yang stoknya mencapai batas kritis.');
      warningHtml = `<div style="padding: 15px; background-color: #fff3cd; border-left: 5px solid #ffeeba; margin-bottom: 20px;"><h3 style="margin-top: 0; color: #856404;">${warningTitle}</h3>${warningMessages.map(msg => `<p style="margin-bottom: 5px;">${msg}</p>`).join('')}</div>`;
    }

    // Bagian Detail Penjualan
    let salesDetailHtml = totalItemsSold > 0
      ? `<ul>${soldItemsList.map(item => `<li>${item}</li>`).join('')}</ul>`
      : '<p>Tidak ada penjualan hari ini.</p>';

    // Bagian Detail Produksi
    let productionDetailHtml = producedItemsList.length > 0
      ? `<ul>${producedItemsList.map(item => `<li>${item}</li>`).join('')}</ul>`
      : '<p>Tidak ada produksi hari ini.</p>';

    // Bagian Stok Kritis
    let criticalStockHtml = hasCriticalStock
      ? `<ul>${criticalStockItems.map(item => `<li>${item.name}: Sisa ${item.stock} (Batas: ${item.warning_limit})</li>`).join('')}</ul>`
      : '<p>Semua stok dalam batas aman. Kerja bagus!</p>';

    // Template Email Final
    const emailHtml = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2>Halo!</h2>
        ${warningHtml}
        <p>Berikut adalah laporan aktivitas inventaris untuk hari ini, <strong>${new Date().toLocaleDateString('id-ID', { timeZone: TIMEZONE, dateStyle: 'full' })}</strong>:</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        
        <h3>Total Penjualan: ${totalItemsSold} item</h3>
        ${salesDetailHtml}
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

        <h3>Total Produksi: ${totalItemsProduced} item</h3>
        ${productionDetailHtml}

        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

        <h3>Stok Kritis:</h3>
        ${criticalStockHtml}
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

        <a href="${APP_URL}" style="display: inline-block; padding: 12px 20px; margin-top: 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
          Buka Aplikasi Inventaris
        </a>
      </div>
    `;

    // Mengirim email
    const { data, error } = await resend.emails.send({
      from: `Nooda Inventaris <${SENDER_EMAIL_ADDRESS}>`,
      to: [YOUR_EMAIL_ADDRESS],
      subject: `🔔 Laporan Harian Inventaris - ${new Date().toLocaleDateString('id-ID', { timeZone: TIMEZONE })}`,
      html: emailHtml,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ message: "Daily summary email sent successfully" }), { status: 200 });

  } catch (err) {
    console.error("Terjadi kesalahan tak terduga:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

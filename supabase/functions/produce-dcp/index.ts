// File: supabase/functions/produce-dcp/index.ts (v2.0 - Dengan Validasi Stok)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log("Function 'produce-dcp' initialized." );

serve(async (req) => {
  // Handle preflight CORS request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Ambil productId dan quantity dari body request
    const { productId, quantity } = await req.json();
    if (!productId || !quantity || quantity <= 0) {
      throw new Error("Product ID dan kuantitas yang valid dibutuhkan.");
    }

    // 2. Buat koneksi ke Supabase dengan hak akses admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Ambil resep produksi untuk produk yang diminta, termasuk data komponen terkait
    const { data: recipe, error: recipeError } = await supabaseAdmin
      .from('product_components')
      .select('quantity_needed, components(id, name, stock)') // Ambil data dari tabel 'components' yang terhubung
      .eq('product_id', productId);

    if (recipeError) throw recipeError;
    if (!recipe || recipe.length === 0) {
      throw new Error(`Tidak ada resep produksi untuk produk dengan ID ${productId}.`);
    }

    // 4. Validasi stok semua komponen yang dibutuhkan SEBELUM melakukan update
    console.log(`Validating stock for production of ${quantity} units...`);
    for (const item of recipe) {
      if (!item.components) {
        throw new Error(`Data komponen tidak ditemukan untuk resep produk ID ${productId}. Periksa relasi tabel.`);
      }
      const requiredStock = item.quantity_needed * quantity;
      const availableStock = item.components.stock;
      
      console.log(`- Component: ${item.components.name}, Required: ${requiredStock}, Available: ${availableStock}`);
      
      if (availableStock < requiredStock) {
        // Jika ada satu saja komponen yang kurang, langsung hentikan proses dan kirim error
        throw new Error(`Stok tidak cukup untuk '${item.components.name}'. Dibutuhkan: ${requiredStock}, Tersedia: ${availableStock}`);
      }
    }
    console.log("Stock validation passed.");

    // 5. Jika semua stok cukup, siapkan semua promise untuk dieksekusi
    const updatePromises = [];

    // Promise untuk mengurangi stok setiap komponen
    for (const item of recipe) {
      const requiredStock = item.quantity_needed * quantity;
      const newStock = item.components.stock - requiredStock;
      updatePromises.push(
        supabaseAdmin.from('components').update({ stock: newStock }).eq('id', item.components.id)
      );
    }

    // Promise untuk menambah stok produk jadi menggunakan fungsi RPC
    updatePromises.push(
      supabaseAdmin.rpc('increment_product_stock', {
        p_id: productId,
        p_quantity: quantity
      })
    );

    // 6. Jalankan semua promise secara bersamaan
    console.log(`Executing ${updatePromises.length} updates...`);
    const results = await Promise.all(updatePromises);

    // Periksa apakah ada error dari salah satu promise
    const errors = results.map(res => res.error).filter(Boolean);
    if (errors.length > 0) {
      throw new Error(`Gagal memperbarui stok: ${errors.map(e => e.message).join(', ')}`);
    }

    console.log("Production successfully recorded.");
    return new Response(JSON.stringify({ message: `Produksi ${quantity} unit berhasil diselesaikan.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    // Tangkap semua error (baik dari validasi atau dari Supabase) dan kirim sebagai respons
    console.error("!!! Error in produce-dcp function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

// File: supabase/functions/produce-dcp/index.ts (Perbaikan Log)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req ) => {
  // Menangani preflight request untuk CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Membuat Supabase client dengan hak akses pengguna yang memanggil
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Mengambil data dari body request
    const { productId, quantity, userId, username, productionSummary, impactSummary } = await req.json();

    // Validasi input dasar
    if (!productId || !quantity || quantity <= 0) {
      throw new Error("ID Produk dan jumlah harus valid.");
    }
    if (!userId || !username) {
      throw new Error("Informasi pengguna tidak ditemukan.");
    }

    // 1. Tambah stok PRODUK JADI
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();

    if (productError) throw productError;

    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: product.stock + quantity })
      .eq('id', productId);

    if (updateError) throw updateError;

    // 2. Kurangi stok KOMPONEN
    const { data: recipe, error: recipeError } = await supabase
      .from('product_components')
      .select('component_id, quantity_needed')
      .eq('product_id', productId)
      .eq('process_type', 'PRODUCTION');

    if (recipeError) throw recipeError;

    for (const item of recipe) {
      const { data: component, error: componentError } = await supabase
        .from('components')
        .select('stock')
        .eq('id', item.component_id)
        .single();

      if (componentError) throw componentError;

      const needed = item.quantity_needed * quantity;
      if (component.stock < needed) {
        throw new Error(`Stok tidak mencukupi untuk komponen ID ${item.component_id}.`);
      }

      const { error: componentUpdateError } = await supabase
        .from('components')
        .update({ stock: component.stock - needed })
        .eq('id', item.component_id);

      if (componentUpdateError) throw componentUpdateError;
    }

    // ========================================================================
    //      PERUBAHAN LOGIKA DESKRIPSI LOG ADA DI SINI
    // ========================================================================
    const description = `Produksi ${quantity} item selesai.`;
    // ========================================================================

    const { error: logError } = await supabase.from('activity_logs').insert({
      action_type: 'PRODUCTION',
      description: description,
      user_id: userId,
      username: username,
      details: {
        production_summary: productionSummary,
        impact_summary: impactSummary,
      },
    });

    // Jika log gagal, jangan gagalkan seluruh proses, cukup catat di console server
    if (logError) {
      console.error(`PENTING: Produksi berhasil, tetapi gagal mencatat log: ${logError.message}`);
    }

    // Kirim respons sukses
    return new Response(JSON.stringify({ message: "Produksi berhasil" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // Menangkap semua error dan mengirim respons error
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

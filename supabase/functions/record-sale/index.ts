// File: supabase/functions/record-sale/index.ts (Perbaikan Log)

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
    const { items, userId, username, saleSummary, impactSummary } = await req.json();

    // Validasi input dasar
    if (!items || items.length === 0) throw new Error("Tidak ada item untuk dijual.");
    if (!userId || !username) throw new Error("Informasi pengguna tidak ditemukan.");

    // Melakukan serangkaian operasi. Jika salah satu gagal, blok catch akan menangkapnya.
    for (const item of items) {
      // Mengambil stok produk saat ini
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('stock')
        .eq('id', item.productId)
        .single();

      if (productError) throw new Error(`Gagal mengambil produk ID ${item.productId}: ${productError.message}`);
      if (product.stock < item.quantity) throw new Error(`Stok tidak mencukupi untuk produk ID ${item.productId}.`);

      // 1. Mengurangi stok PRODUK
      const { error: productUpdateError } = await supabase
        .from('products')
        .update({ stock: product.stock - item.quantity })
        .eq('id', item.productId);
      if (productUpdateError) throw productUpdateError;

      // 2. Mendapatkan resep penjualan untuk produk ini
      const { data: saleRecipe, error: recipeError } = await supabase
        .from('product_components')
        .select('component_id, quantity_needed')
        .eq('product_id', item.productId)
        .eq('process_type', 'SALE');
      
      if (recipeError) throw new Error(`Gagal mengambil resep untuk produk ID ${item.productId}: ${recipeError.message}`);

      // 3. Mengurangi stok KOMPONEN berdasarkan resep
      for (const recipeItem of saleRecipe) {
        // Mengambil stok komponen saat ini
        const { data: component, error: componentError } = await supabase
          .from('components')
          .select('stock')
          .eq('id', recipeItem.component_id)
          .single();
        
        if (componentError) throw new Error(`Gagal mengambil komponen ID ${recipeItem.component_id}: ${componentError.message}`);

        const neededQuantity = recipeItem.quantity_needed * item.quantity;
        if (component.stock < neededQuantity) throw new Error(`Stok tidak mencukupi untuk komponen ID ${recipeItem.component_id}.`);

        const { error: componentUpdateError } = await supabase
          .from('components')
          .update({ stock: component.stock - neededQuantity })
          .eq('id', recipeItem.component_id);
        if (componentUpdateError) throw componentUpdateError;
      }
    }

    // ========================================================================
    //      PERUBAHAN LOGIKA DESKRIPSI LOG ADA DI SINI
    // ========================================================================
    const totalQuantitySold = items.reduce((sum, item) => sum + item.quantity, 0);
    const description = `Penjualan ${totalQuantitySold} item dicatat.`;
    // ========================================================================

    const { error: logError } = await supabase.from('activity_logs').insert({
      action_type: 'SALE',
      description: description,
      user_id: userId,
      username: username,
      details: {
        sale_summary: saleSummary,
        impact_summary: impactSummary,
      },
    });

    // Jika log gagal, jangan gagalkan seluruh proses, cukup catat di console server
    if (logError) {
      console.error(`PENTING: Penjualan berhasil, tetapi gagal mencatat log: ${logError.message}`);
    }

    // Kirim respons sukses
    return new Response(JSON.stringify({ message: "Penjualan berhasil dicatat" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // Menangkap semua error (dari validasi, update, dll.) dan mengirim respons error
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

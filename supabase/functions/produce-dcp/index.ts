// File: supabase/functions/produce-dcp/index.ts (Versi 4.4 - Dengan User Logging)

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Fungsi helper untuk mendapatkan info pengguna dari token otentikasi
// (Ini bisa dipindahkan ke file _shared jika Anda mau, tapi di sini juga tidak apa-apa )
async function getUserInfo(supabaseClient: SupabaseClient) {
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    throw new Error("Pengguna tidak terotentikasi. Silakan login kembali.");
  }
  
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();
    
  if (profileError || !profile) {
    throw new Error(`Profil untuk pengguna dengan ID ${user.id} tidak ditemukan.`);
  }
  
  return { userId: user.id, username: profile.username };
}

Deno.serve(async (req) => {
  // Tangani preflight request untuk CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Buat Supabase client dengan menyertakan token otentikasi dari request
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Panggil fungsi helper untuk mendapatkan info pengguna di awal
    const { userId, username } = await getUserInfo(supabaseClient);

    // Ambil data produksi dari body request
    const { productId, quantity } = await req.json();
    if (!productId || !quantity || quantity <= 0) {
      throw new Error("ID Produk dan jumlah produksi harus valid.");
    }

    // Ambil data produk yang akan diproduksi
    const { data: product, error: productError } = await supabaseClient
      .from('products')
      .select('id, name, sku, stock')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      throw new Error(`Produk dengan ID ${productId} tidak ditemukan.`);
    }

    // Tentukan resep berdasarkan SKU produk (logika hardcoded)
    let componentsNeeded: { name: string; quantity: number }[] = [];
    if (product.sku === 'DCP-MINI') {
      componentsNeeded = [{ name: 'Botol Mini', quantity: 1 }];
    } else if (product.sku === 'DCP-CORE') {
      componentsNeeded = [{ name: 'Botol Core', quantity: 1 }];
    } else if (product.sku === 'DCP-PRO') {
      componentsNeeded = [
        { name: 'Botol Pro', quantity: 1 },
        { name: 'Seal Pro', quantity: 1 },
        { name: 'Sprayer Pro', quantity: 1 },
        { name: 'Tutup Botol Pro', quantity: 1 },
      ];
    } else {
      throw new Error(`Tidak ada resep produksi yang ditemukan untuk produk SKU: ${product.sku}`);
    }

    // Ambil data stok komponen yang relevan
    const componentNames = componentsNeeded.map(c => c.name);
    const { data: componentsData, error: componentsError } = await supabaseClient
      .from('components')
      .select('id, name, stock')
      .in('name', componentNames);

    if (componentsError) throw new Error("Gagal mengambil data komponen.");

    // Kumpulkan semua perubahan stok untuk log yang detail
    const stockImpacts: { name: string; initialStock: number; finalStock: number; type: 'PRODUCT' | 'COMPONENT' }[] = [];

    // 1. Validasi dan kurangi stok KOMPONEN MENTAH
    for (const recipeItem of componentsNeeded) {
      const component = componentsData.find(c => c.name === recipeItem.name);
      const totalNeeded = recipeItem.quantity * quantity;

      if (!component) throw new Error(`Komponen ${recipeItem.name} tidak ditemukan di database.`);
      if (component.stock < totalNeeded) {
        throw new Error(`Stok untuk ${component.name} tidak mencukupi (tersisa ${component.stock}, dibutuhkan ${totalNeeded}).`);
      }

      const newStock = component.stock - totalNeeded;
      const { error: updateError } = await supabaseClient.rpc('decrement_component_stock', {
        p_component_id: component.id,
        p_quantity_to_deduct: totalNeeded
      });
      if (updateError) throw updateError;

      stockImpacts.push({ name: component.name, initialStock: component.stock, finalStock: newStock, type: 'COMPONENT' });
    }

    // 2. Tambah stok PRODUK JADI
    const newProductStock = product.stock + quantity;
    const { error: incrementError } = await supabaseClient.rpc('increment_product_stock', {
      p_product_id: product.id,
      p_quantity_to_add: quantity
    });
    if (incrementError) throw incrementError;

    stockImpacts.push({ name: product.name, initialStock: product.stock, finalStock: newProductStock, type: 'PRODUCT' });

    // Buat deskripsi log yang detail
    const stockSummary = stockImpacts.map(si => 
      `  - ${si.name}: ${si.initialStock} -> ${si.finalStock}`
    ).join('\n');

    const description = `Produksi ${quantity}x ${product.name}.\n\nDampak Stok:\n${stockSummary}`;

    // Sisipkan log ke tabel activity_logs dengan menyertakan info pengguna
    await supabaseClient.from('activity_logs').insert({
      action_type: 'PRODUCTION_RUN',
      description: description,
      details: { product_id: productId, quantity_produced: quantity, stock_impact: stockImpacts },
      user_id: userId,     // <-- DATA BARU
      username: username   // <-- DATA BARU
    });

    // Kirim respons sukses
    return new Response(JSON.stringify({ message: 'Produksi berhasil diselesaikan!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // Tangani semua error yang mungkin terjadi
    console.error("Error in produce-dcp function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

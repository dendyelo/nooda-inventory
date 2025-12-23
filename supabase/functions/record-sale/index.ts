// File: supabase/functions/record-sale/index.ts (Versi 3.2 - Dengan User Logging)

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Fungsi helper untuk mendapatkan info pengguna dari token otentikasi
async function getUserInfo(supabaseClient: SupabaseClient ) {
  // 1. Ambil data pengguna dari sesi saat ini
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    throw new Error("Pengguna tidak terotentikasi. Silakan login kembali.");
  }
  
  // 2. Ambil profil pengguna dari tabel 'profiles' untuk mendapatkan username
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();
    
  // 3. Jika profil tidak ditemukan, berikan error yang jelas
  if (profileError || !profile) {
    throw new Error(`Profil untuk pengguna dengan ID ${user.id} tidak ditemukan.`);
  }
  
  // 4. Kembalikan data yang kita butuhkan
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

    // Ambil data penjualan dari body request
    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error("Data penjualan tidak valid atau kosong.");
    }

    // Ambil semua data yang relevan dalam beberapa panggilan efisien
    const productIds = items.map(item => item.productId);
    const [
      { data: productsData, error: productsError },
      { data: recipesData, error: recipesError },
      { data: componentsData, error: componentsError }
    ] = await Promise.all([
      supabaseClient.from('products').select('id, name, stock').in('id', productIds),
      supabaseClient.from('product_components').select('*').eq('process_type', 'SALE'),
      supabaseClient.from('components').select('id, name, stock')
    ]);

    if (productsError || recipesError || componentsError) {
      throw new Error("Gagal mengambil data produk atau resep dari database.");
    }

    // Kumpulkan semua perubahan stok dalam satu objek untuk log yang detail
    const stockImpacts: { name: string; initialStock: number; finalStock: number; type: 'PRODUCT' | 'COMPONENT' }[] = [];

    // 1. Kurangi stok PRODUK JADI
    for (const item of items) {
      const product = productsData.find(p => p.id === item.productId);
      if (!product) throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan.`);
      if (product.stock < item.quantity) {
        throw new Error(`Stok untuk ${product.name} tidak mencukupi (tersisa ${product.stock}, dibutuhkan ${item.quantity}).`);
      }
      
      const newStock = product.stock - item.quantity;
      const { error: updateError } = await supabaseClient.rpc('decrement_product_stock', {
        p_product_id: item.productId,
        p_quantity_to_deduct: item.quantity
      });
      if (updateError) throw updateError;

      stockImpacts.push({ name: product.name, initialStock: product.stock, finalStock: newStock, type: 'PRODUCT' });
    }

    // 2. Kurangi stok BAHAN PENGEMASAN
    const componentDeductions: { [key: number]: number } = {};
    for (const item of items) {
      const saleRecipe = recipesData.filter(r => r.product_id === item.productId);
      for (const recipeItem of saleRecipe) {
        componentDeductions[recipeItem.component_id] = (componentDeductions[recipeItem.component_id] || 0) + (recipeItem.quantity_needed * item.quantity);
      }
    }

    for (const [componentId, quantityToDeduct] of Object.entries(componentDeductions)) {
      const component = componentsData.find(c => c.id === Number(componentId));
      if (!component) throw new Error(`Komponen dengan ID ${componentId} tidak ditemukan.`);
      if (component.stock < quantityToDeduct) {
        throw new Error(`Stok untuk komponen ${component.name} tidak mencukupi.`);
      }

      const newStock = component.stock - quantityToDeduct;
      const { error: updateError } = await supabaseClient.rpc('decrement_component_stock', {
        p_component_id: Number(componentId),
        p_quantity_to_deduct: quantityToDeduct
      });
      if (updateError) throw updateError;

      stockImpacts.push({ name: component.name, initialStock: component.stock, finalStock: newStock, type: 'COMPONENT' });
    }

    // Buat deskripsi log yang detail
    const saleSummary = items.map(item => {
      const product = productsData.find(p => p.id === item.productId);
      return `${item.quantity}x ${product?.name || '?'}`;
    }).join(', ');

    const stockSummary = stockImpacts.map(si => 
      `  - ${si.name}: ${si.initialStock} -> ${si.finalStock}`
    ).join('\n');

    const description = `Penjualan untuk ${saleSummary}.\n\nDampak Stok:\n${stockSummary}`;

    // Sisipkan log ke tabel activity_logs dengan menyertakan info pengguna
    await supabaseClient.from('activity_logs').insert({
      action_type: 'SALE_RECORDED',
      description: description,
      details: { items_sold: items, stock_impact: stockImpacts },
      user_id: userId,     // <-- DATA BARU
      username: username   // <-- DATA BARU
    });

    // Kirim respons sukses
    return new Response(JSON.stringify({ message: 'Penjualan berhasil dicatat!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // Tangani semua error yang mungkin terjadi
    console.error("Error in record-sale function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

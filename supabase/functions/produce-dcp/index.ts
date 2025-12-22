// File: supabase/functions/produce-dcp/index.ts (v2.0 - Versi Stabil Sebelum Logging/Auth)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req ) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { productId, quantity } = await req.json();
    if (!productId || !quantity || quantity <= 0) {
      throw new Error("ID Produk dan kuantitas (harus > 0) dibutuhkan.");
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('name, sku')
      .eq('id', productId)
      .single();

    if (productError) throw new Error(`Produk dengan ID ${productId} tidak ditemukan.`);
    
    const { data: recipe, error: recipeError } = await adminClient
      .from('product_components')
      .select('component_id, quantity_needed, components(name, stock)')
      .eq('product_id', productId);

    if (recipeError) throw recipeError;
    if (!recipe || recipe.length === 0) {
      throw new Error(`Resep untuk produk ${product.name} tidak ditemukan.`);
    }

    // Validasi stok komponen
    for (const item of recipe) {
      if (!item.components) {
        throw new Error(`Data komponen untuk resep produk ${product.name} tidak lengkap.`);
      }
      const requiredStock = item.quantity_needed * quantity;
      if (item.components.stock < requiredStock) {
        throw new Error(`Stok komponen '${item.components.name}' tidak cukup. Dibutuhkan: ${requiredStock}, Tersedia: ${item.components.stock}`);
      }
    }

    // Jika validasi lolos, lakukan pengurangan stok komponen
    for (const item of recipe) {
      const newComponentStock = item.components!.stock - (item.quantity_needed * quantity);
      const { error: updateError } = await adminClient
        .from('components')
        .update({ stock: newComponentStock })
        .eq('id', item.component_id);
      
      if (updateError) throw updateError;
    }

    // Tambah stok produk jadi
    const { data: currentProduct } = await adminClient.from('products').select('stock').eq('id', productId).single();
    const newProductStock = currentProduct!.stock + quantity;
    await adminClient.from('products').update({ stock: newProductStock }).eq('id', productId);

    return new Response(JSON.stringify({ message: 'Produksi berhasil diselesaikan!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    console.error("!!! Error in produce-dcp function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

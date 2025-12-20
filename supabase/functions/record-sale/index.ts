// File: supabase/functions/record-sale/index.ts (v5.1 - Pengelompokan Error)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resep untuk komponen pelengkap yang ikut terjual bersama produk
const SALE_RECIPES = {
  'DCP-MINI': ['Dus Mini', 'Microfiber'],
  'DCP-CORE': ['Dus Core/Pro', 'Microfiber'],
  'DCP-PRO': ['Dus Core/Pro', 'Microfiber', 'Sprayer Pro'],
};

serve(async (req ) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Ambil dan sanitasi data input
    const { cart: rawCart } = await req.json();
    if (!rawCart || !Array.isArray(rawCart)) {
      throw new Error("Data keranjang (cart) tidak valid.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const cart = rawCart.map(item => ({
      productId: parseInt(item.productId, 10),
      quantity: parseInt(item.quantity, 10),
    })).filter(item => item.quantity > 0);

    if (cart.length === 0) {
      throw new Error("Tidak ada item untuk dijual (kuantitas > 0).");
    }

    const productIds = cart.map(item => item.productId);

    // 2. Ambil data SKU produk
    const { data: productsData, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, sku')
      .in('id', productIds);
    if (productsError) throw productsError;
    const productSkuMap = new Map(productsData.map(p => [p.id, p.sku]));

    // 3. Panggil RPC untuk mengambil semua level stok yang relevan dalam 1 kali jalan
    const { data: stockLevels, error: rpcError } = await supabaseAdmin
      .rpc('get_stock_levels', { product_ids: productIds });
    if (rpcError) throw rpcError;

    const stockMap = new Map(stockLevels.map(s => [s.item_type + '_' + (s.item_sku || s.item_name), s.stock_level]));

    // =================================================================
    // LOGIKA VALIDASI BARU: KELOMPOKKAN ERROR
    // =================================================================
    const productErrors: string[] = [];
    const componentErrors: string[] = [];

    // 4. Validasi stok produk jadi
    for (const item of cart) {
      const sku = productSkuMap.get(item.productId);
      if (!sku) {
        productErrors.push(`SKU untuk produk ID ${item.productId} tidak ditemukan.`);
        continue;
      }
      const availableStock = stockMap.get('PRODUCT_' + sku);
      if (availableStock === undefined || availableStock < item.quantity) {
        productErrors.push(`Stok ${sku} tidak cukup (Dibutuhkan: ${item.quantity}, Tersedia: ${availableStock ?? 0})`);
      }
    }

    // 5. Validasi stok komponen pelengkap
    const componentTotals = new Map<string, number>();
    for (const item of cart) {
      const sku = productSkuMap.get(item.productId);
      if (!sku) continue;
      const recipe = SALE_RECIPES[sku] || [];
      for (const compName of recipe) {
        componentTotals.set(compName, (componentTotals.get(compName) || 0) + item.quantity);
      }
    }
    for (const [name, totalNeeded] of componentTotals.entries()) {
      const availableStock = stockMap.get('COMPONENT_' + name);
      if (availableStock === undefined || availableStock < totalNeeded) {
        componentErrors.push(`Stok ${name} tidak cukup (Dibutuhkan: ${totalNeeded}, Tersedia: ${availableStock ?? 0})`);
      }
    }

    // 6. Periksa dan gabungkan error yang terkumpul
    if (productErrors.length > 0 || componentErrors.length > 0) {
      let combinedMessage = "";
      if (productErrors.length > 0) {
        combinedMessage += productErrors.join('\n');
      }
      if (productErrors.length > 0 && componentErrors.length > 0) {
        combinedMessage += '\n\n';
      }
      if (componentErrors.length > 0) {
        combinedMessage += componentErrors.join('\n');
      }
      throw new Error(combinedMessage);
    }
    // =================================================================
    // AKHIR DARI LOGIKA VALIDASI BARU
    // =================================================================

    // 7. Jika semua validasi lolos, eksekusi semua pembaruan database
    const updatePromises = [];

    // Kurangi stok produk jadi
    for (const item of cart) {
      const sku = productSkuMap.get(item.productId);
      const currentStock = stockMap.get('PRODUCT_' + sku);
      updatePromises.push(
        supabaseAdmin.from('products').update({ stock: currentStock - item.quantity }).eq('id', item.productId)
      );
    }

    // Kurangi stok komponen pelengkap
    for (const [name, totalNeeded] of componentTotals.entries()) {
      const currentStock = stockMap.get('COMPONENT_' + name);
      updatePromises.push(
        supabaseAdmin.from('components').update({ stock: currentStock - totalNeeded }).eq('name', name)
      );
    }

    const results = await Promise.all(updatePromises);
    const dbErrors = results.map(res => res.error).filter(Boolean);
    if (dbErrors.length > 0) {
      throw new Error(`Gagal memperbarui stok di database: ${dbErrors.map(e => e.message).join(', ')}`);
    }

    // 8. Kirim respons sukses
    return new Response(JSON.stringify({ message: "Penjualan berhasil dicatat." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    // Blok catch ini akan menangkap error gabungan dari validasi
    console.error("!!! Error in record-sale function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

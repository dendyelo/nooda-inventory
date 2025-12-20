// File: supabase/functions/record-sale/index.ts (v2 - LENGKAP & BENAR)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Definisikan resep PENJUALAN di sini dengan SKU yang benar
const SALE_RECIPES = {
  'DCP-MINI': ['Dus Mini', 'Microfiber'],
  'DCP-CORE': ['Dus Core/Pro', 'Microfiber'],
  'DCP-PRO': ['Dus Core/Pro', 'Microfiber', 'Sprayer Pro'],
};

serve(async (req ) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { productId, quantity } = await req.json();
    if (!productId || !quantity || quantity <= 0) throw new Error("Product ID and quantity are required.");

    // 1. Ambil data produk yang dijual (termasuk SKU dan stok saat ini)
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, sku, stock')
      .eq('id', productId)
      .single(); // .single() untuk mendapatkan satu objek, bukan array

    if (productError) throw productError;
    if (!product) throw new Error("Product not found.");

    // 2. Validasi stok produk jadi
    if (product.stock < quantity) {
      throw new Error(`Insufficient stock for ${product.sku}. Required: ${quantity}, Available: ${product.stock}`);
    }

    // 3. Dapatkan resep penjualan berdasarkan SKU
    const saleComponents = SALE_RECIPES[product.sku];
    if (!saleComponents) throw new Error(`No sale recipe for SKU ${product.sku}`);

    // 4. Ambil data stok komponen pelengkap
    const { data: components, error: componentsError } = await supabaseAdmin
      .from('components')
      .select('id, name, stock')
      .in('name', saleComponents);
    if (componentsError) throw componentsError;

    // 5. Validasi stok komponen pelengkap & siapkan promise update
    const updatePromises = [];
    for (const comp of components) {
      if (comp.stock < quantity) {
        throw new Error(`Insufficient stock for ${comp.name}. Required: ${quantity}, Available: ${comp.stock}`);
      }
      updatePromises.push(
        supabaseAdmin.from('components').update({ stock: comp.stock - quantity }).eq('id', comp.id)
      );
    }

    // 6. Tambahkan promise untuk mengurangi stok produk jadi itu sendiri
    updatePromises.push(
      supabaseAdmin.from('products').update({ stock: product.stock - quantity }).eq('id', product.id)
    );

    // 7. Jalankan semua update
    const results = await Promise.all(updatePromises);
    const errors = results.map(res => res.error).filter(Boolean);
    if (errors.length > 0) throw new Error(`Failed to update stock: ${errors.map(e => e.message).join(', ')}`);

    return new Response(JSON.stringify({ message: `Sale of ${quantity} ${product.sku} recorded.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

// File: supabase/functions/produce-dcp/index.ts (LENGKAP & BENAR)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req ) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { productId, quantity } = await req.json();
    if (!productId || !quantity || quantity <= 0) throw new Error("Product ID and quantity are required.");

    // 1. Ambil resep PRODUKSI dari database
    const { data: recipe, error: recipeError } = await supabaseAdmin
      .from('product_components')
      .select(`quantity_needed, components ( id, name, stock )`)
      .eq('product_id', productId);
    if (recipeError) throw recipeError;
    if (!recipe || recipe.length === 0) throw new Error("Production recipe not found.");

    // 2. Validasi stok bahan baku & siapkan promise update
    const componentUpdatePromises = [];
    for (const item of recipe) {
      const needed = item.quantity_needed * quantity;
      if (item.components.stock < needed) {
        throw new Error(`Insufficient stock for ${item.components.name}. Required: ${needed}, Available: ${item.components.stock}`);
      }
      componentUpdatePromises.push(
        supabaseAdmin.from('components').update({ stock: item.components.stock - needed }).eq('id', item.components.id)
      );
    }

    // 3. Ambil stok produk jadi saat ini
    const { data: product, error: productError } = await supabaseAdmin
      .from('products').select('stock').eq('id', productId).single();
    if (productError) throw productError;

    // 4. Siapkan promise untuk MENAMBAH stok produk jadi
    const productUpdatePromise = supabaseAdmin
      .from('products')
      .update({ stock: product.stock + quantity })
      .eq('id', productId);

    // 5. Jalankan semua promise (kurangi bahan baku, tambah produk jadi)
    const allPromises = [...componentUpdatePromises, productUpdatePromise];
    const results = await Promise.all(allPromises);
    const errors = results.map(res => res.error).filter(Boolean);
    if (errors.length > 0) throw new Error(`Failed to run production: ${errors.map(e => e.message).join(', ')}`);

    return new Response(JSON.stringify({ message: `Successfully produced ${quantity} units.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

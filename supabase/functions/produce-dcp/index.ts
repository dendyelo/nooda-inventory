// File: supabase/functions/produce-dcp/index.ts (Versi 5.3 - Menerima Detail dari Frontend)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req ) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // PERUBAHAN 1: Terima 'impactSummary' dari frontend
    const { productId, quantity, userId, username, impactSummary }: {
      productId: number,
      quantity: number,
      userId: string,
      username: string,
      impactSummary: string[]
    } = await req.json();

    if (!productId || !quantity || !userId || !username) {
      throw new Error("Data produksi, pengguna, atau ringkasan tidak lengkap.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // (Validasi dan pembaruan stok tetap sama seperti sebelumnya)
    const { data: product, error: productError } = await supabaseAdmin.from('products').select('id, name, stock').eq('id', productId).single();
    if (productError || !product) throw new Error("Produk tidak ditemukan.");
    const { data: recipe, error: recipeError } = await supabaseAdmin.from('product_components').select('component_id, quantity_needed, components(id, name, stock)').eq('product_id', productId).eq('process_type', 'PRODUCTION');
    if (recipeError) throw recipeError;
    for (const item of recipe) {
      const component = item.components;
      if (!component) throw new Error(`Komponen resep tidak lengkap.`);
      const needed = item.quantity_needed * quantity;
      if (component.stock < needed) throw new Error(`Stok tidak cukup untuk ${component.name}.`);
    }
    const componentUpdates = recipe.map(item => {
      const component = item.components!;
      const needed = item.quantity_needed * quantity;
      return supabaseAdmin.from('components').update({ stock: component.stock - needed }).eq('id', component.id);
    });
    const productUpdate = supabaseAdmin.from('products').update({ stock: product.stock + quantity }).eq('id', productId);
    const results = await Promise.all([...componentUpdates, productUpdate]);
    results.forEach(res => { if (res.error) throw res.error; });

    // Siapkan log
    const description = `Produksi ${quantity}x ${product.name} selesai.`;

    // PERUBAHAN 2: Gunakan ringkasan yang dikirim dari frontend untuk disimpan di 'details'
    await supabaseAdmin.from('activity_logs').insert({
      action_type: 'PRODUCTION',
      description: description,
      user_id: userId,
      username: username,
      details: { 
        production_summary: [`${quantity}x ${product.name}`],
        impact_summary: impactSummary 
      }
    });

    return new Response(JSON.stringify({ message: "Produksi berhasil" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

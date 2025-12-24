// File: supabase/functions/record-sale/index.ts (Versi 4.3 - Menerima Detail dari Frontend)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface SaleItem { productId: number; quantity: number; }

Deno.serve(async (req ) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // PERUBAHAN 1: Terima 'saleSummary' dan 'impactSummary' dari frontend
    const { items, userId, username, saleSummary, impactSummary }: { 
      items: SaleItem[], 
      userId: string, 
      username: string,
      saleSummary: string[],
      impactSummary: string[]
    } = await req.json();

    if (!items || items.length === 0 || !userId || !username) {
      throw new Error("Data penjualan, pengguna, atau ringkasan tidak lengkap.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // (Validasi dan pembaruan stok tetap sama seperti sebelumnya)
    const { data: products, error: productError } = await supabaseAdmin.from('products').select('id, name, stock').in('id', items.map(i => i.productId));
    if (productError) throw productError;
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) throw new Error(`Produk ID ${item.productId} tidak ditemukan.`);
      if (product.stock < item.quantity) throw new Error(`Stok tidak cukup untuk ${product.name}.`);
    }
    const productStockUpdates = items.map(item => {
      const product = products.find(p => p.id === item.productId)!;
      return supabaseAdmin.from('products').update({ stock: product.stock - item.quantity }).eq('id', item.productId);
    });
    const productResults = await Promise.all(productStockUpdates);
    productResults.forEach(res => { if (res.error) throw res.error; });

    // Siapkan log
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const description = `Penjualan ${totalItems} item dicatat.`;

    // PERUBAHAN 2: Gunakan ringkasan yang dikirim dari frontend untuk disimpan di 'details'
    await supabaseAdmin.from('activity_logs').insert({
      action_type: 'SALE',
      description: description,
      user_id: userId,
      username: username,
      details: { 
        sale_summary: saleSummary,
        impact_summary: impactSummary 
      } 
    });

    return new Response(JSON.stringify({ message: "Penjualan berhasil dicatat" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

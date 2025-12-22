import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Initializing record-sale function v3.1 (Detailed Log Description )");

Deno.serve(async (req) => {
  // Tangani preflight request untuk CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validasi data masuk
    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error("Data penjualan tidak valid atau kosong.");
    }

    // 2. Buat Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 3. Validasi stok PRODUK JADI dan kumpulkan data stok awal
    const productsToDecrement: { id: number; name: string; initialStock: number; quantityToDeduct: number; }[] = [];
    for (const item of items) {
      const { data: product, error } = await supabaseClient.from('products').select('id, name, stock').eq('id', item.productId).single();
      if (error || !product) {
        throw new Error(`Produk ID ${item.productId} tidak ditemukan.`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Stok tidak cukup untuk '${product.name}'. Tersedia: ${product.stock}, Diminta: ${item.quantity}`);
      }
      productsToDecrement.push({ id: product.id, name: product.name, initialStock: product.stock, quantityToDeduct: item.quantity });
    }

    // 4. Ambil resep PENJUALAN (bahan pengemasan) dan kumpulkan data stok awal
    const productIds = items.map(item => item.productId);
    const { data: saleRecipe, error: recipeError } = await supabaseClient
      .from('product_components')
      .select('*, components(id, name, stock, unit)')
      .in('product_id', productIds)
      .eq('process_type', 'SALE');
    if (recipeError) throw recipeError;

    const packagingToDecrement: { id: number; name: string; initialStock: number; unit: string; quantityToDeduct: number; }[] = [];
    for (const item of items) {
      const packagingItems = saleRecipe.filter(r => r.product_id === item.productId);
      for (const pack of packagingItems) {
        if (!pack.components) continue;
        const quantityToDeduct = pack.quantity_needed * item.quantity;
        if (pack.components.stock < quantityToDeduct) {
          throw new Error(`Stok tidak cukup untuk bahan pengemasan '${pack.components.name}'. Dibutuhkan: ${quantityToDeduct}, Tersedia: ${pack.components.stock}`);
        }
        // Hindari duplikasi jika bahan sama untuk produk berbeda (misal: Microfiber)
        const existingPack = packagingToDecrement.find(p => p.id === pack.components.id);
        if (existingPack) {
          existingPack.quantityToDeduct += quantityToDeduct;
        } else {
          packagingToDecrement.push({
            id: pack.components.id,
            name: pack.components.name,
            initialStock: pack.components.stock,
            unit: pack.components.unit,
            quantityToDeduct: quantityToDeduct
          });
        }
      }
    }

    // 5. Lakukan semua perubahan database
    // 5a. Kurangi stok PRODUK JADI
    for (const product of productsToDecrement) {
      const { error } = await supabaseClient.rpc('decrement_product_stock', { p_id: product.id, p_quantity_to_deduct: product.quantityToDeduct });
      if (error) throw new Error(`Gagal mengurangi stok produk '${product.name}': ${error.message}`);
    }
    // 5b. Kurangi stok BAHAN PENGEMASAN
    for (const pack of packagingToDecrement) {
      const { error } = await supabaseClient.rpc('decrement_component_stock', { p_component_id: pack.id, p_quantity_to_deduct: pack.quantityToDeduct });
      if (error) throw new Error(`Gagal mengurangi stok bahan pengemasan '${pack.name}': ${error.message}`);
    }

    // 6. Buat deskripsi log yang sangat detail
    const saleSummary = productsToDecrement.map(p => `${p.quantityToDeduct}x ${p.name}`).join(', ');
    let description = `Penjualan ${saleSummary} berhasil dicatat.\nDampak stok:\n`;

    for (const product of productsToDecrement) {
      description += `  - ${product.name} (Produk Jadi): ${product.initialStock} -> ${product.initialStock - product.quantityToDeduct}\n`;
    }
    for (const pack of packagingToDecrement) {
      description += `  - ${pack.name}: ${pack.initialStock} -> ${pack.initialStock - pack.quantityToDeduct} ${pack.unit}\n`;
    }

    // 7. Sisipkan log ke database
    await supabaseClient.from('activity_logs').insert({
      action_type: 'SALE_RECORDED',
      description: description,
      details: { items_sold: items }
    });

    // 8. Kirim respons sukses
    return new Response(JSON.stringify({ message: 'Penjualan berhasil dicatat!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error in record-sale function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

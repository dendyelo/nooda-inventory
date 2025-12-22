import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Initializing produce-dcp function v4.3 (NaN Bugfix )");

// Fungsi Pembantu untuk mengambil detail komponen.
async function getComponentDetails(supabase: any, name: string): Promise<{ id: number; stock: number; unit: string; }> {
  const { data, error } = await supabase.from('components').select('id, stock, unit').eq('name', name).single();
  if (error || !data) {
    throw new Error(`Komponen penting '${name}' tidak ditemukan di database.`);
  }
  return data;
}

Deno.serve(async (req) => {
  // Tangani preflight request untuk CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validasi data masuk
    const { productId, quantity } = await req.json();
    if (!productId || !quantity || quantity <= 0) {
      throw new Error("ID Produk dan jumlah (lebih dari 0) harus disertakan.");
    }

    // 2. Buat Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 3. Ambil data produk, termasuk stok awal untuk logging
    const { data: product, error: productError } = await supabaseClient.from('products').select('sku, name, stock').eq('id', productId).single();
    if (productError || !product) {
      throw new Error(`Produk dengan ID ${productId} tidak ditemukan.`);
    }
    const initialProductStock = product.stock;

    // 4. Bangun daftar komponen yang akan dikurangi, dengan data stok awal yang benar
    let componentsToDecrement: { id: number; name: string; initialStock: number; unit: string; quantityToDeduct: number; }[] = [];

    if (product.sku === 'DCP-MINI') {
      const details = await getComponentDetails(supabaseClient, 'Botol Mini');
      // Secara eksplisit petakan 'stock' dari 'details' ke 'initialStock'
      componentsToDecrement.push({ id: details.id, name: 'Botol Mini', initialStock: details.stock, unit: details.unit, quantityToDeduct: 1 * quantity });
    } else if (product.sku === 'DCP-CORE') {
      const details = await getComponentDetails(supabaseClient, 'Botol Core');
      // Secara eksplisit petakan 'stock' dari 'details' ke 'initialStock'
      componentsToDecrement.push({ id: details.id, name: 'Botol Core', initialStock: details.stock, unit: details.unit, quantityToDeduct: 1 * quantity });
    } else if (product.sku === 'DCP-PRO') {
      const botolDetails = await getComponentDetails(supabaseClient, 'Botol Pro');
      const sealDetails = await getComponentDetails(supabaseClient, 'Seal Pro');
      const sprayerDetails = await getComponentDetails(supabaseClient, 'Sprayer Pro');
      const tutupDetails = await getComponentDetails(supabaseClient, 'Tutup Botol Pro');
      componentsToDecrement.push(
        // Secara eksplisit petakan 'stock' dari setiap 'details' ke 'initialStock'
        { id: botolDetails.id, name: 'Botol Pro', initialStock: botolDetails.stock, unit: botolDetails.unit, quantityToDeduct: 1 * quantity },
        { id: sealDetails.id, name: 'Seal Pro', initialStock: sealDetails.stock, unit: sealDetails.unit, quantityToDeduct: 1 * quantity },
        { id: sprayerDetails.id, name: 'Sprayer Pro', initialStock: sprayerDetails.stock, unit: sprayerDetails.unit, quantityToDeduct: 1 * quantity },
        { id: tutupDetails.id, name: 'Tutup Botol Pro', initialStock: tutupDetails.stock, unit: tutupDetails.unit, quantityToDeduct: 1 * quantity }
      );
    } else {
      throw new Error(`Logika produksi untuk produk SKU '${product.sku}' tidak didefinisikan.`);
    }

    // 5. Validasi stok (sekarang akan berfungsi karena `initialStock` ada nilainya)
    for (const comp of componentsToDecrement) {
      if (comp.initialStock < comp.quantityToDeduct) {
        throw new Error(`Stok tidak cukup untuk komponen '${comp.name}'. Dibutuhkan: ${comp.quantityToDeduct}, Tersedia: ${comp.initialStock}`);
      }
    }

    // 6. Lakukan pengurangan stok komponen
    for (const comp of componentsToDecrement) {
      const { error: decrementError } = await supabaseClient.rpc('decrement_component_stock', {
        p_component_id: comp.id,
        p_quantity_to_deduct: comp.quantityToDeduct
      });
      if (decrementError) throw decrementError;
    }

    // 7. Lakukan penambahan stok produk jadi
    const { error: incrementError } = await supabaseClient.rpc('increment_product_stock', {
      p_id: productId,
      p_quantity: quantity
    });
    if (incrementError) throw incrementError;

    // 8. Buat deskripsi log yang sangat detail
    let description = `Produksi ${quantity}x ${product.name} selesai.\nDampak stok:\n`;
    description += `  - ${product.name} (Produk Jadi): ${initialProductStock} -> ${initialProductStock + quantity}\n`;
    for (const comp of componentsToDecrement) {
      description += `  - ${comp.name}: ${comp.initialStock} -> ${comp.initialStock - comp.quantityToDeduct} ${comp.unit}\n`;
    }

    // 9. Sisipkan log ke database
    await supabaseClient.from('activity_logs').insert({
      action_type: 'PRODUCTION_RUN',
      description: description,
      details: {
        product_id: productId,
        quantity_produced: quantity,
        initial_product_stock: initialProductStock,
        final_product_stock: initialProductStock + quantity,
        components_impact: componentsToDecrement.map(c => ({
          name: c.name,
          initial_stock: c.initialStock,
          final_stock: c.initialStock - c.quantityToDeduct,
          unit: c.unit
        }))
      }
    });

    // 10. Kirim respons sukses
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

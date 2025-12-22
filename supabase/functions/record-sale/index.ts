// File: supabase/functions/record-sale/index.ts (v5.1 - Versi Stabil Sebelum Logging/Auth)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Definisikan resep penjualan secara eksplisit di dalam kode
// Ini lebih cepat dan lebih aman daripada query tambahan ke database
const SALE_RECIPES: Record<string, string[]> = {
  'DCP-MINI': ['Dus Mini', 'Microfiber'],
  'DCP-CORE': ['Dus Core/Pro', 'Microfiber'],
  'DCP-PRO': ['Dus Core/Pro', 'Microfiber', 'Sprayer Pro'],
};

Deno.serve(async (req ) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { cart } = await req.json();
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      throw new Error("Data keranjang (cart) tidak valid atau kosong.");
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Ambil SKU dari semua produk yang ada di keranjang
    const productIds = cart.map(item => item.productId);
    const { data: products, error: productsError } = await adminClient
      .from('products')
      .select('id, name, sku, stock')
      .in('id', productIds);

    if (productsError) throw productsError;

    // Kumpulkan semua kebutuhan stok dalam satu tempat
    const stockRequirements: Record<string, { needed: number, available: number, type: 'PRODUCT' | 'COMPONENT' }> = {};
    const productErrors: string[] = [];
    const componentErrors: string[] = [];

    // 1. Validasi stok PRODUK JADI
    for (const item of cart) {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        productErrors.push(`Produk dengan ID ${item.productId} tidak ditemukan.`);
        continue;
      }
      if (product.stock < item.quantity) {
        productErrors.push(`Stok ${product.sku} tidak cukup. Dibutuhkan: ${item.quantity}, Tersedia: ${product.stock}`);
      }
    }

    // 2. Kumpulkan kebutuhan KOMPONEN PELENGKAP
    const allComponentNames: string[] = Object.values(SALE_RECIPES).flat();
    const { data: allComponents, error: componentsError } = await adminClient
      .from('components')
      .select('name, stock')
      .in('name', allComponentNames);

    if (componentsError) throw componentsError;
    const componentStockMap = new Map(allComponents.map(c => [c.name, c.stock]));

    for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        if (!product) continue;

        const recipe = SALE_RECIPES[product.sku];
        if (recipe) {
            for (const componentName of recipe) {
                if (!stockRequirements[componentName]) {
                    stockRequirements[componentName] = { needed: 0, available: componentStockMap.get(componentName) ?? 0, type: 'COMPONENT' };
                }
                stockRequirements[componentName].needed += item.quantity;
            }
        }
    }

    // 3. Validasi stok KOMPONEN PELENGKAP
    for (const [name, req] of Object.entries(stockRequirements)) {
        if (req.available < req.needed) {
            componentErrors.push(`Stok komponen '${name}' tidak cukup. Dibutuhkan: ${req.needed}, Tersedia: ${req.available}`);
        }
    }
    
    // 4. Jika ada error, gabungkan dan lempar
    const allErrors = [...productErrors, ...componentErrors];
    if (allErrors.length > 0) {
      // Tambahkan spasi jika ada kedua jenis error
      if (productErrors.length > 0 && componentErrors.length > 0) {
        const middleIndex = productErrors.length;
        allErrors.splice(middleIndex, 0, ''); // Sisipkan baris kosong
      }
      throw new Error(allErrors.join('\n'));
    }

    // 5. Jika semua validasi lolos, lakukan transaksi
    for (const item of cart) {
      const product = products.find(p => p.id === item.productId)!;
      const newProductStock = product.stock - item.quantity;
      await adminClient.from('products').update({ stock: newProductStock }).eq('id', item.productId);
    }
    for (const [name, req] of Object.entries(stockRequirements)) {
      const newComponentStock = req.available - req.needed;
      await adminClient.from('components').update({ stock: newComponentStock }).eq('name', name);
    }

    return new Response(JSON.stringify({ message: 'Penjualan berhasil dicatat!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    console.error("!!! Error in record-sale function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

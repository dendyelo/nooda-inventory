// File: src/App.tsx (Versi 7.5.0 - Konfigurasi Batas Peringatan)

import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from './lib/supabaseClient';
import type { User, PostgrestError } from '@supabase/supabase-js';
import './App.css';

// Tipe Data
type Product = { id: number; name: string; sku: string; stock: number; category_id: number | null; sort_order: number; };
type Component = { id: number; name: string; stock: number; unit: string; };
type Category = { id: number; name: string; };
type ProductComponent = { product_id: number; component_id: number; quantity_needed: number; process_type: 'PRODUCTION' | 'SALE'; };
type ActivityLog = { id: number; created_at: string; description: string; username: string | null; details: { sale_summary?: string[]; production_summary?: string[]; impact_summary?: string[]; } | null; };

// ========================================================================
//      KONFIGURASI BATAS STOK PERINGATAN
// ========================================================================
// Daftar item dengan batas peringatan khusus. Tambahkan nama komponen di sini.
const SPECIAL_WARNING_ITEMS = [
  'Buble Warp', 
  'Lakban Bening', 
  'Lakban Fragile',
  'Air Murni'
];
// Batas stok default untuk peringatan (warna kuning).
const DEFAULT_WARNING_LIMIT = 20;
// Batas stok khusus untuk item dalam daftar di atas.
const SPECIAL_WARNING_LIMIT = 2;
// ========================================================================

const getStockRowClass = (stock: number, name: string): string => {
  // Logika sekarang merujuk ke konstanta konfigurasi di atas.
  const warningLimit = SPECIAL_WARNING_ITEMS.includes(name) 
    ? SPECIAL_WARNING_LIMIT 
    : DEFAULT_WARNING_LIMIT;

  if (stock === 0) return 'stock-danger';
  if (stock < warningLimit) return 'stock-warning';
  return '';
};

type SaleQuantities = { [productId: number]: number; };
type AppProps = { user: User; };

export default function App({ user }: AppProps) {
  const APP_VERSION = "v7.5.0";

  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productComponents, setProductComponents] = useState<ProductComponent[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saleQuantities, setSaleQuantities] = useState<SaleQuantities>({});
  const [prodProductId, setProdProductId] = useState<string>('');
  const [prodQuantity, setProdQuantity] = useState<string>('');

  const username = user.user_metadata.username || user.email;

  const fetchData = async () => {
    try {
      const [compRes, prodRes, catRes, pcRes, logRes] = await Promise.all([
        supabase.from('components').select('*').order('name'),
        supabase.from('products').select('*').order('sort_order', { ascending: true }),
        supabase.from('categories').select('*').order('name'),
        supabase.from('product_components').select('*'),
        supabase.from('activity_logs').select('id, created_at, description, username, details').order('created_at', { ascending: false }).limit(20)
      ]);
      
      const errors: PostgrestError[] = [compRes.error, prodRes.error, catRes.error, pcRes.error, logRes.error].filter((e): e is PostgrestError => e !== null);
      if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));

      setComponents(compRes.data || []);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setProductComponents(pcRes.data || []);
      setActivityLogs(logRes.data || []);

      if (prodRes.data?.length && !prodProductId) setProdProductId(prodRes.data[0].id.toString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); fetchData(); }, []);

  const invokeFunction = async (name: 'record-sale' | 'produce-dcp', body: object): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke(name, { body: { ...body, userId: user.id, username: username } });
      if (error) throw error;
      return true;
    } catch (caughtError: any) {
      let errorMessage = "Terjadi kesalahan.";
      if (caughtError.context?.json) {
        try { errorMessage = (await caughtError.context.json()).error || errorMessage; } catch {}
      } else if (caughtError.message) { errorMessage = caughtError.message; }
      alert(`GAGAL:\n${errorMessage}`);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const quantity = parseInt(prodQuantity, 10);
    const productId = parseInt(prodProductId, 10);
    if (isNaN(productId) || isNaN(quantity) || quantity <= 0) { alert("Harap pilih produk dan masukkan jumlah produksi yang valid."); return; }
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const recipe = productComponents.filter(pc => pc.product_id === productId && pc.process_type === 'PRODUCTION');
    if (recipe.length === 0) { alert(`Tidak ada resep produksi yang ditemukan untuk ${product.name}.`); return; }
    
    const impactLines = recipe.map(item => {
      const component = components.find(c => c.id === item.component_id);
      if (!component) return `- Komponen ID ${item.component_id} tidak ditemukan`;
      const needed = item.quantity_needed * quantity;
      return `- ${component.name}: ${component.stock} -> ${component.stock - needed}`;
    });

    const confirmationMessage = `Anda akan memproduksi:\n\n${quantity}x ${product.name}\n\n[DAMPAK PADA STOK]\n${impactLines.join('\n')}\n\nLanjutkan?`;
    
    if (window.confirm(confirmationMessage)) {
      const success = await invokeFunction('produce-dcp', { productId, quantity, impactSummary: impactLines });
      if (success) { alert('Produksi berhasil diselesaikan!'); setProdQuantity(''); await fetchData(); }
    }
  };

  const handleSaleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const itemsToSell = Object.entries(saleQuantities).map(([pId, q]) => ({ productId: parseInt(pId), quantity: q })).filter(item => item.quantity > 0);
    if (itemsToSell.length === 0) { alert("Tidak ada produk untuk dijual."); return; }

    const impactMap: { [key: string]: { name: string; oldStock: number; change: number; } } = {};
    const saleSummaryLines: string[] = [];

    for (const item of itemsToSell) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;
      saleSummaryLines.push(`${item.quantity}x ${product.name}`);
      const productKey = `product-${product.id}`;
      if (!impactMap[productKey]) impactMap[productKey] = { name: product.name, oldStock: product.stock, change: 0 };
      impactMap[productKey].change -= item.quantity;
      const saleRecipe = productComponents.filter(pc => pc.product_id === item.productId && pc.process_type === 'SALE');
      for (const recipeItem of saleRecipe) {
        const component = components.find(c => c.id === recipeItem.component_id);
        if (!component) continue;
        const componentKey = `component-${component.id}`;
        if (!impactMap[componentKey]) impactMap[componentKey] = { name: component.name, oldStock: component.stock, change: 0 };
        impactMap[componentKey].change -= recipeItem.quantity_needed * item.quantity;
      }
    }

    const impactLines: string[] = [];
    for (const key in impactMap) {
      const { name, oldStock, change } = impactMap[key];
      impactLines.push(`- ${name}: ${oldStock} -> ${oldStock + change}`);
    }

    const confirmationMessage = `Anda akan mencatat penjualan:\n\n[BARANG TERJUAL]\n${saleSummaryLines.join('\n')}\n\n[DAMPAK PADA STOK]\n${impactLines.join('\n')}\n\nLanjutkan?`.trim().replace(/^\s+/gm, '');

    if (window.confirm(confirmationMessage)) {
      const success = await invokeFunction('record-sale', { items: itemsToSell, saleSummary: saleSummaryLines, impactSummary: impactLines });
      if (success) { alert('Penjualan berhasil dicatat!'); setSaleQuantities({}); await fetchData(); }
    }
  };

  const handleModifyComponentStock = async (component: Component, action: 'add' | 'subtract') => {
    const amountStr = window.prompt(`Masukkan jumlah untuk ${action === 'add' ? 'DITAMBAH' : 'DIKURANGI'}:\n${component.name}`, "0");
    if (amountStr === null) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) { alert("Harap masukkan angka positif yang valid."); return; }
    if (action === 'subtract' && amount > component.stock) { alert(`GAGAL: Stok tidak mencukupi.`); return; }
    const newStock = action === 'add' ? component.stock + amount : component.stock - amount;
    if (!window.confirm(`Ubah stok ${component.name} dari ${component.stock} menjadi ${newStock}?`)) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('components').update({ stock: newStock }).eq('id', component.id);
      if (error) throw error;
      const description = `Stok ${component.name} diubah dari ${component.stock} ${component.unit} menjadi ${newStock} ${component.unit}.`;
      await supabase.from('activity_logs').insert({ action_type: 'STOCK_ADJUSTMENT', description, user_id: user.id, username });
      alert("Stok berhasil diperbarui!");
      await fetchData();
    } catch (err: any) {
      alert(`GAGAL:\n${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuantityChange = (productId: number, quantityStr: string) => {
    const quantity = parseInt(quantityStr, 10);
    setSaleQuantities(prev => ({ ...prev, [productId]: isNaN(quantity) ? 0 : Math.max(0, quantity) }));
  };

  if (loading) return <div>Memuat data...</div>;
  if (error) return <div>Terjadi Kesalahan: {error}</div>;

  return (
    <div className="App">
      <div className="user-bar"><span>Login sebagai: <strong>{username}</strong></span><button className="logout-button" onClick={() => supabase.auth.signOut()}>Logout</button></div>
      <h1>Inventaris Nooda</h1>
      
      <div className="section-container">
        <h2>Produk Jadi & Penjualan</h2>
        <table className="stock-table">
          <thead><tr><th>Produk</th><th>SKU</th><th>Stok</th></tr></thead>
          <tbody>
            {categories.map(category => (<>
              <tr key={`cat-header-${category.id}`} className="category-header"><td colSpan={3}>{category.name}</td></tr>
              {products.filter(p => p.category_id === category.id).map(p => (
                <tr key={p.id} className={getStockRowClass(p.stock, p.name)} onTouchStart={() => {}}>
                  <td data-label="Produk">{p.name}</td><td data-label="SKU">{p.sku}</td><td data-label="Stok">{p.stock}</td>
                </tr>
              ))}
            </>))}
          </tbody>
        </table>
        <div className="form-panel sale-panel">
          <h3>Catat Penjualan</h3>
          <form onSubmit={handleSaleSubmit}>
            <table className="sale-input-table stock-table">
              <thead><tr><th>Produk</th><th>Jumlah</th></tr></thead>
              <tbody>
                {categories.map(category => (<>
                  <tr key={`cat-sale-header-${category.id}`} className="category-header"><td colSpan={2}>{category.name}</td></tr>
                  {products.filter(p => p.category_id === category.id).map(product => (
                    <tr key={product.id} onTouchStart={() => {}}>
                      <td data-label="Produk">{product.name}</td>
                      <td data-label="Jumlah"><input type="number" min="0" value={saleQuantities[product.id] || ''} placeholder="0" onChange={(e) => handleQuantityChange(product.id, e.target.value)} className="quantity-input" /></td>
                    </tr>
                  ))}
                </>))}
              </tbody>
            </table>
            <button type="submit" disabled={isSubmitting} className="submit-sale-btn">{isSubmitting ? 'Memproses...' : 'Catat Penjualan'}</button>
          </form>
        </div>
      </div>
      
      <div className="section-container">
        <h2>Bahan Baku</h2>
        <table className="stock-table">
          <thead><tr><th>Komponen</th><th>Stok</th><th>Satuan</th><th>Aksi</th></tr></thead>
          <tbody>
            {components.map(c => (
              <tr key={c.id} className={getStockRowClass(c.stock, c.name)} onTouchStart={() => {}}>
                <td data-label="Komponen">{c.name}</td><td data-label="Stok">{c.stock}</td><td data-label="Satuan">{c.unit}</td>
                <td className="action-cell" data-label="Aksi">
                  <button className="modify-stock-btn subtract" onClick={() => handleModifyComponentStock(c, 'subtract')} disabled={isSubmitting || c.stock === 0}>-</button>
                  <button className="modify-stock-btn add" onClick={() => handleModifyComponentStock(c, 'add')} disabled={isSubmitting}>+</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="section-container">
        <h2>Jalankan Produksi</h2>
        <div className="form-panel production-panel">
          <form onSubmit={handleProductionSubmit}>
            <select value={prodProductId} onChange={(e) => setProdProductId(e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input type="number" value={prodQuantity} placeholder="0" onChange={(e) => setProdQuantity(e.target.value)} min="1" />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : 'Produksi'}</button>
          </form>
        </div>
      </div>
      
      <div className="section-container">
        <h2>Log Aktivitas Terbaru</h2>
        <div className="log-table-container">
          <table className="stock-table log-table">
            <thead><tr><th style={{ width: '200px' }}>Waktu</th><th>Aksi</th><th>Pengguna</th></tr></thead>
            <tbody>
              {activityLogs.length > 0 ? (activityLogs.map(log => (
                <tr key={log.id} onTouchStart={() => {}}>
                  <td data-label="Waktu">{new Date(log.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td data-label="Aksi" style={{ whiteSpace: 'pre-wrap' }}>
                    {log.description}
                    {log.details && (
                      <small className="log-details">
                        {log.details.sale_summary && (
                          <>
                            <strong>Barang Terjual:</strong>
                            {log.details.sale_summary.map((d, i) => <span key={`s${i}`}>{d}</span>)}
                          </>
                        )}
                        {log.details.production_summary && (
                          <>
                            <strong>Hasil Produksi:</strong>
                            {log.details.production_summary.map((d, i) => <span key={`p${i}`}>{d}</span>)}
                          </>
                        )}
                        {log.details.impact_summary && (
                          <>
                            <strong>Dampak Stok:</strong>
                            {log.details.impact_summary.map((d, i) => <span key={`i${i}`}>{d}</span>)}
                          </>
                        )}
                      </small>
                    )}
                  </td>
                  <td data-label="Pengguna">{log.username || 'Sistem'}</td>
                </tr>
              ))) : (<tr><td colSpan={3}>Belum ada aktivitas.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
      
      <footer className="app-footer">Aplikasi Inventaris Nooda | Versi: {APP_VERSION}</footer>
    </div>
  );
}

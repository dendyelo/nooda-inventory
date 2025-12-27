// File: src/App.tsx (Versi 8.0.1 - Final Clean-up)

import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from './lib/supabaseClient';
import type { User, PostgrestError } from '@supabase/supabase-js';
import './App.css';

// Tipe Data
type StockItem = { name: string; warning_limit: number | null; };
type Product = StockItem & { id: number; sku: string; stock: number; category_id: number | null; sort_order: number; };
type Component = StockItem & { id: number; stock: number; unit: string; };
type Category = { id: number; name: string; };
type ActivityLog = { id: number; created_at: string; description: string; username: string | null; details: { sale_summary?: string[]; production_summary?: string[]; impact_summary?: string[]; } | null; };

const getStockRowClass = (stock: number, item: StockItem): string => {
  const warningLimit = item.warning_limit;
  if (stock === 0) return 'stock-danger';
  if (warningLimit !== null && stock < warningLimit) return 'stock-warning';
  return '';
};

type SaleQuantities = { [productId: number]: number; };
type AppProps = { user: User; };

export default function App({ user }: AppProps) {
  const APP_VERSION = "v8.0.1";

  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
      // Panggilan ke 'product_components' telah dihapus dari sini untuk efisiensi.
      const [compRes, prodRes, catRes, logRes] = await Promise.all([
        supabase.from('components').select('*').order('name'),
        supabase.from('products').select('*').order('sort_order', { ascending: true }),
        supabase.from('categories').select('*').order('name'),
        supabase.from('activity_logs').select('id, created_at, description, username, details').order('created_at', { ascending: false }).limit(20)
      ]);
      
      const errors: PostgrestError[] = [compRes.error, prodRes.error, catRes.error, logRes.error].filter((e): e is PostgrestError => e !== null);
      if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));

      setComponents(compRes.data || []);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setActivityLogs(logRes.data || []);
      
      if (prodRes.data?.length && !prodProductId) setProdProductId(prodRes.data[0].id.toString());
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
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
      if (caughtError.context?.json) { try { errorMessage = (await caughtError.context.json()).error || errorMessage; } catch {} }
      else if (caughtError.message) { errorMessage = caughtError.message; }
      alert(`GAGAL:\n${errorMessage}`);
      return false;
    } finally { setIsSubmitting(false); }
  };

  const handleProductionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const quantity = parseInt(prodQuantity, 10);
    const productId = parseInt(prodProductId, 10);
    if (isNaN(productId) || isNaN(quantity) || quantity <= 0) {
      alert("Harap pilih produk dan masukkan jumlah produksi yang valid.");
      setIsSubmitting(false);
      return;
    }
    try {
      const { data: previewData, error: rpcError } = await supabase.rpc('get_production_impact_preview', { p_product_id: productId, p_quantity: quantity });
      if (rpcError) throw rpcError;
      const { production_summary, impact_summary } = previewData;
      if (impact_summary.length === 0) {
        alert(`Tidak ada resep produksi yang ditemukan untuk produk ini.`);
        setIsSubmitting(false);
        return;
      }
      const confirmationMessage = `Anda akan memproduksi:\n\n${production_summary}\n\n[DAMPAK PADA STOK]\n${impact_summary.join('\n')}\n\nLanjutkan?`;
      if (window.confirm(confirmationMessage)) {
        const success = await invokeFunction('produce-dcp', { productId, quantity, productionSummary: [production_summary], impactSummary: impact_summary });
        if (success) {
          alert('Produksi berhasil diselesaikan!');
          setProdQuantity('');
          await fetchData();
        }
      } else {
        setIsSubmitting(false); // Pastikan tombol tidak terkunci jika dibatalkan
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan saat memproses produksi:\n${err.message}`);
      setIsSubmitting(false);
    }
  };

  const handleSaleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const itemsForEdgeFunction = Object.entries(saleQuantities).map(([productId, quantity]) => ({ productId: parseInt(productId, 10), quantity })).filter(item => item.quantity > 0);
    if (itemsForEdgeFunction.length === 0) {
      alert("Tidak ada produk untuk dijual.");
      setIsSubmitting(false);
      return;
    }
    const itemsForRpc = itemsForEdgeFunction.map(item => ({ product_id: item.productId, quantity: item.quantity }));
    try {
      const { data: previewData, error: rpcError } = await supabase.rpc('get_sale_impact_preview', { items_to_sell: itemsForRpc });
      if (rpcError) throw rpcError;
      const { sale_summary, impact_summary } = previewData;
      const confirmationMessage = `Anda akan mencatat penjualan:\n\n[BARANG TERJUAL]\n${sale_summary.join('\n')}\n\n[DAMPAK PADA STOK]\n${impact_summary.join('\n')}\n\nLanjutkan?`;
      if (window.confirm(confirmationMessage)) {
        const success = await invokeFunction('record-sale', { items: itemsForEdgeFunction, saleSummary: sale_summary, impactSummary: impact_summary });
        if (success) {
          alert('Penjualan berhasil dicatat!');
          setSaleQuantities({});
          await fetchData();
        }
      } else {
        setIsSubmitting(false); // Pastikan tombol tidak terkunci jika dibatalkan
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan saat memproses penjualan:\n${err.message}`);
      setIsSubmitting(false);
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
    } catch (err: any) { alert(`GAGAL:\n${err.message}`); } finally { setIsSubmitting(false); }
  };

  const handleQuantityChange = (productId: number, quantityStr: string) => {
    const quantity = parseInt(quantityStr, 10);
    setSaleQuantities(prev => ({ ...prev, [productId]: isNaN(quantity) ? 0 : Math.max(0, quantity) }));
  };

  if (loading) {
    return <div className="fullscreen-centered-container">Memuat...</div>;
  }

  if (error) {
    // Gabungkan dua kelas untuk mendapatkan tata letak yang benar
    return (
      <div className="fullscreen-centered-container error-layout">
        <h2 className="error-title">Terjadi Kesalahan</h2>
        <p className="error-message">{error}</p>
        <button 
          className="reload-button"
          onClick={() => window.location.reload()} 
        >
          Muat Ulang Halaman
        </button>
      </div>
    );
  }

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
                <tr key={p.id} className={getStockRowClass(p.stock, p)} onTouchStart={() => {}}>
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
              <tr key={c.id} className={getStockRowClass(c.stock, c)} onTouchStart={() => {}}>
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
                        {log.details.sale_summary && (<><strong>Barang Terjual:</strong>{log.details.sale_summary.map((d, i) => <span key={`s${i}`}>{d}</span>)}</>)}
                        {log.details.production_summary && (<><strong>Hasil Produksi:</strong>{log.details.production_summary.map((d, i) => <span key={`p${i}`}>{d}</span>)}</>)}
                        {log.details.impact_summary && (<><strong>Dampak Stok:</strong>{log.details.impact_summary.map((d, i) => <span key={`i${i}`}>{d}</span>)}</>)}
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

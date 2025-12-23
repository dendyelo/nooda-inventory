// File: src/App.tsx (Versi 5.22 - Perbaikan Dialog Konfirmasi)

import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from './lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import './App.css';

// Tipe Data
type Product = { id: number; name: string; sku: string; stock: number; };
type Component = { id: number; name: string; stock: number; unit: string; };
type ActivityLog = { id: number; created_at: string; description: string; username: string | null; };
type Profile = { id: string; username: string; };
type ProductComponent = { product_id: number; component_id: number; quantity_needed: number; process_type: 'PRODUCTION' | 'SALE'; }; // Tipe dikembalikan

type SaleQuantities = { [productId: number]: number; };

// Definisikan tipe untuk props komponen App
interface AppProps {
  user: User;
}

export default function App({ user }: AppProps) {
  const APP_VERSION = "v5.22";

  // States
  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productComponents, setProductComponents] = useState<ProductComponent[]>([]); // State dikembalikan
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saleQuantities, setSaleQuantities] = useState<SaleQuantities>({});
  const [prodProductId, setProdProductId] = useState<string>('');
  const [prodQuantity, setProdQuantity] = useState<string>('');

  // Fungsi helper
  const sortProducts = (a: Product, b: Product): number => {
    const order = ['DCP-MINI', 'DCP-CORE', 'DCP-PRO'];
    const indexA = order.indexOf(a.sku);
    const indexB = order.indexOf(b.sku);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.name.localeCompare(b.name);
  };

  const getStockRowClass = (stock: number, name: string): string => {
    const specialItems = ['Buble Warp', 'Lakban Bening', 'Lakban Fragile'];
    let warningLimit = 20;
    if (specialItems.includes(name)) warningLimit = 2;
    if (stock === 0) return 'stock-danger';
    if (stock < warningLimit) return 'stock-warning';
    return '';
  };

  // Fungsi untuk mengambil semua data
  const fetchData = async () => {
    try {
      // Tambahkan panggilan untuk mengambil product_components
      const [compRes, prodRes, logRes, profileRes, pcRes] = await Promise.all([
        supabase.from('components').select('*').order('name'),
        supabase.from('products').select('*'),
        supabase.from('activity_logs').select('id, created_at, description, username').order('created_at', { ascending: false }).limit(20),
        supabase.from('profiles').select('id, username'),
        supabase.from('product_components').select('*') // Panggilan dikembalikan
      ]);

      const errors = [compRes.error, prodRes.error, logRes.error, profileRes.error, pcRes.error].filter(Boolean);
      if (errors.length > 0) {
        throw new Error(errors.map(e => e!.message).join(', '));
      }

      setComponents(compRes.data || []);
      setProducts(prodRes.data || []);
      setActivityLogs(logRes.data || []);
      setProfiles(profileRes.data || []);
      setProductComponents(pcRes.data || []); // State dikembalikan

      if (prodRes.data?.length) {
        const sortedProducts = [...prodRes.data].sort(sortProducts);
        if (!prodProductId) setProdProductId(sortedProducts[0].id.toString());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, []);

  // Fungsi untuk memanggil Edge Function
  const invokeFunction = async (name: 'record-sale' | 'produce-dcp', body: object, successMessage: string): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      alert(successMessage);
      await fetchData();
      return true;
    } catch (caughtError: any) {
      let errorMessage = "Terjadi kesalahan.";
      if (caughtError.context?.json) {
        try {
          const errorBody = await caughtError.context.json();
          errorMessage = errorBody.error || errorMessage;
        } catch { /* Gagal parsing, gunakan pesan default */ }
      } else if (caughtError.message) {
        errorMessage = caughtError.message;
      }
      alert(`GAGAL:\n${errorMessage}`);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler untuk form produksi (dengan konfirmasi)
  const handleProductionSubmit = (e: FormEvent) => {
    e.preventDefault();
    const quantity = parseInt(prodQuantity, 10);
    const productId = parseInt(prodProductId, 10);

    if (isNaN(productId) || isNaN(quantity) || quantity <= 0) {
      alert("Harap pilih produk dan masukkan jumlah produksi yang valid.");
      return;
    }
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const recipe = {
      'DCP-MINI': ['Botol Mini'],
      'DCP-CORE': ['Botol Core'],
      'DCP-PRO': ['Botol Pro', 'Seal Pro', 'Sprayer Pro', 'Tutup Botol Pro'],
    }[product.sku] || [];

    const stockImpactSummary = recipe.map(compName => {
      const component = components.find(c => c.name === compName);
      if (!component) return `  - ${compName}: Data tidak ditemukan`;
      const newStock = component.stock - (1 * quantity);
      return `  - ${compName}: ${component.stock} -> ${newStock}`;
    }).join('\n');

    const confirmationMessage = `Anda akan memproduksi:\n\n${quantity}x ${product.name}\n\nIni akan mengubah stok komponen:\n${stockImpactSummary}\n\nLanjutkan?`;
    
    if (window.confirm(confirmationMessage)) {
      invokeFunction('produce-dcp', { productId, quantity }, 'Produksi berhasil diselesaikan!').then(success => {
        if (success) setProdQuantity('');
      });
    }
  };

  // Handler untuk penyesuaian stok bahan baku (konfirmasi sudah ada)
  const handleModifyComponentStock = async (component: Component, action: 'add' | 'subtract') => {
    const amountStr = window.prompt(`Masukkan jumlah untuk ${action === 'add' ? 'DITAMBAH' : 'DIKURANGI'}:\n${component.name}`, "0");
    if (amountStr === null) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("Harap masukkan angka positif yang valid.");
      return;
    }
    if (action === 'subtract' && amount > component.stock) {
      alert(`GAGAL: Stok tidak mencukupi.`);
      return;
    }

    const newStock = action === 'add' ? component.stock + amount : component.stock - amount;
    if (!window.confirm(`Ubah stok ${component.name} dari ${component.stock} menjadi ${newStock}?`)) return;

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.from('components').update({ stock: newStock }).eq('id', component.id);
      if (updateError) throw updateError;

      const userProfile = profiles.find(p => p.id === user.id);
      const username = userProfile ? userProfile.username : 'Pengguna Tidak Dikenal';
      const description = `Stok ${component.name} diubah dari ${component.stock} ${component.unit} menjadi ${newStock} ${component.unit}.`;
      
      await supabase.from('activity_logs').insert({
        action_type: 'STOCK_ADJUSTMENT',
        description: description,
        details: { component_id: component.id, old_stock: component.stock, new_stock: newStock },
        user_id: user.id,
        username: username
      });

      alert("Stok berhasil diperbarui!");
      await fetchData();
    } catch (err: any) {
      alert(`GAGAL:\n${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler untuk form penjualan (dengan konfirmasi)
  const handleSaleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const itemsToSell = Object.entries(saleQuantities)
      .map(([productId, quantity]) => ({ productId: parseInt(productId, 10), quantity }))
      .filter(item => item.quantity > 0);
    if (itemsToSell.length === 0) {
      alert("Tidak ada produk untuk dijual.");
      return;
    }

    const componentDeductions: { [key: number]: number } = {};
    for (const item of itemsToSell) {
      const saleRecipe = productComponents.filter(pc => 
        pc.product_id === item.productId && pc.process_type === 'SALE'
      );
      for (const recipeItem of saleRecipe) {
        componentDeductions[recipeItem.component_id] = (componentDeductions[recipeItem.component_id] || 0) + (recipeItem.quantity_needed * item.quantity);
      }
    }

    const stockImpactSummary = Object.entries(componentDeductions).map(([componentId, deduction]) => {
        const component = components.find(c => c.id === Number(componentId));
        if (!component) return null;
        const newStock = component.stock - deduction;
        return `  - ${component.name}: ${component.stock} -> ${newStock}`;
      }).filter(line => line).join('\n');

    const saleSummary = itemsToSell.map(item => {
        const product = products.find(p => p.id === item.productId);
        return `${item.quantity}x ${product?.name || '?'}`;
      }).join('\n');

    const confirmationMessage = `Anda yakin ingin menjual:\n\n${saleSummary}\n\nIni akan mengubah stok bahan pengemasan:\n${stockImpactSummary || 'Tidak ada.'}\n\nLanjutkan?`;
    
    if (window.confirm(confirmationMessage)) {
      invokeFunction('record-sale', { items: itemsToSell }, 'Penjualan berhasil dicatat!').then(success => {
        if (success) setSaleQuantities({});
      });
    }
  };

  const handleQuantityChange = (productId: number, quantityStr: string) => {
    const quantity = parseInt(quantityStr, 10);
    setSaleQuantities(prev => ({ ...prev, [productId]: isNaN(quantity) ? 0 : Math.max(0, quantity) }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const currentUserProfile = profiles.find(p => p.id === user.id);
  const displayUsername = currentUserProfile ? currentUserProfile.username : user.email;

  if (loading) return <div>Memuat data...</div>;
  if (error) return <div>Terjadi Kesalahan: {error}</div>;

  return (
    <div className="App">
      <div className="user-bar">
        <span>Login sebagai: <strong>{displayUsername}</strong></span>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </div>

      <h1>Inventaris Nooda</h1>

      <div className="section-container">
        <h2>Produk Jadi & Penjualan</h2>
        <div className="table-wrapper">
          <table className="stock-table">
            <thead><tr><th>Produk</th><th>SKU</th><th>Stok</th></tr></thead>
            <tbody>
              {products.sort(sortProducts).map(p => (
                <tr key={p.id} className={getStockRowClass(p.stock, p.name)}>
                  <td>{p.name}</td>
                  <td>{p.sku}</td>
                  <td>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-panel sale-panel">
          <h3>Catat Penjualan</h3>
          <form onSubmit={handleSaleSubmit}>
            <div className="table-wrapper">
              <table className="sale-input-table stock-table">
                <thead><tr><th>Produk</th><th>Jumlah</th></tr></thead>
                <tbody>
                  {products.sort(sortProducts).map(product => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td><input type="number" min="0" value={saleQuantities[product.id] || ''} placeholder="0" onChange={(e) => handleQuantityChange(product.id, e.target.value)} className="quantity-input" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="submit" disabled={isSubmitting} className="submit-sale-btn">{isSubmitting ? 'Memproses...' : 'Catat Penjualan'}</button>
          </form>
        </div>
      </div>

      <div className="section-container">
        <h2>Bahan Baku</h2>
        <div className="table-wrapper">
          <table className="stock-table">
            <thead><tr><th>Komponen</th><th>Stok</th><th>Satuan</th><th>Aksi</th></tr></thead>
            <tbody>
              {components.map(c => (
                <tr key={c.id} className={getStockRowClass(c.stock, c.name)}>
                  <td>{c.name}</td>
                  <td>{c.stock}</td>
                  <td>{c.unit}</td>
                  <td className="action-cell">
                    <button className="modify-stock-btn subtract" onClick={() => handleModifyComponentStock(c, 'subtract')} disabled={isSubmitting || c.stock === 0}>-</button>
                    <button className="modify-stock-btn add" onClick={() => handleModifyComponentStock(c, 'add')} disabled={isSubmitting}>+</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-container">
        <h2>Jalankan Produksi</h2>
        <div className="form-panel production-panel">
          <form onSubmit={handleProductionSubmit}>
            <select value={prodProductId} onChange={(e) => setProdProductId(e.target.value)}>
              {products.sort(sortProducts).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={prodQuantity} placeholder="0" onChange={(e) => setProdQuantity(e.target.value)} min="1" />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : 'Produksi'}</button>
          </form>
        </div>
      </div>

      <div className="section-container">
        <h2>Log Aktivitas Terbaru</h2>
        <div className="table-wrapper">
          <table className="stock-table">
            <thead>
              <tr>
                <th style={{ width: '200px' }}>Waktu</th>
                <th>Aksi</th>
                <th style={{ width: '150px' }}>Pengguna</th>
              </tr>
            </thead>
            <tbody>
              {activityLogs.length > 0 ? (
                activityLogs.map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{log.description}</td>
                    <td>{log.username || 'Sistem'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={3}>Belum ada aktivitas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="app-footer">Aplikasi Inventaris Nooda | Versi: {APP_VERSION}</footer>
    </div>
  );
}

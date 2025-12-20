// File: src/App.tsx (v5.5 - Final dengan Aturan Highlight Stok Kustom)

import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from './lib/supabaseClient';
import './App.css';

// Tipe Data
type Product = { id: number; name: string; sku: string; stock: number; };
type Component = { id: number; name: string; stock: number; unit: string; };

// Tipe data untuk state kuantitas penjualan
type SaleQuantities = {
  [productId: number]: number;
};

export default function App() {
  // States
  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State untuk form penjualan tabel
  const [saleQuantities, setSaleQuantities] = useState<SaleQuantities>({});

  // States untuk form produksi
  const [prodProductId, setProdProductId] = useState<string>('');
  const [prodQuantity, setProdQuantity] = useState<string>('');

  // Fungsi untuk mengurutkan produk (Mini, Core, Pro)
  const sortProducts = (a: Product, b: Product): number => {
    const order = ['DCP-MINI', 'DCP-CORE', 'DCP-PRO'];
    const indexA = order.indexOf(a.sku);
    const indexB = order.indexOf(b.sku);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.name.localeCompare(b.name);
  };

  // Fungsi helper cerdas untuk menentukan kelas CSS berdasarkan aturan stok kustom
  const getStockRowClass = (stock: number, name: string): string => {
    // Daftar item dengan aturan khusus (limit 2)
    const specialItems = ['Buble Warp', 'Lakban Bening', 'Lakban Fragile'];
    
    // Aturan default
    let warningLimit = 20;

    // Jika nama item ada di dalam daftar khusus, ubah limitnya
    if (specialItems.includes(name)) {
      warningLimit = 2;
    }

    // Terapkan logika dengan limit yang sudah disesuaikan
    if (stock === 0) {
      return 'stock-danger'; // Stok habis -> merah (berlaku untuk semua)
    }
    if (stock < warningLimit) {
      return 'stock-warning'; // Stok kritis -> oranye (menggunakan limit yang benar)
    }
    
    return ''; // Stok aman -> tidak ada kelas tambahan
  };

  // Fungsi untuk mengambil semua data dari Supabase
  const fetchData = async () => {
    try {
      const [compRes, prodRes] = await Promise.all([
        supabase.from('components').select('*').order('name'),
        supabase.from('products').select('*')
      ]);
      if (compRes.error) throw compRes.error;
      if (prodRes.error) throw prodRes.error;
      setComponents(compRes.data || []);
      setProducts(prodRes.data || []);
      if (prodRes.data && prodRes.data.length > 0) {
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

  // Fungsi untuk memanggil Edge Function dengan penanganan error terbaik
  const invokeFunction = async (name: 'record-sale' | 'produce-dcp', body: object, successMessage: string): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      alert(data.message || successMessage);
      await fetchData();
      return true;
    } catch (caughtError: any) {
      let errorMessage = "Terjadi kesalahan yang tidak diketahui.";
      if (caughtError && caughtError.context && typeof caughtError.context.json === 'function') {
        try {
          const errorBody = await caughtError.context.json();
          if (errorBody && errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch (e) {
          errorMessage = caughtError.message || "Gagal mem-parsing respons error.";
        }
      } else if (caughtError && caughtError.message) {
        errorMessage = caughtError.message;
      }
      
      const formattedErrorMessage = `GAGAL:\n${errorMessage}`;
      alert(formattedErrorMessage);
      
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler untuk form produksi
  const handleProductionSubmit = (e: FormEvent) => {
    e.preventDefault();
    const quantity = parseInt(prodQuantity, 10);
    if (isNaN(quantity) || quantity <= 0) {
      alert("Harap masukkan jumlah produksi yang valid (lebih dari 0).");
      return;
    }
    const confirmed = window.confirm(`Anda yakin ingin memproduksi ${quantity} unit?`);
    if (confirmed) {
      invokeFunction('produce-dcp', { productId: parseInt(prodProductId), quantity }, 'Produksi berhasil diselesaikan!')
        .then(success => {
          if (success) setProdQuantity('');
        });
    }
  };

  // Fungsi untuk menambah stok bahan baku
  const handleAddComponentStock = async (component: Component) => {
    const amountStr = window.prompt(`Masukkan jumlah stok yang ingin ditambahkan untuk:\n${component.name}`, "10");
    if (amountStr === null) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("Harap masukkan angka positif yang valid.");
      return;
    }
    const confirmed = window.confirm(`Anda yakin ingin menambah stok ${component.name} sebanyak ${amount}? Stok baru akan menjadi ${component.stock + amount}.`);
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('components').update({ stock: component.stock + amount }).eq('id', component.id);
      if (error) throw error;
      alert("Stok berhasil diperbarui!");
      await fetchData();
    } catch (err: any) {
      alert(`Terjadi Kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler untuk mengubah kuantitas di tabel penjualan
  const handleQuantityChange = (productId: number, quantityStr: string) => {
    if (quantityStr === '') {
      setSaleQuantities(prev => ({ ...prev, [productId]: 0 }));
      return;
    }
    const quantity = parseInt(quantityStr, 10);
    const newQuantity = Math.max(0, quantity);
    setSaleQuantities(prev => ({ ...prev, [productId]: newQuantity }));
  };

  // Handler utama untuk mencatat penjualan dari tabel
  const handleSaleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const itemsToSell = Object.entries(saleQuantities).map(([productId, quantity]) => ({ productId: parseInt(productId, 10), quantity, })).filter(item => item.quantity > 0);
    if (itemsToSell.length === 0) {
      alert("Tidak ada produk yang dimasukkan untuk dijual. Harap isi kuantitas minimal pada satu produk.");
      return;
    }
    const summary = itemsToSell.map(item => { const product = products.find(p => p.id === item.productId); return `${item.quantity}x ${product?.name || 'Produk tidak dikenal'}`; }).join('\n');
    const confirmed = window.confirm(`Anda yakin ingin mencatat penjualan untuk item berikut?\n\n${summary}`);
    if (confirmed) {
      const payload = { cart: itemsToSell };
      invokeFunction('record-sale', payload, 'Penjualan berhasil dicatat!').then((success) => { if (success) { setSaleQuantities({}); } });
    }
  };

  if (loading) return <div>Memuat data...</div>;
  if (error) return <div>Terjadi Kesalahan: {error}</div>;

  return (
    <div className="App">
      <h1>Inventaris Nooda</h1>

      <div className="section-container">
        <h2>Produk Jadi & Penjualan</h2>
        <table className="stock-table">
          <thead><tr><th>Produk</th><th>SKU</th><th>Stok Tersedia</th></tr></thead>
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
        <div className="form-panel sale-panel">
          <h3>Catat Penjualan</h3>
          <form onSubmit={handleSaleSubmit}>
            <table className="sale-input-table">
              <thead><tr><th>Produk</th><th>Jumlah Terjual</th></tr></thead>
              <tbody>
                {products.sort(sortProducts).map(product => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td><input type="number" min="0" value={saleQuantities[product.id] || ''} placeholder="0" onChange={(e) => handleQuantityChange(product.id, e.target.value)} className="quantity-input" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="submit" disabled={isSubmitting} className="submit-sale-btn">{isSubmitting ? 'Memproses...' : 'Catat Semua Penjualan'}</button>
          </form>
        </div>
      </div>

      <div className="section-container">
        <h2>Bahan Baku & Produksi</h2>
        <table className="stock-table">
          <thead><tr><th>Komponen</th><th>Stok</th><th>Satuan</th><th>Aksi</th></tr></thead>
          <tbody>
            {components.map(c => (
              <tr key={c.id} className={getStockRowClass(c.stock, c.name)}>
                <td>{c.name}</td>
                <td>{c.stock}</td>
                <td>{c.unit}</td>
                <td><button className="add-stock-btn" onClick={() => handleAddComponentStock(c)} disabled={isSubmitting}>+ Tambah</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-panel production-panel">
          <h3>Jalankan Produksi</h3>
          <form onSubmit={handleProductionSubmit}>
            <select value={prodProductId} onChange={(e) => setProdProductId(e.target.value)}>
              {products.sort(sortProducts).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={prodQuantity} placeholder="0" onChange={(e) => setProdQuantity(e.target.value)} min="1" />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : 'Produksi'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

// File: src/App.tsx (atau Dashboard.tsx) - Versi Lengkap dengan Tabel Penjualan

import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from './lib/supabaseClient';
import './App.css';

// Tipe Data
type Component = { id: number; name: string; stock: number; unit: string; };
type Product = { id: number; name: string; sku: string; stock: number; };

// Tipe data untuk state kuantitas penjualan
type SaleQuantities = {
  [productId: number]: number;
};

// Jika Anda sudah memisahkan file, ini akan menjadi:
// export default function Dashboard({ session }) {
export default function App() {
  // States
  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State baru untuk form penjualan tabel
  const [saleQuantities, setSaleQuantities] = useState<SaleQuantities>({});

  // States untuk form produksi
  const [prodProductId, setProdProductId] = useState<string>('');
  const [prodQuantity, setProdQuantity] = useState<number>(10);

  // Fungsi untuk mengambil semua data dari Supabase
  const fetchData = async () => {
    // Tidak set loading di sini agar refresh terasa lebih mulus saat update
    try {
      const [compRes, prodRes] = await Promise.all([
        supabase.from('components').select('*').order('name'),
        supabase.from('products').select('*').order('name')
      ]);

      if (compRes.error) throw compRes.error;
      if (prodRes.error) throw prodRes.error;

      setComponents(compRes.data || []);
      setProducts(prodRes.data || []);

      // Set nilai default untuk dropdown produksi
      if (prodRes.data && prodRes.data.length > 0) {
        if (!prodProductId) setProdProductId(prodRes.data[0].id.toString());
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

  // Fungsi generik untuk memanggil Edge Function
  const invokeFunction = async (name: 'record-sale' | 'produce-dcp', body: object, successMessage: string) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      alert(data.message || successMessage);
      await fetchData(); // Refresh semua data
    } catch (err: any) {
      alert(`Terjadi Kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler untuk form produksi dengan konfirmasi
  const handleProductionSubmit = (e: FormEvent) => {
    e.preventDefault();
    const confirmed = window.confirm(`Anda yakin ingin memproduksi ${prodQuantity} unit?`);
    if (confirmed) {
      invokeFunction('produce-dcp', { productId: parseInt(prodProductId), quantity: prodQuantity }, 'Produksi berhasil diselesaikan!');
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
      const { error } = await supabase
        .from('components')
        .update({ stock: component.stock + amount })
        .eq('id', component.id);
      
      if (error) throw error;
      alert("Stok berhasil diperbarui!");
      await fetchData();
    } catch (err: any) {
      alert(`Terjadi Kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler baru untuk mengubah kuantitas di tabel penjualan
  const handleQuantityChange = (productId: number, quantityStr: string) => {
    // Izinkan input kosong untuk dihapus oleh pengguna
    if (quantityStr === '') {
      setSaleQuantities(prev => ({
        ...prev,
        [productId]: 0,
      }));
      return;
    }
    const quantity = parseInt(quantityStr, 10);
    const newQuantity = Math.max(0, quantity);
    setSaleQuantities(prev => ({
      ...prev,
      [productId]: newQuantity,
    }));
  };

  // Handler utama untuk mencatat penjualan dari tabel
  const handleSaleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const itemsToSell = Object.entries(saleQuantities)
      .map(([productId, quantity]) => ({
        productId: parseInt(productId, 10),
        quantity,
      }))
      .filter(item => item.quantity > 0);

    if (itemsToSell.length === 0) {
      alert("Tidak ada produk yang dimasukkan untuk dijual. Harap isi kuantitas minimal pada satu produk.");
      return;
    }
    
    const summary = itemsToSell.map(item => {
      const product = products.find(p => p.id === item.productId);
      return `${item.quantity}x ${product?.name || 'Produk tidak dikenal'}`;
    }).join('\n');

    const confirmed = window.confirm(`Anda yakin ingin mencatat penjualan untuk item berikut?\n\n${summary}`);
    
    if (confirmed) {
      const payload = { cart: itemsToSell };
      invokeFunction('record-sale', payload, 'Penjualan berhasil dicatat!').then(() => {
        setSaleQuantities({}); // Reset form kuantitas setelah berhasil
      });
    }
  };

  if (loading) return <div>Memuat data...</div>;
  if (error) return <div>Terjadi Kesalahan: {error}</div>;

  return (
    <div className="App">
      {/* Jika Anda menggunakan sistem login, header ini akan ada */}
      {/* <header className="app-header">
        <h1>Inventaris Nooda</h1>
        <div className="header-actions">
          <span>Masuk sebagai: <strong>{session.user.email}</strong></span>
          <button className="logout-btn" onClick={() => supabase.auth.signOut()}>
            Keluar
          </button>
        </div>
      </header> */}
      <h1>Inventaris Nooda</h1>

      {/* --- BAGIAN PRODUK JADI & PENJUALAN --- */}
      <div className="section-container">
        <h2>Produk Jadi & Penjualan</h2>
        
        <table className="stock-table">
          <thead>
            <tr>
              <th>Produk</th>
              <th>SKU</th>
              <th>Stok Tersedia</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
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
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Jumlah Terjual</th>
                </tr>
              </thead>
              <tbody>
                {products.map(product => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        // Tampilkan string kosong jika nilainya 0 atau undefined
                        value={saleQuantities[product.id] || ''} 
                        placeholder="0"
                        onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                        className="quantity-input"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="submit" disabled={isSubmitting} className="submit-sale-btn">
              {isSubmitting ? 'Memproses...' : 'Catat Semua Penjualan'}
            </button>
          </form>
        </div>
      </div>

      {/* --- BAGIAN BAHAN BAKU & PRODUKSI --- */}
      <div className="section-container">
        <h2>Bahan Baku & Produksi</h2>
        <table className="stock-table">
          <thead>
            <tr>
              <th>Komponen</th>
              <th>Stok</th>
              <th>Satuan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {components.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.stock}</td>
                <td>{c.unit}</td>
                <td>
                  <button className="add-stock-btn" onClick={() => handleAddComponentStock(c)} disabled={isSubmitting}>
                    + Tambah
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-panel production-panel">
          <h3>Jalankan Produksi</h3>
          <form onSubmit={handleProductionSubmit}>
            <select value={prodProductId} onChange={(e) => setProdProductId(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={prodQuantity} onChange={(e) => setProdQuantity(Number(e.target.value))} min="1" />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : 'Produksi'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

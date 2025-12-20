// File: src/App.tsx (Versi dengan Peningkatan UX)

import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from './lib/supabaseClient';
import './App.css';

// Tipe Data
type Component = { id: number; name: string; stock: number; unit: string; };
type Product = { id: number; name: string; sku: string; stock: number; };

function App() {
  // States
  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // States untuk Form
  const [saleProductId, setSaleProductId] = useState<string>('');
  const [saleQuantity, setSaleQuantity] = useState<number>(1);
  const [prodProductId, setProdProductId] = useState<string>('');
  const [prodQuantity, setProdQuantity] = useState<number>(10);

  // Fungsi untuk mengambil semua data dari Supabase
  const fetchData = async () => {
    // Tidak set loading di sini agar refresh terasa lebih mulus
    try {
      const [compRes, prodRes] = await Promise.all([
        supabase.from('components').select('*').order('name'),
        supabase.from('products').select('*').order('name')
      ]);

      if (compRes.error) throw compRes.error;
      if (prodRes.error) throw prodRes.error;

      setComponents(compRes.data || []);
      setProducts(prodRes.data || []);

      if (prodRes.data && prodRes.data.length > 0) {
        if (!saleProductId) setSaleProductId(prodRes.data[0].id.toString());
        if (!prodProductId) setProdProductId(prodRes.data[0].id.toString());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false); // Hanya set loading false di akhir
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
      await fetchData();
    } catch (err: any) {
      alert(`Terjadi Kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers untuk form dengan konfirmasi
  const handleSaleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // PERUBAHAN: Tambahkan konfirmasi
    const confirmed = window.confirm(`Anda yakin ingin mencatat penjualan ${saleQuantity} unit?`);
    if (confirmed) {
      invokeFunction('record-sale', { productId: parseInt(saleProductId), quantity: saleQuantity }, 'Penjualan berhasil dicatat!');
    }
  };

  const handleProductionSubmit = (e: FormEvent) => {
    e.preventDefault();
    // PERUBAHAN: Tambahkan konfirmasi
    const confirmed = window.confirm(`Anda yakin ingin memproduksi ${prodQuantity} unit?`);
    if (confirmed) {
      invokeFunction('produce-dcp', { productId: parseInt(prodProductId), quantity: prodQuantity }, 'Produksi berhasil diselesaikan!');
    }
  };

  // PERUBAHAN: Fungsi baru untuk menambah stok bahan baku
  const handleAddComponentStock = async (component: Component) => {
    const amountStr = window.prompt(`Masukkan jumlah stok yang ingin ditambahkan untuk:\n${component.name}`, "10");
    if (amountStr === null) return; // Pengguna menekan batal

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
      await fetchData(); // Refresh data
    } catch (err: any) {
      alert(`Terjadi Kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div>Memuat data...</div>;
  if (error) return <div>Terjadi Kesalahan: {error}</div>;

  return (
    <div className="App">
      <h1>Inventaris Nooda</h1>

      {/* --- BAGIAN PRODUK JADI & PENJUALAN --- */}
      <div className="section-container">
        <h2>Produk Jadi (Siap Jual)</h2>
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
        <div className="form-panel sale-panel"> {/* PERUBAHAN: class baru */}
          <h3>Catat Penjualan</h3>
          <form onSubmit={handleSaleSubmit}>
            <select value={saleProductId} onChange={(e) => setSaleProductId(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={saleQuantity} onChange={(e) => setSaleQuantity(Number(e.target.value))} min="1" />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : 'Catat Penjualan'}</button>
          </form>
        </div>
      </div>

      {/* --- BAGIAN BAHAN BAKU & PRODUKSI --- */}
      <div className="section-container">
        <h2>Bahan Baku</h2>
        <table className="stock-table">
          <thead>
            <tr>
              <th>Komponen</th>
              <th>Stok</th>
              <th>Satuan</th>
              <th>Aksi</th> {/* PERUBAHAN: Kolom Aksi */}
            </tr>
          </thead>
          <tbody>
            {components.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.stock}</td>
                <td>{c.unit}</td>
                <td>
                  {/* PERUBAHAN: Tombol Tambah Stok */}
                  <button className="add-stock-btn" onClick={() => handleAddComponentStock(c)} disabled={isSubmitting}>
                    + Tambah
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-panel production-panel"> {/* PERUBAHAN: class baru */}
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

export default App;

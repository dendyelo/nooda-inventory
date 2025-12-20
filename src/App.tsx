// File: src/App.tsx (Versi Bahasa Indonesia)

import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from './lib/supabaseClient';
import './App.css';

// Tipe Data (tetap dalam Bahasa Inggris)
type Component = { id: number; name:string; stock: number; unit: string; };
type Product = { id: number; name: string; sku: string; stock: number; };

function App() {
  // States (tetap dalam Bahasa Inggris)
  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // States untuk Form (tetap dalam Bahasa Inggris)
  const [saleProductId, setSaleProductId] = useState<string>('');
  const [saleQuantity, setSaleQuantity] = useState<number>(1);
  const [prodProductId, setProdProductId] = useState<string>('');
  const [prodQuantity, setProdQuantity] = useState<number>(10);

  // Fungsi fetchData (tetap dalam Bahasa Inggris)
  const fetchData = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fungsi invokeFunction (pesan alert diubah ke Bahasa Indonesia)
  const invokeFunction = async (name: 'record-sale' | 'produce-dcp', body: object, successMessage: string) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      // ID: Mengubah pesan alert
      alert(data.message || successMessage);
      await fetchData();
    } catch (err: any) {
      // ID: Mengubah pesan alert
      alert(`Terjadi Kesalahan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers untuk form (pesan sukses diubah ke Bahasa Indonesia)
  const handleSaleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // ID: Mengubah pesan sukses
    invokeFunction('record-sale', { productId: parseInt(saleProductId), quantity: saleQuantity }, 'Penjualan berhasil dicatat!');
  };

  const handleProductionSubmit = (e: FormEvent) => {
    e.preventDefault();
    // ID: Mengubah pesan sukses
    invokeFunction('produce-dcp', { productId: parseInt(prodProductId), quantity: prodQuantity }, 'Produksi berhasil diselesaikan!');
  };

  // ID: Mengubah teks loading dan error
  if (loading) return <div>Memuat data...</div>;
  if (error) return <div>Terjadi Kesalahan: {error}</div>;

  return (
    <div className="App">
      {/* ID: Judul utama */}
      <h1>Inventaris Nooda</h1>

      {/* ID: Judul tabel produk jadi */}
      <h2>Produk Jadi (Siap Jual)</h2>
      <table className="stock-table">
        <thead>
          <tr>
            {/* ID: Header tabel */}
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

      <div className="actions-panel">
        {/* Form Produksi */}
        <div className="form-panel">
          {/* ID: Judul form */}
          <h2>Jalankan Produksi</h2>
          <form onSubmit={handleProductionSubmit}>
            <select value={prodProductId} onChange={(e) => setProdProductId(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={prodQuantity} onChange={(e) => setProdQuantity(Number(e.target.value))} min="1" />
            {/* ID: Teks tombol */}
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : 'Produksi'}</button>
          </form>
        </div>

        {/* Form Penjualan */}
        <div className="form-panel">
          {/* ID: Judul form */}
          <h2>Catat Penjualan</h2>
          <form onSubmit={handleSaleSubmit}>
            <select value={saleProductId} onChange={(e) => setSaleProductId(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={saleQuantity} onChange={(e) => setSaleQuantity(Number(e.target.value))} min="1" />
            {/* ID: Teks tombol */}
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : 'Catat Penjualan'}</button>
          </form>
        </div>
      </div>

      {/* ID: Judul tabel komponen */}
      <h2>Bahan Baku</h2>
      <table className="stock-table">
        <thead>
          <tr>
            {/* ID: Header tabel */}
            <th>Komponen</th>
            <th>Stok</th>
            <th>Satuan</th>
          </tr>
        </thead>
        <tbody>
          {components.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.stock}</td>
              <td>{c.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;

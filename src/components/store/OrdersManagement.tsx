import { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { Trash2, Clock, Loader, CheckCircle, List, User, Calendar, DollarSign, Settings, Phone, ChevronDown, ChevronUp, Mail, MapPin, CreditCard, FileText } from 'lucide-react';

export type OrderStatus = 'pendiente' | 'procesando' | 'completado';

interface OrderLineItem {
  product_id?: string;
  productId?: string;
  name?: string;
  qty?: number;
  quantity?: number;
  price?: number;
  total?: number;
}

interface OrderAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface OrderItem {
  id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  address?: OrderAddress;
  shipping_address?: OrderAddress;
  payment_method?: string;
  notes?: string;
  items?: OrderLineItem[];
  total?: number;
  created_at?: string;
  status?: OrderStatus | string;
}

const OrdersManagement = () => {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'todas' | OrderStatus>('todas');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchOrders = async () => {
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOrders([]);
        return;
      }
      let items: OrderItem[] = [];
      try {
        const snap = await getDocs(query(collection(db, 'orders'), orderBy('created_at', 'desc')));
        items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      } catch (_) {
        try {
          const snap = await getDocs(collection(db, 'orders'));
          items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        } catch (e) {
          console.warn('No se pudieron cargar las órdenes', e);
          items = [];
        }
      }
      setOrders(items);
    } catch (e) {
      console.warn('Error inesperado al cargar órdenes', e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const byStatus = statusFilter === 'todas' ? true : (o.status === statusFilter);
      const bySearch = search.trim() ? (o.customer_name || '').toLowerCase().includes(search.toLowerCase()) : true;
      return byStatus && bySearch;
    });
  }, [orders, statusFilter, search]);

  const counts = useMemo(() => ({
    todas: orders.length,
    pendiente: orders.filter(o => o.status === 'pendiente').length,
    procesando: orders.filter(o => o.status === 'procesando').length,
    completado: orders.filter(o => o.status === 'completado').length,
  }), [orders]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    await updateDoc(doc(db, 'orders', id), { status });
    await fetchOrders();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar esta orden?')) return;
    await deleteDoc(doc(db, 'orders', id));
    await fetchOrders();
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Gestión de Órdenes</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente" className="px-3 py-2 border rounded-full" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['todas','pendiente','procesando','completado'] as const).map(s => {
          const Icon = s === 'todas' ? List : s === 'pendiente' ? Clock : s === 'procesando' ? Loader : CheckCircle;
          const count = (counts as any)[s];
          const color = s === 'pendiente'
            ? 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white'
            : s === 'procesando'
            ? 'border-yellow-500 text-yellow-700 hover:bg-yellow-500 hover:text-black'
            : s === 'completado'
            ? 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white'
            : 'border-black text-black hover:bg-black hover:text-white';
          const active = statusFilter === s
            ? (s === 'pendiente' ? 'bg-red-600 text-white border-red-600'
              : s === 'procesando' ? 'bg-yellow-500 text-black border-yellow-500'
              : s === 'completado' ? 'bg-green-600 text-white border-green-600'
              : 'bg-black text-white border-black')
            : '';
          return (
            <button key={s} onClick={() => setStatusFilter(s)} title={s} className={`px-3 py-2 rounded-full border-2 inline-flex items-center gap-2 ${active || color}`}>
              <Icon size={16} />
              <span className="text-xs px-1.5 py-0.5 border rounded">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 p-3 text-xs font-medium border-b">
          <div className="col-span-1" />
          <div className="col-span-3"><User size={14} title="Cliente" /></div>
          <div className="col-span-2"><Phone size={14} title="Teléfono" /></div>
          <div className="col-span-2"><Calendar size={14} title="Fecha" /></div>
          <div className="col-span-1"><DollarSign size={14} title="Total" /></div>
          <div className="col-span-2"><CheckCircle size={14} title="Estado" /></div>
          <div className="col-span-1 text-right"><Settings size={14} title="Acciones" /></div>
        </div>
        {loading && <div className="p-4 text-sm text-gray-500">Cargando...</div>}
        {!loading && filtered.length === 0 && <div className="p-4 text-sm text-gray-500">Sin resultados</div>}
        <div className="divide-y">
          {filtered.map(o => (
            <div key={o.id} className="grid grid-cols-12 p-3 items-center">
              <div className="col-span-1">
                <button onClick={() => setExpanded(e => ({ ...e, [o.id]: !e[o.id] }))} className="border-2 border-black text-black px-2 py-1 rounded-full hover:bg-black hover:text-white inline-flex items-center" title={expanded[o.id] ? 'Ocultar' : 'Ver detalles'}>
                  {expanded[o.id] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </button>
              </div>
              <div className="col-span-3 lowercase first-letter:uppercase">{o.customer_name || 'cliente'}</div>
              <div className="col-span-2 text-sm text-gray-700">{o.customer_phone || '-'}</div>
              <div className="col-span-2 text-sm text-gray-600">{o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</div>
              <div className="col-span-1 font-semibold">${Number(o.total || 0).toFixed(0)}</div>
              <div className="col-span-2">
                <div className="flex gap-1">
                  {(['pendiente','procesando','completado'] as const).map(s => {
                    const colorBase = s==='pendiente' ? 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white' : s==='procesando' ? 'border-yellow-500 text-yellow-700 hover:bg-yellow-500 hover:text-black' : 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white';
                    const active = o.status===s ? (s==='pendiente' ? 'bg-red-600 text-white border-red-600' : s==='procesando' ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-green-600 text-white border-green-600') : '';
                    const Icon = s==='pendiente' ? Clock : s==='procesando' ? Loader : CheckCircle;
                    return (
                      <button key={s} onClick={() => updateStatus(o.id, s)} title={s} className={`px-2 py-1 text-xs border-2 rounded-full inline-flex items-center justify-center ${active || colorBase}`}>
                        <Icon size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="col-span-1 text-right">
                <button onClick={() => remove(o.id)} title="Eliminar" className="border-2 border-black text-black px-2 py-1 rounded-full hover:bg-black hover:text-white inline-flex items-center"><Trash2 size={14}/></button>
              </div>
              {expanded[o.id] && (
                <div className="col-span-12 mt-3">
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="flex items-center gap-2"><Mail size={14} className="text-gray-600"/><span>{o.customer_email || '-'}</span></div>
                      <div className="flex items-center gap-2"><CreditCard size={14} className="text-gray-600"/><span>{o.payment_method || '-'}</span></div>
                      <div className="flex items-center gap-2"><MapPin size={14} className="text-gray-600"/>
                        <span>{o.shipping_address?.street || o.address?.street || '-'}, {o.shipping_address?.city || o.address?.city || ''}</span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs font-medium mb-2 flex items-center gap-2"><FileText size={14}/> Items</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-600">
                              <th className="py-1">Producto</th>
                              <th className="py-1">Cant.</th>
                              <th className="py-1">Precio</th>
                              <th className="py-1">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(o.items || []).map((it, idx) => {
                              const qty = Number(it.qty ?? it.quantity ?? 1);
                              const price = Number(it.price ?? 0);
                              const total = it.total != null ? Number(it.total) : price * qty;
                              return (
                                <tr key={idx} className="border-t">
                                  <td className="py-1">{it.name || it.product_id || it.productId || '—'}</td>
                                  <td className="py-1">{qty}</td>
                                  <td className="py-1">${price.toFixed(0)}</td>
                                  <td className="py-1">${total.toFixed(0)}</td>
                                </tr>
                              );
                            })}
                            {(!o.items || o.items.length === 0) && (
                              <tr className="border-t"><td className="py-2 text-gray-500" colSpan={4}>Sin items</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {o.notes && (
                      <div className="mt-3 text-sm text-gray-700">
                        <div className="text-xs font-medium mb-1">Notas</div>
                        <div className="whitespace-pre-line">{o.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrdersManagement;

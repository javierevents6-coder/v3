import { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { ChevronDown, ChevronUp, CheckCircle, Clock, FileText, Loader, Mail, MapPin, Phone, Settings, Trash2, User, DollarSign, Link as LinkIcon, Calendar, Pencil } from 'lucide-react';

interface WorkflowTask { id: string; title: string; done: boolean; due?: string | null; note?: string }
interface WorkflowCategory { id: string; name: string; tasks: WorkflowTask[] }

interface ContractItem {
  id: string;
  clientName: string;
  clientEmail: string;
  eventType?: string;
  eventDate?: string;
  eventTime?: string;
  contractDate?: string;
  totalAmount?: number;
  travelFee?: number;
  paymentMethod?: string;
  depositPaid?: boolean;
  finalPaymentPaid?: boolean;
  eventCompleted?: boolean;
  services?: any[];
  storeItems?: any[];
  message?: string;
  createdAt?: string;
  pdfUrl?: string;
  workflow?: WorkflowCategory[];
  reminders?: { type: 'finalPayment'; sendAt: string }[];
}

const ContractsManagement = () => {
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ContractItem | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [viewing, setViewing] = useState<ContractItem | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowCategory[] | null>(null);
  const [savingWf, setSavingWf] = useState(false);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setContracts([]);
        return;
      }
      let items: ContractItem[] = [];
      try {
        const snap = await getDocs(query(collection(db, 'contracts'), orderBy('createdAt', 'desc')));
        items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      } catch (_) {
        try {
          const snap = await getDocs(collection(db, 'contracts'));
          items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        } catch (e) {
          console.warn('No se pudieron cargar los contratos', e);
          items = [];
        }
      }
      setContracts(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContracts(); }, []);

  const filtered = useMemo(() => {
    const list = (() => {
      if (!search.trim()) return contracts;
      const s = search.toLowerCase();
      return contracts.filter(c =>
        (c.clientName || '').toLowerCase().includes(s) ||
        (c.clientEmail || '').toLowerCase().includes(s) ||
        (c.eventType || '').toLowerCase().includes(s)
      );
    })();

    const now = new Date().getTime();
    const mapped = list.map(c => {
      const ev = c.eventDate ? new Date(c.eventDate) : undefined;
      const t = ev && !isNaN(ev.getTime()) ? ev.getTime() : new Date(c.contractDate || c.createdAt || Date.now()).getTime();
      const diff = Math.abs(t - now);
      return { c, diff };
    });

    mapped.sort((a, b) => {
      const ap = a.c.eventCompleted ? 1 : 0;
      const bp = b.c.eventCompleted ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return a.diff - b.diff;
    });

    return mapped.map(m => m.c);
  }, [contracts, search]);

  const toggleFlag = async (id: string, field: keyof ContractItem) => {
    const current = contracts.find(c => c.id === id);
    if (!current) return;
    const next = !Boolean(current[field]);
    await updateDoc(doc(db, 'contracts', id), { [field]: next } as any);
    await fetchContracts();
  };

  const openEdit = (c: ContractItem) => {
    setEditing(c);
    setEditForm({
      clientName: c.clientName || '',
      clientEmail: c.clientEmail || '',
      eventDate: c.eventDate || '',
      eventTime: (c as any).eventTime || '',
      totalAmount: Number(c.totalAmount || 0),
      travelFee: Number(c.travelFee || 0),
      message: c.message || ''
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const id = editing.id;
    const payload: Partial<ContractItem> = {
      clientName: String(editForm.clientName || ''),
      clientEmail: String(editForm.clientEmail || ''),
      eventDate: String(editForm.eventDate || ''),
      eventCompleted: editing.eventCompleted,
      totalAmount: Number(editForm.totalAmount || 0),
      travelFee: Number(editForm.travelFee || 0),
      message: String(editForm.message || ''),
    } as any;
    if (editForm.eventTime != null) (payload as any).eventTime = String(editForm.eventTime || '');
    await updateDoc(doc(db, 'contracts', id), payload as any);
    setEditing(null);
    await fetchContracts();
  };

  const openView = (c: ContractItem) => {
    const ensure = (c.workflow && c.workflow.length) ? c.workflow : defaultWorkflow(c);
    setViewing(c);
    setWorkflow(JSON.parse(JSON.stringify(ensure)));
  };

  const saveWorkflow = async () => {
    if (!viewing || !workflow) return;
    setSavingWf(true);
    try {
      await updateDoc(doc(db, 'contracts', viewing.id), { workflow } as any);
      await fetchContracts();
    } finally {
      setSavingWf(false);
    }
  };

  const scheduleFinalPaymentEmail = async () => {
    if (!viewing) return;
    const dateStr = viewing.eventDate || '';
    const timeStr = viewing.eventTime || (viewing as any).eventTime || '00:00';
    const dt = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(dt.getTime())) return;
    const sendAt = new Date(dt.getTime() - 30 * 60000).toISOString();
    const nextRem = [ ...(viewing.reminders || []).filter(r => r.type !== 'finalPayment'), { type: 'finalPayment' as const, sendAt } ];
    await updateDoc(doc(db, 'contracts', viewing.id), { reminders: nextRem } as any);
    await fetchContracts();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este contrato?')) return;
    await deleteDoc(doc(db, 'contracts', id));
    await fetchContracts();
  };

  const isPast = (c: ContractItem) => {
    if (!c.eventDate) return false;
    const d = new Date(c.eventDate);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Gestión de Contratos</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente/email" className="px-3 py-2 border rounded-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 p-3 text-xs font-medium border-b">
          <div className="col-span-3">Fecha principal</div>
          <div className="col-span-3">Nombre del trabajo</div>
          <div className="col-span-2">Tipo</div>
          <div className="col-span-3">Progreso del flujo</div>
          <div className="col-span-1 text-right">Acciones</div>
        </div>
        {loading && <div className="p-4 text-sm text-gray-500">Cargando...</div>}
        {!loading && filtered.length === 0 && <div className="p-4 text-sm text-gray-500">Sin resultados</div>}
        <div className="divide-y">
          {filtered.map(c => (
            <div key={c.id} className={`grid grid-cols-12 p-3 items-center ${c.eventCompleted ? 'bg-green-50 text-green-800' : ''} ${(!c.eventCompleted && isPast(c)) ? 'text-red-600' : ''}`}>
              <div className="col-span-1">
                <button onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))} className="border-2 border-black text-black px-2 py-1 rounded-none hover:bg-black hover:text-white inline-flex items-center">
                  {expanded[c.id] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </button>
              </div>
              <div className="col-span-3 lowercase first-letter:uppercase">{c.clientName || 'cliente'}</div>
              <div className="col-span-3 text-sm">{c.eventDate || '-'}</div>
              <div className="col-span-1 text-sm">{(c as any).eventTime || '-'}</div>
              <div className="col-span-2 font-semibold">R$ {Number(c.totalAmount || 0).toFixed(2)}</div>
              <div className="col-span-1 font-semibold">R$ {(() => {
                const form = (c as any).formSnapshot || {};
                const servicesEffective = Array.isArray(c.services)
                  ? c.services.reduce((sum, it: any, idx: number) => {
                      const price = Number(String(it.price || '').replace(/[^0-9]/g, ''));
                      const qty = Number(it.quantity || 1);
                      const coupon = form[`discountCoupon_${idx}`];
                      const isFree = coupon === 'FREE' && it.id && String(it.id).includes('prewedding') && !String(it.id).includes('teaser');
                      if (isFree) return sum;
                      return sum + price * qty;
                    }, 0) + Number(c.travelFee || 0)
                  : Number(c.travelFee || 0);
                const storeItemsTotal = Array.isArray(c.storeItems)
                  ? c.storeItems.reduce((sum, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0)
                  : 0;
                const total = Number(c.totalAmount || 0);
                const hasServices = Array.isArray(c.services) && c.services.length > 0;
                const deposit = hasServices
                  ? Math.ceil(servicesEffective * 0.2 + storeItemsTotal * 0.5)
                  : Math.ceil(total * 0.5);
                return Math.max(0, total - deposit).toFixed(2);
              })()}</div>
              <div className="col-span-1 text-right">
                <div className="inline-flex items-center gap-2">
                  {c.pdfUrl && (
                    <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" title="Ver PDF" className="border-2 border-black text-black px-2 py-1 rounded-none hover:bg-black hover:text-white inline-flex items-center">
                      <LinkIcon size={14} />
                    </a>
                  )}
                  <button onClick={() => toggleFlag(c.id, 'eventCompleted')} className={`px-2 py-1 text-xs border-2 rounded-none ${c.eventCompleted ? 'bg-green-600 text-white border-green-600 hover:bg-green-700' : 'border-black text-black hover:bg-black hover:text-white'}`}>Completado</button>
                  <button onClick={() => remove(c.id)} title="Eliminar" className="border-2 border-black text-black px-2 py-1 rounded-none hover:bg-black hover:text-white inline-flex items-center"><Trash2 size={14}/></button>
                </div>
              </div>
              {expanded[c.id] && (
                <div className="col-span-12 mt-3">
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-end gap-2 mb-3">
                      <button onClick={() => openEdit(c)} title="Modificar" className="border-2 border-black text-black px-2 py-1 rounded-none hover:bg-black hover:text-white inline-flex items-center">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => remove(c.id)} title="Eliminar" className="border-2 border-black text-black px-2 py-1 rounded-none hover:bg-black hover:text-white inline-flex items-center">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="flex items-center gap-2"><Phone size={14} className="text-gray-600"/><span>{c.formSnapshot?.phone || '-'}</span></div>
                      <div className="flex items-center gap-2"><MapPin size={14} className="text-gray-600"/><span>{c.formSnapshot?.address || '-'}</span></div>
                      <div className="flex items-center gap-2"><FileText size={14} className="text-gray-600"/><span>{c.eventType || '-'}</span></div>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs font-medium mb-2 flex items-center gap-2"><FileText size={14}/> Serviços</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-600">
                              <th className="py-1">Item</th>
                              <th className="py-1">Cant.</th>
                              <th className="py-1">Precio</th>
                              <th className="py-1">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(c.services || []).map((it: any, idx: number) => {
                              const qty = Number(it.quantity ?? 1);
                              const price = Number(String(it.price || '').replace(/[^0-9]/g, ''));
                              const total = price * qty;
                              return (
                                <tr key={idx} className="border-t">
                                  <td className="py-1">{it.name || it.id || '—'}</td>
                                  <td className="py-1">{qty}</td>
                                  <td className="py-1">R$ {price.toFixed(2)}</td>
                                  <td className="py-1">R$ {total.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                            {Array.isArray(c.storeItems) && c.storeItems.map((it: any, idx: number) => (
                              <tr key={`store-${idx}`} className="border-t">
                                <td className="py-1">{it.name}</td>
                                <td className="py-1">{Number(it.quantity)}</td>
                                <td className="py-1">R$ {Number(it.price).toFixed(2)}</td>
                                <td className="py-1">R$ {(Number(it.price) * Number(it.quantity)).toFixed(2)}</td>
                              </tr>
                            ))}
                            {Number(c.travelFee || 0) > 0 && (
                              <tr className="border-t">
                                <td className="py-1">Deslocamento</td>
                                <td className="py-1">1</td>
                                <td className="py-1">R$ {Number(c.travelFee).toFixed(2)}</td>
                                <td className="py-1">R$ {Number(c.travelFee).toFixed(2)}</td>
                              </tr>
                            )}
                            {!((c.services && c.services.length) || (c.storeItems && c.storeItems.length) || Number(c.travelFee || 0) > 0) && (
                              <tr className="border-t"><td className="py-2 text-gray-500" colSpan={4}>Sin items</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <div className="text-sm font-semibold text-green-700">
                          Total: R$ {(() => {
                            const servicesTotal = (c.services || []).reduce((sum: number, it: any) => {
                              const qty = Number(it.quantity ?? 1);
                              const price = Number(String(it.price || '').replace(/[^0-9]/g, ''));
                              return sum + price * qty;
                            }, 0);
                            const storeTotal = Array.isArray(c.storeItems)
                              ? c.storeItems.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0)
                              : 0;
                            const travel = Number(c.travelFee || 0);
                            return (servicesTotal + storeTotal + travel).toFixed(2);
                          })()}
                        </div>
                      </div>
                    </div>

                    {c.message && (
                      <div className="mt-3 text-sm text-gray-700">
                        <div className="text-xs font-medium mb-1">Notas</div>
                        <div className="whitespace-pre-line">{c.message}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    {editing && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Editar Contrato</h3>
            <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-900">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Nombre</label>
              <input value={editForm.clientName || ''} onChange={e => setEditForm((f: any) => ({ ...f, clientName: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Email</label>
              <input value={editForm.clientEmail || ''} onChange={e => setEditForm((f: any) => ({ ...f, clientEmail: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Fecha evento</label>
              <input type="date" value={editForm.eventDate || ''} onChange={e => setEditForm((f: any) => ({ ...f, eventDate: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Hora</label>
              <input type="time" value={editForm.eventTime || ''} onChange={e => setEditForm((f: any) => ({ ...f, eventTime: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Total</label>
              <input type="number" step="0.01" value={editForm.totalAmount ?? 0} onChange={e => setEditForm((f: any) => ({ ...f, totalAmount: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Deslocamento</label>
              <input type="number" step="0.01" value={editForm.travelFee ?? 0} onChange={e => setEditForm((f: any) => ({ ...f, travelFee: e.target.value }))} className="w-full px-3 py-2 border rounded-none" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Notas</label>
              <textarea value={editForm.message || ''} onChange={e => setEditForm((f: any) => ({ ...f, message: e.target.value }))} className="w-full px-3 py-2 border rounded-none" rows={3} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Cancelar</button>
            <button onClick={saveEdit} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none hover:opacity-90">Guardar</button>
          </div>
        </div>
      </div>
    )}
  </div>
  );
};

export default ContractsManagement;

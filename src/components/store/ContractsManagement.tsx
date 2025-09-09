import { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { ChevronDown, ChevronUp, CheckCircle, Clock, FileText, Loader, Mail, MapPin, Phone, Settings, Trash2, User, DollarSign, Link as LinkIcon, Calendar, Pencil } from 'lucide-react';
import { defaultWorkflow } from './_contractsWorkflowHelper';

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
          {filtered.map(c => {
            const wf = (c.workflow && c.workflow.length) ? c.workflow : defaultWorkflow(c);
            const segments = wf.map(cat => {
              const total = cat.tasks.length || 1;
              const done = cat.tasks.filter(t => t.done).length;
              return total === 0 ? 0 : Math.round((done/total)*100);
            });
            return (
              <div key={c.id} className="grid grid-cols-12 p-3 items-center hover:bg-gray-50 cursor-pointer" onClick={() => openView(c)}>
                <div className="col-span-3 text-sm">{c.eventDate || '-'}</div>
                <div className="col-span-3 lowercase first-letter:uppercase">{c.clientName || 'Trabajo'}</div>
                <div className="col-span-2 text-sm">{c.eventType || '-'}</div>
                <div className="col-span-3">
                  <div className="w-full h-3 rounded bg-gray-200 overflow-hidden flex">
                    {segments.map((p, i) => (
                      <div key={i} className="relative flex-1 bg-gray-200">
                        <div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${p}%` }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-1 text-right">
                  <button onClick={(e)=>{e.stopPropagation(); openEdit(c);}} title="Editar" className="border-2 border-black text-black px-2 py-1 rounded-none hover:bg-black hover:text-white inline-flex items-center"><Pencil size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    {viewing && workflow && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setViewing(null)}>
        <div className="bg-white rounded-xl border border-gray-200 w-full max-w-5xl p-0 overflow-hidden" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <div className="text-lg font-medium">{viewing.clientName} — {viewing.eventType || 'Trabajo'}</div>
              <div className="text-xs text-gray-500">Fecha principal: {viewing.eventDate || '-' } • Hora: {viewing.eventTime || (viewing as any).eventTime || '-'}</div>
            </div>
            <button onClick={()=>setViewing(null)} className="text-gray-500 hover:text-gray-900">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div className="md:col-span-1 border-r p-4 max-h-[70vh] overflow-auto">
              <h3 className="font-medium mb-3">Workflow</h3>
              <div className="space-y-4">
                {workflow.map((cat, ci) => (
                  <div key={cat.id}>
                    <div className="text-sm font-semibold mb-2">{cat.name}</div>
                    <div className="space-y-2">
                      {cat.tasks.map((t, ti) => (
                        <label key={t.id} className="flex items-start gap-2">
                          <input type="checkbox" checked={t.done} onChange={(e)=>{
                            setWorkflow(wf=>{
                              const next = wf ? [...wf] : [];
                              next[ci] = { ...next[ci], tasks: next[ci].tasks.map((x, idx)=> idx===ti? { ...x, done: e.target.checked }: x)};
                              return next;
                            });
                          }} />
                          <div className="flex-1">
                            <div className="text-sm">{t.title}</div>
                            {t.due && <div className="text-xs text-gray-500">Vence: {new Date(t.due).toLocaleString('es-ES')}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={saveWorkflow} disabled={savingWf} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none hover:opacity-90 disabled:opacity-50">Guardar</button>
              </div>
            </div>
            <div className="md:col-span-2 p-4 max-h-[70vh] overflow-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-600">Email:</span> <span className="font-medium">{viewing.clientEmail}</span></div>
                <div><span className="text-gray-600">Método de pago:</span> <span className="font-medium">{viewing.paymentMethod || '-'}</span></div>
                <div className="flex items-center gap-2"><span className="text-gray-600">Depósito:</span> <span className={`px-2 py-0.5 rounded text-xs ${viewing.depositPaid? 'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{viewing.depositPaid? 'Pagado':'No pagado'}</span></div>
                <div className="flex items-center gap-2"><span className="text-gray-600">Restante:</span> <span className={`px-2 py-0.5 rounded text-xs ${viewing.finalPaymentPaid? 'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{viewing.finalPaymentPaid? 'Pagado':'No pagado'}</span></div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Items del contrato</div>
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
                      {(viewing.services || []).map((it: any, idx: number) => {
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
                      {Array.isArray(viewing.storeItems) && viewing.storeItems.map((it: any, idx: number) => (
                        <tr key={`store-${idx}`} className="border-t">
                          <td className="py-1">{it.name}</td>
                          <td className="py-1">{Number(it.quantity)}</td>
                          <td className="py-1">R$ {Number(it.price).toFixed(2)}</td>
                          <td className="py-1">R$ {(Number(it.price) * Number(it.quantity)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={scheduleFinalPaymentEmail} className="border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Programar email de saldo (−30 min)</button>
                {viewing.reminders?.find(r=>r.type==='finalPayment') && (
                  <span className="text-xs text-gray-600">Programado para: {new Date(viewing.reminders.find(r=>r.type==='finalPayment')!.sendAt).toLocaleString('es-ES')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
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

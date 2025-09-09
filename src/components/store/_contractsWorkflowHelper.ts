export interface WorkflowTask { id: string; title: string; done: boolean; due?: string | null; note?: string }
export interface WorkflowCategory { id: string; name: string; tasks: WorkflowTask[] }
export interface ContractLike { eventDate?: string; eventTime?: string; depositPaid?: boolean; finalPaymentPaid?: boolean }

export function defaultWorkflow(c: ContractLike): WorkflowCategory[] {
  const baseDate = c.eventDate ? new Date(c.eventDate) : new Date();
  const eventDT = c.eventDate ? new Date(`${c.eventDate}T${c.eventTime || '00:00'}`) : null;
  const d = (offsetDays: number) => new Date(baseDate.getTime() + offsetDays*86400000).toISOString();
  return [
    {
      id: 'lead', name: 'LEAD', tasks: [
        { id: 'lead-created', title: 'Lead creado', done: true, due: d(0) },
        { id: 'lead-email', title: 'Respuesta al lead (email automático)', done: false, due: d(0) },
        { id: 'lead-follow', title: 'Seguimiento al lead (email)', done: false, due: d(0) },
      ]
    },
    {
      id: 'produccion', name: 'PRODUCCIÓN', tasks: [
        { id: 'accepted', title: 'Trabajo aceptado', done: Boolean(c.depositPaid), due: d(0) },
        { id: 'thanks', title: 'Gracias por reservar (email auto)', done: false, due: d(1) },
        { id: 'gift', title: 'Enviar regalo a la novia', done: false, due: d(60) },
        { id: 'schedule', title: 'Organizar cronograma', done: false, due: d(320) },
        { id: 'pre-meeting', title: 'Reunión previa', done: false, due: d(-14) },
        { id: 'main-shoot', title: 'Sesión principal', done: false, due: eventDT ? eventDT.toISOString() : d(365) },
      ]
    },
    {
      id: 'post', name: 'POST PRODUCCIÓN', tasks: [
        { id: 'sneak', title: 'Subir sneak peek', done: false, due: d(1) },
        { id: 'email-sneak', title: 'Enviar sneak peek (email)', done: false, due: d(1) },
        { id: 'deliver', title: 'Entregar galería completa', done: false, due: d(21) },
        { id: 'done', title: 'Trabajo completo', done: Boolean(c.finalPaymentPaid), due: d(30) },
      ]
    },
  ];
}

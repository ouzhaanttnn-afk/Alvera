import { supabase, type Store, type SubmitInput, type Filters } from './db';
import type { Application, Document, History, Outbox, Status } from './types';
export class SupabaseStore implements Store {
  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase().rpc(name, args);
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as T;
  }
  async submit(v: SubmitInput) {
    return this.rpc<Application>('submit_application', { v });
  }
  async list(f: Filters) {
    let q = supabase()
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false })
      .range(((f.page || 1) - 1) * 50, (f.page || 1) * 50 - 1);
    if (f.reference) q = q.like('reference', `${f.reference}%`);
    if (f.status) q = q.eq('status', f.status);
    if (f.from) q = q.gte('created_at', f.from);
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59.999Z`);
    const { data, error } = await q;
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Application[];
  }
  async get(id: string) {
    const { data, error } = await supabase()
      .from('applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Application | null;
  }
  async byIntake(id: string) {
    const { data, error } = await supabase()
      .from('applications')
      .select('*')
      .eq('intake_id', id)
      .maybeSingle();
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Application | null;
  }
  async addDocument(d: Document) {
    await this.rpc('register_document', { v: d });
  }
  async documents(id: string) {
    const { data, error } = await supabase()
      .from('application_documents')
      .select('*')
      .eq('application_id', id);
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Document[];
  }
  async document(id: string) {
    const { data, error } = await supabase()
      .from('application_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Document | null;
  }
  async history(id: string) {
    const { data, error } = await supabase()
      .from('application_status_history')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false });
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as History[];
  }
  async outbox(id: string) {
    const { data, error } = await supabase()
      .from('notification_outbox')
      .select('*')
      .eq('application_id', id);
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Outbox[];
  }
  async change(id: string, actor: string, status: Status, note: string) {
    await this.rpc('admin_action', {
      app_id: id,
      actor,
      action: 'STATUS_CHANGED',
      new_status: status,
      note,
    });
  }
  async note(id: string, actor: string, note: string) {
    await this.rpc('admin_action', {
      app_id: id,
      actor,
      action: 'NOTE_ADDED',
      new_status: null,
      note,
    });
  }
  async audit(id: string, actor: string, action: string) {
    const { error } = await supabase()
      .from('audit_logs')
      .insert({ application_id: id || null, actor, action });
    if (error) throw new Error('AUDIT_FAILED');
  }
  async deletion(id: string, actor: string, execute: boolean) {
    await this.rpc('admin_action', {
      app_id: id,
      actor,
      action: execute ? 'DELETED' : 'DELETION_REQUESTED',
      new_status: null,
      note: null,
    });
  }
  async claim() {
    return this.rpc<Outbox[]>('claim_notifications', {});
  }
  async finish(id: string, lease: string, success: boolean) {
    await this.rpc('finish_notification', { item_id: id, lease, success });
  }
  async rate(key: string, limit: number, seconds: number) {
    return this.rpc<boolean>('take_rate_limit', {
      rate_key: key,
      max_hits: limit,
      window_seconds: seconds,
    });
  }
  async orphaned(before: string) {
    const { data, error } = await supabase()
      .from('application_documents')
      .select('*')
      .is('application_id', null)
      .lt('created_at', before)
      .limit(200);
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Document[];
  }
  async deleteDocument(id: string) {
    const { error } = await supabase()
      .from('application_documents')
      .delete()
      .eq('id', id)
      .is('application_id', null);
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
  }
  async expired(before: string) {
    const { data, error } = await supabase()
      .from('applications')
      .select('*')
      .lt('created_at', before)
      .is('deletion_requested_at', null)
      .limit(100);
    if (error) throw new Error('DATABASE_OPERATION_FAILED');
    return data as Application[];
  }
}

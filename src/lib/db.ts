import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import type { Application, Document, History, Outbox, Status } from './types';
export type SubmitInput = {
  id: string;
  intake: string;
  payload: string;
  kind: string;
  masked: string;
  notice: string;
  documents: string[];
  receipt: boolean;
};
export type Filters = {
  reference?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
};
export interface Store {
  submit(input: SubmitInput): Promise<Application>;
  list(filters: Filters): Promise<Application[]>;
  get(id: string): Promise<Application | null>;
  byIntake(id: string): Promise<Application | null>;
  addDocument(doc: Document): Promise<void>;
  documents(id: string): Promise<Document[]>;
  document(id: string): Promise<Document | null>;
  history(id: string): Promise<History[]>;
  outbox(id: string): Promise<Outbox[]>;
  change(id: string, actor: string, status: Status, note: string): Promise<void>;
  note(id: string, actor: string, note: string): Promise<void>;
  audit(id: string, actor: string, action: string): Promise<void>;
  deletion(id: string, actor: string, execute: boolean): Promise<void>;
  claim(): Promise<Outbox[]>;
  finish(id: string, lease: string, success: boolean): Promise<void>;
  rate(key: string, limit: number, seconds: number): Promise<boolean>;
  orphaned(before: string): Promise<Document[]>;
  deleteDocument(id: string): Promise<void>;
  expired(before: string): Promise<Application[]>;
}
let remote: SupabaseClient | undefined;
export function supabase() {
  const c = config('admin');
  if (c.local) throw new Error('REMOTE_DISABLED');
  return (remote ||= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ));
}
let local: Store | undefined;
export async function store(): Promise<Store> {
  if (config('admin').local) {
    if (!local) {
      const { LocalStore } = await import('./local-store');
      local = new LocalStore();
    }
    return local;
  }
  const { SupabaseStore } = await import('./supabase-store');
  return new SupabaseStore();
}

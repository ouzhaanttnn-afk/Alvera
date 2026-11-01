'use server';
// Tüm sunucu eylemleri: her biri oturumu ve izni yeniden doğrular (UI gizleme güvenlik sınırı değildir).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import type { FormState } from '@/masak-raporu/ui/form';
import type { Mapping } from '@/masak-raporu/csv';
import { AppError, safeMessage } from '@/masak-raporu/server/errors';
import { clientKey, cookieOptions, getCtx, ORG_COOKIE, type Ctx } from '@/masak-raporu/server/session';
import { acceptInvitation, createInvitation, inviteSchema, logout, mfaStep, passwordStep } from '@/masak-raporu/server/auth';
import { addIdentityCheck, addPerson, confirmIdentityCheck, createCustomer, getCustomer, updateCustomer } from '@/masak-raporu/server/customers';
import { cancelTransaction, correctTransaction, createTransaction, decideLinkGroup, evaluateTransaction, proposeLinkGroup } from '@/masak-raporu/server/transactions';
import { reviewAlert } from '@/masak-raporu/server/alerts';
import { linkCaseTransaction, submitCase, updateCase } from '@/masak-raporu/server/cases';
import { requestDeletionReview } from '@/masak-raporu/server/documents';
import { commitImport, previewImport, type ImportPreview } from '@/masak-raporu/server/imports';
import { draftRule, revokeInvitation, setRuleStatus, updateMember, updateOrganization, updateRetention } from '@/masak-raporu/server/admin';

async function mustCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new AppError('LOGIN_REQUIRED', 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.', 401);
  return ctx;
}

function obj(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('$ACTION')) continue;
    if (k.endsWith('[]')) ((out[k.slice(0, -2)] ||= []) as unknown[]).push(v);
    else out[k] = typeof v === 'string' ? v : v;
  }
  return out;
}

async function run(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) || { ok: true };
  } catch (e) {
    if (e instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const i of e.issues) fields[i.path.join('.') || `_${Object.keys(fields).length}`] = i.message;
      return { error: 'Lütfen aşağıdaki alanları düzeltin.', fields };
    }
    return { error: safeMessage(e) };
  }
}

const id = (fd: FormData, key = 'id') => {
  const v = String(fd.get(key) || '');
  if (!/^[0-9a-f-]{36}$/.test(v)) throw new AppError('INVALID_ID', 'Geçersiz kayıt.');
  return v;
};

// ---------- Oturum ----------
export async function loginPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const email = String(fd.get('email') || '').trim().slice(0, 254);
    const password = String(fd.get('password') || '').slice(0, 200);
    if (!email || !password) throw new AppError('REQUIRED', 'E-posta ve parola gerekli.');
    return { ok: true, data: await passwordStep(email, password, await clientKey()) };
  });
}

export async function loginMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await run(async () => mfaStep(String(fd.get('code') || '').replace(/\s/g, ''), await clientKey()));
  if (r.ok) redirect('/masak-raporu');
  return r;
}

export async function logoutAction() {
  await logout(await getCtx().catch(() => null));
  redirect('/masak-raporu/giris');
}

export async function switchOrgAction(fd: FormData) {
  const ctx = await mustCtx();
  const org = String(fd.get('organization_id') || '');
  if (ctx.memberships.some((m) => m.organizationId === org)) (await cookies()).set(ORG_COOKIE, org, cookieOptions(60 * 60 * 24 * 30));
  redirect('/masak-raporu');
}

export async function acceptInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await run(async () => {
    if (fd.get('password') !== fd.get('password2')) throw new AppError('MISMATCH', 'Parolalar eşleşmiyor.');
    await acceptInvitation(String(fd.get('token') || ''), String(fd.get('full_name') || ''), String(fd.get('password') || ''), await clientKey());
  });
  if (r.ok) redirect('/masak-raporu/giris?davet=1');
  return r;
}

// ---------- Müşteriler ----------
export async function createCustomerAction(_: FormState, fd: FormData): Promise<FormState> {
  let target = '';
  const r = await run(async () => {
    const res = await createCustomer(await mustCtx(), obj(fd));
    if (res.duplicates)
      return {
        error: res.duplicates.some((d) => d.reason.startsWith('Aynı kimlik'))
          ? 'Bu kimlik/vergi numarasıyla kayıtlı bir müşteri zaten var. Mevcut kaydı kullanın.'
          : 'Benzer bir müşteri kaydı bulundu. Farklı kişi olduğundan eminseniz "Yine de kaydet" kutusunu işaretleyin.',
        fields: Object.fromEntries(res.duplicates.map((d) => [d.id, `${d.display_name} — ${d.reason}`])),
      };
    target = `/masak-raporu/musteriler/${res.id}`;
  });
  if (target) redirect(target);
  return r;
}

export async function updateCustomerAction(_: FormState, fd: FormData): Promise<FormState> {
  let target = '';
  const r = await run(async () => {
    const cid = id(fd);
    const res = await updateCustomer(await mustCtx(), cid, obj(fd));
    if ('duplicates' in res && res.duplicates) return { error: 'Bu kimlik/vergi numarası başka bir müşteri kaydında kullanılıyor.' };
    target = `/masak-raporu/musteriler/${cid}`;
  });
  if (target) redirect(target);
  return r;
}

export async function revealCustomerAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const d = await getCustomer(await mustCtx(), id(fd), true);
    return { ok: true, data: d.revealed };
  });
}

export async function identityCheckAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const cid = id(fd, 'customer_id');
    const r = await addIdentityCheck(await mustCtx(), cid, obj(fd));
    revalidatePath(`/masak-raporu/musteriler/${cid}`);
    return { ok: true, message: r.status === 'verified' ? 'Kimlik teyidi onaylı olarak kaydedildi.' : 'Teyit kaydı oluşturuldu; onay bekliyor.' };
  });
}

export async function confirmCheckAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await confirmIdentityCheck(await mustCtx(), id(fd), fd.get('ocr_confirmed') === 'on');
    revalidatePath(`/masak-raporu/musteriler/${id(fd, 'customer_id')}`);
    return { ok: true, message: 'Teyit onaylandı.' };
  });
}

export async function addPersonAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const cid = id(fd, 'customer_id');
    await addPerson(await mustCtx(), cid, fd.get('person_kind') === 'owner' ? 'owner' : 'representative', obj(fd));
    revalidatePath(`/masak-raporu/musteriler/${cid}`);
    return { ok: true, message: 'Kayıt eklendi.' };
  });
}

// ---------- İşlemler ----------
export async function createTransactionAction(_: FormState, fd: FormData): Promise<FormState> {
  let target = '';
  const r = await run(async () => {
    const t = await createTransaction(await mustCtx(), obj(fd));
    target = `/masak-raporu/islemler/${t.id}?yeni=1`;
  });
  if (target) redirect(target);
  return r;
}

export async function cancelTransactionAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await cancelTransaction(await mustCtx(), id(fd), String(fd.get('reason') || ''));
    revalidatePath(`/masak-raporu/islemler/${id(fd)}`);
    return { ok: true, message: 'İşlem iptal edildi. Kayıt ve geçmişi korunuyor.' };
  });
}

export async function correctTransactionAction(_: FormState, fd: FormData): Promise<FormState> {
  let target = '';
  const r = await run(async () => {
    const t = await correctTransaction(await mustCtx(), id(fd), obj(fd), String(fd.get('reason') || ''));
    target = `/masak-raporu/islemler/${t.id}`;
  });
  if (target) redirect(target);
  return r;
}

export async function reevaluateAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const ctx = await mustCtx();
    ctx.need('records.write');
    await ctx.db((sql) => evaluateTransaction(ctx, sql, id(fd)));
    revalidatePath(`/masak-raporu/islemler/${id(fd)}`);
    return { ok: true, message: 'Kurallar güncel versiyonlarla yeniden değerlendirildi.' };
  });
}

export async function proposeLinkAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const o = obj(fd);
    await proposeLinkGroup(await mustCtx(), (o.transactions as string[]) || [], (o.basis as string[]) || [], String(o.rationale || ''));
    revalidatePath('/masak-raporu/islemler/baglantilar');
    return { ok: true, message: 'Bağlantı önerisi kaydedildi. Yetkili kişinin kararı bekleniyor; karar verilene kadar tutarlar toplanmaz.' };
  });
}

export async function decideLinkAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await decideLinkGroup(await mustCtx(), id(fd), fd.get('decision') === 'confirmed' ? 'confirmed' : 'rejected', String(fd.get('note') || ''));
    revalidatePath('/masak-raporu/islemler/baglantilar');
    return { ok: true, message: 'Karar kaydedildi ve ilgili işlemler yeniden değerlendirildi.' };
  });
}

export async function reviewAlertAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await reviewAlert(await mustCtx(), id(fd), obj(fd));
    revalidatePath('/masak-raporu/uyarilar');
    return { ok: true, message: 'Değerlendirme kaydedildi.' };
  });
}

// ---------- İç incelemeler (ŞİB hazırlık) ----------
export async function submitCaseAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const o = obj(fd);
    const number = await submitCase(await mustCtx(), { ...o, transactions: (o.transactions as string[]) || [] });
    return { ok: true, message: `İç değerlendirme kaydı ${number} numarasıyla yetkiliye iletildi. Bu bilgiyi müşteriyle veya yetkisiz kişilerle paylaşmayın.` };
  });
}

export async function updateCaseAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await updateCase(await mustCtx(), id(fd), obj(fd));
    revalidatePath(`/masak-raporu/incelemeler/${id(fd)}`);
    return { ok: true, message: 'İnceleme güncellendi.' };
  });
}

export async function linkCaseTxAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await linkCaseTransaction(await mustCtx(), id(fd), id(fd, 'transaction_id'));
    revalidatePath(`/masak-raporu/incelemeler/${id(fd)}`);
    return { ok: true, message: 'İşlem incelemeye bağlandı.' };
  });
}

// ---------- Belgeler ----------
export async function deletionReviewAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await requestDeletionReview(await mustCtx(), id(fd));
    revalidatePath('/masak-raporu/belgeler');
    return { ok: true, message: 'Silme değerlendirme talebi kaydedildi. Belge yasal saklama süresi ve istisnalar incelenmeden silinmez.' };
  });
}

// ---------- CSV içe aktarma ----------
export async function previewImportAction(csv: string, mapping: Mapping): Promise<{ preview?: ImportPreview; error?: string }> {
  try {
    return { preview: await previewImport(await mustCtx(), String(csv), mapping) };
  } catch (e) {
    return { error: safeMessage(e) };
  }
}
export async function commitImportAction(csv: string, mapping: Mapping): Promise<{ imported?: number; skipped?: number; error?: string }> {
  try {
    const r = await commitImport(await mustCtx(), String(csv), mapping);
    revalidatePath('/masak-raporu/islemler');
    return { imported: r.imported, skipped: r.skipped };
  } catch (e) {
    return { error: safeMessage(e) };
  }
}

// ---------- Personel ve ayarlar ----------
export async function inviteAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const link = await createInvitation(await mustCtx(), inviteSchema.parse(obj(fd)));
    revalidatePath('/masak-raporu/ayarlar/personel');
    return { ok: true, message: 'Davet oluşturuldu. Bağlantı yalnızca şimdi gösterilir; güvenli bir kanalla iletin (72 saat geçerli).', data: link };
  });
}

export async function updateMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const o = obj(fd);
    await updateMember(await mustCtx(), id(fd), { role: o.role, granted: o.granted || [], revoked: o.revoked || [], active: o.active === 'on' });
    revalidatePath('/masak-raporu/ayarlar/personel');
    return { ok: true, message: 'Yetkiler güncellendi.' };
  });
}

export async function revokeInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await revokeInvitation(await mustCtx(), id(fd));
    revalidatePath('/masak-raporu/ayarlar/personel');
  });
}

export async function draftRuleAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await draftRule(await mustCtx(), obj(fd));
    revalidatePath('/masak-raporu/ayarlar/kurallar');
    return { ok: true, message: 'Kural taslağı oluşturuldu. Onay ve test sonrasında aktifleştirilebilir.' };
  });
}

export async function ruleStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const s = String(fd.get('status'));
    if (!['approved', 'active', 'retired'].includes(s)) throw new AppError('INVALID', 'Geçersiz durum.');
    await setRuleStatus(await mustCtx(), id(fd), s as 'approved', fd.get('tested') === 'on');
    revalidatePath('/masak-raporu/ayarlar/kurallar');
  });
}

export async function updateOrgAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await updateOrganization(await mustCtx(), obj(fd));
    revalidatePath('/masak-raporu/ayarlar');
    return { ok: true, message: 'İşletme bilgileri kaydedildi.' };
  });
}

export async function retentionAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await updateRetention(await mustCtx(), String(fd.get('entity')), Number(fd.get('years')), String(fd.get('basis') || ''), fd.get('approve') === 'on');
    revalidatePath('/masak-raporu/ayarlar');
    return { ok: true, message: 'Saklama politikası güncellendi.' };
  });
}

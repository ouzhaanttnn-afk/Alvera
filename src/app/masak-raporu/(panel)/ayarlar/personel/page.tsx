import { listMembers, memberActivity } from '@/masak-raporu/server/admin';
import { ACTION_LABELS } from '@/masak-raporu/server/audit';
import { requireCtx } from '@/masak-raporu/server/session';
import { ADJUSTABLE, PERMISSION_LABELS, PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, ROLES, type Role } from '@/masak-raporu/permissions';
import { formatDateTime } from '@/masak-raporu/dates';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Badge, Card, PageHeader } from '@/masak-raporu/ui/ui';
import { InviteForm } from '@/masak-raporu/ui/invite-form';
import { revokeInviteAction, updateMemberAction } from '../../../actions';

export const metadata = { title: 'Personel ve roller' };

export default async function Members({ searchParams }: { searchParams: Promise<{ kisi?: string }> }) {
  const ctx = await requireCtx('records.read');
  const { kisi } = await searchParams;
  const { members, invitations } = await listMembers(ctx);
  const manage = ctx.can('members.manage');
  const activity = kisi && /^[0-9a-f-]{36}$/.test(kisi) && ctx.can('audit.view') ? await memberActivity(ctx, kisi) : null;
  return (
    <>
      <PageHeader title="Personel ve roller" description="Personel yalnızca davetle eklenir; açık kayıt yoktur. Yetkiler veritabanında da uygulanır." />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card title="Personel">
          <div className="overflow-x-auto"><table className="mr-table">
            <thead><tr><th scope="col">Ad soyad</th><th scope="col">Rol</th><th scope="col">Ek / kısıtlı izin</th><th scope="col">Son giriş</th><th scope="col"><span className="mr-sr">İşlemler</span></th></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={String(m.id)}>
                <td><strong>{String(m.full_name)}</strong><span className="mr-hint block">{String(m.email)}</span>{!m.active && <Badge tone="danger">Pasif</Badge>}</td>
                <td>{ROLE_LABELS[m.role as Role]}</td>
                <td className="text-[12px]">{[...(m.granted as string[]).map((g) => `+ ${PERMISSION_LABELS[g as keyof typeof PERMISSION_LABELS]}`), ...(m.revoked as string[]).map((g) => `− ${PERMISSION_LABELS[g as keyof typeof PERMISSION_LABELS]}`)].join(', ') || '—'}</td>
                <td>{formatDateTime(m.last_sign_in_at as Date)}</td>
                <td className="whitespace-nowrap">
                  {ctx.can('audit.view') && <a className="mr-btn" href={`/masak-raporu/ayarlar/personel?kisi=${m.user_id}`}>Geçmiş</a>}
                  {manage && m.user_id !== ctx.user.id && (
                    <details className="mt-1"><summary className="text-[12.5px] font-semibold text-[#794c2b]">Yetki düzenle</summary>
                      <ActionForm action={updateMemberAction} className="mt-2 w-[260px] space-y-2 text-[13px]">
                        <input type="hidden" name="id" value={String(m.id)} />
                        <div><label className="mr-label" htmlFor={`r-${m.id}`}>Rol</label><select className="mr-input" id={`r-${m.id}`} name="role" defaultValue={String(m.role)}>{ROLES.filter((r) => r !== 'owner' || ctx.org.role === 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
                        <fieldset><legend className="mr-label">Ek izin ver</legend>{ADJUSTABLE.map((p) => <label key={p} className="flex items-center gap-2"><input type="checkbox" name="granted[]" value={p} defaultChecked={(m.granted as string[]).includes(p)} className="accent-[#794c2b]" />{PERMISSION_LABELS[p]}</label>)}</fieldset>
                        <fieldset><legend className="mr-label">Rol izninden kaldır</legend>{ADJUSTABLE.map((p) => <label key={p} className="flex items-center gap-2"><input type="checkbox" name="revoked[]" value={p} defaultChecked={(m.revoked as string[]).includes(p)} className="accent-[#794c2b]" />{PERMISSION_LABELS[p]}</label>)}</fieldset>
                        <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={Boolean(m.active)} className="accent-[#794c2b]" /> Hesap aktif</label>
                        <Submit variant="default">Kaydet</Submit>
                      </ActionForm>
                    </details>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          {activity && (
            <div className="mt-4">
              <h3 className="text-[13px] font-bold">Seçili personelin yetkili işlem geçmişi (son 50)</h3>
              <ul className="mt-2 divide-y divide-[#efe6db] text-[13px]">{activity.map((a, i) => <li key={i} className="py-1">{ACTION_LABELS[String(a.action)] || String(a.action)} <span className="mr-hint">· {formatDateTime(a.created_at as Date)}</span></li>)}</ul>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          {manage && (
            <Card title="Davet gönder">
              <InviteForm canOwner={ctx.org.role === 'owner'} />
              {invitations.length > 0 && (
                <ul className="mt-4 divide-y divide-[#efe6db] text-[13px]">{invitations.map((i) => (
                  <li key={String(i.id)} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>{String(i.email)} · {ROLE_LABELS[i.role as Role]} <span className="mr-hint block">{i.accepted_at ? `Kabul: ${formatDateTime(i.accepted_at as Date)}` : i.revoked_at ? 'İptal edildi' : `Son: ${formatDateTime(i.expires_at as Date)}`}</span></span>
                    {!i.accepted_at && !i.revoked_at && <ActionForm action={revokeInviteAction}><input type="hidden" name="id" value={String(i.id)} /><Submit variant="danger">İptal</Submit></ActionForm>}
                  </li>
                ))}</ul>
              )}
            </Card>
          )}
          <Card title="Rol ve izin matrisi">
            <div className="overflow-x-auto"><table className="mr-table text-[11.5px]">
              <thead><tr><th scope="col">İzin</th>{ROLES.map((r) => <th key={r} scope="col" className="text-center">{ROLE_LABELS[r]}</th>)}</tr></thead>
              <tbody>{PERMISSIONS.map((p) => <tr key={p}><td>{PERMISSION_LABELS[p]}</td>{ROLES.map((r) => <td key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p) ? <span aria-label="var">✓</span> : <span aria-label="yok" className="text-[#c2b4a5]">—</span>}</td>)}</tr>)}</tbody>
            </table></div>
          </Card>
        </div>
      </div>
    </>
  );
}

import { INDICATORS, listRules } from '@/masak-raporu/server/admin';
import { requireCtx } from '@/masak-raporu/server/session';
import { formatDate, istanbulDate } from '@/masak-raporu/dates';
import { formatKurus } from '@/masak-raporu/money';
import { LEVEL_LABELS, type Level } from '@/masak-raporu/rules/engine';
import { ActionForm, Submit } from '@/masak-raporu/ui/form';
import { Badge, Card, LevelBadge, Notice, PageHeader } from '@/masak-raporu/ui/ui';
import { draftRuleAction, ruleStatusAction } from '../../../actions';

export const metadata = { title: 'Mevzuat ve kurallar' };
const STATUS: Record<string, string> = { draft: 'Taslak', approved: 'Onaylı', active: 'Aktif', retired: 'Kullanımdan kalktı' };

export default async function Rules() {
  const ctx = await requireCtx('records.read');
  const rules = await listRules(ctx);
  const today = istanbulDate(new Date());
  const keys = [...new Set(rules.map((r) => String(r.rule_key)))];
  return (
    <>
      <PageHeader title="Tarihe bağlı kurallar ve mevzuat kaynakları" description="Her işlem, işlem tarihinde yürürlükte olan kural versiyonuyla değerlendirilir. Kaynak bağlantıları ve son kontrol tarihleri aşağıdadır." />
      <div className="mb-4 space-y-2">
        <Notice tone="warn">Sistem genel kuralları (yasal eşikler) yalnızca kod incelemesi, otomatik test ve veritabanı migration&apos;ı ile değişir. İnternetteki bir haberden otomatik kural üretilmez. Resmî Gazete&apos;deki değişiklikler yürürlük tarihi doğrulanarak eklenir; &quot;hukuki doğrulama gerekiyor&quot; işaretli kuralları hukuk danışmanınızla teyit edin.</Notice>
        <Notice>Bu sayfa uyumluluk sertifikası değildir. &quot;Bağlantılı işlem&quot; mevzuatta tanımlı değildir; sistem işlemleri otomatik bağlamaz, toplama yalnızca yetkili kararıyla yapılır.</Notice>
      </div>
      <div className="space-y-3">
        {keys.map((key) => {
          const versions = rules.filter((r) => r.rule_key === key);
          const current = versions.find((r) => r.status === 'active' && String(r.valid_from) <= today && (!r.valid_to || String(r.valid_to) >= today));
          return (
            <Card key={key} title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{key}</span> {String(versions[0].title)} {Boolean(versions[0].organization_id) ? <Badge>İşletmeye özel</Badge> : <Badge tone="neutral">Sistem geneli</Badge>}</span>}>
              <p className="mb-2 text-[13px] text-[#5f4d40]">{String(versions[0].scope)}</p>
              <div className="overflow-x-auto"><table className="mr-table">
                <thead><tr><th scope="col">Versiyon</th><th scope="col">Eşik</th><th scope="col">Yürürlük</th><th scope="col">Seviye</th><th scope="col">Kaynak</th><th scope="col">Son kontrol</th><th scope="col">Durum</th></tr></thead>
                <tbody>{versions.map((r) => (
                  <tr key={String(r.id)} className={r === current ? 'bg-[#fbf6ec]' : ''}>
                    <td>v{String(r.version)} {r === current && <Badge tone="ok">Bugün geçerli</Badge>}</td>
                    <td className="mr-num">{r.threshold ? formatKurus(String(r.threshold)) : 'Tutardan bağımsız'}</td>
                    <td>{formatDate(String(r.valid_from))} – {r.valid_to ? formatDate(String(r.valid_to)) : '…'}</td>
                    <td><LevelBadge level={r.level as Level} /></td>
                    <td className="max-w-[320px]"><a className="underline" href={String(r.source_url)} target="_blank" rel="noopener noreferrer">{String(r.source_article)}</a></td>
                    <td>{formatDate(String(r.last_verified_at))} {Boolean(r.legal_review_required) && <Badge tone="warn">Hukuki doğrulama gerekiyor</Badge>}</td>
                    <td>{STATUS[String(r.status)]}{r.approved_by_name ? <span className="mr-hint block">Onay: {String(r.approved_by_name)}</span> : null}
                      {Boolean(r.organization_id) && ctx.can('rules.approve') && ['draft', 'approved'].includes(String(r.status)) && (
                        <ActionForm action={ruleStatusAction} className="mt-1 space-y-1">
                          <input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="status" value={r.status === 'draft' ? 'approved' : 'active'} />
                          <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" name="tested" className="accent-[#794c2b]" /> Örnek işlemlerle test edildi</label>
                          <Submit variant="default">{r.status === 'draft' ? 'Onayla' : 'Aktifleştir'}</Submit>
                        </ActionForm>
                      )}
                      {Boolean(r.organization_id) && ctx.can('rules.manage') && ['approved', 'active'].includes(String(r.status)) && (
                        <ActionForm action={ruleStatusAction} className="mt-1"><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="status" value="retired" /><Submit variant="danger">Kullanımdan kaldır</Submit></ActionForm>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            </Card>
          );
        })}
      </div>
      {ctx.can('rules.manage') && (
        <Card title="İşletmeye özel iç gösterge kuralı (taslak)" className="mt-4">
          <p className="mb-2 text-[13px] text-[#5f4d40]">Yalnızca iç risk göstergeleri için. Taslak → onay → aktifleştirme adımları ayrı ayrı kaydedilir. Aynı gösterge için sistem kuralının önüne geçer.</p>
          <ActionForm action={draftRuleAction} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div><label className="mr-label" htmlFor="indicator">Gösterge</label><select className="mr-input" id="indicator" name="indicator">{Object.entries(INDICATORS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
            <div><label className="mr-label" htmlFor="level">Seviye</label><select className="mr-input" id="level" name="level">{Object.entries(LEVEL_LABELS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
            <div><label className="mr-label" htmlFor="window_days">Pencere (gün)</label><input className="mr-input" id="window_days" name="window_days" type="number" min={1} max={90} defaultValue={7} /></div>
            <div><label className="mr-label" htmlFor="valid_from">Başlangıç</label><input className="mr-input" id="valid_from" name="valid_from" type="date" defaultValue={today} /></div>
            <div className="sm:col-span-2 lg:col-span-4"><label className="mr-label" htmlFor="rnotes">Gerekçe ve dayanak</label><textarea className="mr-input" id="rnotes" name="notes" required minLength={10} rows={2} /></div>
            <div><Submit>Taslak oluştur</Submit></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}

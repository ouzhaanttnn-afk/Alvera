'use client';
import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormAction, FormState } from './form';
import { Submit } from './form';

/** Hassas alanları yalnızca açık talep üzerine (ve denetim izine yazılarak) gösterir. */
export function Reveal({ action, id }: { action: FormAction; id: string }) {
  const [state, run] = useActionState(action, {} as FormState);
  const data = state.data as { identity?: string; tax?: string; document?: string } | null | undefined;
  return (
    <form action={run} className="text-[13px]">
      <input type="hidden" name="id" value={id} />
      {data ? (
        <div className="rounded border border-[#ecd29a] bg-[#fff8e8] p-2">
          {data.identity && <p>Kimlik no: <span className="font-mono">{data.identity}</span></p>}
          {data.tax && <p>Vergi no: <span className="font-mono">{data.tax}</span></p>}
          {data.document && <p>Belge seri/no: <span className="font-mono">{data.document}</span></p>}
          {!data.identity && !data.tax && !data.document && <p>Kayıtlı açık bilgi yok.</p>}
          <p className="mr-hint">Bu görüntüleme denetim izine kaydedildi.</p>
        </div>
      ) : (
        <>
          {state.error && <p role="alert" className="text-[#8c1f24]">{state.error}</p>}
          <Submit variant="default">Açık bilgiyi göster (kayıt altına alınır)</Submit>
        </>
      )}
    </form>
  );
}

/** Belge yükleme: içerik türü sunucuda baytlardan doğrulanır, dosya şifrelenip özel depoya yazılır. */
export function UploadDocument({ relation, kinds, allowConfidential = false }: { relation: Record<string, string>; kinds: Record<string, string>; allowConfidential?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const fd = new FormData(e.currentTarget);
        for (const [k, v] of Object.entries(relation)) fd.set(k, v);
        try {
          const r = await fetch('/api/masak-raporu/belge', { method: 'POST', body: fd, headers: { 'x-requested-with': 'masak-raporu' } });
          const j = await r.json();
          if (!r.ok) setMsg({ ok: false, text: j.error || 'Yükleme başarısız.' });
          else {
            setMsg({ ok: true, text: `Belge yüklendi (versiyon ${j.version}).` });
            (e.target as HTMLFormElement).reset();
            router.refresh();
          }
        } catch {
          setMsg({ ok: false, text: 'Bağlantı hatası.' });
        }
        setBusy(false);
      }}
    >
      <div>
        <label className="mr-label" htmlFor="doc-title">Belge başlığı</label>
        <input className="mr-input" id="doc-title" name="title" required maxLength={200} />
      </div>
      <div>
        <label className="mr-label" htmlFor="doc-kind">Tür</label>
        <select className="mr-input" id="doc-kind" name="kind" defaultValue={allowConfidential ? 'ic_inceleme' : 'diger'}>
          {Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="sm:col-span-3">
        <label className="mr-label" htmlFor="doc-file">Dosya (PDF, JPEG, PNG, WEBP · en fazla 10 MB)</label>
        <input id="doc-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="block text-[13px]" />
      </div>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button className="mr-btn mr-btn-primary" type="submit" disabled={busy}>{busy ? 'Yükleniyor…' : 'Yükle'}</button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-[13px] ${msg.ok ? 'text-[#245a2f]' : 'text-[#8c1f24]'}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

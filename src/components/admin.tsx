'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Brand } from './brand';
import {
  statuses,
  statusLabels,
  transitions,
  type Application,
  type Detail,
  type History,
  type Status,
} from '@/lib/types';
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      (
        {
          LOGIN_FAILED: 'Giriş bilgileri doğrulanamadı.',
          MFA_FAILED: 'Doğrulama kodu hatalı.',
          RATE_LIMITED: 'Çok fazla deneme. Daha sonra tekrar deneyin.',
          INVALID_TRANSITION: 'Bu durum değişikliğine izin verilmiyor.',
          ADMIN_REQUIRED: 'Bu hesap yönetici olarak yetkilendirilmemiş.',
          LOGIN_REQUIRED: 'Oturum süreniz doldu. Yeniden giriş yapın.',
          MFA_REQUIRED: 'İki aşamalı doğrulamayı tamamlayın.',
          DELETION_CONFIRMATION_REQUIRED:
            'Silme talebi ve referans numarası doğrulaması gerekiyor.',
        } as Record<string, string>
      )[data.error] || 'İşlem tamamlanamadı. Yapılandırmayı veya bağlantınızı kontrol edin.',
    );
  return data as T;
}
function Login({ local, onLogin }: { local: boolean; onLogin: () => void }) {
  const [phase, setPhase] = useState<'password' | 'mfa'>('password'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [factor, setFactor] = useState<{ factorId?: string; qr?: string; secret?: string }>({});
  const login = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      if (phase === 'password') {
        const result = await api<typeof factor>('/api/masak/auth/password', {
          email: f.get('email') || '',
          password: f.get('password'),
        });
        setFactor(result);
        setPhase('mfa');
      } else {
        await api('/api/masak/auth/mfa', { code: f.get('code'), factorId: factor.factorId });
        onLogin();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page" id="main-content">
      <div className="login-card">
        <Brand />
        <h1>{phase === 'password' ? 'Yönetici girişi' : 'İki aşamalı doğrulama'}</h1>
        <p>
          {phase === 'password'
            ? 'Başvuruları yönetmek için yetkili hesabınızla giriş yapın.'
            : 'Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin.'}
        </p>
        {local && (
          <div className="info-box">
            <InfoIcon />
            <span>
              Yerel geliştirme oturumu. Parola ve geliştirme kodu .env.local dosyanızda belirlenir.
              Bu mekanizma production MFA yerine kullanılamaz.
            </span>
          </div>
        )}
        {factor.qr && (
          <>
            <img
              className="mfa-qr"
              src={factor.qr}
              alt="Kimlik doğrulayıcıya eklenecek TOTP QR kodu"
            />
            <p>QR kodu tarayın veya aşağıdaki anahtarı uygulamanıza ekleyin.</p>
            <div className="totp-secret">{factor.secret}</div>
          </>
        )}
        <form onSubmit={login}>
          {phase === 'password' ? (
            <>
              {!local && (
                <div className="field">
                  <label htmlFor="admin-email">E-posta</label>
                  <input
                    id="admin-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="admin-password">Parola</label>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="admin-code">Doğrulama kodu</label>
              <input
                id="admin-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                autoFocus
              />
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : phase === 'password' ? (
              <LockKeyhole size={17} />
            ) : (
              <KeyRound size={17} />
            )}{' '}
            {phase === 'password' ? 'Güvenli giriş' : 'Kodu doğrula'}
          </button>
        </form>
        <a href="/masak-form">Başvuru sayfasına dön</a>
      </div>
    </main>
  );
}
function InfoIcon() {
  return <ShieldCheck size={19} />;
}
function ApplicationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [notes, setNotes] = useState<History[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState<Status>('IN_REVIEW'),
    [note, setNote] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const load = useCallback(async () => {
    const [d, n] = await Promise.all([
      api<Detail>(`/api/masak/admin/applications/${id}`),
      api<History[]>(`/api/masak/admin/notes/${id}`),
    ]);
    setDetail(d);
    setNotes(n);
    setStatus(transitions[d.application.status][0] || d.application.status);
  }, [id]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  const action = async (body: unknown) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/masak/admin/applications/${id}`, body);
      if ((body as { action: string }).action === 'delete') {
        onBack();
        return;
      }
      await load();
      setNote('');
      setNotice('İşlem kaydedildi.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!detail)
    return (
      <>
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} /> Başvurulara dön
        </button>
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : (
          <p>Başvuru yükleniyor…</p>
        )}
      </>
    );
  const { application: a, data: d, documents, history, notifications } = detail;
  return (
    <>
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> Tüm başvurular
      </button>
      <div className="admin-heading">
        <div>
          <h1>{a.reference}</h1>
          <div className="detail-meta">
            <span>{new Date(a.created_at).toLocaleString('tr-TR')}</span>
            <span className={`admin-status ${a.status}`}>{statusLabels[a.status]}</span>
          </div>
        </div>
        <a className="button secondary" href={`/api/masak/admin/applications/${id}/pdf`}>
          <ArrowDownToLine size={16} /> PDF indir
        </a>
      </div>
      {notice && (
        <p role="status" className="toast">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <div className="admin-detail">
        <div>
          <section className="detail-card">
            <h2>Başvuru bilgileri</h2>
            <dl className="review-grid">
              {[
                ['Başvuru türü', d.kind === 'individual' ? 'Bireysel' : 'Kurumsal'],
                ['Ad soyad / unvan', d.name],
                ['Kimlik / vergi no', d.identityNumber],
                ['Kimlik tipi', d.identityType],
                ['Telefon', d.phone],
                ['E-posta', d.email],
                ['İl', d.province],
                ['İlçe', d.district],
                ['Mahalle', d.neighborhood],
                ['Açık adres', d.address],
                ['Uyruk', d.nationality],
                ['Meslek / unvan', d.occupation],
                ['Satış tutarı', `${d.amount || '—'} TRY`],
                ['Aydınlatma sürümü', a.notice_version],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || 'Belirtilmedi'}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="detail-card">
            <h2>Belgeler ve çizim imzası</h2>
            {documents.length ? (
              documents.map((doc) => (
                <a
                  key={doc.id}
                  className="document-link"
                  href={`/api/masak/admin/documents/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText size={18} />
                  {
                    {
                      front: 'Kimlik ön yüzü',
                      back: 'Kimlik arka yüzü',
                      signature: 'Çizim imzası',
                      residence: 'İkametgâh belgesi',
                    }[doc.kind]
                  }
                  <small>{Math.ceil(doc.size / 1024)} KB</small>
                  <ArrowDownToLine size={16} />
                </a>
              ))
            ) : (
              <p className="section-description">Bu başvuruda belge toplanmamış.</p>
            )}
          </section>
          <section className="detail-card">
            <h2>Yönetici notları</h2>
            <div className="history-list">
              {notes.map((h) => (
                <div className="history-item" key={h.id}>
                  <small>{new Date(h.created_at).toLocaleString('tr-TR')}</small>
                  <p>{h.note}</p>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action({ action: 'note', note });
              }}
            >
              <div className="field">
                <label htmlFor="admin-note">Yeni not</label>
                <textarea
                  id="admin-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  maxLength={2000}
                  rows={3}
                  placeholder="Değerlendirme notunuzu yazın. Gereksiz kişisel veri eklemeyin."
                />
              </div>
              <button className="button primary" disabled={busy || !note.trim()}>
                Notu kaydet
              </button>
            </form>
          </section>
        </div>
        <div>
          <section className="detail-card">
            <h2>Başvuru durumu</h2>
            {transitions[a.status].length ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action({ action: 'status', status });
                }}
              >
                <div className="field">
                  <label htmlFor="new-status">Yeni durum</label>
                  <select
                    id="new-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                  >
                    {transitions[a.status].map((s) => (
                      <option value={s} key={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="button primary" disabled={busy}>
                  Durumu güncelle
                </button>
              </form>
            ) : (
              <p className="section-description">Bu durumdan başka bir aşamaya geçiş yok.</p>
            )}
          </section>
          <section className="detail-card">
            <h2>E-posta bildirimleri</h2>
            <div className="history-list">
              {notifications.map((n) => (
                <div className="history-item" key={n.id}>
                  <strong>
                    {n.audience === 'admin' ? 'Yönetici bildirimi' : 'Başvuru alındı bildirimi'}
                  </strong>
                  <p>
                    {
                      {
                        pending: 'Gönderim bekliyor',
                        processing: 'İşleniyor',
                        sent: 'Gönderildi',
                        failed: 'Gönderilemedi',
                      }[n.state]
                    }{' '}
                    · {n.attempts} deneme
                  </p>
                  {n.state === 'failed' && (
                    <small>
                      {n.attempts >= 8 ||
                      Date.now() - new Date(n.created_at).getTime() > 23 * 3600000
                        ? 'Otomatik tekrar durdu; operatör incelemesi gerekli.'
                        : `Sonraki deneme: ${new Date(n.next_attempt_at).toLocaleString('tr-TR')}`}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="detail-card">
            <h2>İşlem geçmişi</h2>
            <div className="history-list">
              {history.map((h) => (
                <div key={h.id} className="history-item">
                  {h.status
                    ? statusLabels[h.status]
                    : (
                        {
                          NOTE_ADDED: 'Not eklendi',
                          DELETION_REQUESTED: 'Silme talebi açıldı',
                        } as Record<string, string>
                      )[h.action] || h.action}
                  <small>
                    {new Date(h.created_at).toLocaleString('tr-TR')} ·{' '}
                    {h.actor === 'applicant'
                      ? 'Başvuru sahibi'
                      : h.actor === 'retention-worker'
                        ? 'Saklama süresi kontrolü'
                        : 'Yetkili yönetici'}
                  </small>
                </div>
              ))}
            </div>
          </section>
          <section className="detail-card">
            <h2>Saklama ve silme</h2>
            {a.deletion_requested_at ? (
              <>
                <div className="deletion-warning">
                  Silme talebi açılmıştır. Hukuki saklama yükümlülüklerini değerlendirdikten sonra
                  kalıcı silmeyi onaylayın. Belgeler ve başvuru geri alınamaz şekilde silinir.
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({ action: 'delete', confirmation });
                  }}
                >
                  <div className="field">
                    <label htmlFor="delete-confirm">Onaylamak için {a.reference} yazın</label>
                    <input
                      id="delete-confirm"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <button className="button danger" disabled={busy || confirmation !== a.reference}>
                    <Trash2 size={15} /> Kalıcı sil
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="section-description">
                  Yetkili silme değerlendirmesini başlatın. Bu işlem kaydı hemen silmez.
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action({ action: 'request-deletion' })}
                >
                  Silme talebi oluştur
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
export function Admin({ local }: { local: boolean }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [rows, setRows] = useState<Application[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [filters, setFilters] = useState({ reference: '', status: '', from: '', to: '' }),
    [page, setPage] = useState(1);
  const load = useCallback(
    async (p = 1) => {
      setBusy(true);
      setError('');
      try {
        const q = new URLSearchParams({ ...filters, page: String(p) });
        setRows(await api<Application[]>(`/api/masak/admin/applications?${q}`));
        setPage(p);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [filters],
  );
  useEffect(() => {
    api('/api/masak/admin/session')
      .then(() => {
        setAuthenticated(true);
        const id = new URLSearchParams(window.location.search).get('application');
        if (id && /^[0-9a-f-]{36}$/.test(id)) setSelected(id);
      })
      .catch(() => setAuthenticated(false));
  }, []);
  useEffect(() => {
    if (authenticated) void load(1); /* Filters are applied by explicit search. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);
  if (authenticated === null)
    return (
      <main className="unavailable">
        <LoaderCircle size={26} className="spin" />
        <p>Oturum kontrol ediliyor…</p>
      </main>
    );
  if (!authenticated) return <Login local={local} onLogin={() => setAuthenticated(true)} />;
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand />
        <nav aria-label="Yönetim">
          <a href="/masak-form/admin" className="active">
            <LayoutDashboard size={18} /> Başvurular
          </a>
          <a href="/masak-form" target="_blank" rel="noreferrer">
            <ClipboardList size={18} /> Başvuru formu
          </a>
        </nav>
        <footer>
          <span>
            <UserRound size={16} /> Yetkili yönetici
          </span>
          <button
            onClick={async () => {
              try {
                await api('/api/masak/auth/logout', {});
                setAuthenticated(false);
                setRows([]);
                setSelected(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={15} style={{ display: 'inline', marginRight: 8 }} /> Güvenli çıkış
          </button>
        </footer>
      </aside>
      <main id="main-content" className="admin-main">
        <div className="admin-topbar">
          <span>Çalışma alanı / Başvurular</span>
          <span>
            <ShieldCheck size={13} style={{ display: 'inline', marginRight: 6 }} />
            {local ? 'Yerel geliştirme · Sentetik veriler' : 'İki aşamalı doğrulanmış oturum'}
          </span>
        </div>
        {selected ? (
          <ApplicationDetail
            id={selected}
            onBack={() => {
              setSelected(null);
              void load(page);
            }}
          />
        ) : (
          <>
            <div className="admin-heading">
              <div>
                <span className="eyebrow" style={{ marginBottom: 10 }}>
                  BAŞVURU YÖNETİMİ
                </span>
                <h1>Her başvuru, tek bir yerde.</h1>
                <p>Başvuruları inceleyin, değerlendirin ve süreçlerini yönetin.</p>
              </div>
              <a className="button primary" href="/masak-form" target="_blank" rel="noreferrer">
                Formu görüntüle <ArrowRight size={15} />
              </a>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <section className="admin-panel">
              <form
                className="admin-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  void load(1);
                }}
              >
                <div>
                  <label htmlFor="reference-search">Referans numarası</label>
                  <input
                    id="reference-search"
                    className="admin-input"
                    placeholder="NF-2026-000001"
                    value={filters.reference}
                    maxLength={30}
                    onChange={(e) =>
                      setFilters((v) => ({ ...v, reference: e.target.value.toUpperCase() }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="status-filter">Durum</label>
                  <select
                    id="status-filter"
                    className="admin-input"
                    value={filters.status}
                    onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))}
                  >
                    <option value="">Tüm durumlar</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="from-filter">İlk tarih</label>
                  <input
                    id="from-filter"
                    className="admin-input"
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilters((v) => ({ ...v, from: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="to-filter">Son tarih</label>
                  <input
                    id="to-filter"
                    className="admin-input"
                    type="date"
                    value={filters.to}
                    min={filters.from}
                    onChange={(e) => setFilters((v) => ({ ...v, to: e.target.value }))}
                  />
                </div>
                <button className="button secondary" disabled={busy}>
                  <Search size={15} /> Ara
                </button>
              </form>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>BAŞVURU NO</th>
                      <th>TARİH</th>
                      <th>TÜR</th>
                      <th>KİMLİK / VERGİ NO</th>
                      <th>DURUM</th>
                      <th>
                        <span className="sr-only">İşlem</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button className="text-button" onClick={() => setSelected(a.id)}>
                            {a.reference}
                          </button>
                        </td>
                        <td>{new Date(a.created_at).toLocaleDateString('tr-TR')}</td>
                        <td>{a.kind === 'individual' ? 'Bireysel' : 'Kurumsal'}</td>
                        <td>{a.masked_identity}</td>
                        <td>
                          <span className={`admin-status ${a.status}`}>
                            {statusLabels[a.status]}
                          </span>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            onClick={() => setSelected(a.id)}
                            aria-label={`${a.reference} detayları`}
                          >
                            <ArrowRight size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <div className="empty-state">
                  <ClipboardList size={32} />
                  {busy ? 'Başvurular yükleniyor…' : 'Bu filtrelerle eşleşen başvuru bulunamadı.'}
                </div>
              )}
              <div className="admin-pagination">
                <span>
                  Sayfa {page} · {rows.length} kayıt
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Önceki sayfa"
                    disabled={page === 1 || busy}
                    onClick={() => void load(page - 1)}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Sonraki sayfa"
                    disabled={rows.length < 50 || busy}
                    onClick={() => void load(page + 1)}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

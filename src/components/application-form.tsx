'use client';
import { useRef, useState, useEffect } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  ShieldCheck,
  LockKeyhole,
  UserRound,
  Building2,
  MapPin,
  FileCheck2,
  ClipboardCheck,
  Upload,
  FileText,
  X,
  LoaderCircle,
  ChevronRight,
  Clock3,
  Info,
  Copy,
} from 'lucide-react';
import { applicationSchema, provinces, fileSelectionError } from '@/lib/validation';
import type { ApplicationData, PublicPolicy } from '@/lib/types';
import { Signature } from './signature';
import { Captcha } from './turnstile';
const steps = [
  { title: 'Kimlik bilgileri', hint: 'Sizi tanıyalım', icon: UserRound },
  { title: 'İletişim ve adres', hint: 'Size ulaşabilelim', icon: MapPin },
  { title: 'Belgeler ve imza', hint: 'Başvurunuzu tamamlayın', icon: FileCheck2 },
  { title: 'Kontrol ve onay', hint: 'Son bir göz atalım', icon: ClipboardCheck },
];
const initial: ApplicationData = {
  kind: 'individual',
  identityNumber: '',
  identityType: 'T.C. Kimlik Kartı',
  name: '',
  province: '',
  district: '',
  neighborhood: '',
  phone: '',
  email: '',
  address: '',
  nationality: 'Türkiye',
  occupation: '',
  amount: '',
  noticeRead: false,
};
const stepFields: FieldPath<ApplicationData>[][] = [
  ['kind', 'identityNumber', 'identityType', 'name', 'nationality', 'occupation', 'amount'],
  ['province', 'district', 'neighborhood', 'phone', 'email', 'address'],
  [],
  ['noticeRead'],
];
type FileKind = 'front' | 'back' | 'signature' | 'residence';
function FilePicker({
  kind,
  label,
  max,
  onFile,
  file,
  previewOnly,
}: {
  kind: FileKind;
  label: string;
  max: number;
  onFile: (f: File | null) => void;
  file?: File;
  previewOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfOnly = kind === 'residence';
  const [preview, setPreview] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="file-picker">
      <label className="field-label" htmlFor={`file-${kind}`}>
        {label}
      </label>
      {file ? (
        <div className="file-preview">
          {file.type.startsWith('image/') && preview ? (
            <img alt={`${label} önizleme`} src={preview} />
          ) : (
            <FileText size={30} />
          )}
          <span>
            {file.name}
            <small>{Math.max(1, Math.ceil(file.size / 1024))} KB</small>
            <small>{previewOnly ? 'Yalnızca bu cihazda seçildi' : 'Gönderim için seçildi'}</small>
            {file.type === 'application/pdf' && preview && (
              <a
                href={preview}
                target="_blank"
                rel="noreferrer"
                aria-label={`${label} PDF önizleme`}
              >
                PDF’yi görüntüle
              </a>
            )}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={`${label} dosyasını kaldır`}
            onClick={() => {
              onFile(null);
              setError('');
            }}
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="upload-box"
          aria-label={`${label}: dosya seç`}
          onClick={() => inputRef.current?.click()}
        >
          <span className="upload-icon">
            <Upload size={22} />
          </span>
          <strong>{pdfOnly ? 'PDF dosyası seçin' : 'Dosya seçin veya fotoğraf yükleyin'}</strong>
          <small>
            {pdfOnly ? 'Yalnızca PDF' : 'JPG, PNG veya PDF'} · En fazla {max} MB
          </small>
        </button>
      )}
      <input
        ref={inputRef}
        hidden
        id={`file-${kind}`}
        type="file"
        accept={pdfOnly ? '.pdf,application/pdf' : 'image/jpeg,image/png,application/pdf'}
        className="file-input"
        aria-invalid={!!error}
        aria-describedby={error ? `file-${kind}-error` : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const selectionError =
            fileSelectionError(f, max) ||
            (pdfOnly && f.type !== 'application/pdf'
              ? 'İkametgâh belgesi için yalnızca PDF yükleyin.'
              : '');
          if (selectionError) {
            setError(selectionError);
            e.target.value = '';
            return;
          }
          setError('');
          onFile(f);
          e.target.value = '';
        }}
      />
      {error && (
        <p id={`file-${kind}-error`} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function ApplicationForm({ policy, notice }: { policy: PublicPolicy; notice: string }) {
  const [step, setStep] = useState(0),
    [files, setFiles] = useState<Partial<Record<FileKind, File>>>({}),
    [noticeOpen, setNoticeOpen] = useState(false),
    [captcha, setCaptcha] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reference, setReference] = useState(''),
    [copied, setCopied] = useState(false);
  const intake = useRef<{ token: string; created: number } | null>(null),
    uploaded = useRef<Partial<Record<FileKind, { file: File; id: string }>>>({}),
    heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false),
    successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (reference) successHeading.current?.focus();
  }, [reference]);
  const {
    register,
    watch,
    getValues,
    setValue,
    setError: fieldError,
    clearErrors,
    formState: { errors },
    setFocus,
  } = useForm<ApplicationData>({ defaultValues: initial });
  const kind = watch('kind'),
    province = watch('province');
  const updateFile = (kind: FileKind, file: File | null) => {
    setFiles((v) => ({ ...v, [kind]: file || undefined }));
    setError('');
  };
  const required = (name: string) => policy.required.includes(name);
  const field = (
    name: FieldPath<ApplicationData>,
    label: string,
    placeholder: string,
    type = 'text',
    options?: string[],
  ) => (
    <div className={`field ${name === 'address' ? 'full' : ''}`} key={name}>
      <label htmlFor={name}>
        {label}
        {required(name) && <span aria-label="zorunlu"> *</span>}
        {!required(name) && <small>İsteğe bağlı</small>}
      </label>
      {options ? (
        <select
          id={name}
          {...register(name, { onChange: () => clearErrors(name) })}
          aria-required={required(name)}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        >
          <option value="">Seçiniz</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : name === 'address' ? (
        <textarea
          id={name}
          rows={3}
          placeholder={placeholder}
          {...register(name, { onChange: () => clearErrors(name) })}
          aria-required={required(name)}
          maxLength={600}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
      ) : (
        <input
          id={name}
          type={type}
          placeholder={placeholder}
          {...register(name, { onChange: () => clearErrors(name) })}
          aria-required={required(name)}
          autoComplete={
            (
              { name: 'name', phone: 'tel', email: 'email', address: 'street-address' } as Record<
                string,
                string
              >
            )[name] || 'off'
          }
          inputMode={['identityNumber', 'amount'].includes(name) ? 'decimal' : undefined}
          maxLength={name === 'identityNumber' ? (kind === 'individual' ? 11 : 10) : 254}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
      )}{' '}
      {errors[name] && (
        <p id={`${name}-error`} className="field-error" role="alert">
          {errors[name]?.message}
        </p>
      )}
    </div>
  );
  const validate = (all = false) => {
    clearErrors();
    const parsed = applicationSchema(policy).safeParse(getValues());
    if (parsed.success) return true;
    const relevant = parsed.error.issues.filter(
      (i) => all || stepFields[step].includes(i.path[0] as FieldPath<ApplicationData>),
    );
    for (const issue of relevant)
      fieldError(issue.path[0] as FieldPath<ApplicationData>, { message: issue.message });
    if (relevant.length) setFocus(relevant[0].path[0] as FieldPath<ApplicationData>);
    return !relevant.length;
  };
  const move = (value: number) => {
    setStep(value);
    setError('');
    setTimeout(() => heading.current?.focus(), 10);
  };
  const next = () => {
    if (!validate()) return;
    if (step === 2) {
      if (
        (policy.documents && (!files.front || !files.back)) ||
        (policy.signature && !files.signature) ||
        (policy.residenceRequired && !files.residence)
      ) {
        const missing = [
          policy.documents && !files.front ? 'Kimlik ön yüzü' : '',
          policy.documents && !files.back ? 'Kimlik arka yüzü' : '',
          policy.signature && !files.signature ? 'Çizim imzası' : '',
          policy.residenceRequired && !files.residence ? 'İkametgâh belgesi' : '',
        ].filter(Boolean);
        setError(`Devam etmek için tamamlayın: ${missing.join(', ')}.`);
        return;
      }
    }
    move(step + 1);
  };
  const send = async () => {
    if (policy.previewOnly) return;
    if (submitting.current || !validate(true)) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      if (!intake.current) {
        if (!policy.local && !captcha) throw new Error('Lütfen güvenlik doğrulamasını tamamlayın.');
        const r = await fetch('/api/masak/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captcha }),
        });
        const b = await r.json();
        if (!r.ok)
          throw new Error(
            r.status === 429
              ? 'Çok fazla deneme yaptınız. Bir süre sonra yeniden deneyin.'
              : 'Güvenlik doğrulaması başarısız. Sayfayı yenileyerek tekrar deneyin.',
          );
        intake.current = { token: b.token, created: Date.now() };
      }
      if (Date.now() - intake.current.created > 14 * 60 * 1000) {
        intake.current = null;
        uploaded.current = {};
        throw new Error('Güvenli gönderim süresi doldu. Sayfayı yenileyip yeniden deneyin.');
      }
      const ids: string[] = [];
      for (const [k, f] of Object.entries(files)) {
        const key = k as FileKind;
        if (!f) continue;
        let cached = uploaded.current[key];
        if (!cached || cached.file !== f) {
          const r = await fetch('/api/masak/uploads', {
            method: 'POST',
            headers: {
              'Content-Type': f.type,
              'x-intake-token': intake.current.token,
              'x-document-kind': key,
              'x-file-name': `${key}.${f.name.split('.').pop()?.toLowerCase()}`,
            },
            body: f,
          });
          const b = await r.json();
          if (!r.ok)
            throw new Error(
              'Dosya güvenlik kontrolünden geçemedi. Türünü, boyutunu ve içeriğini kontrol edin.',
            );
          cached = { file: f, id: b.id };
          uploaded.current[key] = cached;
        }
        ids.push(cached.id);
      }
      const r = await fetch('/api/masak/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-intake-token': intake.current.token },
        body: JSON.stringify({ data: getValues(), documents: ids }),
      });
      const b = await r.json();
      if (!r.ok)
        throw new Error('Başvuru kaydedilemedi. Bilgilerinizi kontrol edip tekrar deneyin.');
      setReference(b.reference);
      setFiles({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bağlantı kurulamadı. Tekrar deneyin.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  if (reference)
    return (
      <main className="success-page">
        <div className="success-icon">
          <CheckCheck size={38} />
        </div>
        <span className="eyebrow">BAŞVURUNUZ ALINDI</span>
        <h1 ref={successHeading} tabIndex={-1}>
          İlk adım tamamlandı.
        </h1>
        <p>
          Bilgileriniz kaydedildi ve değerlendirme için sıraya alındı.
          <br />
          Başvuru numaranızı saklamayı unutmayın.
        </p>
        <div className="reference-card">
          <small>BAŞVURU NUMARANIZ</small>
          <strong>{reference}</strong>
          <button
            type="button"
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(reference);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy size={16} />
            {copied ? 'Kopyalandı' : 'Numarayı kopyala'}
          </button>
        </div>
        <div className="info-box">
          <Clock3 size={20} />
          <span>
            Başvurunuz yetkili ekip tarafından incelenecek. Bu ekran bir onay veya kimlik doğrulama
            belgesi değildir.
          </span>
        </div>
        <a className="button primary" href="/masak-form">
          Yeni başvuru oluştur <ArrowRight size={17} />
        </a>
      </main>
    );
  return (
    <main className="application-layout">
      <aside className="form-aside">
        <div>
          <span className="eyebrow">
            <span className="tiny-dot" /> DİJİTAL BAŞVURU
          </span>
          <h1>
            Güvenle başlayın.
            <br />
            <span>Kolayca tamamlayın.</span>
          </h1>
          <p>
            Başvurunuz için gereken tüm bilgiler,
            <br className="desktop-only" /> tek bir sade akışta.
          </p>
        </div>
        <nav aria-label="Başvuru adımları" className="step-list">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className={`step-item ${i === step ? 'active' : ''} ${i < step ? 'complete' : ''}`}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="step-number">
                {i < step ? <Check size={18} /> : String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.hint}</small>
              </div>
              {i === step && <ChevronRight size={16} />}
            </div>
          ))}
        </nav>
        <div className="aside-art" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <div className="art-card">
            <ShieldCheck size={32} />
            <span>
              Her adımda
              <br />
              <strong>özenle korunan bilgiler.</strong>
            </span>
            <span className="art-check">
              <Check size={14} />
            </span>
          </div>
          <span className="art-spark spark-one">+</span>
          <span className="art-spark spark-two">+</span>
        </div>
        <div className="aside-footer">
          <LockKeyhole size={16} />
          <span>Yalnızca yetkili ekip erişimi</span>
        </div>
      </aside>
      <section className="form-main" aria-label="Başvuru formu">
        <div className="form-topline">
          <span>Müşteri başvuru formu</span>
          <span className="time-pill">
            <Clock3 size={13} /> Yaklaşık 5 dakika
          </span>
        </div>
        <div className="mobile-progress">
          <span>
            Adım {step + 1} / 4 · {steps[step].title}
          </span>
          <progress value={step + 1} max={4} aria-label="Başvuru ilerlemesi" />
        </div>
        <div className="form-card">
          <div className="section-kicker">
            ADIM {String(step + 1).padStart(2, '0')} <span>/ 04</span>
          </div>
          <h2 ref={heading} tabIndex={-1}>
            {steps[step].title}
          </h2>
          <p className="section-description">
            {
              [
                'Başvurunuza başlamak için temel bilgilerinizi paylaşın.',
                'Güncel iletişim ve ikamet bilgilerinizi girin.',
                'Gerekli ekleri bu adımda tamamlayın.',
                'Göndermeden önce bilgilerinizi kontrol edin.',
              ][step]
            }
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 3) next();
              else void send();
            }}
          >
            {step === 0 && (
              <>
                <fieldset className="type-fieldset">
                  <legend>Başvuru türü</legend>
                  <div className="type-options">
                    {(['individual', 'corporate'] as const).map((k) => (
                      <label key={k} className={`type-option ${kind === k ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          value={k}
                          {...register('kind')}
                          onChange={() => {
                            setValue('kind', k);
                            setValue('identityNumber', '');
                            setValue(
                              'identityType',
                              k === 'individual' ? 'T.C. Kimlik Kartı' : 'Vergi Levhası',
                            );
                            clearErrors();
                          }}
                        />
                        {k === 'individual' ? <UserRound size={21} /> : <Building2 size={21} />}
                        <span>
                          <strong>{k === 'individual' ? 'Bireysel' : 'Kurumsal'}</strong>
                          <small>
                            {k === 'individual'
                              ? 'Kendi adıma başvuruyorum'
                              : 'Şirketim adına başvuruyorum'}
                          </small>
                        </span>
                        <span className="radio-dot" />
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="fields-grid">
                  {field(
                    'name',
                    kind === 'individual' ? 'Ad soyad' : 'Şirket unvanı',
                    kind === 'individual' ? 'Kimliğinizde yazdığı şekilde' : 'Ticari unvanınız',
                  )}
                  {field(
                    'identityNumber',
                    kind === 'individual' ? 'T.C. kimlik numarası' : 'Vergi kimlik numarası',
                    kind === 'individual' ? '11 haneli TCKN' : '10 haneli VKN',
                  )}
                  {field(
                    'identityType',
                    'Kimlik tipi',
                    '',
                    'text',
                    kind === 'individual'
                      ? ['T.C. Kimlik Kartı', 'Nüfus Cüzdanı']
                      : ['Vergi Levhası'],
                  )}
                  {field('nationality', 'Uyruk', 'Örn. Türkiye')}
                  {field('occupation', 'Meslek / unvan', 'Örn. Mühendis')}
                  {field('amount', 'Satış tutarı (TRY)', '0,00')}
                </div>
                <div className="subtle-note">
                  <Info size={16} />
                  <span>
                    TCKN/VKN kontrolü yalnızca biçim ve sağlama kontrolüdür; resmi kimlik
                    doğrulaması değildir.
                  </span>
                </div>
              </>
            )}
            {step === 1 && (
              <div className="fields-grid">
                {field('phone', 'Cep telefonu', '05XX XXX XX XX', 'tel')}
                {field('email', 'E-posta adresi', 'ornek@eposta.com', 'email')}
                <div className="field">
                  <label htmlFor="province">İl{required('province') ? ' *' : ''}</label>
                  <select
                    id="province"
                    {...register('province')}
                    aria-invalid={!!errors.province}
                    onChange={(e) => {
                      setValue('province', e.target.value);
                      setValue('district', '');
                    }}
                  >
                    <option value="">İl seçiniz</option>
                    {Object.keys(provinces)
                      .sort((a, b) => a.localeCompare(b, 'tr'))
                      .map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                  </select>
                  {errors.province && (
                    <p role="alert" className="field-error">
                      {errors.province.message}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="district">İlçe{required('district') ? ' *' : ''}</label>
                  <select
                    id="district"
                    {...register('district')}
                    disabled={!province}
                    aria-invalid={!!errors.district}
                  >
                    <option value="">{province ? 'İlçe seçiniz' : 'Önce il seçiniz'}</option>
                    {(provinces[province] || []).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  {errors.district && (
                    <p role="alert" className="field-error">
                      {errors.district.message}
                    </p>
                  )}
                </div>
                {field('neighborhood', 'Mahalle', 'Mahalle adını yazın')}
                {field('address', 'Açık adres', 'Cadde, sokak, bina ve daire numarası')}
              </div>
            )}
            {step === 2 && (
              <>
                {policy.previewOnly && (
                  <div className="info-box">
                    <Info size={18} />
                    <span>
                      Belge ve imza alanlarını yalnızca sentetik dosyalarla deneyin. Seçtiğiniz
                      dosyalar bu cihazda kalır; bu önizlemede sunucuya yüklenmez.
                    </span>
                  </div>
                )}
                {policy.documents ? (
                  <div className="document-grid">
                    <FilePicker
                      kind="front"
                      label="Kimlik ön yüzü"
                      max={policy.maxUploadMB}
                      file={files.front}
                      previewOnly={policy.previewOnly}
                      onFile={(f) => updateFile('front', f)}
                    />
                    <FilePicker
                      kind="back"
                      label="Kimlik arka yüzü"
                      max={policy.maxUploadMB}
                      file={files.back}
                      previewOnly={policy.previewOnly}
                      onFile={(f) => updateFile('back', f)}
                    />
                  </div>
                ) : (
                  <div className="collection-off">
                    <span className="soft-icon">
                      <ShieldCheck size={28} />
                    </span>
                    <h3>Bu başvuruda kimlik belgesi istenmiyor.</h3>
                    <p>
                      Veri toplama ayarları gereği kimlik fotoğrafı yüklemenize gerek yok. Sonraki
                      adıma geçebilirsiniz.
                    </p>
                    <span className="badge">Belge toplama kapalı</span>
                  </div>
                )}
                {policy.residence && (
                  <div className="residence-document">
                    <FilePicker
                      kind="residence"
                      label="İkametgâh belgesi"
                      max={policy.maxUploadMB}
                      file={files.residence}
                      previewOnly={policy.previewOnly}
                      onFile={(f) => updateFile('residence', f)}
                    />
                    <p className="section-description">
                      {policy.residenceRequired ? 'Zorunlu belge.' : 'İsteğe bağlı belge.'} Yalnızca
                      PDF yükleyebilirsiniz.
                    </p>
                  </div>
                )}
                {policy.signature ? (
                  <Signature file={files.signature} onChange={(f) => updateFile('signature', f)} />
                ) : (
                  <div className="subtle-note">
                    <LockKeyhole size={17} />
                    <span>
                      Çizim imzası toplama da kapalıdır. Gerekli olmayan belgeleri veya kişisel
                      bilgileri paylaşmayın.
                    </span>
                  </div>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <div className="review-header">
                  <h3>Başvuru özeti</h3>
                  <button type="button" className="text-button" onClick={() => move(0)}>
                    Bilgileri düzenle <ArrowRight size={15} />
                  </button>
                </div>
                <dl className="review-grid">
                  {[
                    ['Başvuru türü', kind === 'individual' ? 'Bireysel' : 'Kurumsal'],
                    ['Ad soyad / unvan', getValues('name')],
                    ['Kimlik / vergi no', getValues('identityNumber')],
                    ['Telefon', getValues('phone')],
                    ['E-posta', getValues('email') || 'Belirtilmedi'],
                    ['İl / ilçe', `${getValues('province')} / ${getValues('district')}`],
                    ['Mahalle', getValues('neighborhood')],
                    ['Adres', getValues('address')],
                    ['Uyruk', getValues('nationality')],
                    ['Meslek / unvan', getValues('occupation')],
                    [
                      'Satış tutarı',
                      getValues('amount') ? `${getValues('amount')} TRY` : 'Belirtilmedi',
                    ],
                    [
                      'Belgeler',
                      Object.keys(files).filter((k) => files[k as FileKind]).length + ' dosya',
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || 'Belirtilmedi'}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  className="notice-toggle"
                  type="button"
                  aria-expanded={noticeOpen}
                  onClick={() => setNoticeOpen((v) => !v)}
                >
                  <FileText size={18} />
                  <span>
                    Aydınlatma metnini görüntüle<small>Sürüm: {policy.noticeVersion}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                {noticeOpen && (
                  <div className="privacy-text" tabIndex={0}>
                    {notice}
                  </div>
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    {...register('noticeRead', { onChange: () => clearErrors('noticeRead') })}
                  />
                  <span>
                    Aydınlatma metnini okudum.<small>Bu beyan, açık rıza onayı değildir.</small>
                  </span>
                </label>
                {errors.noticeRead && (
                  <p role="alert" className="field-error">
                    {errors.noticeRead.message}
                  </p>
                )}
                {policy.previewOnly && (
                  <div className="info-box">
                    Bu önizlemede başvuru gönderimi kapalıdır. Bilgileriniz kaydedilmez ve e-posta
                    gönderilmez.
                  </div>
                )}
                {!policy.local && !policy.previewOnly && (
                  <Captcha siteKey={policy.siteKey} onToken={setCaptcha} />
                )}
              </>
            )}
            {error && (
              <div role="alert" className="error-banner">
                {error}
              </div>
            )}
            <div className="form-actions">
              {step > 0 ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => move(step - 1)}
                  disabled={busy}
                >
                  <ArrowLeft size={17} /> Geri
                </button>
              ) : (
                <span className="required-note">* Zorunlu alanlar</span>
              )}
              <button
                className="button primary"
                type="submit"
                disabled={
                  busy ||
                  (step === 3 &&
                    (policy.previewOnly || (!policy.local && !captcha && !intake.current)))
                }
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Kaydediliyor…
                  </>
                ) : step === 3 ? (
                  <>
                    Başvuruyu gönder <CheckCircle2 size={18} />
                  </>
                ) : (
                  <>
                    Devam et <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
        <div className="form-security">
          <ShieldCheck size={16} />
          <span>Verileriniz başvuru değerlendirmesi için işlenir.</span>
          <span className="security-divider" />
          <span>Güvenli başvuru altyapısı</span>
        </div>
      </section>
    </main>
  );
}

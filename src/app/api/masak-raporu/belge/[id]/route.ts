import { readDocument } from '@/masak-raporu/server/documents';
import { AppError } from '@/masak-raporu/server/errors';
import { attachment, handle } from '@/masak-raporu/server/http';

export const dynamic = 'force-dynamic';

// Belge yalnızca oturumlu, "documents.download" izni olan kullanıcıya ve veritabanı yetki fonksiyonundan geçerek verilir.
// Kalıcı/paylaşılabilir bağlantı yoktur; her erişim denetim izine yazılır. Dosya her zaman ek (attachment) olarak iner.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, async (ctx) => {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError('NOT_FOUND', 'Belge bulunamadı.', 404);
    const doc = await readDocument(ctx, id);
    const ext = doc.mime === 'application/pdf' ? 'pdf' : doc.mime === 'image/png' ? 'png' : doc.mime === 'image/webp' ? 'webp' : 'jpg';
    return attachment(doc.data, `${doc.title}.${ext}`, doc.mime);
  });
}

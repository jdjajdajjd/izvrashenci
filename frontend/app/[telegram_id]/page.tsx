import { notFound } from 'next/navigation';

export const runtime = 'edge';

interface Dossier {
  full_name: string;
  birth_date: string;
  city: string;
  phone: string;
  avatar_url: string;
}

async function getDossier(telegramId: string): Promise<Dossier | null> {
  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL;
  if (!workerUrl) throw new Error('NEXT_PUBLIC_WORKER_URL is not set');

  const res = await fetch(`${workerUrl}/api/dossier/${telegramId}`, {
    cache: 'no-store',
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);

  return res.json() as Promise<Dossier>;
}

export default async function DossierPage({
  params,
}: {
  params: { telegram_id: string };
}) {
  const { telegram_id } = params;

  if (!/^\d+$/.test(telegram_id)) notFound();

  const dossier = await getDossier(telegram_id);
  if (!dossier) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-6 mb-10">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--surface)] border border-[var(--border)] flex-shrink-0">
          {dossier.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dossier.avatar_url}
              alt={dossier.full_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl text-[var(--muted)]">
              ?
            </div>
          )}
        </div>
        <div>
          <p className="text-xs text-[var(--muted)] mb-1">ID: {telegram_id}</p>
          <h1 className="text-xl font-bold tracking-tight">{dossier.full_name}</h1>
        </div>
      </div>

      {/* Info grid */}
      <section className="mb-10 bg-[var(--surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
        <InfoRow label="Дата рождения" value={dossier.birth_date} />
        <InfoRow label="Город" value={dossier.city} />
        <InfoRow label="Телефон" value={dossier.phone} />
      </section>

      {/* Sections */}
      <div className="grid gap-4">
        <EmptySection title="Переписка" icon="💬" />
        <EmptySection title="Фото" icon="📷" />
        <EmptySection title="Друзья из ВК" icon="👥" />
        <EmptySection title="Родственники" icon="🧬" />
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-5 py-3">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

function EmptySection({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </h2>
      <p className="text-xs text-[var(--muted)]">Нет данных</p>
    </div>
  );
}

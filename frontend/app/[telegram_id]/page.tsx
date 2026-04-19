'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const WORKER_URL = 'https://dossier-worker.qsenseeee.workers.dev';

interface Dossier {
  full_name: string;
  birth_date: string;
  city: string;
  phone: string;
  avatar_url: string;
}

export default function DossierPage() {
  const params = useParams();
  const telegram_id = params.telegram_id as string;

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'not_found'>('loading');

  useEffect(() => {
    if (!telegram_id || !/^\d+$/.test(telegram_id)) {
      setStatus('not_found');
      return;
    }

    fetch(`${WORKER_URL}/api/dossier/${telegram_id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json() as Promise<Dossier>;
      })
      .then((data) => {
        setDossier(data);
        setStatus('found');
      })
      .catch(() => setStatus('not_found'));
  }, [telegram_id]);

  if (status === 'loading') {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="text-[var(--muted)] text-sm animate-pulse">Загрузка...</div>
      </main>
    );
  }

  if (status === 'not_found' || !dossier) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-6xl font-bold text-[var(--border)] mb-4">404</p>
          <p className="text-[var(--muted)] text-sm">Досье не найдено</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
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

      <section className="mb-10 bg-[var(--surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
        <InfoRow label="Дата рождения" value={dossier.birth_date} />
        <InfoRow label="Город" value={dossier.city} />
        <InfoRow label="Телефон" value={dossier.phone} />
      </section>

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

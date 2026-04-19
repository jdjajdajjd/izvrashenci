'use client';

export const runtime = 'edge';

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

interface Media {
  correspondence: string[];
  gallery: string[];
}

export default function DossierPage() {
  const params = useParams();
  const telegram_id = params.telegram_id as string;

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [media, setMedia] = useState<Media>({ correspondence: [], gallery: [] });
  const [status, setStatus] = useState<'loading' | 'found' | 'not_found'>('loading');
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!telegram_id || !/^\d+$/.test(telegram_id)) {
      setStatus('not_found');
      return;
    }

    Promise.all([
      fetch(`${WORKER_URL}/api/dossier/${telegram_id}`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${WORKER_URL}/api/dossier/${telegram_id}/media`).then((r) =>
        r.ok ? r.json() : { correspondence: [], gallery: [] },
      ),
    ])
      .then(([d, m]) => {
        if (!d) { setStatus('not_found'); return; }
        setDossier(d as Dossier);
        setMedia(m as Media);
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
    <>
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl leading-none opacity-70 hover:opacity-100"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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

        {/* Info */}
        <section className="mb-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
          <InfoRow label="Дата рождения" value={dossier.birth_date} />
          <InfoRow label="Город" value={dossier.city} />
          <InfoRow label="Телефон" value={dossier.phone} />
        </section>

        {/* Correspondence */}
        <PhotoSection
          title="Переписка"
          icon="💬"
          photos={media.correspondence}
          onOpen={setLightbox}
        />

        {/* Gallery */}
        <PhotoSection
          title="Фото"
          icon="📷"
          photos={media.gallery}
          onOpen={setLightbox}
        />

        {/* Static sections */}
        <EmptySection title="Друзья из ВК" icon="👥" />
        <EmptySection title="Родственники" icon="🧬" />
      </main>
    </>
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

function PhotoSection({
  title,
  icon,
  photos,
  onOpen,
}: {
  title: string;
  icon: string;
  photos: string[];
  onOpen: (url: string) => void;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
        {photos.length > 0 && (
          <span className="ml-auto text-xs text-[var(--muted)]">{photos.length} фото</span>
        )}
      </h2>

      {photos.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">Нет данных</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => onOpen(url)}
              className="aspect-square rounded-lg overflow-hidden bg-[var(--border)] hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptySection({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </h2>
      <p className="text-xs text-[var(--muted)]">Нет данных</p>
    </div>
  );
}

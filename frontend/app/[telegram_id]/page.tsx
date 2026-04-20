'use client';

export const runtime = 'edge';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const WORKER_URL = 'https://dossier-worker.qsenseeee.workers.dev';

interface Relatives {
  mother?: string; father?: string;
  brother_1?: string; brother_2?: string; brother_3?: string;
  sister_1?: string;  sister_2?: string;  sister_3?: string;
  grandma_1?: string; grandma_2?: string;
  grandpa_1?: string; grandpa_2?: string;
}

interface Dossier {
  full_name: string;
  birth_date: string;
  city: string;
  phone: string;
  avatar_url: string;
  username: string;
  suspected_of: string;
  info_text: string;
  notes: string;
  public_messages: string;
  relatives: Relatives;
  hidden_sections: string[];
}

interface MediaItem { url: string; type: 'image' | 'video'; }
interface Media { correspondence: MediaItem[]; gallery: MediaItem[]; }

const RELATIVE_LABELS: Record<keyof Relatives, string> = {
  mother: 'Мать', father: 'Отец',
  brother_1: 'Брат 1', brother_2: 'Брат 2', brother_3: 'Брат 3',
  sister_1: 'Сестра 1', sister_2: 'Сестра 2', sister_3: 'Сестра 3',
  grandma_1: 'Бабушка 1', grandma_2: 'Бабушка 2',
  grandpa_1: 'Дедушка 1', grandpa_2: 'Дедушка 2',
};

export default function DossierPage() {
  const params = useParams();
  const telegram_id = params.telegram_id as string;

  const [dossier, setDossier]   = useState<Dossier | null>(null);
  const [media, setMedia]       = useState<Media>({ correspondence: [], gallery: [] });
  const [status, setStatus]     = useState<'loading' | 'found' | 'not_found'>('loading');
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [relOpen, setRelOpen]   = useState(false);

  useEffect(() => {
    if (!telegram_id || !/^\d+$/.test(telegram_id)) { setStatus('not_found'); return; }
    Promise.all([
      fetch(`${WORKER_URL}/api/dossier/${telegram_id}`).then((r) => r.ok ? r.json() : null),
      fetch(`${WORKER_URL}/api/dossier/${telegram_id}/media`).then((r) => r.ok ? r.json() : { correspondence: [], gallery: [] }),
    ])
      .then(([d, m]) => {
        if (!d) { setStatus('not_found'); return; }
        setDossier(d as Dossier);
        setMedia(m as Media);
        setStatus('found');
      })
      .catch(() => setStatus('not_found'));
  }, [telegram_id]);

  if (status === 'loading') return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-[var(--muted)] text-sm animate-pulse">Загрузка...</div>
    </main>
  );

  if (status === 'not_found' || !dossier) return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-6xl font-bold text-[var(--border)] mb-4">404</p>
        <p className="text-[var(--muted)] text-sm">Досье не найдено</p>
      </div>
    </main>
  );

  const hidden  = dossier.hidden_sections ?? [];
  const visible = (key: string) => !hidden.includes(key);

  const relEntries = Object.entries(dossier.relatives ?? {}).filter(([, v]) => v) as [keyof Relatives, string][];

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl opacity-70 hover:opacity-100"
            onClick={() => setLightbox(null)}
          >✕</button>
          <a
            href={lightbox.url}
            download
            target="_blank"
            rel="noreferrer"
            className="absolute top-4 left-4 text-white text-sm opacity-70 hover:opacity-100 bg-white/10 px-3 py-1 rounded-full"
            onClick={(e) => e.stopPropagation()}
          >⬇ Скачать</a>
          {lightbox.type === 'video'
            ? <video src={lightbox.url} controls autoPlay className="max-w-full max-h-[90vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={lightbox.url} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          }
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="flex items-center gap-6 mb-6">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--surface)] border border-[var(--border)] flex-shrink-0">
            {dossier.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={dossier.avatar_url} alt={dossier.full_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-2xl text-[var(--muted)]">?</div>
            }
          </div>
          <div>
            <p className="text-xs text-[var(--muted)] mb-0.5">
              ID: {telegram_id}
              {dossier.username && (
                <span className="ml-2 text-[var(--accent)]">@{dossier.username}</span>
              )}
            </p>
            <h1 className="text-xl font-bold tracking-tight">{dossier.full_name}</h1>
          </div>
        </div>

        {/* Подозревается в */}
        {visible('suspected_of') && dossier.suspected_of && (
          <div className="mb-4 rounded-xl border border-red-800/60 bg-red-950/40 p-5">
            <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <span>🔴</span><span>Подозревается в</span>
            </h2>
            <p className="text-sm text-red-200 leading-relaxed font-medium whitespace-pre-wrap">{dossier.suspected_of}</p>
          </div>
        )}

        {/* Основные данные */}
        <section className="mb-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
          <InfoRow label="Дата рождения" value={dossier.birth_date} />
          <InfoRow label="Город"         value={dossier.city} />
          <InfoRow label="Телефон"       value={dossier.phone} />
        </section>

        {/* Информация */}
        {visible('info') && dossier.info_text && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span>ℹ️</span><span>Информация</span>
            </h2>
            <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap font-mono leading-relaxed">{dossier.info_text}</pre>
          </div>
        )}

        {/* Родственники */}
        {visible('relatives') && relEntries.length > 0 && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl mb-4 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold hover:bg-white/5 transition-colors"
              onClick={() => setRelOpen((v) => !v)}
            >
              <span className="flex items-center gap-2"><span>🧬</span><span>Родственники</span><span className="text-xs text-[var(--muted)] font-normal ml-1">{relEntries.length}</span></span>
              <span className="text-[var(--muted)] text-xs">{relOpen ? '▲' : '▼'}</span>
            </button>
            {relOpen && (
              <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {relEntries.map(([key, val]) => (
                  <InfoRow key={key} label={RELATIVE_LABELS[key]} value={val} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Переписка */}
        {visible('correspondence') && (
          <MediaSection
            title="Переписка" icon="💬"
            items={media.correspondence}
            onOpen={(url, type) => setLightbox({ url, type })}
          />
        )}

        {/* Медиа */}
        {visible('gallery') && (
          <MediaSection
            title="Медиа" icon="🎞️"
            items={media.gallery}
            onOpen={(url, type) => setLightbox({ url, type })}
          />
        )}

        {/* Сообщения из публичных чатов */}
        {visible('public_messages') && dossier.public_messages && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span>🗨️</span><span>Сообщения из публичных чатов</span>
            </h2>
            <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap font-mono leading-relaxed">{dossier.public_messages}</pre>
          </div>
        )}

        {/* Заметки */}
        {visible('notes') && dossier.notes && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span>📓</span><span>Заметки</span>
            </h2>
            <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap font-mono leading-relaxed">{dossier.notes}</pre>
          </div>
        )}

        {/* Друзья из ВК */}
        {visible('vk_friends') && <EmptySection title="Друзья из ВК" icon="👥" />}

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

function MediaSection({ title, icon, items, onOpen }: {
  title: string; icon: string; items: MediaItem[];
  onOpen: (url: string, type: 'image' | 'video') => void;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <span>{icon}</span><span>{title}</span>
        {items.length > 0 && <span className="ml-auto text-xs text-[var(--muted)]">{items.length} файлов</span>}
      </h2>
      {items.length === 0
        ? <p className="text-xs text-[var(--muted)]">Нет данных</p>
        : <div className="grid grid-cols-3 gap-2">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={() => onOpen(item.url, item.type)}
                className="relative aspect-square rounded-lg overflow-hidden bg-[var(--border)] hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {item.type === 'video'
                  ? <>
                      <video src={item.url} className="w-full h-full object-cover" muted preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-black/50 rounded-full w-8 h-8 flex items-center justify-center text-white text-sm">▶</div>
                      </div>
                    </>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={item.url} alt="" className="w-full h-full object-cover" />
                }
              </button>
            ))}
          </div>
      }
    </div>
  );
}

function EmptySection({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span><span>{title}</span>
      </h2>
      <p className="text-xs text-[var(--muted)]">Нет данных</p>
    </div>
  );
}

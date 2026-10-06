'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import type { Photo, Variant } from './media-client';
import { Button, IconButton } from '../../components/ui/button';
import { Icon } from '../../components/ui/icon';
import { galleryPhotos } from '../detail/detail-model';

function GalleryImage({ image, alt, priority = false }: { image: Variant; alt: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="detail-image-fallback"><Icon name="car" /><span>Фото недоступно</span></span> :
    <Image unoptimized src={image.url} width={image.width} height={image.height} alt={alt} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} onError={() => setFailed(true)} />;
}
export function MediaGallery({ photos, title = 'Объявление', type = 'VEHICLE' }: { photos: Photo[]; title?: string; type?: 'VEHICLE' | 'PART' }) {
  const ready = galleryPhotos(photos);
  const [active, setActive] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  function select(index: number) {
    const next = Math.min(ready.length - 1, Math.max(0, index));
    strip.current?.scrollTo({left: next * strip.current.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  const offset = Math.floor(active / 5) * 5;
  return <section aria-label={type === 'PART' ? 'Фотографии запчасти' : 'Фотографии автомобиля'} className={`detail-gallery gallery-${type.toLowerCase()}`} onKeyDown={event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !ready.length) return;
    event.preventDefault();
    select(event.key === 'Home' ? 0 : event.key === 'End' ? ready.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1));
  }}>
    {ready.length ? <>
      <div className="detail-gallery-strip" ref={strip} tabIndex={0} aria-label="Фотографии: используйте стрелки влево и вправо" onScroll={() => {
        if (strip.current?.clientWidth) setActive(Math.round(strip.current.scrollLeft / strip.current.clientWidth));
      }}>
        {ready.map((photo,index) => <figure key={photo.id} aria-label={`Фото ${index+1} из ${ready.length}`}><GalleryImage key={photo.variants!.medium.url} image={photo.variants!.medium} alt={`${title} — фото ${index+1}${photo.isPrimary ? ', главное фото' : ''}`} priority={index === 0} /></figure>)}
      </div>
      <div className="detail-gallery-controls">
        <IconButton label="Предыдущее фото" variant="outline" disabled={active === 0} onClick={() => select(active-1)}><Icon name="arrow" className="detail-arrow-back" /></IconButton>
        <span className="detail-photo-counter" aria-label={`Фото ${active+1} из ${ready.length}`}>{active+1} / {ready.length}</span>
        <IconButton label="Следующее фото" variant="outline" disabled={active >= ready.length-1} onClick={() => select(active+1)}><Icon name="arrow" /></IconButton>
        <a href={ready[active]?.variants?.large.url} target="_blank" rel="noopener noreferrer" className="detail-photo-original">Крупное фото<span className="visually-hidden"> (в новой вкладке)</span></a>
      </div>
      {ready.length > 1 && <div className="detail-thumbnails" aria-label="Выбор фотографии">{ready.slice(offset,offset+5).map((photo,index) => <Button key={photo.id} variant="ghost" aria-label={`Показать фото ${offset+index+1}`} aria-pressed={active === offset+index} onClick={() => select(offset+index)}><GalleryImage key={photo.variants!.thumbnail.url} image={photo.variants!.thumbnail} alt="" /></Button>)}</div>}
    </> : <div className="detail-gallery-empty"><Icon name={type === 'PART' ? 'part' : 'car'} /><p>Фотографии отсутствуют.</p></div>}
  </section>;
}

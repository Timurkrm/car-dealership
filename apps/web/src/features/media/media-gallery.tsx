import Image from 'next/image';
import type { Photo } from './media-client';
export function MediaGallery({ photos }: { photos: Photo[] }) {
  const ready = photos.filter(
    (photo) => photo.status === 'READY' && photo.variants,
  );
  return (
    <section aria-label="Фотографии автомобиля" className="media-gallery">
      {ready.length ? (
        ready.map(
          (photo, index) =>
            photo.variants && (
              <a
                key={photo.id}
                href={photo.variants.large.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  unoptimized
                  src={photo.variants.medium.url}
                  width={photo.variants.medium.width}
                  height={photo.variants.medium.height}
                  alt={`Фотография автомобиля ${index + 1}${photo.isPrimary ? ', главное фото' : ''}`}
                />
              </a>
            ),
        )
      ) : (
        <p>Фотографии отсутствуют.</p>
      )}
    </section>
  );
}

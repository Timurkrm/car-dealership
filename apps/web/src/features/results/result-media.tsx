'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { Variant } from '../media/media-client';
import { Icon } from '../../components/ui/icon';
export function ResultMedia({
  cover,
  type,
  label,
}: {
  cover: Variant | null;
  type: 'VEHICLE' | 'PART';
  label: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={`result-media result-media--${type.toLowerCase()}`}>
      {cover && failed !== cover.url ? (
        <Image
          unoptimized
          src={cover.url}
          width={cover.width}
          height={cover.height}
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1439px) 33vw, 25vw"
          loading="lazy"
          alt={`Фото: ${label}`}
          onError={() => setFailed(cover.url)}
        />
      ) : (
        <div className="result-media-placeholder">
          <Icon
            name={type === 'VEHICLE' ? 'car' : 'part'}
            width={40}
            height={40}
          />
          <span>Фото недоступно</span>
        </div>
      )}
    </div>
  );
}

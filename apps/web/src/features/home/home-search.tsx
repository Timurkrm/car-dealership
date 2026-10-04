'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchListingType } from '../search/search-client';
import { Button } from '../../components/ui/button';
import { Input, SearchInput } from '../../components/ui/field';
import { Card } from '../../components/ui/card';
import { Icon } from '../../components/ui/icon';
import { homeSearchTarget } from './home-search-model';

export function HomeSearch() {
  const router = useRouter();
  const [type, setType] = useState<SearchListingType>('VEHICLE');
  const [values, setValues] = useState({ VEHICLE: '', PART: '' });
  const [error, setError] = useState('');
  return (
    <Card className="home-search">
      <div
        className="home-category-switch"
        role="group"
        aria-label="Раздел поиска"
      >
        {(['VEHICLE', 'PART'] as const).map((value) => (
          <Button
            key={value}
            variant={type === value ? 'secondary' : 'ghost'}
            aria-pressed={type === value}
            onClick={() => {
              setType(value);
              setError('');
            }}
          >
            <Icon name={value === 'VEHICLE' ? 'car' : 'part'} />
            {value === 'VEHICLE' ? 'Автомобили' : 'Запчасти'}
          </Button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Read the actual control: early input can precede React hydration.
          const input = new FormData(event.currentTarget).get('query');
          const target = homeSearchTarget(
            type,
            typeof input === 'string' ? input : '',
          );
          if (target.error) setError(target.error);
          else if (target.href) router.push(target.href);
        }}
      >
        {type === 'VEHICLE' ? (
          <Input
            name="query"
            label="Год от"
            inputMode="numeric"
            maxLength={4}
            value={values.VEHICLE}
            onChange={(event) =>
              setValues({ ...values, VEHICLE: event.target.value })
            }
            placeholder="Например, 2020"
            hint="Марку, модель и другие фильтры выберите в каталоге."
            error={error}
          />
        ) : (
          <SearchInput
            name="query"
            label="Номер запчасти или OEM"
            maxLength={100}
            value={values.PART}
            onChange={(event) =>
              setValues({ ...values, PART: event.target.value })
            }
            placeholder="Введите номер или оставьте поле пустым"
            hint="Поиск по номеру. Совместимость уточняйте в каталоге."
            error={error}
          />
        )}
        <Button type="submit" size="lg">
          <Icon name="search" />
          {type === 'VEHICLE' ? 'Найти автомобиль' : 'Найти запчасть'}
        </Button>
      </form>
    </Card>
  );
}

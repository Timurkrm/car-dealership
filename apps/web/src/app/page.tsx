import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { webConfig } from '../config';
import {
  Container,
  PageHeader,
  Section,
  SectionHeader,
} from '../components/ui/layout';
import { Card } from '../components/ui/card';
import { Chip } from '../components/ui/chip';
import { Icon } from '../components/ui/icon';
import { ButtonLink } from '../components/ui/button';
import { HomeSearch } from '../features/home/home-search';
import {
  LatestListings,
  LatestLoading,
} from '../features/home/latest-listings';

export const metadata = {
  title: 'Автомобили и запчасти — Automotive Marketplace',
  description:
    'Найдите автомобиль или запчасть, сравните предложения рядом и свяжитесь с продавцом. Разместите своё объявление в Automotive Marketplace.',
};

export default async function HomePage() {
  await connection();
  const { apiUrl } = webConfig();
  return (
    <>
      <Container
        as="main"
        id="main"
        width="public"
        density="public"
        className="home-page"
      >
        <section className="home-hero" aria-label="Поиск в marketplace">
          <div>
            <Chip>Автомобили и запчасти</Chip>
            <PageHeader
              title="Найдите то, что вам нужно"
              description="Автомобиль для следующей поездки. Запчасть, чтобы продолжить путь. Всё в одном месте."
            />
          </div>
          <HomeSearch />
        </section>
        <Section aria-label="Разделы marketplace">
          <SectionHeader title="Выберите свой раздел" />
          <div className="home-category-grid">
            <Card
              variant="interactive"
              href="/cars"
              className="home-category-card"
            >
              <span className="home-category-icon">
                <Icon name="car" width={32} height={32} />
              </span>
              <h3>Автомобили</h3>
              <p>
                Сравнивайте марки, цены и пробег. Ищите предложения по
                местоположению.
              </p>
              <span className="home-category-action">
                Смотреть автомобили <Icon name="arrow" />
              </span>
            </Card>
            <Card
              variant="interactive"
              href="/parts"
              className="home-category-card"
            >
              <span className="home-category-icon">
                <Icon name="part" width={32} height={32} />
              </span>
              <h3>Запчасти</h3>
              <p>
                Ищите по номеру, категории и совместимости с вашим автомобилем.
              </p>
              <span className="home-category-action">
                Смотреть запчасти <Icon name="arrow" />
              </span>
            </Card>
          </div>
        </Section>
        {(['VEHICLE', 'PART'] as const).map((type) => (
          <Section
            key={type}
            className="home-latest"
            aria-label={
              type === 'VEHICLE' ? 'Свежие автомобили' : 'Свежие запчасти'
            }
          >
            <SectionHeader
              title={
                type === 'VEHICLE' ? 'Свежие автомобили' : 'Свежие запчасти'
              }
              description="Последние опубликованные предложения"
              actions={
                <ButtonLink
                  variant="ghost"
                  href={type === 'VEHICLE' ? '/cars' : '/parts'}
                >
                  {type === 'VEHICLE' ? 'Все автомобили' : 'Все запчасти'}
                  <Icon name="arrow" />
                </ButtonLink>
              }
            />
            <div className="home-latest-body">
              <Suspense fallback={<LatestLoading />}>
                <LatestListings origin={apiUrl} type={type} />
              </Suspense>
            </div>
          </Section>
        ))}
        <Section className="home-sell" aria-label="Продажа">
          <div>
            <SectionHeader
              title="Есть что продать?"
              description="Разместите автомобиль или запчасть и общайтесь с покупателями напрямую."
            />
          </div>
          <ButtonLink href="/sell">
            <Icon name="plus" />
            Разместить объявление
          </ButtonLink>
        </Section>
      </Container>
      <footer className="home-footer">
        <Container width="public">
          <span>Automotive Marketplace</span>
          <nav aria-label="Навигация внизу страницы">
            <Link prefetch={false} href="/cars">
              Автомобили
            </Link>
            <Link prefetch={false} href="/parts">
              Запчасти
            </Link>
            <Link prefetch={false} href="/sell">
              Продать
            </Link>
          </nav>
        </Container>
      </footer>
    </>
  );
}

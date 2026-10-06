import { Container } from '../../components/ui/layout';
import { Skeleton } from '../../components/ui/loading';
import { ButtonLink } from '../../components/ui/button';
import { DetailRefresh } from './detail-refresh';
export function DetailLoading() {
  return <Container as="main" id="main" width="public" className="listing-detail" aria-busy="true">
    <h1 className="visually-hidden">Объявление</h1><p role="status">Загружаем объявление…</p>
    <div className="detail-top"><Skeleton className="detail-gallery-skeleton" /><div className="ui-stack"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div></div>
    <Skeleton className="detail-section-skeleton" />
  </Container>;
}
export function DetailUnavailable({ missing = false }: { missing?: boolean }) {
  return <Container as="main" id="main" width="content" className="listing-detail detail-unavailable">
    <h1>{missing ? 'Объявление недоступно' : 'Не удалось загрузить объявление'}</h1>
    <p>{missing ? 'Объявление не найдено или больше не доступно публично.' : 'Попробуйте обновить страницу немного позже.'}</p>
    <div className="ui-actions">{!missing && <DetailRefresh retry />}<ButtonLink href="/cars" variant="outline">Все автомобили</ButtonLink><ButtonLink href="/parts" variant="outline">Все запчасти</ButtonLink></div>
  </Container>;
}

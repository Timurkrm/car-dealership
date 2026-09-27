import type { Metadata } from 'next';
import { SellChoice } from '../../features/listings/sell-choice';
export const metadata: Metadata = { title: 'Создать объявление' };
export default function Page() {
  return <SellChoice />;
}

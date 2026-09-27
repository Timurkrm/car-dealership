import type { Metadata } from 'next';
import { SellScreen } from '../../../features/listings/sell-screen';
export const metadata: Metadata = { title: 'Продать автомобиль' };
export default function Page() {
  return <SellScreen />;
}

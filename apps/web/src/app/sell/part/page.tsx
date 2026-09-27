import type { Metadata } from 'next';
import { SellPartScreen } from '../../../features/parts/sell-part-screen';
export const metadata: Metadata = { title: 'Продать запчасть' };
export default function Page() {
  return <SellPartScreen />;
}

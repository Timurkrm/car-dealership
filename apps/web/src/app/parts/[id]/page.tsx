import type { Metadata } from 'next';
import { PartDetailScreen } from '../../../features/parts/part-detail-screen';
export const metadata: Metadata = { title: 'Запчасть — Marketplace' };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartDetailScreen id={id} />;
}

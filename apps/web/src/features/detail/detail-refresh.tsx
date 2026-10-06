'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/button';
export function DetailRefresh({ retry = false }: { retry?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button variant="ghost" loading={pending} onClick={() => start(() => router.refresh())}>
    {retry ? 'Повторить' : 'Обновить объявление и фотографии'}
  </Button>;
}

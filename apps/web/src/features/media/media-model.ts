import type { MediaList } from './media-client';
export function validateFiles(
  files: Pick<File, 'type' | 'size'>[],
  current: number,
  limits: MediaList['limits'],
): string | null {
  if (current + files.length > limits.maxImages)
    return `Можно добавить не более ${limits.maxImages} фотографий.`;
  if (files.some((file) => !limits.supportedTypes.includes(file.type)))
    return 'Выберите JPEG, PNG или WebP.';
  if (files.some((file) => !file.size || file.size > limits.maxFileSize))
    return `Размер фотографии должен быть не более ${Math.floor(limits.maxFileSize / 1048576)} МБ.`;
  return null;
}
export function moved(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id),
    target = index + direction,
    result = [...ids];
  if (index < 0 || target < 0 || target >= ids.length) return result;
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}
export function processing(items: MediaList['items']): boolean {
  return items.some((item) =>
    ['PENDING', 'UPLOADED', 'PROCESSING'].includes(item.status),
  );
}
export function failureMessage(code: string | null): string {
  if (code === 'IMAGE_TOO_LARGE') return 'Изображение слишком большое.';
  if (
    ['INVALID_IMAGE', 'UNSUPPORTED_IMAGE', 'SOURCE_CHANGED'].includes(
      code ?? '',
    )
  )
    return 'Файл не является допустимым изображением. Загрузите его заново.';
  return 'Не удалось обработать изображение. Удалите его и загрузите заново.';
}

import { AuthApiError } from '../auth/auth-client';
import { Alert } from '../../components/ui/feedback';

export function listingErrorMessage(error: unknown): string {
  if (!(error instanceof AuthApiError))
    return 'Не удалось связаться с сервисом. Попробуйте ещё раз.';
  const messages: Record<string, string> = {
    PART_INVALID_FITMENT:
      'Проверьте модель, годы и повторяющиеся варианты совместимости.',
    PART_DUPLICATE_FITMENT: 'Такой вариант совместимости уже добавлен.',
    PART_INVALID_YEAR_RANGE: 'Год от должен быть не больше года до.',
    PART_UNIVERSAL_FITMENT_CONFLICT:
      'Универсальная запчасть не должна содержать список автомобилей.',
    PART_INCOMPLETE:
      'Выберите активную категорию и добавьте совместимость либо укажите универсальную запчасть.',
    PART_CATEGORY_NOT_FOUND: 'Категория недоступна. Выберите другую категорию.',
    PART_BRAND_NOT_FOUND:
      'Бренд недоступен. Выберите другой бренд или уберите его.',
    PART_INVALID_NUMBER:
      'Проверьте номер: допустимы латинские буквы, цифры, пробелы и разделители.',
    SEARCH_INVALID_RANGE: 'Укажите валюту и проверьте порядок границ цены.',
    LISTING_VERSION_CONFLICT:
      'Объявление было изменено в другой вкладке или сессии. Обновите данные перед повторным сохранением.',
    LISTING_NOT_FOUND: 'Объявление не найдено или недоступно.',
    LISTING_INVALID_STATE: 'В текущем статусе редактирование недоступно.',
    LISTING_INVALID_STATE_TRANSITION:
      'Это действие недоступно в текущем статусе. Обновите данные.',
    LISTING_INCOMPLETE:
      'Заполните описание и местоположение, добавьте готовое главное фото и завершите или удалите незавершённые загрузки.',
    MEDIA_LIMIT_EXCEEDED: 'Достигнут лимит фотографий.',
    MEDIA_FILE_TOO_LARGE: 'Фотография превышает допустимый размер.',
    MEDIA_UNSUPPORTED_TYPE: 'Выберите JPEG, PNG или WebP.',
    MEDIA_UPLOAD_EXPIRED:
      'Время загрузки истекло. Удалите фотографию и загрузите заново.',
    MEDIA_NOT_READY: 'Дождитесь обработки фотографии.',
    MEDIA_INVALID_ORDER: 'Список фотографий изменился. Обновите фотографии.',
    LISTING_MEDIA_LOCKED: 'В этом статусе фотографии нельзя изменять.',
    MEDIA_STORAGE_UNAVAILABLE:
      'Хранилище временно недоступно. Попробуйте позже.',
    VALIDATION_ERROR: 'Проверьте введённые данные и обязательные поля.',
    INVALID_PRICE: 'Укажите положительную цену в поддерживаемой валюте.',
    INVALID_LOCATION: 'Проверьте широту и долготу.',
    VEHICLE_MODEL_NOT_FOUND: 'Модель не найдена. Выберите её заново.',
    VEHICLE_GENERATION_NOT_FOUND: 'Поколение не найдено. Выберите его заново.',
    VEHICLE_GENERATION_MODEL_MISMATCH:
      'Поколение не соответствует выбранной модели.',
    RATE_LIMITED: 'Слишком много запросов. Попробуйте позже.',
    RATE_LIMIT_UNAVAILABLE: 'Сервис временно недоступен. Попробуйте позже.',
    ACCOUNT_BLOCKED: 'Аккаунт недоступен.',
    ACCOUNT_SUSPENDED: 'Доступ к аккаунту приостановлен.',
    EMAIL_VERIFICATION_REQUIRED: 'Подтвердите email и войдите снова.',
  };
  return (
    messages[error.code] ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.'
  );
}
export function ListingError({ error }: { error: unknown }) {
  return error ? (
    <Alert tone="error">{listingErrorMessage(error)}</Alert>
  ) : null;
}

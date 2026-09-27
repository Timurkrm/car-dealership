import { ApiException } from '../../../platform/http/api-error';

export function validateNewPassword(password: string): void {
  const length = [...password].length;
  if (length < 15 || length > 128 || Buffer.byteLength(password, 'utf8') > 1024)
    throw new ApiException(
      400,
      'PASSWORD_POLICY_VIOLATION',
      'Use a password of 15–128 characters',
    );
}

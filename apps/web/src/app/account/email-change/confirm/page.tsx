import { EmailChangeConfirmation } from '../../../../features/account/email-change-confirmation';
export const metadata = {
  title: 'Подтверждение email',
  referrer: 'no-referrer',
};
export default function Page() {
  return (
    <main id="main" className="auth-page">
      <h1>Подтверждение нового email</h1>
      <EmailChangeConfirmation />
    </main>
  );
}

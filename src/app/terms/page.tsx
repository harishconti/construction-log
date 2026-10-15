import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { APP_NAME, LEGAL_CONTACT_EMAIL, TERMS_VERSION } from '@/lib/legal';

export const metadata: Metadata = { title: `Terms of Service · ${APP_NAME}` };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" version={TERMS_VERSION}>
      <p>
        These terms govern your use of {APP_NAME} (the “service”), a shared ledger for recording a
        home-construction project. By creating an account or using the service you agree to them.
      </p>

      <h2>1. The service</h2>
      <p>
        {APP_NAME} lets a project team record expenses, bills and photos, keep a site diary, and set
        budgets per category. Figures shown are a record of what your team entered; they are not
        financial, tax, accounting or legal advice.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You need an account to use the service. Sign-in is handled by our identity provider; we never store your password.</li>
        <li>You must give accurate details and keep access to your sign-in method secure. You are responsible for activity under your account.</li>
        <li>The service is not intended for children. You must be at least 18 years old to create an account.</li>
      </ul>

      <h2>3. Your content</h2>
      <p>
        You keep ownership of the expenses, notes, photos and other content you add. You grant us the
        limited permission needed to store, process, back up and display that content to you and the
        members of your projects so the service can work. You are responsible for having the right to
        upload what you upload.
      </p>

      <h2>4. Shared projects and roles</h2>
      <p>
        A project can have several members with admin, editor or viewer roles. Project admins control
        membership, roles and settings. Content in a shared project is visible to the other members of
        that project, so only invite people you trust. A project admin cannot be removed while they
        are its last admin.
      </p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not break the law, infringe anyone’s rights, or upload malware or illegal content.</li>
        <li>Do not attempt to access projects you are not a member of, or disrupt the service or other users.</li>
        <li>Do not use the service to store data you are not permitted to store.</li>
      </ul>

      <h2>6. Availability and changes</h2>
      <p>
        The service is provided on an “as is” and “as available” basis. We may change, suspend or
        withdraw features, and we may update these terms. When we make a material change we publish a
        new version and ask you to accept it before you continue. Keep your own copies of anything
        important — a ledger is a record, not a backup.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for indirect or consequential loss,
        or for loss of data, profits or goodwill arising from your use of the service. Nothing in
        these terms excludes liability that cannot be excluded under applicable law.
      </p>

      <h2>8. Ending your use</h2>
      <p>
        You may stop using the service at any time and may delete your account from Account settings.
        See the <a href="/privacy">Privacy Policy</a> for what deletion does. We may suspend or end
        your access if you materially breach these terms or use the service unlawfully.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts of India have exclusive
        jurisdiction over any dispute arising from them.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}

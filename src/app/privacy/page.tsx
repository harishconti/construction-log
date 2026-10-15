import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import {
  APP_NAME,
  DELETION_GRACE_DAYS,
  LEGAL_CONTACT_EMAIL,
  PRIVACY_VERSION,
} from '@/lib/legal';

export const metadata: Metadata = { title: `Privacy Policy · ${APP_NAME}` };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" version={PRIVACY_VERSION}>
      <p>
        This policy explains how {APP_NAME} handles your personal data. It is written to meet India’s
        Digital Personal Data Protection Act, 2023 (the “DPDP Act”). In DPDP terms, {APP_NAME} is the
        Data Fiduciary and you are the Data Principal.
      </p>

      <h2>Who we are</h2>
      <p>
        {APP_NAME} is operated by the project owner. For any privacy question, to exercise a right
        below, or to raise a grievance, contact our grievance officer at{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> your name, email address and the identifier issued by our
          identity provider. We never see or store your password.
        </li>
        <li>
          <strong>Ledger data:</strong> the expenses, GST amounts, vendors, payment modes, diary
          entries, budgets and categories you and your project team add.
        </li>
        <li>
          <strong>Uploads:</strong> the bills and photos you attach, stored in private object storage.
        </li>
        <li>
          <strong>Usage and security data:</strong> project membership and roles, an audit log of
          changes you make, and rate-limit counters.
        </li>
        <li>
          <strong>Consent records:</strong> which version of this notice you accepted, when, and the
          technical evidence of that action (for example, your IP address and browser user agent).
        </li>
      </ul>

      <h2>Why we process it, and our legal basis</h2>
      <p>
        We process your personal data on the basis of your consent, given under the DPDP Act, for the
        specific purposes you accepted when you signed up. Each purpose is listed and consented to
        individually. The required purposes are running your account and providing the ledger; an
        optional purpose for non-essential service messages can be turned off in Account settings.
      </p>
      <p>
        We do not use your data for advertising, and we do not sell it. We do not use ledger data to
        train advertising or profiling models.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the essential session cookie set by our identity provider to keep you signed in.
        There are no advertising or third-party analytics cookies.
      </p>

      <h2>Who else processes it</h2>
      <p>
        We use service providers to run the app, each processing data only on our instructions:
      </p>
      <ul>
        <li><strong>Neon</strong> — managed PostgreSQL database and authentication.</li>
        <li><strong>Vercel</strong> — application hosting.</li>
        <li><strong>Cloudflare R2</strong> — private storage for uploaded bills and photos.</li>
        <li><strong>Google</strong> — optional “sign in with Google” authentication.</li>
      </ul>
      <p>
        These providers may store and process data on servers outside India. Where required, we rely
        on your consent for such processing and use providers with appropriate safeguards. Otherwise
        we share personal data only where the law requires it.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Account and ledger data is kept while your account exists. When you delete your account, your
        personal identifiers are erased and the projects you solely owned — including their data and
        stored files — are deleted. Records that must be kept for other project members, or for
        legal, accounting or audit purposes, are retained without your personal identifiers. Audit
        entries and backups are then removed or overwritten as they age out.
      </p>

      <h2>Your rights as a Data Principal</h2>
      <ul>
        <li><strong>Access:</strong> see the personal data we hold about you.</li>
        <li><strong>Correction and completion:</strong> fix inaccurate or incomplete data.</li>
        <li><strong>Erasure:</strong> ask us to delete your personal data (see below).</li>
        <li><strong>Withdraw consent:</strong> withdraw your consent at any time, as easily as you gave it.</li>
        <li><strong>Grievance:</strong> complain to our grievance officer, and if unsatisfied, to the Data Protection Board of India.</li>
        <li><strong>Nominate:</strong> nominate someone to exercise your rights in the event of death or incapacity.</li>
      </ul>
      <p>
        To exercise any of these, email{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. We respond within the
        time the DPDP Act allows.
      </p>

      <h2>Deleting your account and withdrawing consent</h2>
      <p>
        You can request deletion from Account settings in the app at any time. Because withdrawing your
        consent means we can no longer run your ledger, deleting your account also withdraws your
        consent. Requests are processed after a <strong>{DELETION_GRACE_DAYS}-day grace period</strong>,
        during which you can cancel; you can also withdraw consent by emailing us. When the request is
        processed, your name and email are overwritten, your consent records are deleted, and the
        projects you solely owned — with their expenses, diary entries, budgets, bills and stored
        files — are permanently removed. Projects that are shared with other members stay available to
        them. See the <a href="/terms">Terms of Service</a> for more.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Data is encrypted in transit, uploads live in private storage served through short-lived signed
        links, and access to a project is always re-checked against your membership. No system is
        perfectly secure, so keep your sign-in method safe and share projects only with people you
        trust.
      </p>

      <h2>Children</h2>
      <p>
        The service is for adults. We do not knowingly collect personal data of children. If a child’s
        data has been provided, contact us and we will delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy we publish a new version and ask you to accept it before you continue
        using the service. The current version is {PRIVACY_VERSION}.
      </p>
    </LegalLayout>
  );
}

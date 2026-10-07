import { Link } from "@tanstack/react-router";

import { LegalPage, PrivacyContact } from "./legal-page";

/** Draft terms for both apps; see legal.constants.ts and KNOWN_GAPS.md O8. */
export function TermsOfService() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms cover the Linara web dashboard and the Linara app. By creating an account or
        claiming an invite you agree to them, and to how we handle data as set out in the{" "}
        <Link to="/privacy" className="font-semibold text-primary underline">
          privacy policy
        </Link>
        .
      </p>

      <h2>What Linara is, and isn&rsquo;t</h2>
      <p>
        Linara is a tool for running a home: tasks, schedules, pay and the pantry. It is not an
        employment agency, and it is not a party to the work arrangement between a household and its
        helper. The household is the employer under the Batas Kasambahay (RA 10361), and the duties
        the law gives an employer stay with the household.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>A manager must be at least 18 and able to employ someone in the Philippines.</li>
        <li>
          A helper joins with an invite code from a household and keeps their own account. When they
          leave, their account and their record stay theirs, and they can join another household.
        </li>
        <li>
          Keep your password to yourself. You&rsquo;re responsible for what is done with your
          account.
        </li>
      </ul>

      <h2>Pay, contributions and the law</h2>
      <ul>
        <li>
          Linara works out pay, statutory contributions (SSS, PhilHealth, Pag-IBIG), vale deductions
          and 13th-month pay from what the household has entered. These figures are a guide, not
          legal or tax advice. The household is responsible for paying the right wage, on time, and
          for registering and remitting contributions.
        </li>
        <li>
          Pay sent through Linara goes by GCash or Maya through Xendit. A payout can fail or be
          delayed by the provider; Linara shows its status and does not hold the money.
        </li>
        <li>
          A payment made outside Linara (cash, bank transfer) can be recorded afterwards. It counts
          on the helper&rsquo;s record once they confirm they received it. Record only payments that
          really happened.
        </li>
        <li>
          Wages below the regional minimum are flagged but not blocked. Paying the legal minimum is
          the household&rsquo;s duty.
        </li>
      </ul>

      <h2>Fair use</h2>
      <p>Use Linara to run a household fairly. In particular, don&rsquo;t:</p>
      <ul>
        <li>try to read a helper&rsquo;s private notes or anything outside your own household;</li>
        <li>use Linara to watch, score or pressure someone beyond what the work needs;</li>
        <li>enter false records, such as a payment that wasn&rsquo;t made;</li>
        <li>interfere with the service or other people&rsquo;s use of it.</li>
      </ul>
      <p>We may suspend an account that does these things.</p>

      <h2>Your content</h2>
      <p>
        What you enter stays yours. You let us store and show it to the people it&rsquo;s meant for
        (your household, or your employer for work records) so Linara can work. Deleting it, or your
        account, works as described in the{" "}
        <Link to="/privacy" hash="delete" className="font-semibold text-primary underline">
          privacy policy
        </Link>
        .
      </p>

      <h2>The service</h2>
      <p>
        We work to keep Linara available and correct, but it is provided as it is, and some features
        (such as the AI helpers) may change or be switched off. To the extent the law allows, Linara
        Home is not liable for indirect losses, or for losses from relying on a calculation without
        checking it. Nothing here limits rights you have under Philippine law that can&rsquo;t be
        limited.
      </p>

      <h2>Ending</h2>
      <p>
        You can stop using Linara and ask for your account to be deleted at any time. Philippine law
        governs these terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <PrivacyContact />.
      </p>
    </LegalPage>
  );
}

import { DELETION_WINDOW_DAYS } from "./legal.constants";
import { LegalPage, PrivacyContact } from "./legal-page";

/**
 * Written from what the two apps actually store and send (checked against the
 * schema and code on the "last updated" date), not from a template. When a
 * feature starts collecting something new, this page changes with it.
 */
export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Linara helps a household and the people who work in it run the home: tasks, schedules, pay,
        and the pantry. Two kinds of people use it. <strong>Managers</strong> run a household from
        the web dashboard or the app. <strong>Helpers</strong> (kasambahay) use the Worker&rsquo;s
        Station app. This page explains what Linara keeps about each of you, who can see it, and how
        to have it deleted.
      </p>

      <h2>Buod sa Filipino</h2>
      <ul>
        <li>
          Ang private notes mo ay sa iyo lang. Hindi ito mababasa ng employer mo, kahit kailan.
        </li>
        <li>Ang mga Quick Utos ay binubura gabi-gabi, paglampas ng hatinggabi sa oras ng bahay.</li>
        <li>
          Ang payslips, oras ng trabaho at leave mo ay itinatago ng bahay nang hindi bababa sa
          tatlong taon, dahil iyon ang hinihingi ng batas. Puwede mong i-download ang record mo
          bilang PDF anumang oras.
        </li>
        <li>
          Puwede mong ipabura ang account mo mula sa app (My Record). Gagawin namin ito sa loob ng{" "}
          {DELETION_WINDOW_DAYS} araw.
        </li>
      </ul>

      <h2>Who is responsible for your data</h2>
      <p>
        Linara Home runs Linara and stores everything described here. When a household keeps
        employment records about its helper (her wage, hours, pay and leave), the household is her
        employer and is responsible for those records under the Batas Kasambahay (RA 10361); Linara
        keeps them on the household&rsquo;s behalf. Both of us handle personal data under the Data
        Privacy Act of 2012 (RA 10173).
      </p>

      <h2>What Linara keeps</h2>
      <h3>About managers</h3>
      <ul>
        <li>Your name, email address, and password (stored only as a secure hash).</li>
        <li>Your household&rsquo;s name and time zone.</li>
        <li>
          What you put into the household: tasks and routines, appointments, house procedures
          (SOPs), pantry and grocery lists, budgets, and the photos attached to them.
        </li>
      </ul>
      <h3>About helpers</h3>
      <ul>
        <li>Your name, the email address you sign in with, and your password (hashed).</li>
        <li>
          Your terms of work: role, monthly wage, shift, rest day, first and last day, and the
          mobile number your pay is sent to by GCash or Maya.
        </li>
        <li>
          Your work record: tasks and their status, photos you take to show a task is done, hours
          worked after your shift, rest days, leave requests, cash advances (vale), and payslips.
        </li>
        <li>Whether you&rsquo;ve said you&rsquo;re available right now, and when that ends.</li>
        <li>
          Your private notes. Voice notes are turned into text; the recording itself is not kept.
        </li>
      </ul>
      <h3>From your phone</h3>
      <ul>
        <li>
          A notification token, so your household can reach you when you&rsquo;ve allowed it. It is
          removed when you sign out.
        </li>
      </ul>
      <p>
        Linara does not use advertising, analytics or tracking tools, and does not sell personal
        data.
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Your household</strong> sees what it needs to run the home and pay you: your
          tasks, schedule, availability, hours, leave, vales and payslips.
        </li>
        <li>
          <strong>Your private notes are yours alone.</strong> The database itself refuses every
          other account, your employer&rsquo;s included, and nobody at Linara looks at them.
        </li>
        <li>
          <strong>After you leave a household</strong>, you can still see and download your own
          record from it. The household keeps its copy and can no longer see anything new you do.
        </li>
        <li>No household can see another household&rsquo;s data.</li>
      </ul>

      <h2>Services that handle data for us</h2>
      <ul>
        <li>
          <strong>Supabase</strong> hosts the database, sign-in and photo storage.
        </li>
        <li>
          <strong>Vercel</strong> hosts the web dashboard.
        </li>
        <li>
          <strong>Xendit</strong> sends pay by GCash or Maya. It receives the helper&rsquo;s name,
          mobile number and the amount, and keeps its own payment records as the law requires.
        </li>
        <li>
          <strong>Expo</strong> delivers notifications to the helper app.
        </li>
        <li>
          <strong>AI features</strong> (writing house procedures, turning a sentence into an
          appointment, transcribing voice notes) currently run on built-in examples, and nothing is
          sent to an AI company. Before that changes, this page will name the provider and what it
          receives.
        </li>
      </ul>

      <h2>How long it&rsquo;s kept</h2>
      <ul>
        <li>
          <strong>Quick Utos</strong> are deleted every night, within the hour after midnight in the
          household&rsquo;s time zone.
        </li>
        <li>
          <strong>Employment records</strong> (payslips, vales, hours and leave) are kept for at
          least three years after the last entry, as Philippine labor law requires. They stay even
          if an account is deleted, without the link to that person&rsquo;s login.
        </li>
        <li>Everything else is kept until the account or household is deleted.</li>
      </ul>

      <h2 id="delete">Deleting your account</h2>
      <p>You can ask for your account to be deleted at any time:</p>
      <ul>
        <li>
          <strong>Helpers:</strong> in the app, open <em>My Record</em> and choose{" "}
          <em>Burahin ang account ko</em>. Download your record as a PDF first if you want to keep
          it.
        </li>
        <li>
          <strong>Managers:</strong> in the dashboard, open <em>People</em> and choose{" "}
          <em>Delete my account</em>.
        </li>
        <li>
          Or write to <PrivacyContact /> from the email address on the account.
        </li>
      </ul>
      <p>
        We carry it out within {DELETION_WINDOW_DAYS} days, and you can withdraw the request until
        then. Deleting removes your login, your profile, your private notes and your notification
        tokens. For a household&rsquo;s last manager it also removes the household&rsquo;s
        appointments, procedures, pantry and grocery lists. What stays is the employment record
        described above, which the household and the helper both have a right to. Someone still
        employed needs that employment ended first, so their final pay is settled.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Data Privacy Act you can ask what Linara holds about you, have it corrected, get a
        copy (helpers can download theirs as a PDF from <em>My Record</em>), object to how
        it&rsquo;s used, and have it deleted as described above. Write to <PrivacyContact />. If
        you&rsquo;re not satisfied with our answer, you can complain to the National Privacy
        Commission (privacy.gov.ph).
      </p>

      <h2>Security</h2>
      <p>
        Data travels encrypted. Each household&rsquo;s data is separated by rules in the database
        itself, not only in the app. If a breach puts your data at risk, we will tell you and the
        National Privacy Commission as the law requires.
      </p>

      <h2>Changes</h2>
      <p>
        When this policy changes, the date at the top changes too. If a change affects what we
        collect or who sees it, we will tell you before it takes effect.
      </p>
    </LegalPage>
  );
}

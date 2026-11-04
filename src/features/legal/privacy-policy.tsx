import { DELETION_WINDOW_DAYS } from "./legal.constants";
import { LegalPage, PrivacyContact } from "./legal-page";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

/**
 * Written from what the two apps actually store and send (checked against the
 * schema and code on the "last updated" date), not from a template. When a
 * feature starts collecting something new, this page changes with it.
 */
export function PrivacyPolicy() {
  const t = useT();
  return (
    <LegalPage title={t("legal.privacyPolicy")}>
      <p>
        {richText(t("legal.linaraHelpsAHouseholdAnd2"), {
          strong: <strong>{t("legal.managers")}</strong>,
          strong2: <strong>{t("legal.helpers")}</strong>,
        })}
      </p>

      <h2>{t("legal.buodSaFilipino")}</h2>
      <ul>
        <li>{t("legal.angPrivateNotesMoAy")}</li>
        <li>{t("legal.angMgaQuickUtosAy")}</li>
        <li>{t("legal.angPayslipsOrasNgTrabaho")}</li>
        <li>
          {richText(t("legal.puwedeMongIpaburaAngAccount2"), {
            deletionWindowDays: DELETION_WINDOW_DAYS,
          })}
        </li>
      </ul>

      <h2>{t("legal.whoIsResponsibleForYour")}</h2>
      <p>{t("legal.linaraHomeRunsLinaraAnd")}</p>

      <h2>{t("legal.whatLinaraKeeps")}</h2>
      <h3>{t("legal.aboutManagers")}</h3>
      <ul>
        <li>{t("legal.yourNameEmailAddressAnd")}</li>
        <li>{t("legal.yourHouseholdSNameAnd")}</li>
        <li>{t("legal.whatYouPutIntoThe")}</li>
      </ul>
      <h3>{t("legal.aboutHelpers")}</h3>
      <ul>
        <li>{t("legal.yourNameTheEmailAddress")}</li>
        <li>{t("legal.yourTermsOfWorkRole")}</li>
        <li>{t("legal.yourWorkRecordTasksAnd")}</li>
        <li>{t("legal.whetherYouVeSaidYou")}</li>
        <li>{t("legal.yourPrivateNotesVoiceNotes")}</li>
      </ul>
      <h3>{t("legal.fromYourPhone")}</h3>
      <ul>
        <li>{t("legal.aNotificationTokenSoYour")}</li>
      </ul>
      <p>{t("legal.linaraDoesNotUseAdvertising")}</p>

      <h2>{t("legal.whoCanSeeWhat")}</h2>
      <ul>
        <li>
          {richText(t("legal.seesWhatItNeedsTo2"), {
            strong: <strong>{t("legal.yourHousehold")}</strong>,
          })}
        </li>
        <li>
          {richText(t("legal.theDatabaseItselfRefusesEvery2"), {
            strong: <strong>{t("legal.yourPrivateNotesAreYours")}</strong>,
          })}
        </li>
        <li>
          {richText(t("legal.youCanStillSeeAnd"), {
            strong: <strong>{t("legal.afterYouLeaveAHousehold")}</strong>,
          })}
        </li>
        <li>{t("legal.noHouseholdCanSeeAnother")}</li>
      </ul>

      <h2>{t("legal.servicesThatHandleDataFor")}</h2>
      <ul>
        <li>
          {richText(t("legal.hostsTheDatabaseSignIn2"), {
            strong: <strong>{t("legal.supabase")}</strong>,
          })}
        </li>
        <li>
          {richText(t("legal.hostsTheWebDashboard2"), {
            strong: <strong>{t("legal.vercel")}</strong>,
          })}
        </li>
        <li>
          {richText(t("legal.sendsPayByGcashOr2"), {
            strong: <strong>{t("legal.xendit")}</strong>,
          })}
        </li>
        <li>
          {richText(t("legal.deliversNotificationsToTheHelper2"), {
            strong: <strong>{t("legal.expo")}</strong>,
          })}
        </li>
        <li>
          {richText(t("legal.writingHouseProceduresTurningA2"), {
            strong: <strong>{t("legal.aiFeatures")}</strong>,
          })}
        </li>
      </ul>

      <h2>{t("legal.howLongItSKept")}</h2>
      <ul>
        <li>
          {richText(t("legal.areDeletedEveryNightWithin2"), {
            strong: <strong>{t("legal.quickUtos")}</strong>,
          })}
        </li>
        <li>
          {richText(t("legal.payslipsValesHoursAndLeave2"), {
            strong: <strong>{t("legal.employmentRecords")}</strong>,
          })}
        </li>
        <li>{t("legal.everythingElseIsKeptUntil")}</li>
      </ul>

      <h2 id="delete">{t("legal.deletingYourAccount")}</h2>
      <p>{t("legal.youCanAskForYour")}</p>
      <ul>
        <li>
          {richText(t("legal.inTheAppOpenAnd2"), {
            strong: <strong>{t("legal.helpers2")}</strong>,
            em: <em>{t("legal.myRecord")}</em>,
            em2: <em>{t("legal.burahinAngAccountKo")}</em>,
          })}
        </li>
        <li>
          {richText(t("legal.inTheDashboardOpenAnd2"), {
            strong: <strong>{t("legal.managers2")}</strong>,
            em: <em>{t("legal.people")}</em>,
            em2: <em>{t("legal.deleteMyAccount")}</em>,
          })}
        </li>
        <li>{richText(t("legal.orWriteToFromThe2"), { el1: <PrivacyContact /> })}</li>
      </ul>
      <p>
        {richText(t("legal.weCarryItOutWithin2"), { deletionWindowDays: DELETION_WINDOW_DAYS })}
      </p>

      <h2>{t("legal.yourRights")}</h2>
      <p>
        {richText(t("legal.underTheDataPrivacyAct"), {
          em: <em>{t("legal.myRecord")}</em>,
          el1: <PrivacyContact />,
        })}
      </p>

      <h2>{t("legal.security")}</h2>
      <p>{t("legal.dataTravelsEncryptedEachHousehold")}</p>

      <h2>{t("legal.changes")}</h2>
      <p>{t("legal.whenThisPolicyChangesThe")}</p>
    </LegalPage>
  );
}

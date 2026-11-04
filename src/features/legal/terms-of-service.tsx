import { Link } from "@tanstack/react-router";

import { LegalPage, PrivacyContact } from "./legal-page";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

/** Draft terms for both apps; see legal.constants.ts and KNOWN_GAPS.md O8. */
export function TermsOfService() {
  const t = useT();
  return (
    <LegalPage title={t("legal.termsOfService")}>
      <p>
        {richText(t("legal.theseTermsCoverTheLinara"), {
          el1: (
            <Link to="/privacy" className="font-semibold text-primary underline">
              {t("legal.privacyPolicy2")}
            </Link>
          ),
        })}
      </p>

      <h2>{t("legal.whatLinaraIsAndIsn")}</h2>
      <p>{t("legal.linaraIsAToolFor")}</p>

      <h2>{t("legal.accounts")}</h2>
      <ul>
        <li>{t("legal.aManagerMustBeAt")}</li>
        <li>{t("legal.aHelperJoinsWithAn")}</li>
        <li>{t("legal.keepYourPasswordToYourself")}</li>
      </ul>

      <h2>{t("legal.payContributionsAndTheLaw")}</h2>
      <ul>
        <li>{t("legal.linaraWorksOutPayStatutory")}</li>
        <li>{t("legal.paySentThroughLinaraGoes")}</li>
        <li>{t("legal.aPaymentMadeOutsideLinara")}</li>
        <li>{t("legal.wagesBelowTheRegionalMinimum")}</li>
      </ul>

      <h2>{t("legal.fairUse")}</h2>
      <p>{t("legal.useLinaraToRunA")}</p>
      <ul>
        <li>{t("legal.tryToReadAHelper")}</li>
        <li>{t("legal.useLinaraToWatchScore")}</li>
        <li>{t("legal.enterFalseRecordsSuchAs")}</li>
        <li>{t("legal.interfereWithTheServiceOr")}</li>
      </ul>
      <p>{t("legal.weMaySuspendAnAccount")}</p>

      <h2>{t("legal.yourContent")}</h2>
      <p>
        {richText(t("legal.whatYouEnterStaysYours"), {
          privacyPolicy: (
            <Link to="/privacy" hash="delete" className="font-semibold text-primary underline">
              {t("legal.privacyPolicy2")}
            </Link>
          ),
        })}
      </p>

      <h2>{t("legal.theService")}</h2>
      <p>{t("legal.weWorkToKeepLinara")}</p>

      <h2>{t("legal.ending")}</h2>
      <p>{t("legal.youCanStopUsingLinara")}</p>

      <h2>{t("legal.contact")}</h2>
      <p>{richText(t("legal.questionsAboutTheseTerms"), { el1: <PrivacyContact /> })}</p>
    </LegalPage>
  );
}

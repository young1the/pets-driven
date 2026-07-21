import { defaultLocale, isLocale } from "@pets-driven/i18n/config";
import Intro from "@/components/Intro";

export default function HomePage({ params }: { params: { locale: string } }) {
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  return <Intro locale={locale} />;
}

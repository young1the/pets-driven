import { defaultLocale, isLocale } from "@pets-driven/i18n/config";
import Intro from "@/components/Intro";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: requested } = await params;
  const locale = isLocale(requested) ? requested : defaultLocale;
  return <Intro locale={locale} />;
}

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Newspaper } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { StatePanel, Spinner } from '../components/ui/Spinner';
import { useNews } from '../lib/queries';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { formatDate } from '../lib/utils';
import { SITE } from '../lib/site';

export default function Insights() {
  const { t, i18n } = useTranslation();
  const { data: articles, isLoading, isError } = useNews();
  const isArabic = i18n.language === 'ar';

  useSeo({
    title: `${t('insightsPage.title')} | ${SITE.brand}`,
    description: t('insightsPage.description'),
    path: '/insights',
    jsonLd: breadcrumbJsonLd([{ name: t('nav.insights'), path: '/insights' }]),
  });

  return (
    <>
      <PageHeader
        eyebrow={t('insightsPage.eyebrow')}
        title={t('insightsPage.title')}
        description={t('insightsPage.description')}
        crumbs={[{ label: t('nav.insights') }]}
      />

      <section className="py-14 sm:py-16">
        <Container>
          {isLoading ? (
            <Spinner label={t('states.loading')} />
          ) : isError ? (
            <StatePanel title={t('states.error')} body={t('states.errorBody')} />
          ) : !articles?.length ? (
            <StatePanel
              title={t('insightsPage.empty')}
              body={t('insightsPage.emptyBody')}
              icon={<Newspaper className="h-5 w-5" aria-hidden="true" />}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <Link
                  key={article.slug}
                  to={`/insights/${article.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-steel-200 bg-white p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift"
                >
                  <span className="chip">{article.category}</span>
                  <h2 className="mt-4 text-[1.05rem] font-bold leading-snug text-navy-800 group-hover:text-brand-700">
                    {isArabic ? article.titleAr : article.titleEn}
                  </h2>
                  <p className="mt-2 flex-1 text-[0.86rem] leading-relaxed text-steel-500">
                    {isArabic ? article.excerptAr : article.excerptEn}
                  </p>
                  <div className="mt-5 flex items-center justify-between text-xs text-steel-400">
                    <span>{formatDate(article.publishedAt, i18n.language)}</span>
                    <ArrowRight className="flip-x h-4 w-4 text-brand-600" aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}

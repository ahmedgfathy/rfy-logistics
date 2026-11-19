import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { ButtonLink } from '../components/ui/Button';
import { Spinner, StatePanel } from '../components/ui/Spinner';
import { useArticle } from '../lib/queries';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { formatDate } from '../lib/utils';
import { SITE } from '../lib/site';

export default function Article() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const { data: article, isLoading, isError } = useArticle(slug);
  const isArabic = i18n.language === 'ar';

  const title = article ? (isArabic ? article.titleAr : article.titleEn) : t('states.loading');
  const description = article ? (isArabic ? article.excerptAr : article.excerptEn) : '';

  useSeo({
    title: `${title} | ${SITE.brand}`,
    description: description || t('insightsPage.description'),
    path: `/insights/${slug ?? ''}`,
    type: 'article',
    jsonLd: article
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: title,
            description,
            datePublished: article.publishedAt,
            author: { '@type': 'Organization', name: article.author },
            publisher: { '@type': 'Organization', name: SITE.brand },
          },
          breadcrumbJsonLd([
            { name: t('nav.insights'), path: '/insights' },
            { name: title, path: `/insights/${article.slug}` },
          ]),
        ]
      : undefined,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label={t('states.loading')} />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <Container className="py-24">
        <StatePanel
          title={t('insightsPage.notFound')}
          body={t('states.notFoundBody')}
          action={<ButtonLink to="/insights" variant="onlight">{t('insightsPage.back')}</ButtonLink>}
        />
      </Container>
    );
  }

  const body = (isArabic ? article.bodyAr : article.bodyEn) ?? '';

  return (
    <>
      <PageHeader
        eyebrow={article.category}
        title={title}
        description={description}
        crumbs={[{ label: t('nav.insights'), to: '/insights' }, { label: title }]}
      />
      <article className="py-14 sm:py-16">
        <Container className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-4 border-b border-steel-200 pb-5 text-xs text-steel-500">
            <span>{t('insightsPage.publishedOn')} {formatDate(article.publishedAt, i18n.language)}</span>
            <span aria-hidden="true">·</span>
            <span>{t('insightsPage.by')} {article.author}</span>
          </div>
          <div className="prose-copy mt-6">
            {body.split('\n\n').map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>
          <Link to="/insights" className="mt-10 inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-800">
            <ArrowLeft className="flip-x h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {t('insightsPage.back')}
          </Link>
        </Container>
      </article>
    </>
  );
}

import { useEffect } from 'react';
import { SITE } from './site';

interface SeoOptions {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

/** Keeps document metadata in sync with the active route. */
export function useSeo({ title, description, path = '/', image = '/images/hero-terminal.jpg', type = 'website', noIndex, jsonLd }: SeoOptions): void {
  useEffect(() => {
    const absoluteUrl = `${SITE.url}${path}`;
    const absoluteImage = image.startsWith('http') ? image : `${SITE.url}${image}`;

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noIndex ? 'noindex,nofollow' : 'index,follow');
    upsertLink('canonical', absoluteUrl);

    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', SITE.brand);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', absoluteUrl);
    upsertMeta('property', 'og:image', absoluteImage);
    upsertMeta('property', 'og:locale', document.documentElement.lang === 'ar' ? 'ar_EG' : 'en_GB');

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', absoluteImage);

    const scriptId = 'page-jsonld';
    document.getElementById(scriptId)?.remove();
    if (jsonLd) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [title, description, path, image, type, noIndex, JSON.stringify(jsonLd)]);
}

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.legalName,
  url: SITE.url,
  email: SITE.email,
  telephone: SITE.phone,
  description:
    'Egyptian freight forwarder and customs broker handling sea, air and road freight, customs clearance and inland haulage.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: SITE.addressEn,
    addressLocality: 'Alexandria',
    addressCountry: 'EG',
  },
  areaServed: 'Egypt',
};

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE.url}${item.path}`,
    })),
  };
}

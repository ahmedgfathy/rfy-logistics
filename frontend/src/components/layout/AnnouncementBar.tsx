import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AnnouncementBar() {
  const { t } = useTranslation();
  return (
    <div className="border-b border-brand-100 bg-brand-50">
      <div className="container-page flex items-center justify-between gap-4 py-2.5">
        <p className="truncate text-[0.72rem] font-medium text-brand-900/85 sm:text-[0.78rem]">
          <span className="me-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" aria-hidden="true" />
          {t('announce.text')}
        </p>
        <Link
          to="/quote"
          className="hidden shrink-0 items-center gap-1.5 text-[0.72rem] font-bold text-brand-700 transition-colors hover:text-brand-800 sm:inline-flex"
        >
          {t('announce.cta')}
          <ArrowRight className="flip-x h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

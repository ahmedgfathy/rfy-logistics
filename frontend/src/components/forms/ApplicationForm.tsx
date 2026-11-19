import { useMemo, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Paperclip, Send } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { createCareerSchema, type CareerFormValues } from '../../lib/form-schemas';
import { Field, Input, Textarea } from '../ui/Field';
import { Button } from '../ui/Button';

export function ApplicationForm() {
  const { t, i18n } = useTranslation();
  const schema = useMemo(() => createCareerSchema(t), [t]);
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CareerFormValues>({
    resolver: zodResolver(schema) as Resolver<CareerFormValues>,
    mode: 'onTouched',
    defaultValues: { fullName: '', email: '', phone: '', position: '', experience: '', coverLetter: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value.trim()) form.append(key, value.trim());
    });
    form.append('locale', i18n.language === 'ar' ? 'ar' : 'en');
    const cv = fileRef.current?.files?.[0];
    if (cv) form.append('cv', cv);

    try {
      await api.postForm('/careers/apply', form);
      setSent(true);
      reset();
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t('states.errorBody'));
    }
  });

  if (sent) {
    return (
      <div className="surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-xl font-extrabold text-navy-800">{t('careersPage.successTitle')}</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-steel-600">{t('careersPage.successBody')}</p>
        <Button variant="onlight" className="mt-6" onClick={() => setSent(false)}>
          {t('careersPage.applyTitle')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="surface p-6 sm:p-8">
      <h3 className="text-xl font-extrabold text-navy-800">{t('careersPage.applyTitle')}</h3>
      <p className="mt-1.5 text-sm text-steel-500">{t('careersPage.applyBody')}</p>

      {serverError ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {serverError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label={t('contactPage.name')} htmlFor="career-name" required error={errors.fullName?.message}>
          <Input id="career-name" autoComplete="name" invalid={Boolean(errors.fullName)} {...register('fullName')} />
        </Field>
        <Field label={t('contactPage.email')} htmlFor="career-email" required error={errors.email?.message}>
          <Input id="career-email" type="email" dir="ltr" autoComplete="email" invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
        <Field label={t('contactPage.phone')} htmlFor="career-phone" required error={errors.phone?.message}>
          <Input id="career-phone" type="tel" dir="ltr" autoComplete="tel" invalid={Boolean(errors.phone)} {...register('phone')} />
        </Field>
        <Field label={t('careersPage.position')} htmlFor="career-position" required error={errors.position?.message}>
          <Input id="career-position" invalid={Boolean(errors.position)} {...register('position')} />
        </Field>
        <Field label={`${t('careersPage.experience')} (${t('quotePage.form.optional')})`} htmlFor="career-experience">
          <Input id="career-experience" inputMode="numeric" dir="ltr" {...register('experience')} />
        </Field>
        <Field label={t('careersPage.coverLetter')} htmlFor="career-cover" required className="sm:col-span-2" error={errors.coverLetter?.message}>
          <Textarea id="career-cover" rows={5} invalid={Boolean(errors.coverLetter)} {...register('coverLetter')} />
        </Field>
        <Field label={t('careersPage.cv')} htmlFor="career-cv" help={t('careersPage.cvHelp')} className="sm:col-span-2">
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-steel-300 bg-steel-50/60 px-4 py-3">
            <Paperclip className="h-4 w-4 shrink-0 text-steel-500" aria-hidden="true" />
            <input id="career-cv" ref={fileRef} type="file" accept=".pdf,.docx" className="w-full text-sm text-steel-600 file:me-3 file:min-h-[36px] file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
          </div>
        </Field>
      </div>

      <div className="mt-6 flex justify-end border-t border-steel-200 pt-6">
        <Button type="submit" disabled={isSubmitting} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
          {isSubmitting ? t('careersPage.submitting') : t('careersPage.submit')}
        </Button>
      </div>
    </form>
  );
}

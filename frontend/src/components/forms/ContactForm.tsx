import { useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Send } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { createContactSchema, type ContactFormValues } from '../../lib/form-schemas';
import { Field, Input, Textarea } from '../ui/Field';
import { Button } from '../ui/Button';

export function ContactForm() {
  const { t, i18n } = useTranslation();
  const schema = useMemo(() => createContactSchema(t), [t]);
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(schema) as Resolver<ContactFormValues>,
    mode: 'onTouched',
    defaultValues: { fullName: '', email: '', phone: '', company: '', subject: '', message: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post('/contact', { ...values, locale: i18n.language === 'ar' ? 'ar' : 'en' });
      setSent(true);
      reset();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t('states.errorBody'));
    }
  });

  if (sent) {
    return (
      <div className="surface p-8 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-2xl font-extrabold text-navy-800">{t('contactPage.successTitle')}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-steel-600">{t('contactPage.successBody')}</p>
        <Button variant="onlight" className="mt-7" onClick={() => setSent(false)}>
          {t('contactPage.sendAnother')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="surface p-6 sm:p-8">
      <h2 className="text-xl font-extrabold text-navy-800">{t('contactPage.formTitle')}</h2>
      <p className="mt-1.5 text-sm text-steel-500">{t('contactPage.formSub')}</p>

      {serverError ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {serverError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label={t('contactPage.name')} htmlFor="contact-name" required error={errors.fullName?.message}>
          <Input id="contact-name" autoComplete="name" invalid={Boolean(errors.fullName)} {...register('fullName')} />
        </Field>
        <Field label={t('contactPage.email')} htmlFor="contact-email" required error={errors.email?.message}>
          <Input id="contact-email" type="email" dir="ltr" autoComplete="email" invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
        <Field label={`${t('contactPage.phone')} (${t('quotePage.form.optional')})`} htmlFor="contact-phone">
          <Input id="contact-phone" type="tel" dir="ltr" autoComplete="tel" {...register('phone')} />
        </Field>
        <Field label={`${t('contactPage.company')} (${t('quotePage.form.optional')})`} htmlFor="contact-company">
          <Input id="contact-company" autoComplete="organization" {...register('company')} />
        </Field>
        <Field label={t('contactPage.subject')} htmlFor="contact-subject" required className="sm:col-span-2" error={errors.subject?.message}>
          <Input id="contact-subject" invalid={Boolean(errors.subject)} {...register('subject')} />
        </Field>
        <Field label={t('contactPage.message')} htmlFor="contact-message" required className="sm:col-span-2" error={errors.message?.message}>
          <Textarea id="contact-message" rows={5} invalid={Boolean(errors.message)} {...register('message')} />
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-steel-200 pt-6">
        <p className="text-xs text-steel-500">{t('quotePage.form.responseTime')}</p>
        <Button type="submit" disabled={isSubmitting} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
          {isSubmitting ? t('contactPage.submitting') : t('contactPage.submit')}
        </Button>
      </div>
    </form>
  );
}

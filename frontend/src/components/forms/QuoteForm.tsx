import { useMemo, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, CheckCircle2, ChevronLeft, Paperclip, Send } from 'lucide-react';
import { createQuoteSchema, type QuoteFormValues } from '../../lib/form-schemas';
import { api, ApiError } from '../../lib/api';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Button } from '../ui/Button';
import { CONTAINER_TYPES, FREIGHT_MODES, INCOTERMS, SHIPMENT_TYPES } from '../../lib/site';
import { cn } from '../../lib/utils';

const stepFields: (keyof QuoteFormValues)[][] = [
  ['fullName', 'companyName', 'email', 'phone'],
  [
    'freightMode',
    'shipmentType',
    'originCountry',
    'originCity',
    'destinationCountry',
    'destinationCity',
    'cargoDescription',
    'cargoWeightKg',
    'cargoVolumeCbm',
    'packageCount',
    'containerType',
    'incoterms',
    'expectedShipDate',
  ],
  ['additionalNotes', 'consent'],
];

export function QuoteForm() {
  const { t, i18n } = useTranslation();
  const schema = useMemo(() => createQuoteSchema(t), [t]);
  const steps = t('quotePage.steps', { returnObjects: true }) as string[];
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(schema) as Resolver<QuoteFormValues>,
    mode: 'onTouched',
    defaultValues: {
      fullName: '',
      companyName: '',
      email: '',
      phone: '',
      originCountry: '',
      originCity: '',
      destinationCountry: '',
      destinationCity: '',
      shipmentType: '',
      freightMode: 'SEA',
      cargoDescription: '',
      cargoWeightKg: '',
      cargoVolumeCbm: '',
      packageCount: '',
      containerType: '',
      incoterms: '',
      expectedShipDate: '',
      additionalNotes: '',
      consent: false,
    },
  });

  const goNext = async () => {
    const valid = await trigger(stepFields[step], { shouldFocus: true });
    if (valid) setStep((current) => Math.min(current + 1, 2));
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const form = new FormData();
    const { consent: _consent, expectedShipDate, ...rest } = values;

    Object.entries(rest).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) form.append(key, value.trim());
    });

    if (expectedShipDate) form.append('expectedShipDate', `${expectedShipDate}T00:00:00.000Z`);
    form.append('consent', 'true');
    form.append('locale', i18n.language === 'ar' ? 'ar' : 'en');

    const files = fileInputRef.current?.files;
    if (files) {
      Array.from(files)
        .slice(0, 3)
        .forEach((file) => form.append('attachments', file));
    }

    try {
      const response = await api.postForm<{ reference: string }>('/quotes', form);
      setReference(response.data.reference);
      reset();
      setStep(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : t('states.errorBody'),
      );
    }
  });

  const startAnother = () => {
    setReference(null);
    setServerError(null);
    setStep(0);
  };

  if (reference) {
    return (
      <div className="surface p-8 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-2xl font-extrabold text-navy-800">{t('quotePage.form.successTitle')}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-steel-600">{t('quotePage.form.successBody')}</p>
        <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-xl border border-steel-200 bg-steel-50 px-5 py-3">
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-steel-500">
            {t('quotePage.form.successReference')}
          </span>
          <span className="mt-1 font-mono text-lg font-bold tracking-wide text-navy-800">{reference}</span>
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button variant="onlight" onClick={startAnother}>
            {t('quotePage.form.successNext')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="surface overflow-hidden" onSubmit={onSubmit} noValidate>
      <div className="border-b border-steel-200 bg-steel-50/60 px-4 py-4 sm:px-8 sm:py-5">
        <ol className="flex items-center gap-2 sm:gap-3">
          {steps.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-extrabold transition-colors',
                  index < step && 'bg-emerald-600 text-white',
                  index === step && 'bg-brand-600 text-white',
                  index > step && 'bg-steel-200 text-steel-500',
                )}
              >
                {index < step ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden text-[0.78rem] font-semibold sm:block',
                  index <= step ? 'text-navy-800' : 'text-steel-400',
                )}
              >
                {label}
              </span>
              {index < 2 ? <span className="h-px flex-1 bg-steel-200" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-6 p-5 sm:p-8">
        {serverError ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {serverError}
          </div>
        ) : null}

        {step === 0 ? (
          <fieldset className="grid gap-5 border-0 p-0 sm:grid-cols-2">
            <legend className="mb-1 text-[1rem] font-bold text-navy-800">{t('quotePage.form.contactTitle')}</legend>
            <Field label={t('quotePage.form.fullName')} htmlFor="fullName" required error={errors.fullName?.message}>
              <Input id="fullName" autoComplete="name" invalid={Boolean(errors.fullName)} {...register('fullName')} />
            </Field>
            <Field label={`${t('quotePage.form.companyName')} (${t('quotePage.form.optional')})`} htmlFor="companyName" error={errors.companyName?.message}>
              <Input id="companyName" autoComplete="organization" {...register('companyName')} />
            </Field>
            <Field label={t('quotePage.form.email')} htmlFor="email" required error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" dir="ltr" invalid={Boolean(errors.email)} {...register('email')} />
            </Field>
            <Field label={t('quotePage.form.phone')} htmlFor="phone" required error={errors.phone?.message}>
              <Input id="phone" type="tel" autoComplete="tel" dir="ltr" placeholder="+20 100 000 0000" invalid={Boolean(errors.phone)} {...register('phone')} />
            </Field>
          </fieldset>
        ) : null}

        {step === 1 ? (
          <>
            <fieldset className="grid gap-5 border-0 p-0 sm:grid-cols-2">
              <legend className="mb-1 text-[1rem] font-bold text-navy-800">{t('quotePage.form.routeTitle')}</legend>
              <Field label={t('quotePage.form.originCountry')} htmlFor="originCountry" required error={errors.originCountry?.message}>
                <Input id="originCountry" invalid={Boolean(errors.originCountry)} {...register('originCountry')} />
              </Field>
              <Field label={t('quotePage.form.originCity')} htmlFor="originCity" required error={errors.originCity?.message}>
                <Input id="originCity" invalid={Boolean(errors.originCity)} {...register('originCity')} />
              </Field>
              <Field label={t('quotePage.form.destinationCountry')} htmlFor="destinationCountry" required error={errors.destinationCountry?.message}>
                <Input id="destinationCountry" invalid={Boolean(errors.destinationCountry)} {...register('destinationCountry')} />
              </Field>
              <Field label={t('quotePage.form.destinationCity')} htmlFor="destinationCity" required error={errors.destinationCity?.message}>
                <Input id="destinationCity" invalid={Boolean(errors.destinationCity)} {...register('destinationCity')} />
              </Field>
            </fieldset>

            <fieldset className="grid gap-5 border-0 p-0 sm:grid-cols-2">
              <legend className="mb-1 text-[1rem] font-bold text-navy-800">{t('quotePage.form.cargoTitle')}</legend>
              <Field label={t('quotePage.form.freightMode')} htmlFor="freightMode" required>
                <Select id="freightMode" {...register('freightMode')}>
                  {FREIGHT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`mode.${mode}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('quotePage.form.shipmentType')} htmlFor="shipmentType" required error={errors.shipmentType?.message}>
                <Select id="shipmentType" invalid={Boolean(errors.shipmentType)} {...register('shipmentType')} defaultValue="">
                  <option value="">{t('quotePage.form.select')}</option>
                  {SHIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('quotePage.form.cargoDescription')}
                htmlFor="cargoDescription"
                required
                className="sm:col-span-2"
                error={errors.cargoDescription?.message}
              >
                <Textarea
                  id="cargoDescription"
                  rows={3}
                  placeholder={t('quotePage.form.cargoDescription')}
                  invalid={Boolean(errors.cargoDescription)}
                  {...register('cargoDescription')}
                />
              </Field>
              <Field label={t('quotePage.form.cargoWeightKg')} htmlFor="cargoWeightKg" error={errors.cargoWeightKg?.message}>
                <Input id="cargoWeightKg" inputMode="decimal" dir="ltr" {...register('cargoWeightKg')} />
              </Field>
              <Field label={t('quotePage.form.cargoVolumeCbm')} htmlFor="cargoVolumeCbm" error={errors.cargoVolumeCbm?.message}>
                <Input id="cargoVolumeCbm" inputMode="decimal" dir="ltr" {...register('cargoVolumeCbm')} />
              </Field>
              <Field label={t('quotePage.form.packageCount')} htmlFor="packageCount" error={errors.packageCount?.message}>
                <Input id="packageCount" inputMode="numeric" dir="ltr" {...register('packageCount')} />
              </Field>
              <Field label={`${t('quotePage.form.containerType')} (${t('quotePage.form.optional')})`} htmlFor="containerType">
                <Select id="containerType" defaultValue="" {...register('containerType')}>
                  <option value="">{t('quotePage.form.select')}</option>
                  {CONTAINER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${t('quotePage.form.incoterms')} (${t('quotePage.form.optional')})`} htmlFor="incoterms">
                <Select id="incoterms" defaultValue="" {...register('incoterms')}>
                  <option value="">{t('quotePage.form.select')}</option>
                  {INCOTERMS.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={`${t('quotePage.form.expectedShipDate')} (${t('quotePage.form.optional')})`}
                htmlFor="expectedShipDate"
              >
                <Input id="expectedShipDate" type="date" dir="ltr" {...register('expectedShipDate')} />
              </Field>
            </fieldset>
          </>
        ) : null}

        {step === 2 ? (
          <fieldset className="grid gap-5 border-0 p-0">
            <legend className="mb-1 text-[1rem] font-bold text-navy-800">{t('quotePage.form.extraTitle')}</legend>
            <Field
              label={`${t('quotePage.form.additionalNotes')} (${t('quotePage.form.optional')})`}
              htmlFor="additionalNotes"
            >
              <Textarea id="additionalNotes" rows={4} {...register('additionalNotes')} />
            </Field>

            <Field label={t('quotePage.form.attachments')} htmlFor="attachments" help={t('quotePage.form.attachmentsHelp')}>
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-steel-300 bg-steel-50/60 px-4 py-3">
                <Paperclip className="h-4 w-4 shrink-0 text-steel-500" aria-hidden="true" />
                <input
                  id="attachments"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
                  className="w-full text-sm text-steel-600 file:me-3 file:min-h-[36px] file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                />
              </div>
            </Field>

            <label className="flex items-start gap-3 rounded-xl border border-steel-200 bg-white p-4">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-steel-400 text-brand-600 focus:ring-brand-600"
                aria-invalid={Boolean(errors.consent)}
                {...register('consent')}
              />
              <span className="text-[0.82rem] leading-relaxed text-steel-600">
                {t('quotePage.form.consent')}
                {errors.consent ? <span className="mt-1 block font-medium text-red-600">{errors.consent.message}</span> : null}
              </span>
            </label>
          </fieldset>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-steel-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-steel-500">{t('quotePage.form.responseTime')}</p>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {step > 0 ? (
              <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={() => setStep((current) => Math.max(0, current - 1))} icon={<ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}>
                {t('actions.back')}
              </Button>
            ) : null}
            {step < 2 ? (
              <Button type="button" className="flex-1 sm:flex-none" onClick={() => void goNext()} iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}>
                {t('actions.next')}
              </Button>
            ) : (
              <Button type="submit" className="flex-1 sm:flex-none" disabled={isSubmitting} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
                {isSubmitting ? t('quotePage.form.submitting') : t('quotePage.form.submit')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

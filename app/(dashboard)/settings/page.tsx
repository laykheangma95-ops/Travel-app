'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select, FieldWrapper } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CountryPicker } from '@/components/ui/CountryPicker';
import { PhoneVerifyCard } from '@/components/auth/PhoneVerifyCard';
import { useLang, type DictKey } from '@/lib/i18n';

const notificationKeys = [
  'settings.notify.flights',
  'settings.notify.esim',
  'settings.notify.checklist',
  'settings.notify.tips',
] as const satisfies ReadonlyArray<DictKey>;

export default function SettingsPage() {
  const { t } = useLang();
  const [profile, setProfile] = useState({
    fullName: 'Sokha Prak',
    telegram: '@sokha',
    passportCountry: 'KH',
    language: 'km',
  });
  const [saved, setSaved] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    // Persisted to Supabase profiles table once the project is connected.
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{t('settings.title')}</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">{t('settings.sub')}</p>
      </div>

      <Card className="p-7">
        <form onSubmit={save} className="space-y-4">
          <Input
            id="fullName"
            label={t('settings.fullName')}
            value={profile.fullName}
            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
          />
          <Input
            id="telegram"
            label={t('settings.telegram')}
            value={profile.telegram}
            onChange={(e) => setProfile({ ...profile, telegram: e.target.value })}
          />
          <FieldWrapper label={t('settings.passportCountry')} htmlFor="passportCountry">
            <CountryPicker
              id="passportCountry"
              value={profile.passportCountry}
              onChange={(passportCountry) => setProfile({ ...profile, passportCountry })}
              aria-label={t('settings.passportCountry')}
            />
          </FieldWrapper>
          <Select
            id="language"
            label={t('settings.language')}
            value={profile.language}
            onChange={(e) => setProfile({ ...profile, language: e.target.value })}
          >
            <option value="km">ខ្មែរ (Khmer)</option>
            <option value="en">English</option>
          </Select>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">{t('settings.save')}</Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-success animate-fade-up">
                <Check size={16} /> {t('settings.saved')}
              </span>
            )}
          </div>
        </form>
      </Card>

      <PhoneVerifyCard initialCountry="KH" initialNumber="12 345 678" />

      <Card className="p-7">
        <h2 className="font-display font-bold text-ink">{t('settings.notifications')}</h2>
        <div className="mt-4 space-y-3">
          {notificationKeys.map((key) => (
            <label key={key} className="flex cursor-pointer items-center justify-between text-sm text-ink-secondary">
              {t(key)}
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#C69749]" />
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function SettingsPage() {
  const [profile, setProfile] = useState({
    fullName: 'Sokha Prak',
    phone: '+855 12 345 678',
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
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">Your profile and preferences.</p>
      </div>

      <Card className="p-7">
        <form onSubmit={save} className="space-y-4">
          <Input
            id="fullName"
            label="Full name"
            value={profile.fullName}
            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
          />
          <Input
            id="phone"
            label="Phone number"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
          <Input
            id="telegram"
            label="Telegram username"
            value={profile.telegram}
            onChange={(e) => setProfile({ ...profile, telegram: e.target.value })}
          />
          <Select
            id="passportCountry"
            label="Passport country"
            value={profile.passportCountry}
            onChange={(e) => setProfile({ ...profile, passportCountry: e.target.value })}
          >
            <option value="KH">Cambodia 🇰🇭</option>
            <option value="TH">Thailand 🇹🇭</option>
            <option value="VN">Vietnam 🇻🇳</option>
            <option value="OTHER">Other</option>
          </Select>
          <Select
            id="language"
            label="Preferred language"
            value={profile.language}
            onChange={(e) => setProfile({ ...profile, language: e.target.value })}
          >
            <option value="km">ខ្មែរ (Khmer)</option>
            <option value="en">English</option>
          </Select>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">Save changes</Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-success animate-fade-up">
                <Check size={16} /> Saved
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-7">
        <h2 className="font-display font-bold text-ink">Notifications</h2>
        <div className="mt-4 space-y-3">
          {['Flight alerts', 'eSIM delivery updates', 'Checklist reminders', 'Travel tips at destination'].map(
            (label) => (
              <label key={label} className="flex cursor-pointer items-center justify-between text-sm text-ink-secondary">
                {label}
                <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#F97316]" />
              </label>
            )
          )}
        </div>
      </Card>
    </div>
  );
}

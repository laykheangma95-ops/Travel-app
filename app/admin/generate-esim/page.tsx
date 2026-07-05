'use client';

import { useRef, useState } from 'react';
import { FileDown, ImagePlus, QrCode } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { destinations } from '@/data/destinations';
import { generateOrderNumber } from '@/lib/utils';

interface PdfForm {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderNumber: string;
  country: string;
  plan: string;
  duration: string;
  data: string;
  network: string;
  price: string;
}

export default function GenerateEsimPage() {
  const [form, setForm] = useState<PdfForm>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    orderNumber: generateOrderNumber(),
    country: 'vietnam',
    plan: 'Standard',
    duration: '7',
    data: '2',
    network: 'MobiFone & Viettel',
    price: '7.99',
  });
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof PdfForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const onQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setQrPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Generates the branded fulfilment document via the browser's print-to-PDF.
  const generatePdf = () => {
    const dest = destinations.find((d) => d.slug === form.country);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><title>${form.orderNumber} — Domner eSIM</title>
<style>
  body { font-family: Arial, sans-serif; color: #0F172A; max-width: 640px; margin: 0 auto; padding: 32px; }
  .header { background: #0A1628; border-radius: 16px; padding: 28px; text-align: center; }
  .logo { font-size: 26px; font-weight: 800; }
  .logo .d { color: #93B4E8; } .logo .a { color: #F97316; }
  h2 { margin-top: 32px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 10px 0; border-bottom: 1px solid #E2E8F0; }
  td:last-child { text-align: right; font-weight: 600; }
  .qr { text-align: center; margin: 32px 0; }
  .qr img { width: 240px; height: 240px; border: 1px solid #E2E8F0; border-radius: 16px; padding: 12px; }
  .steps { background: #F8FAFC; border-radius: 16px; padding: 20px 28px; }
  .footer { margin-top: 32px; text-align: center; color: #475569; font-size: 13px; }
  .accent { color: #F97316; }
</style></head><body>
  <div class="header"><div class="logo"><span class="d">Domner</span><span class="a">App</span></div></div>
  <h2>Your ${dest?.name ?? form.country} eSIM ${dest?.flag ?? ''}</h2>
  <table>
    <tr><td>Order number</td><td>${form.orderNumber}</td></tr>
    <tr><td>Customer</td><td>${form.customerName}</td></tr>
    <tr><td>Plan</td><td>${form.plan} — ${form.duration} days, ${form.data}GB/day</td></tr>
    <tr><td>Network</td><td>${form.network}</td></tr>
    <tr><td>Price paid</td><td>$${form.price}</td></tr>
  </table>
  <div class="qr">${qrPreview ? `<img src="${qrPreview}" alt="eSIM QR code" />` : '<p>[ QR code ]</p>'}</div>
  <div class="steps">
    <strong>Installation — English</strong>
    <ol><li>Settings → Cellular/Connections → Add eSIM</li><li>Scan this QR code</li><li>Turn the eSIM ON only after you land</li><li>Enable Data Roaming for the new eSIM</li></ol>
    <strong>របៀបដំឡើង — ខ្មែរ</strong>
    <ol><li>ចូល Settings → Cellular → Add eSIM</li><li>ស្កេន QR កូដនេះ</li><li>បើក eSIM បន្ទាប់ពីចុះចតតែប៉ុណ្ណោះ</li><li>បើក Data Roaming សម្រាប់ eSIM ថ្មី</li></ol>
  </div>
  <p><strong>Important:</strong> Install before you fly. Validity starts at first connection abroad.</p>
  <div class="footer">24/7 Khmer support: <span class="accent">t.me/domnerapp</span> · domnerapp.com</div>
  <script>window.print();</script>
</body></html>`);
    win.document.close();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card className="p-7">
        <h2 className="mb-5 flex items-center gap-2 font-display font-bold text-ink">
          <QrCode size={18} className="text-accent" aria-hidden="true" /> Generate eSIM PDF
        </h2>
        <div className="space-y-4">
          <Input id="customerName" label="Customer name" required value={form.customerName} onChange={set('customerName')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="customerEmail" type="email" label="Email" value={form.customerEmail} onChange={set('customerEmail')} />
            <Input id="customerPhone" label="Phone" value={form.customerPhone} onChange={set('customerPhone')} />
          </div>
          <Input id="orderNumber" label="Order number" value={form.orderNumber} onChange={set('orderNumber')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select id="country" label="Destination country" value={form.country} onChange={set('country')}>
              {destinations.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.flag} {d.name}
                </option>
              ))}
            </Select>
            <Select id="plan" label="Plan" value={form.plan} onChange={set('plan')}>
              <option>Basic</option>
              <option>Standard</option>
              <option>Premium</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input id="duration" label="Duration (days)" value={form.duration} onChange={set('duration')} />
            <Input id="data" label="Data (GB/day)" value={form.data} onChange={set('data')} />
            <Input id="price" label="Price paid ($)" value={form.price} onChange={set('price')} />
          </div>
          <Input id="network" label="Network name" value={form.network} onChange={set('network')} />

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">QR code image</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed border-line p-8 text-ink-muted transition-colors hover:border-accent hover:text-accent"
            >
              <ImagePlus size={24} aria-hidden="true" />
              <span className="text-sm">{qrPreview ? 'Replace QR code image' : 'Upload QR code image'}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onQrUpload} className="hidden" aria-label="Upload QR code" />
          </div>

          <Button onClick={generatePdf} className="w-full">
            <FileDown size={16} /> Generate branded PDF
          </Button>
        </div>
      </Card>

      {/* Live preview */}
      <div>
        <h2 className="mb-5 font-display font-bold text-ink">Preview</h2>
        <Card className="overflow-hidden">
          <div className="bg-primary p-6 text-center">
            <p className="font-display text-xl font-extrabold">
              <span className="text-[#93B4E8]">Domner</span>
              <span className="text-accent">App</span>
            </p>
          </div>
          <div className="p-7">
            <h3 className="font-display text-lg font-bold text-ink">
              Your {destinations.find((d) => d.slug === form.country)?.name} eSIM{' '}
              {destinations.find((d) => d.slug === form.country)?.flag}
            </h3>
            <dl className="mt-4 space-y-2 border-b border-line pb-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Order</dt><dd className="font-mono font-semibold">{form.orderNumber}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Customer</dt><dd className="font-semibold">{form.customerName || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Plan</dt><dd className="font-semibold">{form.plan} · {form.duration}d · {form.data}GB/day</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Price</dt><dd className="font-semibold">${form.price}</dd></div>
            </dl>
            <div className="mt-6 flex justify-center">
              {qrPreview ? (
                // Data-URI preview of the uploaded QR — next/image doesn't apply here.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrPreview} alt="Uploaded eSIM QR code" className="h-44 w-44 rounded-card border border-line p-2" />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-card border-2 border-dashed border-line text-ink-muted">
                  <QrCode size={44} aria-hidden="true" />
                </div>
              )}
            </div>
            <p className="mt-6 text-center text-xs text-ink-muted">
              Installation steps in English + Khmer · 24/7 support footer included
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

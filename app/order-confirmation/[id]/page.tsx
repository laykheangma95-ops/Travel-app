'use client';

import { motion } from 'framer-motion';
import { Check, MessageCircle, Plane, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TelegramConnectCard } from '@/components/esim/TelegramConnectCard';

const nextSteps = [
  {
    n: 1,
    title: 'We prepare your eSIM',
    description: 'Our team generates your QR code — usually within 15 minutes.',
  },
  {
    n: 2,
    title: 'You receive the QR code',
    description: 'By email, and on Telegram too if you connected it below.',
  },
  {
    n: 3,
    title: 'Install before you fly',
    description: 'Scan the QR to install, then turn the eSIM on when you land.',
  },
];

export default function OrderConfirmationPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      {/* Success checkmark animation */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-success shadow-lg shadow-success/30"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 300 }}
        >
          <Check size={48} className="text-white" strokeWidth={3} aria-hidden="true" />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <h1 className="mt-8 font-display text-3xl font-bold text-ink sm:text-4xl">
          Your eSIM is Being Prepared!
        </h1>
        <p className="mt-3 text-ink-secondary">
          Order number:{' '}
          <span className="font-mono font-bold text-secondary">{params.id}</span>
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">
          We will send your QR code within <strong className="text-ink">15 minutes</strong>.
        </p>
      </motion.div>

      <TelegramConnectCard orderNumber={params.id} />

      {/* What happens next timeline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-12 rounded-card border border-line/60 bg-white p-8 text-left shadow-card"
      >
        <h2 className="mb-6 font-display text-lg font-bold text-ink">What happens next</h2>
        <ol className="relative space-y-8 border-l-2 border-line pl-8">
          {nextSteps.map((step) => (
            <li key={step.n} className="relative">
              <span className="absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-bold text-white">
                {step.n}
              </span>
              <p className="font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm text-ink-secondary">{step.description}</p>
            </li>
          ))}
        </ol>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-10 flex flex-col justify-center gap-3 sm:flex-row"
      >
        <Button href="/checklist" variant="secondary">
          <PlusCircle size={16} /> Add to your Trip
        </Button>
        <Button href="/flights" variant="outline">
          <Plane size={16} /> Track another flight
        </Button>
        <Button href="https://t.me/domnerapp" variant="outline">
          <MessageCircle size={16} /> Contact support
        </Button>
      </motion.div>
    </div>
  );
}

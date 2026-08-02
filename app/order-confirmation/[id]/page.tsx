'use client';

import { motion, useReducedMotion } from 'framer-motion';
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
  // Hard gate from .claude/skills/ui-ux §4: every animation needs a calm static
  // fallback. The spring-in seal and staggered reveals below are the most
  // motion-heavy moment in the funnel, so they honour the OS setting.
  const reduce = useReducedMotion();

  /** Static when the visitor asked for reduced motion, choreographed otherwise. */
  const rise = (delay: number) =>
    reduce
      ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, ease: [0.22, 1, 0.36, 1] as const, duration: 0.7 },
        };

  return (
    // The confirmation is the emotional peak of the funnel — it stays on the
    // same night sky as the store and checkout instead of cutting to a white
    // page (see .claude/skills/ui-ux §9, concept continuity).
    <div className="night-canvas min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        {/* Gold seal — "your boarding pass has been issued", not a generic tick. */}
        <motion.div
          initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
          className="liquid-glass-accent mx-auto flex h-24 w-24 items-center justify-center rounded-full"
        >
          <motion.div
            initial={reduce ? { scale: 1 } : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={reduce ? { duration: 0 } : { delay: 0.25, type: 'spring', stiffness: 300 }}
          >
            {/* Dark ink on gold — white on Angkor Gold is 2.6:1. */}
            <Check size={48} className="text-primary-deep" strokeWidth={3} aria-hidden="true" />
          </motion.div>
        </motion.div>

        <motion.div {...rise(0.35)}>
          <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-accent">
            Order confirmed
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
            Your eSIM is being prepared
          </h1>
          <p className="mt-4 text-white/70">
            Order number{' '}
            <span className="font-mono font-bold text-gold-light">{params.id}</span>
          </p>
          <p className="mt-1.5 text-sm text-white/55">
            We will send your QR code within{' '}
            <strong className="font-semibold text-white">15 minutes</strong>.
          </p>
        </motion.div>

        {/* TelegramConnectCard is locked (docs/LOCKED.md) and ships light-surface
            classes. .night-locked-surface repaints it for the night canvas from
            globals.css — presentation only, no locked file touched. */}
        <div className="night-locked-surface">
          <TelegramConnectCard orderNumber={params.id} />
        </div>

        {/* What happens next timeline */}
        <motion.div {...rise(0.5)} className="night-card mt-12 p-8 text-left">
          <h2 className="mb-6 font-display text-lg font-bold text-white">What happens next</h2>
          <ol className="relative space-y-8 border-l-2 border-gold-light/25 pl-8">
            {nextSteps.map((step) => (
              <li key={step.n} className="relative">
                <span className="absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full border border-gold-light/40 bg-gold-light/15 text-xs font-bold text-gold-light">
                  {step.n}
                </span>
                <p className="font-semibold text-white">{step.title}</p>
                <p className="mt-1 text-sm text-white/65">{step.description}</p>
              </li>
            ))}
          </ol>
        </motion.div>

        <motion.div
          {...rise(0.7)}
          className="mt-10 flex flex-col justify-center gap-3 sm:flex-row"
        >
          <Button href="/checklist" variant="liquid">
            <PlusCircle size={16} aria-hidden="true" /> Add to your trip
          </Button>
          <Button href="/flights" variant="liquid">
            <Plane size={16} aria-hidden="true" /> Track your flight
          </Button>
          <Button href="https://t.me/domnerapp" variant="liquid">
            <MessageCircle size={16} aria-hidden="true" /> Contact support
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

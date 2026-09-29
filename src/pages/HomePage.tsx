import {
  ArrowDown,
  ArrowRight,
  CheckCircle,
  ChatsCircle,
  EyeSlash,
  Fingerprint,
  Keyhole,
  LockKey,
  ShieldCheck,
  Sparkle,
  Wallet,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Cordao } from '@/design/Cordao';
import { supportedLanguages } from '@/lib/i18n';
import { homeCopy } from '@/content/homeCopy';

const pillarIcons = [Sparkle, ChatsCircle, Wallet] as const;
const linkButtonBase = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] px-4 py-3 text-sm font-semibold no-underline transition-colors';
const primaryLinkButton = `${linkButtonBase} border border-crimson-400/40 bg-crimson-500 text-white shadow-[0_0_32px_hsl(var(--wine-600)/.30)] hover:bg-crimson-400`;
const outlineLinkButton = `${linkButtonBase} border border-bone-50/15 bg-transparent text-bone-50 hover:border-crimson-500/40 hover:bg-wine-900/30`;

export function HomePage() {
  const { t, i18n } = useTranslation();
  const reduced = useReducedMotion();
  const [curtainOpen, setCurtainOpen] = useState(false);
  const language = supportedLanguages.includes(i18n.language as (typeof supportedLanguages)[number]) ? i18n.language : 'pt-MZ';
  const copy = homeCopy[language as keyof typeof homeCopy] ?? homeCopy['pt-MZ'];

  return (
    <div className="overflow-hidden">
      <section className="relative isolate border-b border-bone-50/7">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_28%,hsl(var(--crimson-500)/.12),transparent_32rem)]" />
        <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-14 px-5 py-14 md:grid-cols-[1.08fr_.92fr] md:px-8 md:py-20">
          <div className="relative z-10 max-w-3xl">
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.45 }}
              className="mb-7 flex items-center gap-3 text-sm text-bone-300"
            >
              <span className="h-px w-9 bg-crimson-400/70" />
              <span>{t('brand.tagline')}</span>
              <span className="text-bone-500">18+</span>
            </motion.div>

            <motion.h1
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.55, delay: 0.04 }}
              className="max-w-3xl font-display text-[clamp(4rem,9vw,8.5rem)] leading-[.83] tracking-[-0.045em] text-bone-50"
            >
              {t('brand.discreet')}
            </motion.h1>

            <motion.p
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0.12 : 0.55, delay: 0.12 }}
              className="mt-8 max-w-xl text-base leading-7 text-bone-300 md:text-lg"
            >
              {t('hero.body')}
            </motion.p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/idade?role=client" className={primaryLinkButton}>
                <Keyhole size={19} weight="duotone" />{t('hero.clientAction')}<ArrowRight size={17} weight="duotone" />
              </Link>
              <Link to="/idade?role=creator" className={outlineLinkButton}>
                <Sparkle size={19} weight="duotone" />{t('hero.creatorAction')}
              </Link>
            </div>

            <div className="mt-8 grid max-w-xl gap-3 border-t border-bone-50/8 pt-5 sm:grid-cols-3">
              <span className="text-xs leading-5 text-bone-500">{copy.audienceNote}</span>
              <span className="text-xs leading-5 text-bone-500">{copy.identityNote}</span>
              <span className="text-xs leading-5 text-bone-500">{copy.publicNote}</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: reduced ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.8, delay: 0.08 }}
              className="relative min-h-[28rem] overflow-hidden rounded-[4px] border border-bone-50/10 bg-ink-900 shadow-[0_30px_100px_hsl(var(--ink-950)/.55)]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,hsl(var(--wine-700)/.35),transparent_26rem)]" />
              <div className="absolute inset-x-8 top-8 flex items-center justify-between text-[10px] uppercase tracking-[.24em] text-bone-500">
                <span>PRIVELY</span>
                <span>{curtainOpen ? copy.curtainOpen : copy.curtainClosed}</span>
              </div>

              <button
                type="button"
                aria-expanded={curtainOpen}
                aria-label={curtainOpen ? copy.curtainOpen : copy.curtainClosed}
                onClick={() => setCurtainOpen((open) => !open)}
                className="group absolute inset-x-8 bottom-8 top-20 overflow-hidden rounded-[3px] border border-crimson-500/20 bg-ink-950/60 text-left"
              >
                <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle,hsl(var(--crimson-500)/.09),transparent_45%)]">
                  <div className="relative z-0 text-center">
                    <p className="font-display text-[clamp(4rem,14vw,7rem)] leading-none text-bone-50">PRIVÊ</p>
                    <p className="mt-3 text-xs uppercase tracking-[.28em] text-bone-500">{t('hero.privacyTitle')}</p>
                  </div>
                </div>

                <motion.div
                  animate={{ width: curtainOpen ? '12%' : '50%' }}
                  transition={{ duration: reduced ? 0.12 : 0.7, ease: [0.22, 0.8, 0.2, 1] }}
                  className="absolute inset-y-0 left-0 z-10 border-r border-crimson-400/20 bg-[linear-gradient(90deg,hsl(var(--wine-900)),hsl(var(--wine-700)/.88))] shadow-[inset_-20px_0_38px_hsl(var(--ink-950)/.35)]"
                />
                <motion.div
                  animate={{ width: curtainOpen ? '12%' : '50%' }}
                  transition={{ duration: reduced ? 0.12 : 0.7, ease: [0.22, 0.8, 0.2, 1] }}
                  className="absolute inset-y-0 right-0 z-10 border-l border-crimson-400/20 bg-[linear-gradient(270deg,hsl(var(--wine-900)),hsl(var(--wine-700)/.88))] shadow-[inset_20px_0_38px_hsl(var(--ink-950)/.35)]"
                />

                <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-bone-50/15 bg-ink-950/80 px-4 py-2 text-[10px] uppercase tracking-[.2em] text-bone-300 backdrop-blur-md">
                  {curtainOpen ? t('hero.privacyTitle') : copy.curtainClosed}
                </div>
              </button>

              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-bone-500">
                <Fingerprint size={14} weight="duotone" /> {copy.legalIdentityNote}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 pb-7 text-xs text-bone-500 md:px-8">
          <ArrowDown size={15} weight="duotone" />
          <span>{copy.sectionEyebrow}</span>
        </div>
      </section>

      <section id="prive" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-10 md:grid-cols-[.78fr_1.22fr] md:gap-16">
          <div>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[.2em] text-bone-500">
              <span className="text-crimson-400">01</span>
              <span>{copy.sectionEyebrow}</span>
            </div>
            <h2 className="mt-5 max-w-xl font-display text-5xl leading-[.92] text-bone-50 md:text-7xl">{copy.sectionTitle}</h2>
            <p className="mt-6 max-w-md text-base leading-7 text-bone-300">{copy.sectionBody}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {copy.pillars.map((pillar, index) => {
              const Icon = pillarIcons[index];
              return (
                <Ficha key={pillar.title} className="min-h-64 p-6 md:p-7">
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <Icon size={24} weight="duotone" className="text-crimson-400" />
                      <span className="text-xs text-bone-500">0{index + 1}</span>
                    </div>
                    <div>
                      <h3 className="font-display text-3xl text-bone-50">{pillar.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-bone-300">{pillar.body}</p>
                    </div>
                  </div>
                </Ficha>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-bone-50/7 bg-ink-900/45">
        <div className="mx-auto grid max-w-7xl gap-0 px-5 md:grid-cols-2 md:px-8">
          <div className="border-b border-bone-50/7 py-16 md:border-b-0 md:border-r md:py-24 md:pr-16">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[.2em] text-bone-500">
              <EyeSlash size={17} weight="duotone" className="text-crimson-400" />
              <span>{copy.privacyEyebrow}</span>
            </div>
            <h2 className="mt-5 max-w-xl font-display text-5xl leading-[.9] text-bone-50 md:text-6xl">{copy.privacyTitle}</h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-bone-300">{copy.privacyBody}</p>
            <div className="mt-8 flex flex-wrap gap-2 text-xs text-bone-400">
              {copy.privacyTags.map((tag) => <span key={tag} className="rounded-full border border-bone-50/10 px-3 py-2">{tag}</span>)}
            </div>
          </div>

          <div className="py-16 md:py-24 md:pl-16">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[.2em] text-bone-500">
              <Sparkle size={17} weight="duotone" className="text-crimson-400" />
              <span>{copy.creatorEyebrow}</span>
            </div>
            <h2 className="mt-5 max-w-xl font-display text-5xl leading-[.9] text-bone-50 md:text-6xl">{copy.creatorTitle}</h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-bone-300">{copy.creatorBody}</p>
            <div className="mt-8 grid gap-3">
              {copy.creatorSteps.map((label, index) => (
                <div key={label} className="flex items-start gap-4 border-t border-bone-50/8 pt-3 text-sm text-bone-300">
                  <span className="text-bone-500">0{index + 1}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-20">
          <div>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[.2em] text-bone-500">
              <ShieldCheck size={17} weight="duotone" className="text-crimson-400" />
              <span>{copy.safetyEyebrow}</span>
            </div>
            <h2 className="mt-5 max-w-xl font-display text-5xl leading-[.92] text-bone-50 md:text-6xl">{copy.safetyTitle}</h2>
          </div>

          <div className="space-y-3">
            {copy.safetyItems.map((item) => (
              <div key={item} className="flex items-center gap-4 border-b border-bone-50/8 py-4 text-sm text-bone-300">
                <CheckCircle size={19} weight="duotone" className="shrink-0 text-crimson-400" />
                <span>{item}</span>
              </div>
            ))}
            <div className="mt-7 border border-wine-700/35 bg-wine-900/20 p-5 text-sm leading-6 text-bone-300">
              {copy.socialNote}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-bone-50/7 bg-[linear-gradient(180deg,hsl(var(--wine-900)/.18),transparent_40%)]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[.2em] text-bone-500">
              <span className="text-crimson-400">02</span>
              <span>{copy.journeyEyebrow}</span>
            </div>
            <h2 className="mt-5 font-display text-5xl leading-[.92] text-bone-50 md:text-7xl">{copy.journeyTitle}</h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {copy.journey.map((step) => (
              <Ficha key={step.no} className="min-h-56 p-6">
                <div className="text-xs tracking-[.2em] text-bone-500">{step.no}</div>
                <div className="mt-12">
                  <h3 className="font-display text-3xl text-bone-50">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-bone-300">{step.body}</p>
                </div>
              </Ficha>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
        <div className="relative overflow-hidden rounded-[4px] border border-crimson-500/25 bg-wine-900/20 p-8 md:p-12">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-crimson-500/10 blur-3xl" />
          <div className="relative z-10 max-w-4xl">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[.2em] text-bone-500">
              <LockKey size={17} weight="duotone" className="text-crimson-400" />
              <span>{copy.finalEyebrow}</span>
            </div>
            <h2 className="mt-5 max-w-3xl font-display text-5xl leading-[.9] text-bone-50 md:text-7xl">{copy.finalTitle}</h2>
            <p className="mt-6 max-w-2xl text-base leading-7 text-bone-300">{copy.finalBody}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/idade?role=client" className={primaryLinkButton}>
                <Keyhole size={19} weight="duotone" />{t('hero.clientAction')}
              </Link>
              <Link to="/idade?role=creator" className={outlineLinkButton}>
                <Sparkle size={19} weight="duotone" />{t('hero.creatorAction')}
              </Link>
            </div>
          </div>
          <Cordao className="absolute bottom-7 left-8 right-8 opacity-50 md:left-12 md:right-12" />
        </div>
      </section>
    </div>
  );
}

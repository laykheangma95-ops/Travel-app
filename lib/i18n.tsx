'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'km';

// UI dictionary. English is the source of truth; Khmer mirrors every key.
const dicts = {
  en: {
    // Brand
    'brand.word': 'Domner',
    'brand.kicker': 'TRAVEL',
    // Navbar
    'nav.esim': 'eSIM',
    'nav.buyEsim': 'Buy eSIM',
    'nav.destinations': 'Destinations',
    'nav.myEsims': 'My eSIMs',
    'nav.flights': 'Flights',
    'nav.flightTracker': 'Flight Tracker',
    'nav.airportBoard': 'Airport Live Board',
    'nav.savedFlights': 'Saved Flights',
    'nav.tools': 'Travel Tools',
    'nav.checklist': 'Am I Ready? Checklist',
    'nav.airportGuide': 'Airport Guide',
    'nav.emergency': 'Emergency Phrases',
    'nav.support': 'Support',
    'nav.signIn': 'Sign In',
    'nav.getStarted': 'Get Started',
    // Sign-in and sign-up failures. Each one names what the traveller should do
    // next — an error they cannot act on is the same as no error at all.
    'auth.error.providerUnavailable':
      'This sign-in method is not available yet. Please use your email address instead.',
    'auth.error.phoneUnavailable':
      'Phone sign-in is not available yet. Please use your email address — it works even with no mobile signal.',
    'auth.error.badCredentials': 'That email or password is not right. Please check and try again.',
    'auth.error.emailNotConfirmed':
      'Please confirm your email first. Check your inbox for the message we sent you.',
    'auth.error.codeExpired': 'That code has expired. Ask for a new one and try again.',
    'auth.error.codeInvalid': 'That code is not correct. Please check it and try again.',
    'auth.error.tooMany': 'Too many attempts. Please wait a few minutes and try again.',
    'auth.error.emailTaken':
      'An account already exists with this email. Try signing in instead.',
    // Hero
    'hero.badge': "Cambodia's First Travel Super App 🇰🇭",
    // GlobeHero renders t2 with its own leading space — no space here, or the
    // English headline gets a double gap that Khmer never shows.
    'hero.t1': 'Travel',
    'hero.t2': 'Confidently',
    'hero.t3': 'Stay Connected.',
    'hero.sub':
      'eSIM for the routes Cambodians fly. Real-time flight alerts. Step-by-step airport guidance. All in Khmer.',
    'hero.ctaEsim': 'Get Your eSIM',
    'hero.ctaFlight': 'Track My Flight',
    'hero.stat1': 'Khmer-first guidance',
    'hero.stat2': '24/7 Khmer Support',
    'hero.stat3': 'Instant Delivery',
    // Features
    'features.eyebrow': 'Why Domner',
    'features.title': 'Everything a Cambodian traveler needs',
    'features.desc': 'Three tools that work together, from booking to landing.',
    'features.learnMore': 'Learn more',
    'feature1.name': 'eSIM in 3 Minutes',
    'feature1.desc': 'Buy, install, connect. No physical SIM needed.',
    'feature2.name': 'Flight Guardian',
    'feature2.desc': 'Real-time alerts before the airline tells you.',
    'feature3.name': 'Airport Companion',
    'feature3.desc': 'Step-by-step guide in Khmer at every stage.',
    // How it works
    'how.eyebrow': 'How it works',
    'how.title': 'From your sofa to your destination',
    'how.step1': "Tell us where you're going",
    'how.step2': 'Get your eSIM + flight setup',
    'how.step3': 'We guide you at the airport',
    'how.step4': 'Arrive safely and confidently',
    // Destinations
    'dest.eyebrow': 'Popular destinations',
    'dest.title': 'Where are you flying next?',
    'dest.desc': 'Instant eSIM delivery for the routes Cambodians travel most.',
    'dest.viewAll': 'View all destinations',
    'dest.from': 'From',
    'dest.viewPlans': 'View Plans',
    // Testimonials
    'testi.eyebrow': 'Travelers trust Domner',
    'testi.title': 'Stories from the road',
    // CTA
    'cta.title': 'Ready for your next trip?',
    'cta.sub': 'Everything you need before you fly, in Khmer.',
    'cta.checklist': 'Am I Ready? Checklist',
    // Footer
    'footer.tagline': "Cambodia's first travel super app. Travel confidently — stay connected, in Khmer.",
    'footer.esim': 'eSIM',
    'footer.destinations': 'Destinations',
    'footer.how': 'How it works',
    'footer.install': 'Install guide',
    'footer.faq': 'FAQ',
    'footer.tools': 'Travel Tools',
    'footer.tracker': 'Flight Tracker',
    'footer.checklist': 'Am I Ready? Checklist',
    'footer.guide': 'Airport Guide',
    'footer.phrases': 'Emergency Phrases',
    'footer.support': 'Support',
    'footer.khmerSupport': '24/7 Khmer Support',
    'footer.contact': 'Contact',
    'footer.affiliate': 'Affiliate Program',
    'footer.about': 'About',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms',
    'footer.refunds': 'Refunds',
    'footer.prices': 'All prices in USD',

    // ── Homepage v3 — the journey ──
    'v3.greet.morning': 'Good morning',
    'v3.greet.afternoon': 'Good afternoon',
    'v3.greet.evening': 'Good evening',
    'v3.greet.night': 'Still awake',
    'v3.title': 'Where are you traveling next?',
    'v3.sub': 'Every journey begins with a name.',
    'v3.searchPlaceholder': 'Search country, city or destination…',
    'v3.searchLabel': 'Search for a destination',
    'v3.suggestions': 'Destination suggestions',
    'v3.continue': 'continue',
    'v3.clear': 'Clear search',
    'v3.explore': 'Or press a lit city on the globe.',
    'v3.soundOn': 'Sound on',
    'v3.soundOff': 'Sound off',
    'v3.back': 'Back to the globe',
    'v3.direct': 'direct from Phnom Penh',
    'v3.oneStop': 'one stop from Phnom Penh',
    'v3.guideReady': 'Full guide',
    'v3.guideSoon': 'Guide coming soon',
    'v3.esimExpress': 'eSIM · buy now',
    'v3.noResults': 'Nothing matched that.',
    'v3.noGuideTitle': "We haven't written this guide yet.",
    'v3.noGuideBody':
      "We write each destination properly or not at all, and this one isn't ready. If we sell an eSIM for it, you can still get connected today.",
    'v3.noGuideCta': 'See eSIM plans',
    // Chapters
    'v3.ch1.eyebrow': 'Arrival',
    'v3.ch2.eyebrow': 'The basics',
    'v3.ch2.title': 'What money, power and signal look like',
    'v3.ch3.eyebrow': 'Getting in',
    'v3.ch3.title': 'With a Cambodian passport',
    'v3.ch4.eyebrow': 'Getting around',
    'v3.ch4.title': 'From the airport, and after',
    'v3.ch5.eyebrow': 'Why you go',
    'v3.ch5.title': 'Worth the flight',
    'v3.ch6.eyebrow': 'One last thing',
    'v3.ch6.title': 'Staying connected',
    // Field labels
    'v3.currency': 'Currency',
    'v3.power': 'Power',
    'v3.network': 'Network',
    'v3.buys': 'Ten dollars buys',
    'v3.language': 'Language',
    'v3.updatedDaily': 'Updated daily',
    'v3.indicative': 'indicative rate',
    'v3.verified': 'Verified',
    'v3.source': 'Source',
    'v3.confirmFirst': 'This changes — confirm before you book',
    'v3.beforeYouFly': 'Before you fly',
    'v3.required': 'Required',
    'v3.recommended': 'Recommended',
    'v3.ifWrong': 'If something goes wrong',
    'v3.police': 'Police',
    'v3.ambulance': 'Ambulance',
    'v3.fire': 'Fire',
    'v3.passport': 'Passport validity',
    'v3.customs': 'Do not bring',
    'v3.declareCash': 'Declare cash over',
    'v3.fromAirport': 'From the airport',
    'v3.transitCard': 'Getting around town',
    'v3.inWallet': 'Works in your phone',
    'v3.notInWallet': 'Physical card only',
    'v3.apps': 'Apps people actually use',
    'v3.yourCard': 'Your Cambodian card',
    'v3.cardWidely': 'Accepted widely',
    'v3.cardSometimes': 'Accepted sometimes',
    'v3.cardRarely': 'Rarely accepted',
    'v3.khqrYes': 'KHQR works here',
    'v3.khqrNo': 'KHQR does not work here',
    'v3.tipping': 'Tipping',
    'v3.hiddenGem': 'Hidden gem',
    'v3.landmark': 'Landmark',
    'v3.popularKh': 'Popular with Cambodians',
    // Recommendation
    'v3.rec.title': 'Recommended for you',
    'v3.rec.days': 'days',
    'v3.rec.typical': 'Typical use over',
    'v3.rec.disclaimer': 'Typical use, not a guarantee. Tap a line to change it.',
    'v3.rec.buy': 'Get this eSIM',
    'v3.rec.added': 'Added — go to cart',
    'v3.rec.tripLength': 'Different trip length?',
    'v3.rec.headroom': 'Spare',
    'v3.rec.total': 'Estimated use',
    'v3.rec.why': 'Why this plan',
    // Trust
    'v3.trust.title': 'What you can hold us to',
    'v3.trust.refund':
      'If we do not deliver your QR code within 2 hours of payment, or the eSIM will not activate and support cannot fix it, you get a full refund.',
    'v3.trust.khmer': 'Support answers in Khmer, on Telegram or email.',
    'v3.trust.pay': 'Pay in USD by card, or with ABA PayWay and KHQR.',
    'v3.trust.noContract': 'No contract, no subscription, no auto-renewal.',
    'v3.trust.policy': 'Read the refund policy',

    // ── eSIM store (/esim) ──
    'store.eyebrow': 'Global data',
    'store.title': 'eSIM Store',
    'store.sub':
      'Instant data for the places Cambodians fly. Buy now, scan the QR, and connect the moment you land.',
    'store.searchRegion': 'Search destinations',
    'store.searchPlaceholder': 'Search destination…',
    'store.search': 'Search',
    'store.filterLabel': 'Filter by region',
    'store.filter.All': 'All',
    'store.filter.Asia': 'Asia',
    'store.filter.EastAsia': 'East Asia',
    'store.filter.SoutheastAsia': 'Southeast Asia',
    'store.filter.Europe': 'Europe',
    'store.filter.Americas': 'Americas',
    'store.filter.MiddleEast': 'Middle East',
    'store.empty.title': 'No destinations found',
    'store.empty.desc': 'We couldn’t find "{query}". Try another country name or clear your filters.',
    'store.empty.cta': 'Clear search',

    // ── Country plans (/esim/[country]) ──
    'country.title': '{country} eSIM Plans',
    'country.poweredBy': 'Powered by {networks} network',
    'country.coverage': 'Nationwide coverage',
    'country.quality': '{tech} · {quality} quality',
    'country.entryInfo': 'Entry info',
    'country.installTitle': 'Installation guide',
    'country.install.iphone': '📱 iPhone installation steps',
    'country.install.iphone1': 'Open <b>Settings → Cellular → Add eSIM</b>',
    'country.install.iphone2': 'Tap <b>Use QR Code</b> and scan the QR we send you',
    'country.install.iphone3': 'Label the new plan “{country} Trip”',
    'country.install.iphone4': 'Keep the eSIM <b>OFF</b> until you land in {country}',
    'country.install.iphone5':
      'After landing: turn the eSIM on and enable <b>Data Roaming</b> for it',
    'country.install.android': '🤖 Android installation steps',
    'country.install.android1':
      'Open <b>Settings → Connections → SIM Manager → Add eSIM</b>',
    'country.install.android2': 'Choose <b>Scan QR code</b> and scan the QR we send you',
    'country.install.android3': 'Confirm the download and name it “{country} Trip”',
    'country.install.android4': 'Keep mobile data on your Cambodian SIM until departure',
    'country.install.android5':
      'After landing: switch mobile data to the new eSIM and enable roaming',
    'country.faqTitle': '{country} eSIM — frequently asked questions',
    'country.faq.q1': 'When should I activate my {country} eSIM?',
    'country.faq.a1':
      'Install the eSIM before you fly, but only turn it on after you land in {country}. The validity period starts when the eSIM first connects to a local network.',
    'country.faq.q2': 'Can I share data with my travel partner?',
    'country.faq.a2':
      'Yes — all Domner plans include hotspot/tethering, so you can share your connection with family members’ phones.',
    'country.faq.q3': 'Which networks will I connect to in {country}?',
    'country.faq.a3':
      'Your eSIM automatically connects to {networks} — whichever has the strongest signal where you are. Expect {tech} speeds in cities.',
    'country.faq.q4': 'What if I run out of data?',
    'country.faq.a4':
      'Message our 24/7 Khmer support on Telegram and we’ll top you up in minutes — no need to buy a new eSIM.',
    'country.faq.q5': 'Does my number change?',
    'country.faq.a5':
      'Your Cambodian number stays active for calls/SMS (roaming charges may apply if you answer). The eSIM is data-only, and apps like Telegram keep working with your normal number over data.',

    // ── Cart (/cart) ──
    'cart.title': 'Your Cart',
    'cart.empty.title': 'Your cart is empty',
    'cart.empty.desc': 'Browse our eSIM store and add a plan for your next destination.',
    'cart.empty.cta': 'Browse eSIM plans',
    'cart.days': '{days} days',
    'cart.perDay': '{gb}GB/day',
    'cart.totalData': '{gb}GB total',
    'cart.remove': 'Remove {country} {plan} from cart',
    'cart.summary': 'Order Summary',
    'cart.subtotal': 'Subtotal',
    'cart.discount': 'Discount',
    'cart.discountCode': 'Discount code',
    'cart.apply': 'Apply',
    'cart.codeInvalid': 'This code is not valid or has expired.',
    'cart.referralApplied': 'Referral code {code} applied automatically.',
    'cart.total': 'Total',
    'cart.checkout': 'Proceed to Checkout',

    // ── Checkout (/esim/checkout) ──
    'checkout.eyebrow': 'Almost there',
    'checkout.title': 'Checkout',
    'checkout.empty.title': 'Nothing to check out',
    'checkout.empty.desc': 'Add an eSIM plan to your cart first.',
    'checkout.details': 'Your details',
    'checkout.fullName': 'Full Name',
    'checkout.fullNamePlaceholder': 'e.g. Sokha Prak',
    'checkout.email': 'Email Address',
    'checkout.phoneOptional': 'Phone number (optional)',
    'checkout.phone': 'Phone number',
    'checkout.phoneHintEmail': 'Only used if we need to reach you about this order.',
    'checkout.phoneHintTelegram': 'Used to confirm your Telegram chat belongs to you.',
    'checkout.deviceType': 'Device Type',
    'checkout.deviceNotSure': 'Not sure',
    'checkout.notes': 'Special Notes (optional)',
    'checkout.notesPlaceholder': 'Anything we should know?',
    'checkout.delivery': 'QR code delivery',
    'checkout.summary': 'Order summary',
    'checkout.total': 'Total',
    'checkout.payMethod': 'Payment method',
    'checkout.cards': 'International Cards',
    'checkout.cardsDesc': 'Visa · Mastercard · Amex — via Stripe',
    'checkout.aba': 'ABA PayWay (Cambodia)',
    'checkout.abaDesc': 'KHQR · ABA Mobile · local cards',
    'checkout.processing': 'Processing…',
    'checkout.payCard': 'Pay with Card',
    'checkout.payAba': 'Pay with ABA / KHQR',
    'checkout.secure': 'Secure payment · QR delivered within 15 minutes',
    'checkout.err.name': 'Please enter your full name',
    'checkout.err.email': 'Please enter a valid email address',
    'checkout.err.payStart': 'Payment could not be started. Please try again.',
    'checkout.err.generic': 'Something went wrong',

    // ── Order confirmation ──
    'confirm.title': 'Your eSIM is Being Prepared!',
    'confirm.orderNumber': 'Order number:',
    'confirm.eta': 'We will send your QR code within {minutes} minutes.',
    'confirm.next': 'What happens next',
    'confirm.step1.title': 'We prepare your eSIM',
    'confirm.step1.desc': 'Our team generates your QR code — usually within 15 minutes.',
    'confirm.step2.title': 'You receive the QR code',
    'confirm.step2.desc': 'By email, and on Telegram too if you connected it below.',
    'confirm.step3.title': 'Install before you fly',
    'confirm.step3.desc': 'Scan the QR to install, then turn the eSIM on when you land.',
    'confirm.addTrip': 'Add to your Trip',
    'confirm.trackFlight': 'Track another flight',
    'confirm.support': 'Contact support',

    // ── Dashboard shell ──
    'dash.nav.dashboard': 'Dashboard',
    'dash.nav.trips': 'My Trips',
    'dash.nav.esims': 'My eSIMs',
    'dash.nav.alerts': 'Flight Alerts',
    'dash.nav.memories': 'Memories',
    'dash.nav.settings': 'Settings',
    'dash.navLabel': 'Dashboard navigation',

    // ── My eSIMs ──
    'esims.title': 'My eSIMs',
    'esims.sub': 'Your data plans, QR codes, and order history in one place.',
    'esims.loading': 'Loading your eSIMs…',
    'esims.signInPrompt': 'Please sign in to see your eSIMs.',
    'esims.loadFailed': 'Could not load your eSIMs.',
    'esims.signIn': 'Sign in',
    'esims.empty.title': 'No eSIMs yet',
    'esims.empty.desc': 'Buy your first eSIM and it will appear here with its QR code.',
    'esims.empty.cta': 'Browse eSIM plans',
    'esims.status.pending': 'Awaiting payment',
    'esims.status.paid': 'Preparing your eSIM',
    'esims.status.fulfilled': 'Ready to install',
    'esims.status.cancelled': 'Cancelled',
    'esims.status.refunded': 'Refunded',
    'esims.planLine': '{plan} · {days} days · {gb}GB/day',
    'esims.paidNote':
      'Payment received. Your QR code is being prepared and will be emailed within 15 minutes.',
    'esims.viewQr': 'View QR code',
    'esims.support': 'Get support',
    'esims.buyAgain': 'Buy again',
    'esims.modalTitle': '{country} eSIM',
    'esims.qrAlt': 'eSIM QR code for order {order}',
    'esims.manualCode': 'Manual activation code',
    'esims.installNote': 'Install over Wi-Fi before you fly. This QR code can only be scanned once.',

    // ── Dashboard home ──
    // The Khmer greeting in front of the English is deliberate — it was in the
    // heading before this key existed, and it is the one word every visitor reads.
    'dash.welcome': 'សួស្តី! Welcome back',
    'dash.sub': 'Here’s everything for your upcoming travel.',
    'dash.quick.flight': 'Track Flight',
    'dash.quick.esim': 'Buy eSIM',
    'dash.quick.trip': 'New Trip',
    'dash.flights': 'Upcoming flights',
    'dash.trackNew': 'Track new',
    'dash.esims': 'Active eSIMs',
    'dash.viewAll': 'View all',
    'dash.daysLeft': '{days} days remaining',
    'dash.active': 'Active',
    'dash.dataUsed': '{pct}% of today’s data used',
    'dash.trips': 'Upcoming trips',
    'dash.open': 'Open',

    // ── Settings ──
    'settings.title': 'Settings',
    'settings.sub': 'Your profile and preferences.',
    'settings.fullName': 'Full name',
    'settings.telegram': 'Telegram username',
    'settings.passportCountry': 'Passport country',
    'settings.language': 'Preferred language',
    'settings.save': 'Save changes',
    'settings.saved': 'Saved',
    'settings.notifications': 'Notifications',
    'settings.notify.flights': 'Flight alerts',
    'settings.notify.esim': 'eSIM delivery updates',
    'settings.notify.checklist': 'Checklist reminders',
    'settings.notify.tips': 'Travel tips at destination',

    // ── Checklist (/checklist) ──
    'check.eyebrow': 'Am I Ready?',
    'check.title': 'Your personal travel checklist',
    'check.sub':
      'Answer a few questions and we’ll build the exact list you need — nothing forgotten.',
    'check.stepOf': 'Step {step} of 3',
    'check.step1': 'Step 1 — Travel details',
    'check.where': 'Where are you going?',
    'check.passportCountry': 'Your passport country',
    'check.cambodia': 'Cambodia 🇰🇭',
    'check.other': 'Other',
    'check.departure': 'Departure date',
    'check.return': 'Return date',
    'check.travelingWith': 'Traveling with',
    'check.solo': 'Solo',
    'check.partner': 'Partner',
    'check.family': 'Family',
    'check.group': 'Group',
    'check.continue': 'Continue',
    'check.step2': 'Step 2 — Your profile',
    'check.firstTime': 'Is this your first time traveling abroad?',
    'check.flownBefore': 'Have you flown before?',
    'check.insuranceQ': 'Do you have travel insurance?',
    'check.stayQ': 'Accommodation booked?',
    'check.yes': 'Yes',
    'check.no': 'No',
    'check.notYet': 'Not yet',
    'check.back': 'Back',
    'check.generate': 'Generate my checklist',
    'check.progress': '{done}/{total} items complete — You’re {pct}% ready for {country}',
    'check.remind':
      '📲 We’ll remind you <b>48 hours before your flight</b> if you still have unchecked items.',
    'check.editAnswers': 'Edit answers',
    'check.esimNext': 'Get your eSIM next →',
    'check.destFallback': 'your destination',
    'check.cat.urgent': '🚨 URGENT — Do before flying (7+ days before)',
    'check.cat.important': '📋 IMPORTANT — Do 48 hours before',
    'check.cat.pack': '🧳 PACK',
    'check.cat.day-of': '✈️ DAY OF FLIGHT',
    'check.item.visaCustoms': 'Check {country} visa requirements ({info})',
    'check.item.visa': 'Check {country} visa requirements for your passport',
    'check.item.bookStay': 'Book accommodation (save hotel confirmation)',
    'check.item.saveStay': 'Save your hotel confirmation where you can find it offline',
    'check.item.insurance': 'Travel insurance (recommended: SafetyWing from $40/month)',
    'check.item.esim': 'Get eSIM for {country}',
    'check.item.passport6m': 'Check your passport is valid 6+ months after your return date',
    'check.item.vietnamArrival': 'Fill Vietnam e-arrival card (official form)',
    'check.item.sgArrival': 'Submit the SG Arrival Card online',
    'check.item.mdac': 'Complete the Malaysia Digital Arrival Card (MDAC)',
    'check.item.visitJapan': 'Complete Visit Japan Web for faster entry',
    'check.item.flightStatus': 'Check flight status on Domner',
    'check.item.maxCash': 'Confirm: max cash ${amount} USD allowed into {country}',
    'check.item.hotelScreenshot':
      'Screenshot hotel address in the local language for the taxi driver',
    'check.item.offlineMaps': 'Download offline maps of your destination city',
    'check.item.packPassport': 'Passport (valid 6+ months)',
    'check.item.packReturn': 'Return flight booking printout',
    'check.item.packHotel': 'Hotel confirmation',
    'check.item.packCash': 'USD cash for emergencies',
    'check.item.packCharger': 'Phone charger + adapter',
    'check.item.packMeds': 'Prescription medications (in original packaging)',
    'check.item.packKids': 'Children’s documents + snacks + entertainment',
    'check.item.arriveEarly': 'Arrive airport {hours} hours early',
    'check.item.checkIn': 'Check in online',
    'check.item.activateAfter': 'Activate eSIM only after landing',
    'check.item.airportGuide': 'Open the Domner Airport Guide when you arrive at the airport',

    // ── Emergency phrases (/emergency) ──
    'emerg.eyebrow': 'Emergency Phrases',
    'emerg.title': 'Say it right, when it matters',
    // Split around the speaker icon rendered inline between them.
    'emerg.subBefore': 'Tap',
    'emerg.subAfter':
      'to play the phrase out loud for a local person, or copy it and show your phone.',
    'emerg.offline': 'Phrases available without internet',
    'emerg.selectLang': 'Select destination language',
    'emerg.ttsUnavailable':
      'Voice playback needs an internet connection or a device voice for this language. The copy button still works — show the phrase on your screen instead.',
    'emerg.play': 'Play “{phrase}” out loud in {language}',
    'emerg.stop': 'Stop playing “{phrase}”',
    'emerg.copy': 'Copy “{phrase}” in {language}',
    'emerg.footnote':
      'Voice playback uses your device’s built-in speech voices when available, and Google Translate audio otherwise. Phrases and copying always work offline.',

    // ── Airport guide (/airport-guide) ──
    'guide.eyebrow': 'Airport Companion',
    'guide.title': 'Never feel lost at an airport again',
    'guide.sub':
      'Step-by-step guidance for every stage — check-in, security, immigration, gate, boarding.',
    'guide.searchPlaceholder': 'Search airports (e.g. PNH, Bangkok)…',
    'guide.searchLabel': 'Search airports',
    'guide.departing': 'Departing',
    'guide.arriving': 'Arriving',
    'guide.departingFrom': 'Departing from {city} ({code})',
    'guide.arrivingAt': 'Arriving at {city} ({code})',
    'guide.mapOpen': 'Open the digital terminal map for {airport}',
    'guide.map': 'Digital Map',
    'guide.mapDefault': 'Interactive terminal map',
    'guide.stepAria': 'Step {n}: {title}',
    'guide.step': 'Step {n}',
    'guide.phrases': 'Useful phrases',
    'guide.watchOut': 'Watch out for',
    'guide.nextStep': 'Done — next step →',
  },
  km: {
    // Brand
    'brand.word': 'ដំណើរ',
    'brand.kicker': 'DOMNER',
    // Navbar
    'nav.esim': 'eSIM',
    'nav.buyEsim': 'ទិញ eSIM',
    'nav.destinations': 'គោលដៅ',
    'nav.myEsims': 'eSIM របស់ខ្ញុំ',
    'nav.flights': 'ជើងហោះហើរ',
    'nav.flightTracker': 'តាមដានជើងហោះហើរ',
    'nav.airportBoard': 'ផ្ទាំងព័ត៌មានអាកាសយានដ្ឋាន',
    'nav.savedFlights': 'ជើងហោះហើរបានរក្សាទុក',
    'nav.tools': 'ឧបករណ៍ធ្វើដំណើរ',
    'nav.checklist': 'បញ្ជីត្រៀមធ្វើដំណើរ',
    'nav.airportGuide': 'មគ្គុទ្ទេសក៍អាកាសយានដ្ឋាន',
    'nav.emergency': 'ឃ្លាបន្ទាន់',
    'nav.support': 'ជំនួយ',
    'nav.signIn': 'ចូលគណនី',
    'nav.getStarted': 'ចាប់ផ្តើម',
    // ការចូល និងការចុះឈ្មោះមិនបានសម្រេច
    'auth.error.providerUnavailable':
      'វិធីចូលនេះមិនទាន់មានទេ។ សូមប្រើអាសយដ្ឋានអ៊ីមែលរបស់អ្នកជំនួសវិញ។',
    'auth.error.phoneUnavailable':
      'ការចូលដោយលេខទូរស័ព្ទមិនទាន់មានទេ។ សូមប្រើអ៊ីមែល — វាដំណើរការទោះបីគ្មានសេវាទូរស័ព្ទក៏ដោយ។',
    'auth.error.badCredentials': 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ។ សូមពិនិត្យ ហើយព្យាយាមម្តងទៀត។',
    'auth.error.emailNotConfirmed':
      'សូមបញ្ជាក់អ៊ីមែលរបស់អ្នកជាមុនសិន។ សូមពិនិត្យប្រអប់សំបុត្ររបស់អ្នក។',
    'auth.error.codeExpired': 'លេខកូដនេះផុតកំណត់ហើយ។ សូមស្នើសុំលេខកូដថ្មី។',
    'auth.error.codeInvalid': 'លេខកូដមិនត្រឹមត្រូវទេ។ សូមពិនិត្យ ហើយព្យាយាមម្តងទៀត។',
    'auth.error.tooMany': 'ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំពីរបីនាទី ហើយព្យាយាមម្តងទៀត។',
    'auth.error.emailTaken': 'មានគណនីរួចហើយជាមួយអ៊ីមែលនេះ។ សូមព្យាយាមចូលគណនីវិញ។',
    // Hero
    'hero.badge': 'កម្មវិធីធ្វើដំណើរដំបូងគេរបស់កម្ពុជា 🇰🇭',
    'hero.t1': 'ធ្វើដំណើរ',
    'hero.t2': 'ដោយទំនុកចិត្ត',
    'hero.t3': 'ភ្ជាប់អ៊ីនធឺណិតគ្រប់ពេល។',
    'hero.sub':
      'eSIM សម្រាប់ផ្លូវដែលខ្មែរធ្វើដំណើរ។ ការជូនដំណឹងជើងហោះហើរភ្លាមៗ។ ការណែនាំនៅអាកាសយានដ្ឋានជាជំហានៗ។ ទាំងអស់ជាភាសាខ្មែរ។',
    'hero.ctaEsim': 'ទិញ eSIM របស់អ្នក',
    'hero.ctaFlight': 'តាមដានជើងហោះហើរ',
    'hero.stat1': 'ការណែនាំជាភាសាខ្មែរ',
    'hero.stat2': 'ជំនួយភាសាខ្មែរ 24/7',
    // ដឹកជញ្ជូន is freight — wrong verb for a QR code that arrives by email.
    'hero.stat3': 'ទទួលបានភ្លាមៗ',
    // Features
    'features.eyebrow': 'ហេតុអ្វីជ្រើសរើស Domner',
    'features.title': 'អ្វីៗគ្រប់យ៉ាងដែលអ្នកដំណើរខ្មែរត្រូវការ',
    'features.desc': 'ឧបករណ៍បីដែលធ្វើការជាមួយគ្នា ពីការកក់រហូតដល់ការចុះចត។',
    'features.learnMore': 'ស្វែងយល់បន្ថែម',
    'feature1.name': 'eSIM ក្នុងរយៈពេល 3 នាទី',
    'feature1.desc': 'ទិញ ដំឡើង ភ្ជាប់ — មិនត្រូវការស៊ីមកាតទេ។',
    'feature2.name': 'អ្នកការពារជើងហោះហើរ',
    'feature2.desc': 'ការជូនដំណឹងភ្លាមៗ មុនក្រុមហ៊ុនអាកាសចរណ៍ប្រាប់អ្នក។',
    'feature3.name': 'ដៃគូអាកាសយានដ្ឋាន',
    'feature3.desc': 'ការណែនាំជាជំហានៗជាភាសាខ្មែរ គ្រប់ដំណាក់កាល។',
    // How it works
    'how.eyebrow': 'របៀបដំណើរការ',
    'how.title': 'ពីផ្ទះអ្នក ទៅដល់គោលដៅ',
    'how.step1': 'ប្រាប់យើងថាអ្នកទៅណា',
    'how.step2': 'ទទួល eSIM និងការរៀបចំជើងហោះហើរ',
    'how.step3': 'យើងណែនាំអ្នកនៅអាកាសយានដ្ឋាន',
    'how.step4': 'ទៅដល់ដោយសុវត្ថិភាព និងទំនុកចិត្ត',
    // Destinations
    'dest.eyebrow': 'គោលដៅពេញនិយម',
    'dest.title': 'តើអ្នកហោះទៅណាបន្ទាប់?',
    'dest.desc': 'ទទួល eSIM ភ្លាមៗ សម្រាប់ផ្លូវដែលបងប្អូនខ្មែរធ្វើដំណើរច្រើនជាងគេ។',
    'dest.viewAll': 'មើលគោលដៅទាំងអស់',
    'dest.from': 'ចាប់ពី',
    'dest.viewPlans': 'មើលគម្រោង',
    // Testimonials
    'testi.eyebrow': 'អ្នកដំណើរទុកចិត្ត Domner',
    'testi.title': 'រឿងរ៉ាវពីដំណើរ',
    // CTA
    'cta.title': 'ត្រៀមខ្លួនសម្រាប់ដំណើរបន្ទាប់ហើយឬនៅ?',
    'cta.sub': 'អ្វីៗគ្រប់យ៉ាងដែលអ្នកត្រូវការមុនហោះហើរ ជាភាសាខ្មែរ។',
    'cta.checklist': 'បញ្ជីត្រៀមធ្វើដំណើរ',
    // Footer
    'footer.tagline': 'កម្មវិធីធ្វើដំណើរដំបូងគេរបស់កម្ពុជា។ ធ្វើដំណើរដោយទំនុកចិត្ត — ជាភាសាខ្មែរ។',
    'footer.esim': 'eSIM',
    'footer.destinations': 'គោលដៅ',
    'footer.how': 'របៀបដំណើរការ',
    'footer.install': 'របៀបដំឡើង',
    'footer.faq': 'សំណួរញឹកញាប់',
    'footer.tools': 'ឧបករណ៍ធ្វើដំណើរ',
    'footer.tracker': 'តាមដានជើងហោះហើរ',
    'footer.checklist': 'បញ្ជីត្រៀមធ្វើដំណើរ',
    'footer.guide': 'មគ្គុទ្ទេសក៍អាកាសយានដ្ឋាន',
    'footer.phrases': 'ឃ្លាបន្ទាន់',
    'footer.support': 'ជំនួយ',
    'footer.khmerSupport': 'ជំនួយភាសាខ្មែរ 24/7',
    'footer.contact': 'ទំនាក់ទំនង',
    'footer.affiliate': 'កម្មវិធីដៃគូណែនាំ',
    'footer.about': 'អំពីយើង',
    'footer.privacy': 'គោលការណ៍ឯកជនភាព',
    'footer.terms': 'លក្ខខណ្ឌ',
    'footer.refunds': 'ការសងប្រាក់វិញ',
    'footer.prices': 'តម្លៃទាំងអស់គិតជាដុល្លារអាមេរិក',

    // ── Homepage v3 — the journey ──
    // អរុណសួស្តី is everyday Khmer; ទិវាសួស្តី/សាយណ្ហសួស្តី are literary forms
    // nobody greets a friend with. Keep the register the same across all four.
    'v3.greet.morning': 'អរុណសួស្តី',
    'v3.greet.afternoon': 'សួស្តីពេលរសៀល',
    'v3.greet.evening': 'សួស្តីពេលល្ងាច',
    'v3.greet.night': 'នៅមិនទាន់គេងទេ',
    'v3.title': 'តើអ្នកនឹងធ្វើដំណើរទៅណាបន្ទាប់?',
    'v3.sub': 'រាល់ដំណើរចាប់ផ្តើមពីឈ្មោះមួយ។',
    'v3.searchPlaceholder': 'ស្វែងរកប្រទេស ទីក្រុង ឬគោលដៅ…',
    'v3.searchLabel': 'ស្វែងរកគោលដៅ',
    'v3.suggestions': 'គោលដៅណែនាំ',
    'v3.continue': 'បន្តទៀត',
    'v3.clear': 'លុបពាក្យស្វែងរក',
    'v3.explore': 'ឬចុចលើទីក្រុងដែលភ្លឺនៅលើផែនដីមូល។',
    'v3.soundOn': 'បើកសំឡេង',
    'v3.soundOff': 'បិទសំឡេង',
    'v3.back': 'ត្រឡប់ទៅផែនដីមូលវិញ',
    'v3.direct': 'ហោះផ្ទាល់ពីភ្នំពេញ',
    'v3.oneStop': 'ឈប់ម្តងពីភ្នំពេញ',
    'v3.guideReady': 'មគ្គុទ្ទេសក៍ពេញលេញ',
    'v3.guideSoon': 'មគ្គុទ្ទេសក៍នឹងមកដល់ឆាប់ៗ',
    'v3.esimExpress': 'eSIM · ទិញឥឡូវ',
    'v3.noResults': 'រកមិនឃើញអ្វីត្រូវគ្នាទេ។',
    'v3.noGuideTitle': 'យើងមិនទាន់សរសេរមគ្គុទ្ទេសក៍នេះទេ។',
    'v3.noGuideBody':
      'យើងសរសេរគោលដៅនីមួយៗឲ្យបានត្រឹមត្រូវ ឬមិនសរសេរទាល់តែសោះ ហើយគោលដៅនេះមិនទាន់រួចរាល់។ ប្រសិនបើយើងលក់ eSIM សម្រាប់ទីនោះ អ្នកនៅតែអាចតភ្ជាប់បានថ្ងៃនេះ។',
    'v3.noGuideCta': 'មើលគម្រោង eSIM',
    // Chapters
    'v3.ch1.eyebrow': 'ការមកដល់',
    'v3.ch2.eyebrow': 'មូលដ្ឋានគ្រឹះ',
    'v3.ch2.title': 'រូបិយប័ណ្ណ ចរន្តអគ្គិសនី និងសញ្ញា',
    'v3.ch3.eyebrow': 'ការចូលប្រទេស',
    'v3.ch3.title': 'ជាមួយលិខិតឆ្លងដែនកម្ពុជា',
    'v3.ch4.eyebrow': 'ការធ្វើដំណើរ',
    'v3.ch4.title': 'ពីអាកាសយានដ្ឋាន និងបន្ទាប់មក',
    'v3.ch5.eyebrow': 'ហេតុអ្វីត្រូវទៅ',
    'v3.ch5.title': 'សមនឹងការហោះទៅ',
    'v3.ch6.eyebrow': 'រឿងចុងក្រោយ',
    'v3.ch6.title': 'ការភ្ជាប់អ៊ីនធឺណិត',
    // Field labels
    'v3.currency': 'រូបិយប័ណ្ណ',
    'v3.power': 'ចរន្តអគ្គិសនី',
    'v3.network': 'បណ្តាញទូរស័ព្ទ',
    'v3.buys': 'ដប់ដុល្លារទិញបាន',
    'v3.language': 'ភាសា',
    'v3.updatedDaily': 'ធ្វើបច្ចុប្បន្នភាពប្រចាំថ្ងៃ',
    'v3.indicative': 'អត្រាប្រហាក់ប្រហែល',
    'v3.verified': 'ផ្ទៀងផ្ទាត់',
    'v3.source': 'ប្រភព',
    'v3.confirmFirst': 'ព័ត៌មាននេះប្រែប្រួល — សូមបញ្ជាក់មុនកក់',
    'v3.beforeYouFly': 'មុនពេលហោះហើរ',
    'v3.required': 'ចាំបាច់',
    'v3.recommended': 'គួរធ្វើ',
    'v3.ifWrong': 'ប្រសិនបើមានបញ្ហា',
    'v3.police': 'ប៉ូលិស',
    'v3.ambulance': 'ឡានពេទ្យ',
    'v3.fire': 'ពន្លត់អគ្គិភ័យ',
    'v3.passport': 'សុពលភាពលិខិតឆ្លងដែន',
    'v3.customs': 'របស់ហាមយកចូល',
    'v3.declareCash': 'ត្រូវប្រកាសសាច់ប្រាក់លើសពី',
    'v3.fromAirport': 'ពីអាកាសយានដ្ឋាន',
    'v3.transitCard': 'ការធ្វើដំណើរក្នុងទីក្រុង',
    'v3.inWallet': 'ដំណើរការក្នុងទូរស័ព្ទ',
    'v3.notInWallet': 'កាតរូបវន្តតែប៉ុណ្ណោះ',
    'v3.apps': 'កម្មវិធីដែលគេប្រើពិតប្រាកដ',
    'v3.yourCard': 'កាតកម្ពុជារបស់អ្នក',
    'v3.cardWidely': 'ទទួលយកយ៉ាងទូលំទូលាយ',
    'v3.cardSometimes': 'ទទួលយកខ្លះ',
    'v3.cardRarely': 'កម្រទទួលយក',
    'v3.khqrYes': 'KHQR ដំណើរការនៅទីនេះ',
    'v3.khqrNo': 'KHQR មិនដំណើរការនៅទីនេះទេ',
    'v3.tipping': 'ការឲ្យទឹកតែ',
    'v3.hiddenGem': 'កន្លែងសម្ងាត់',
    'v3.landmark': 'ទីតាំងល្បី',
    'v3.popularKh': 'ពេញនិយមក្នុងចំណោមខ្មែរ',
    // Recommendation
    'v3.rec.title': 'ណែនាំសម្រាប់អ្នក',
    'v3.rec.days': 'ថ្ងៃ',
    'v3.rec.typical': 'ការប្រើប្រាស់ធម្មតាក្នុងរយៈពេល',
    'v3.rec.disclaimer': 'ជាការប្រើប្រាស់ធម្មតា មិនមែនការធានាទេ។ ចុចលើជួរណាមួយដើម្បីផ្លាស់ប្តូរ។',
    'v3.rec.buy': 'យក eSIM នេះ',
    'v3.rec.added': 'បានបន្ថែម — ទៅកន្ត្រក',
    'v3.rec.tripLength': 'រយៈពេលដំណើរផ្សេង?',
    'v3.rec.headroom': 'បម្រុង',
    'v3.rec.total': 'ការប្រើប្រាស់ប៉ាន់ស្មាន',
    'v3.rec.why': 'ហេតុអ្វីជ្រើសគម្រោងនេះ',
    // Trust
    'v3.trust.title': 'អ្វីដែលអ្នកអាចទុកចិត្តលើយើង',
    'v3.trust.refund':
      'ប្រសិនបើយើងមិនផ្ញើកូដ QR ជូនអ្នកក្នុងរយៈពេល ២ ម៉ោងបន្ទាប់ពីការទូទាត់ ឬ eSIM មិនដំណើរការ ហើយក្រុមជំនួយមិនអាចជួសជុលបាន អ្នកទទួលបានការសងប្រាក់វិញពេញលេញ។',
    'v3.trust.khmer': 'ក្រុមជំនួយឆ្លើយជាភាសាខ្មែរ តាម Telegram ឬអ៊ីមែល។',
    'v3.trust.pay': 'ទូទាត់ជាដុល្លារដោយកាត ឬតាម ABA PayWay និង KHQR។',
    'v3.trust.noContract': 'គ្មានកិច្ចសន្យា គ្មានការជាវ គ្មានការបន្តដោយស្វ័យប្រវត្តិ។',
    'v3.trust.policy': 'អានគោលការណ៍សងប្រាក់វិញ',

    // ── ហាង eSIM (/esim) ──
    'store.eyebrow': 'អ៊ីនធឺណិតទូទាំងពិភពលោក',
    'store.title': 'ហាង eSIM',
    'store.sub':
      'អ៊ីនធឺណិតភ្លាមៗ សម្រាប់ប្រទេសដែលបងប្អូនខ្មែរតែងតែទៅ។ ទិញឥឡូវ ស្កេន QR រួចភ្ជាប់បានតែម្តង ពេលចុះដល់។',
    'store.searchRegion': 'ស្វែងរកគោលដៅ',
    'store.searchPlaceholder': 'ស្វែងរកគោលដៅ…',
    'store.search': 'ស្វែងរក',
    'store.filterLabel': 'ត្រងតាមតំបន់',
    'store.filter.All': 'ទាំងអស់',
    'store.filter.Asia': 'អាស៊ី',
    'store.filter.EastAsia': 'អាស៊ីខាងកើត',
    'store.filter.SoutheastAsia': 'អាស៊ីអាគ្នេយ៍',
    'store.filter.Europe': 'អឺរ៉ុប',
    'store.filter.Americas': 'អាមេរិក',
    'store.filter.MiddleEast': 'មជ្ឈិមបូព៌ា',
    'store.empty.title': 'រកមិនឃើញគោលដៅទេ',
    'store.empty.desc': 'យើងរកមិនឃើញ "{query}" ទេ។ សូមសាកឈ្មោះប្រទេសផ្សេង ឬលុបតម្រងចេញ។',
    'store.empty.cta': 'លុបពាក្យស្វែងរក',

    // ── គម្រោងតាមប្រទេស (/esim/[country]) ──
    'country.title': 'គម្រោង eSIM {country}',
    'country.poweredBy': 'ដំណើរការលើបណ្តាញ {networks}',
    'country.coverage': 'គ្របដណ្តប់ទូទាំងប្រទេស',
    'country.quality': '{tech} · គុណភាព {quality}',
    'country.entryInfo': 'ព័ត៌មានចូលប្រទេស',
    'country.installTitle': 'របៀបដំឡើង',
    'country.install.iphone': '📱 ជំហានដំឡើងលើ iPhone',
    'country.install.iphone1': 'បើក <b>Settings → Cellular → Add eSIM</b>',
    'country.install.iphone2': 'ចុច <b>Use QR Code</b> រួចស្កេន QR ដែលយើងផ្ញើជូន',
    'country.install.iphone3': 'ដាក់ឈ្មោះគម្រោងថ្មីថា “ដំណើរ {country}”',
    'country.install.iphone4': 'ទុក eSIM ឲ្យ<b>បិទ</b>សិន រហូតដល់អ្នកចុះដល់ {country}',
    'country.install.iphone5':
      'ពេលចុះដល់ហើយ៖ បើក eSIM រួចបើក <b>Data Roaming</b> សម្រាប់វា',
    'country.install.android': '🤖 ជំហានដំឡើងលើ Android',
    'country.install.android1':
      'បើក <b>Settings → Connections → SIM Manager → Add eSIM</b>',
    'country.install.android2': 'ជ្រើស <b>Scan QR code</b> រួចស្កេន QR ដែលយើងផ្ញើជូន',
    'country.install.android3': 'បញ្ជាក់ការទាញយក រួចដាក់ឈ្មោះថា “ដំណើរ {country}”',
    'country.install.android4': 'ទុកអ៊ីនធឺណិតលើស៊ីមកម្ពុជារបស់អ្នកសិន រហូតដល់ថ្ងៃចេញដំណើរ',
    'country.install.android5':
      'ពេលចុះដល់ហើយ៖ ប្តូរអ៊ីនធឺណិតទៅ eSIM ថ្មី រួចបើក roaming',
    'country.faqTitle': 'eSIM {country} — សំណួរញឹកញាប់',
    'country.faq.q1': 'តើខ្ញុំគួរបើក eSIM {country} នៅពេលណា?',
    'country.faq.a1':
      'ដំឡើង eSIM មុនពេលហោះ តែបើកវាតែក្រោយពេលអ្នកចុះដល់ {country} ប៉ុណ្ណោះ។ រយៈពេលប្រើប្រាស់ចាប់ផ្តើមរាប់ ពេល eSIM ភ្ជាប់បណ្តាញក្នុងស្រុកលើកដំបូង។',
    'country.faq.q2': 'តើខ្ញុំអាចចែកអ៊ីនធឺណិតឲ្យមិត្តរួមដំណើរបានទេ?',
    'country.faq.a2':
      'បាន — គ្រប់គម្រោងរបស់ Domner អាចបើក hotspot បាន ដូច្នេះអ្នកអាចចែកអ៊ីនធឺណិតឲ្យទូរស័ព្ទសមាជិកគ្រួសារបាន។',
    'country.faq.q3': 'តើខ្ញុំនឹងភ្ជាប់បណ្តាញណាខ្លះនៅ {country}?',
    'country.faq.a3':
      'eSIM របស់អ្នកភ្ជាប់ទៅ {networks} ដោយស្វ័យប្រវត្តិ — មួយណាដែលមានសញ្ញាខ្លាំងជាងគេនៅកន្លែងអ្នក។ ក្នុងទីក្រុង អ្នកនឹងទទួលបានល្បឿន {tech}។',
    'country.faq.q4': 'បើអស់អ៊ីនធឺណិត ត្រូវធ្វើដូចម្តេច?',
    'country.faq.a4':
      'សរសេរមកក្រុមជំនួយភាសាខ្មែររបស់យើងតាម Telegram ២៤ម៉ោង យើងបញ្ចូលបន្ថែមឲ្យក្នុងរយៈពេលពីរបីនាទី — មិនចាំបាច់ទិញ eSIM ថ្មីទេ។',
    'country.faq.q5': 'តើលេខទូរស័ព្ទរបស់ខ្ញុំប្តូរទេ?',
    'country.faq.a5':
      'លេខកម្ពុជារបស់អ្នកនៅដំណើរការធម្មតាសម្រាប់ការហៅ និង SMS (អាចមានថ្លៃ roaming បើអ្នកទទួល)។ eSIM នេះប្រើសម្រាប់អ៊ីនធឺណិតតែប៉ុណ្ណោះ ហើយកម្មវិធីដូចជា Telegram នៅតែដំណើរការជាមួយលេខធម្មតារបស់អ្នកតាមអ៊ីនធឺណិត។',

    // ── កន្ត្រក (/cart) ──
    'cart.title': 'កន្ត្រករបស់អ្នក',
    'cart.empty.title': 'កន្ត្រករបស់អ្នកទទេ',
    'cart.empty.desc': 'សូមមើលហាង eSIM របស់យើង ហើយបន្ថែមគម្រោងសម្រាប់គោលដៅបន្ទាប់របស់អ្នក។',
    'cart.empty.cta': 'មើលគម្រោង eSIM',
    'cart.days': '{days} ថ្ងៃ',
    'cart.perDay': '{gb}GB ក្នុងមួយថ្ងៃ',
    'cart.totalData': '{gb}GB សរុប',
    'cart.remove': 'ដកគម្រោង {plan} របស់ {country} ចេញពីកន្ត្រក',
    'cart.summary': 'សេចក្តីសង្ខេបការបញ្ជាទិញ',
    'cart.subtotal': 'សរុបរង',
    'cart.discount': 'បញ្ចុះតម្លៃ',
    'cart.discountCode': 'កូដបញ្ចុះតម្លៃ',
    'cart.apply': 'ប្រើកូដ',
    'cart.codeInvalid': 'កូដនេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ។',
    'cart.referralApplied': 'កូដណែនាំ {code} ត្រូវបានប្រើដោយស្វ័យប្រវត្តិ។',
    'cart.total': 'សរុប',
    'cart.checkout': 'បន្តទៅការទូទាត់',

    // ── ការទូទាត់ (/esim/checkout) ──
    'checkout.eyebrow': 'ជិតរួចរាល់ហើយ',
    'checkout.title': 'ការទូទាត់',
    'checkout.empty.title': 'គ្មានអ្វីត្រូវទូទាត់ទេ',
    'checkout.empty.desc': 'សូមបន្ថែមគម្រោង eSIM ទៅក្នុងកន្ត្រកជាមុនសិន។',
    'checkout.details': 'ព័ត៌មានរបស់អ្នក',
    'checkout.fullName': 'ឈ្មោះពេញ',
    'checkout.fullNamePlaceholder': 'ឧ. ប្រាក់ សុខា',
    'checkout.email': 'អាសយដ្ឋានអ៊ីមែល',
    'checkout.phoneOptional': 'លេខទូរស័ព្ទ (មិនចាំបាច់)',
    'checkout.phone': 'លេខទូរស័ព្ទ',
    'checkout.phoneHintEmail': 'ប្រើតែក្នុងករណីយើងត្រូវទាក់ទងអ្នកអំពីការបញ្ជាទិញនេះ។',
    'checkout.phoneHintTelegram': 'ប្រើដើម្បីបញ្ជាក់ថា Telegram នោះជារបស់អ្នក។',
    'checkout.deviceType': 'ប្រភេទទូរស័ព្ទ',
    'checkout.deviceNotSure': 'មិនច្បាស់',
    'checkout.notes': 'កំណត់សម្គាល់បន្ថែម (មិនចាំបាច់)',
    'checkout.notesPlaceholder': 'មានអ្វីចង់ប្រាប់យើងទេ?',
    'checkout.delivery': 'ការផ្ញើកូដ QR',
    'checkout.summary': 'សេចក្តីសង្ខេបការបញ្ជាទិញ',
    'checkout.total': 'សរុប',
    'checkout.payMethod': 'វិធីទូទាត់',
    'checkout.cards': 'កាតអន្តរជាតិ',
    'checkout.cardsDesc': 'Visa · Mastercard · Amex — តាម Stripe',
    'checkout.aba': 'ABA PayWay (កម្ពុជា)',
    'checkout.abaDesc': 'KHQR · ABA Mobile · កាតក្នុងស្រុក',
    'checkout.processing': 'កំពុងដំណើរការ…',
    'checkout.payCard': 'ទូទាត់ដោយកាត',
    'checkout.payAba': 'ទូទាត់តាម ABA / KHQR',
    'checkout.secure': 'ការទូទាត់មានសុវត្ថិភាព · ផ្ញើ QR ក្នុងរយៈពេល ១៥ នាទី',
    'checkout.err.name': 'សូមបញ្ចូលឈ្មោះពេញរបស់អ្នក',
    'checkout.err.email': 'សូមបញ្ចូលអាសយដ្ឋានអ៊ីមែលឲ្យបានត្រឹមត្រូវ',
    'checkout.err.payStart': 'មិនអាចចាប់ផ្តើមការទូទាត់បានទេ។ សូមព្យាយាមម្តងទៀត។',
    'checkout.err.generic': 'មានបញ្ហាកើតឡើង',

    // ── បញ្ជាក់ការបញ្ជាទិញ ──
    'confirm.title': 'eSIM របស់អ្នកកំពុងរៀបចំហើយ!',
    'confirm.orderNumber': 'លេខបញ្ជាទិញ៖',
    'confirm.eta': 'យើងនឹងផ្ញើកូដ QR ជូនអ្នកក្នុងរយៈពេល {minutes} នាទី។',
    'confirm.next': 'ជំហានបន្ទាប់',
    'confirm.step1.title': 'យើងរៀបចំ eSIM របស់អ្នក',
    'confirm.step1.desc': 'ក្រុមការងាររបស់យើងបង្កើតកូដ QR — ជាធម្មតាក្នុងរយៈពេល ១៥ នាទី។',
    'confirm.step2.title': 'អ្នកទទួលបានកូដ QR',
    'confirm.step2.desc': 'តាមអ៊ីមែល និងតាម Telegram ផងដែរ បើអ្នកបានភ្ជាប់វាខាងក្រោម។',
    'confirm.step3.title': 'ដំឡើងមុនពេលហោះ',
    'confirm.step3.desc': 'ស្កេន QR ដើម្បីដំឡើង រួចបើក eSIM ពេលអ្នកចុះដល់។',
    'confirm.addTrip': 'បន្ថែមទៅដំណើររបស់អ្នក',
    'confirm.trackFlight': 'តាមដានជើងហោះហើរផ្សេង',
    'confirm.support': 'ទាក់ទងក្រុមជំនួយ',

    // ── ផ្ទាំងគ្រប់គ្រង ──
    'dash.nav.dashboard': 'ផ្ទាំងគ្រប់គ្រង',
    'dash.nav.trips': 'ដំណើររបស់ខ្ញុំ',
    'dash.nav.esims': 'eSIM របស់ខ្ញុំ',
    'dash.nav.alerts': 'ជូនដំណឹងជើងហោះហើរ',
    'dash.nav.memories': 'ការចងចាំ',
    'dash.nav.settings': 'ការកំណត់',
    'dash.navLabel': 'ម៉ឺនុយផ្ទាំងគ្រប់គ្រង',

    // ── eSIM របស់ខ្ញុំ ──
    'esims.title': 'eSIM របស់ខ្ញុំ',
    'esims.sub': 'គម្រោងអ៊ីនធឺណិត កូដ QR និងប្រវត្តិបញ្ជាទិញរបស់អ្នក នៅកន្លែងតែមួយ។',
    'esims.loading': 'កំពុងផ្ទុក eSIM របស់អ្នក…',
    'esims.signInPrompt': 'សូមចូលគណនីដើម្បីមើល eSIM របស់អ្នក។',
    'esims.loadFailed': 'មិនអាចផ្ទុក eSIM របស់អ្នកបានទេ។',
    'esims.signIn': 'ចូលគណនី',
    'esims.empty.title': 'មិនទាន់មាន eSIM ទេ',
    'esims.empty.desc': 'ទិញ eSIM ដំបូងរបស់អ្នក រួចវានឹងបង្ហាញនៅទីនេះជាមួយកូដ QR។',
    'esims.empty.cta': 'មើលគម្រោង eSIM',
    'esims.status.pending': 'រង់ចាំការទូទាត់',
    'esims.status.paid': 'កំពុងរៀបចំ eSIM',
    'esims.status.fulfilled': 'អាចដំឡើងបានហើយ',
    'esims.status.cancelled': 'បានលុបចោល',
    'esims.status.refunded': 'បានសងប្រាក់វិញ',
    'esims.planLine': '{plan} · {days} ថ្ងៃ · {gb}GB ក្នុងមួយថ្ងៃ',
    'esims.paidNote':
      'បានទទួលការទូទាត់។ កូដ QR របស់អ្នកកំពុងរៀបចំ ហើយនឹងផ្ញើតាមអ៊ីមែលក្នុងរយៈពេល ១៥ នាទី។',
    'esims.viewQr': 'មើលកូដ QR',
    'esims.support': 'សុំជំនួយ',
    'esims.buyAgain': 'ទិញម្តងទៀត',
    'esims.modalTitle': 'eSIM {country}',
    'esims.qrAlt': 'កូដ QR eSIM សម្រាប់ការបញ្ជាទិញ {order}',
    'esims.manualCode': 'កូដបើកដំណើរការដោយដៃ',
    'esims.installNote': 'ដំឡើងតាម Wi-Fi មុនពេលហោះ។ កូដ QR នេះស្កេនបានតែម្តងគត់។',

    // ── ទំព័រដើមផ្ទាំងគ្រប់គ្រង ──
    'dash.welcome': 'សួស្តី! សូមស្វាគមន៍ការត្រឡប់មកវិញ',
    'dash.sub': 'នេះជាព័ត៌មានទាំងអស់សម្រាប់ដំណើររបស់អ្នកដែលជិតមកដល់។',
    'dash.quick.flight': 'តាមដានជើងហោះហើរ',
    'dash.quick.esim': 'ទិញ eSIM',
    'dash.quick.trip': 'ដំណើរថ្មី',
    'dash.flights': 'ជើងហោះហើរជិតមកដល់',
    'dash.trackNew': 'តាមដានថ្មី',
    'dash.esims': 'eSIM កំពុងប្រើ',
    'dash.viewAll': 'មើលទាំងអស់',
    'dash.daysLeft': 'នៅសល់ {days} ថ្ងៃ',
    'dash.active': 'កំពុងប្រើ',
    'dash.dataUsed': 'ប្រើអស់ {pct}% នៃទិន្នន័យថ្ងៃនេះ',
    'dash.trips': 'ដំណើរជិតមកដល់',
    'dash.open': 'បើក',

    // ── ការកំណត់ ──
    'settings.title': 'ការកំណត់',
    'settings.sub': 'ប្រវត្តិរូប និងចំណូលចិត្តរបស់អ្នក។',
    'settings.fullName': 'ឈ្មោះពេញ',
    'settings.telegram': 'ឈ្មោះអ្នកប្រើ Telegram',
    'settings.passportCountry': 'ប្រទេសនៃលិខិតឆ្លងដែន',
    'settings.language': 'ភាសាដែលចូលចិត្ត',
    'settings.save': 'រក្សាទុកការផ្លាស់ប្តូរ',
    'settings.saved': 'បានរក្សាទុក',
    'settings.notifications': 'ការជូនដំណឹង',
    'settings.notify.flights': 'ជូនដំណឹងជើងហោះហើរ',
    'settings.notify.esim': 'ព័ត៌មានអំពីការផ្ញើ eSIM',
    'settings.notify.checklist': 'រំលឹកបញ្ជីត្រៀម',
    'settings.notify.tips': 'គន្លឹះធ្វើដំណើរនៅគោលដៅ',

    // ── បញ្ជីត្រៀម (/checklist) ──
    'check.eyebrow': 'ត្រៀមរួចហើយឬនៅ?',
    'check.title': 'បញ្ជីត្រៀមធ្វើដំណើរផ្ទាល់ខ្លួនរបស់អ្នក',
    'check.sub':
      'ឆ្លើយសំណួរពីរបីម៉ាត់ រួចយើងនឹងធ្វើបញ្ជីត្រឹមត្រូវសម្រាប់អ្នក — គ្មានអ្វីភ្លេចឡើយ។',
    'check.stepOf': 'ជំហានទី {step} ក្នុងចំណោម ៣',
    'check.step1': 'ជំហានទី ១ — ព័ត៌មានដំណើរ',
    'check.where': 'តើអ្នកទៅណា?',
    'check.passportCountry': 'ប្រទេសនៃលិខិតឆ្លងដែនរបស់អ្នក',
    'check.cambodia': 'កម្ពុជា 🇰🇭',
    'check.other': 'ផ្សេងទៀត',
    'check.departure': 'ថ្ងៃចេញដំណើរ',
    'check.return': 'ថ្ងៃត្រឡប់មកវិញ',
    'check.travelingWith': 'ធ្វើដំណើរជាមួយ',
    'check.solo': 'ទៅតែម្នាក់ឯង',
    'check.partner': 'ជាមួយគូ',
    'check.family': 'ជាមួយគ្រួសារ',
    'check.group': 'ជាក្រុម',
    'check.continue': 'បន្ត',
    'check.step2': 'ជំហានទី ២ — ព័ត៌មានអ្នក',
    'check.firstTime': 'តើនេះជាលើកទីមួយដែលអ្នកទៅក្រៅប្រទេសមែនទេ?',
    'check.flownBefore': 'តើអ្នកធ្លាប់ជិះយន្តហោះទេ?',
    'check.insuranceQ': 'តើអ្នកមានធានារ៉ាប់រងធ្វើដំណើរទេ?',
    'check.stayQ': 'តើកក់កន្លែងស្នាក់នៅរួចហើយឬនៅ?',
    'check.yes': 'បាទ/ចាស',
    'check.no': 'ទេ',
    'check.notYet': 'មិនទាន់',
    'check.back': 'ថយក្រោយ',
    'check.generate': 'បង្កើតបញ្ជីរបស់ខ្ញុំ',
    'check.progress': 'រួចរាល់ {done}/{total} — អ្នកត្រៀមបាន {pct}% សម្រាប់ {country}',
    'check.remind':
      '📲 យើងនឹងរំលឹកអ្នក <b>៤៨ ម៉ោងមុនជើងហោះហើរ</b> បើអ្នកនៅសល់ចំណុចមិនទាន់ធីក។',
    'check.editAnswers': 'កែចម្លើយ',
    'check.esimNext': 'យក eSIM បន្ទាប់ →',
    'check.destFallback': 'គោលដៅរបស់អ្នក',
    'check.cat.urgent': '🚨 បន្ទាន់ — ធ្វើមុនហោះ (៧ ថ្ងៃ ឬច្រើនជាង)',
    'check.cat.important': '📋 សំខាន់ — ធ្វើមុន ៤៨ ម៉ោង',
    'check.cat.pack': '🧳 វេចខ្ចប់',
    'check.cat.day-of': '✈️ ថ្ងៃហោះហើរ',
    'check.item.visaCustoms': 'ពិនិត្យលក្ខខណ្ឌទិដ្ឋាការ {country} ({info})',
    'check.item.visa': 'ពិនិត្យលក្ខខណ្ឌទិដ្ឋាការ {country} សម្រាប់លិខិតឆ្លងដែនរបស់អ្នក',
    'check.item.bookStay': 'កក់កន្លែងស្នាក់នៅ (រក្សាទុកលិខិតបញ្ជាក់ការកក់សណ្ឋាគារ)',
    'check.item.saveStay':
      'រក្សាទុកលិខិតបញ្ជាក់សណ្ឋាគារ ទុកកន្លែងដែលអ្នកអាចមើលបានពេលគ្មានអ៊ីនធឺណិត',
    'check.item.insurance': 'ធានារ៉ាប់រងធ្វើដំណើរ (ណែនាំ៖ SafetyWing ចាប់ពី $40 ក្នុងមួយខែ)',
    'check.item.esim': 'យក eSIM សម្រាប់ {country}',
    'check.item.passport6m':
      'ពិនិត្យថាលិខិតឆ្លងដែនរបស់អ្នកមានសុពលភាព ៦ ខែ ឬច្រើនជាង បន្ទាប់ពីថ្ងៃត្រឡប់មកវិញ',
    'check.item.vietnamArrival': 'បំពេញបណ្ណចូលប្រទេសវៀតណាមតាមអ៊ីនធឺណិត (ទម្រង់ផ្លូវការ)',
    'check.item.sgArrival': 'ដាក់បណ្ណចូលប្រទេសសិង្ហបុរី (SG Arrival Card) តាមអ៊ីនធឺណិត',
    'check.item.mdac': 'បំពេញបណ្ណចូលប្រទេសម៉ាឡេស៊ី (MDAC)',
    'check.item.visitJapan': 'បំពេញ Visit Japan Web ដើម្បីចូលប្រទេសបានលឿន',
    'check.item.flightStatus': 'ពិនិត្យស្ថានភាពជើងហោះហើរនៅលើ Domner',
    'check.item.maxCash': 'បញ្ជាក់៖ សាច់ប្រាក់អតិបរមា ${amount} ដុល្លារ ដែលអនុញ្ញាតឲ្យយកចូល {country}',
    'check.item.hotelScreenshot':
      'ថតអេក្រង់អាសយដ្ឋានសណ្ឋាគារជាភាសាក្នុងស្រុក ដើម្បីបង្ហាញអ្នកបើកតាក់ស៊ី',
    'check.item.offlineMaps': 'ទាញយកផែនទីប្រើពេលគ្មានអ៊ីនធឺណិត សម្រាប់ទីក្រុងគោលដៅ',
    'check.item.packPassport': 'លិខិតឆ្លងដែន (សុពលភាព ៦ ខែឡើងទៅ)',
    'check.item.packReturn': 'សំបុត្រយន្តហោះត្រឡប់ (បោះពុម្ព)',
    'check.item.packHotel': 'លិខិតបញ្ជាក់ការកក់សណ្ឋាគារ',
    'check.item.packCash': 'សាច់ប្រាក់ដុល្លារសម្រាប់ពេលបន្ទាន់',
    'check.item.packCharger': 'ឆ្នាំងសាកទូរស័ព្ទ + ក្បាលបម្លែងដោត',
    'check.item.packMeds': 'ថ្នាំតាមវេជ្ជបញ្ជា (ក្នុងកញ្ចប់ដើម)',
    'check.item.packKids': 'ឯកសារកូនៗ + អាហារសម្រន់ + របស់លេងកម្សាន្ត',
    'check.item.arriveEarly': 'ទៅដល់អាកាសយានដ្ឋានមុន {hours} ម៉ោង',
    'check.item.checkIn': 'ឆេកអ៊ីនតាមអ៊ីនធឺណិត',
    'check.item.activateAfter': 'បើក eSIM តែក្រោយពេលចុះដល់ប៉ុណ្ណោះ',
    'check.item.airportGuide':
      'បើកមគ្គុទ្ទេសក៍អាកាសយានដ្ឋាន Domner ពេលអ្នកទៅដល់អាកាសយានដ្ឋាន',

    // ── ឃ្លាបន្ទាន់ (/emergency) ──
    'emerg.eyebrow': 'ឃ្លាបន្ទាន់',
    'emerg.title': 'និយាយឲ្យត្រូវ នៅពេលចាំបាច់',
    'emerg.subBefore': 'ចុច',
    'emerg.subAfter':
      'ដើម្បីបញ្ចេញសំឡេងឃ្លានេះឲ្យអ្នកស្រុកស្តាប់ ឬចម្លងវា រួចបង្ហាញអេក្រង់ទូរស័ព្ទរបស់អ្នក។',
    'emerg.offline': 'ឃ្លាទាំងនេះប្រើបានទោះគ្មានអ៊ីនធឺណិត',
    'emerg.selectLang': 'ជ្រើសភាសានៅគោលដៅ',
    'emerg.ttsUnavailable':
      'ការបញ្ចេញសំឡេងត្រូវការអ៊ីនធឺណិត ឬសំឡេងក្នុងឧបករណ៍សម្រាប់ភាសានេះ។ ប៊ូតុងចម្លងនៅដំណើរការ — សូមបង្ហាញឃ្លានេះលើអេក្រង់ជំនួសវិញ។',
    'emerg.play': 'បញ្ចេញសំឡេង “{phrase}” ជាភាសា {language}',
    'emerg.stop': 'ឈប់បញ្ចេញសំឡេង “{phrase}”',
    'emerg.copy': 'ចម្លង “{phrase}” ជាភាសា {language}',
    'emerg.footnote':
      'ការបញ្ចេញសំឡេងប្រើសំឡេងក្នុងឧបករណ៍របស់អ្នកនៅពេលមាន ហើយប្រើសំឡេង Google Translate ក្នុងករណីផ្សេង។ ឃ្លា និងការចម្លងដំណើរការគ្រប់ពេល ទោះគ្មានអ៊ីនធឺណិត។',

    // ── មគ្គុទ្ទេសក៍អាកាសយានដ្ឋាន (/airport-guide) ──
    'guide.eyebrow': 'ដៃគូអាកាសយានដ្ឋាន',
    'guide.title': 'លែងវង្វេងនៅអាកាសយានដ្ឋានទៀតហើយ',
    'guide.sub':
      'ការណែនាំជាជំហានៗគ្រប់ដំណាក់កាល — ឆេកអ៊ីន សុវត្ថិភាព អន្តោប្រវេសន៍ ច្រកឡើងយន្តហោះ និងការឡើងជិះ។',
    'guide.searchPlaceholder': 'ស្វែងរកអាកាសយានដ្ឋាន (ឧ. PNH, បាងកក)…',
    'guide.searchLabel': 'ស្វែងរកអាកាសយានដ្ឋាន',
    'guide.departing': 'ចេញដំណើរ',
    'guide.arriving': 'មកដល់',
    'guide.departingFrom': 'ចេញដំណើរពី {city} ({code})',
    'guide.arrivingAt': 'មកដល់ {city} ({code})',
    'guide.mapOpen': 'បើកផែនទីអាកាសយានដ្ឋានឌីជីថលសម្រាប់ {airport}',
    'guide.map': 'ផែនទីឌីជីថល',
    'guide.mapDefault': 'ផែនទីអាកាសយានដ្ឋានអន្តរកម្ម',
    'guide.stepAria': 'ជំហានទី {n}៖ {title}',
    'guide.step': 'ជំហានទី {n}',
    'guide.phrases': 'ឃ្លាមានប្រយោជន៍',
    'guide.watchOut': 'ត្រូវប្រយ័ត្ន',
    'guide.nextStep': 'រួចហើយ — ជំហានបន្ទាប់ →',
  },
} as const;

export type DictKey = keyof typeof dicts.en;

/**
 * Values spliced into a string at `{name}`. Khmer and English put the same
 * facts in a different order — a country name leads the English sentence and
 * trails the Khmer one — so the placeholder has to be named, never positional.
 */
export type TVars = Record<string, string | number>;

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey, vars?: TVars) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => undefined,
  t: (key, vars) => interpolate(dicts.en[key], vars),
});

/** Shared with the server layout, which reads this cookie to set <html lang>. */
export const LANG_COOKIE = 'domner-lang';

function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_COOKIE, lang);
  } catch {
    // Private browsing can refuse localStorage; the cookie below still works.
  }
  // A cookie (not just localStorage) so the SERVER knows the language too and
  // can render <html lang="km"> in the initial HTML. Search engines and screen
  // readers only ever see that first response — a value applied later by an
  // effect is invisible to them.
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageProvider({
  children,
  initialLang = 'en',
}: {
  children: ReactNode;
  /** Read from the cookie during SSR so the first paint is already correct. */
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Reconcile with a stored preference set before cookies existed, and keep
  // the cookie fresh so its expiry rolls forward on every visit.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LANG_COOKIE);
    } catch {
      saved = null;
    }
    const next = saved === 'km' || saved === 'en' ? saved : initialLang;
    setLangState(next);
    persistLang(next);
  }, [initialLang]);

  // Reflect the language on <html> and switch body font for Khmer.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.classList.toggle('lang-km', lang === 'km');
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    persistLang(l);
  };

  const t = (key: DictKey, vars?: TVars) =>
    interpolate(dicts[lang][key] ?? dicts.en[key], vars);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/**
 * Renders a dictionary string that contains `<b>…</b>`, and nothing else.
 *
 * Install instructions need the device menu path in bold — "Open **Settings →
 * Cellular → Add eSIM**" — and the bold run sits in a different place in Khmer
 * than in English, so it has to travel inside the string rather than being
 * bolted on around it. Only `<b>` is understood: anything else is printed as
 * literal text, so this can never become an HTML injection the way
 * dangerouslySetInnerHTML would.
 */
export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(<b>.*?<\/b>)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const bold = part.match(/^<b>(.*?)<\/b>$/);
        return bold ? <strong key={i}>{bold[1]}</strong> : <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * Pick the right half of a bilingual value from the content layer
 * (`content/schema.ts` → `Bi`). Curated destination facts are stored bilingual
 * rather than keyed, because they are content rather than interface copy — but
 * they still resolve through the language the visitor chose here.
 */
export function useBi(): (value: { en: string; km: string }) => string {
  const { lang } = useLang();
  return (value) => value[lang] || value.en;
}

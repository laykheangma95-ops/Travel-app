// ─────────────────────────────────────────────────────────────────────────────
// Bilingual copy for the place-import review screen.
//
// Two entry points share this: the synchronous pipeline (ImportPlacesView,
// POST /api/travel/extract) and the queued-link pipeline (SocialLinkIntake →
// GET /api/imports/:id, Phase 5). Both land the traveler on the same review
// list and the same trip picker, so the copy lives once — a second copy of
// this object is exactly how the two screens drift out of sync with each
// other over time.
//
// `km` mirrors every `en` key, never a subset (CLAUDE.md §11).
// ─────────────────────────────────────────────────────────────────────────────

export const COPY = {
  eyebrow: { en: 'Import', km: 'នាំចូល' },
  heading: { en: 'Turn a post into a plan', km: 'ប្តូរការបង្ហោះទៅជាផែនការ' },
  sub: {
    en: 'Paste a link from TikTok, Instagram, Facebook, YouTube or Google Maps. We read the places out of it and put them on your trip.',
    km: 'បិទភ្ជាប់តំណពី TikTok, Instagram, Facebook, YouTube ឬ Google Maps។ យើងនឹងអានទីតាំងចេញពីវា ហើយដាក់ទៅក្នុងដំណើររបស់អ្នក។',
  },
  label: { en: 'Link or text', km: 'តំណ ឬអត្ថបទ' },
  placeholder: {
    en: 'Paste a link here — or paste the caption itself',
    km: 'បិទភ្ជាប់តំណនៅទីនេះ — ឬបិទភ្ជាប់អត្ថបទរបស់ការបង្ហោះ',
  },
  paste: { en: 'Paste', km: 'បិទភ្ជាប់' },
  find: { en: 'Find places', km: 'រកទីតាំង' },
  reading: { en: 'Reading the post…', km: 'កំពុងអានការបង្ហោះ…' },
  mayBeWrong: {
    en: 'Places and plans may be read wrongly, or not at all.',
    km: 'ទីតាំង និងផែនការអាចត្រូវបានអានខុស ឬអានមិនបាន។',
  },
  cancel: { en: 'Cancel', km: 'បោះបង់' },
  found: { en: 'Places found', km: 'ទីតាំងដែលរកឃើញ' },
  selectAll: { en: 'Select all', km: 'ជ្រើសទាំងអស់' },
  clearAll: { en: 'Clear', km: 'សម្អាត' },
  addToPlan: { en: 'Add to plan', km: 'បន្ថែមទៅផែនការ' },
  chooseTrip: { en: 'Which trip?', km: 'ដំណើរណាមួយ?' },
  newTrip: { en: 'New trip', km: 'ដំណើរថ្មី' },
  createNow: { en: 'Create now', km: 'បង្កើតឥឡូវ' },
  where: { en: 'Where is this trip to?', km: 'ដំណើរនេះទៅកន្លែងណា?' },
  noPin: { en: 'No pin', km: 'គ្មានចំណុចលើផែនទី' },
  onMap: { en: 'On the map', km: 'នៅលើផែនទី' },
  edit: { en: 'Edit', km: 'កែ' },
  done: { en: 'Done', km: 'រួចរាល់' },
  saved: { en: 'Saved to your trip', km: 'បានរក្សាទុកទៅដំណើររបស់អ្នក' },
  viewPlace: { en: 'View place', km: 'មើលទីតាំង' },
  openTrip: { en: 'Open the trip', km: 'បើកដំណើរ' },
  openItinerary: { en: 'Open the itinerary', km: 'បើកកម្មវិធីដំណើរ' },
  importAnother: { en: 'Import another', km: 'នាំចូលមួយទៀត' },
  alreadyThere: { en: 'already on this trip', km: 'មាននៅលើដំណើរនេះរួចហើយ' },
  couldNotSave: { en: 'could not be saved', km: 'មិនអាចរក្សាទុកបាន' },
  nothingFound: { en: 'No places in that one', km: 'គ្មានទីតាំងនៅក្នុងនោះទេ' },
  nothingFoundHelp: {
    en: 'The post did not name a place we could recognise. Paste the caption text and we will read that instead.',
    km: 'ការបង្ហោះនោះមិនបានបញ្ជាក់ឈ្មោះទីតាំងដែលយើងស្គាល់ទេ។ សូមបិទភ្ជាប់អត្ថបទរបស់វា ហើយយើងនឹងអានវាជំនួស។',
  },
  captionUnavailable: { en: 'That app would not show us the caption', km: 'កម្មវិធីនោះមិនបង្ហាញអត្ថបទដល់យើងទេ' },
  captionUnavailableHelp: {
    en: 'Instagram and Facebook usually keep captions behind a login. Copy the caption text from the post and paste it here — that always works.',
    km: 'Instagram និង Facebook ភាគច្រើនរក្សាអត្ថបទនៅក្រោយការចូលគណនី។ សូមចម្លងអត្ថបទពីការបង្ហោះ ហើយបិទភ្ជាប់នៅទីនេះ — វាដំណើរការជានិច្ច។',
  },
  linkUnreadable: { en: 'We could not open that link', km: 'យើងមិនអាចបើកតំណនោះបានទេ' },
  linkUnreadableHelp: {
    en: 'Check the link is complete, or paste the caption text instead.',
    km: 'សូមពិនិត្យថាតំណពេញលេញ ឬបិទភ្ជាប់អត្ថបទជំនួស។',
  },
  tryAgain: { en: 'Try another link', km: 'សាកតំណផ្សេង' },
  signIn: { en: 'Sign in to import places', km: 'ចូលគណនីដើម្បីនាំចូលទីតាំង' },
  basicMode: {
    en: 'Reading captions without AI — simple lists work best.',
    km: 'កំពុងអានអត្ថបទដោយគ្មាន AI — បញ្ជីសាមញ្ញដំណើរការល្អបំផុត។',
  },
} as const;

export type CopyKey = keyof typeof COPY;
export type Translate = (key: CopyKey) => string;

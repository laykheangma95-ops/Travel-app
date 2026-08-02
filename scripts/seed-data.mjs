/**
 * seed-data — a hand-written starter set, written to data/intents.jsonl
 *
 * This exists so the pipeline can be trained and measured before spending
 * anything on generation. It is deliberately small; generate-intent-data.mjs
 * expands it to ~100 per intent. Real customer phrasings from the fallback
 * log should replace these over time.
 */
import fs from 'node:fs';

const DATA = {
  greeting: [
    'hello', 'hi there', 'hey', 'good morning', 'good evening', 'hello anyone there',
    'hi can you help me', 'yo', 'hey there', 'morning', 'is anyone online',
    'សួស្តី', 'ជម្រាបសួរ', 'អរុណសួស្តី', 'សួស្តីបង', 'ជួយបានទេ', 'មានអ្នកនៅទេ',
    'hallo', 'helo', 'hi domner',
  ],
  esim_setup: [
    'how do I install my esim', 'how to set up the esim', 'where is my qr code',
    'i cant activate my esim', 'how do i scan the qr', 'esim not working after install',
    'my internet is not working', 'no signal after installing', 'how do i turn on the data',
    'setup instructions please', 'i bought an esim what now', 'how to activate',
    'the qr code wont scan', 'do i scan before i fly', 'my data isnt connecting',
    'របៀបដំឡើង esim', 'ស្កេន qr មិនបាន', 'អ៊ីនធឺណិតមិនដើរ', 'របៀបប្រើ esim',
    'បើកម៉ាស៊ីនហើយតែគ្មានសេវា', 'ដំឡើងមិនបាន', 'ធ្វើម៉េចទើបប្រើបាន',
  ],
  esim_compatibility: [
    'does my phone support esim', 'is iphone 11 compatible', 'will this work on samsung',
    'can i use esim on my device', 'which phones work with esim', 'is my phone supported',
    'do i need an unlocked phone', 'does xiaomi support this', 'compatible devices list',
    'my phone is old will it work', 'can i check compatibility', 'huawei esim support',
    'ទូរស័ព្ទខ្ញុំប្រើបានទេ', 'iphone ចាស់ប្រើបានទេ', 'samsung ប្រើ esim បានទេ',
    'ឧបករណ៍អ្វីខ្លះប្រើបាន', 'ទូរស័ព្ទត្រូវដោះសោទេ',
  ],
  china_vpn: [
    'do i need a vpn in china', 'will whatsapp work in china', 'is google blocked in china',
    'can i use facebook in china', 'china internet restrictions', 'does the esim bypass the firewall',
    'vpn for china travel', 'social media blocked china', 'will instagram work in beijing',
    'do i need vpn for shanghai', 'is line blocked in china',
    'ទៅចិនត្រូវការ vpn ទេ', 'facebook នៅចិនប្រើបានទេ', 'ចិនប្លុក google មែនទេ',
    'whatsapp នៅចិនដើរទេ', 'ត្រូវការ vpn ទេ',
  ],
  flight: [
    'track my flight', 'is my flight delayed', 'flight status please', 'where is my plane',
    'when does my flight land', 'has flight ak123 departed', 'check flight arrival time',
    'my flight number is qr456 status', 'live flight tracking', 'is the flight on time',
    'how do i track a flight', 'flight alerts', 'did my flight take off',
    'តាមដានជើងហោះហើរ', 'ជើងហោះហើរយឺតទេ', 'យន្តហោះមកដល់ម៉ោងណា',
    'ពិនិត្យស្ថានភាពជើងហោះហើរ', 'យន្តហោះហោះហើយឬនៅ',
  ],
  airport: [
    'phnom penh airport guide', 'where is the immigration counter', 'airport wifi password',
    'how early should i arrive at the airport', 'siem reap airport facilities',
    'is there a lounge at pnh', 'where to eat at the airport', 'airport transfer options',
    'how long is security', 'duty free at phnom penh', 'which terminal do i use',
    'ព្រលានយន្តហោះភ្នំពេញ', 'ត្រូវទៅមុនប៉ុន្មានម៉ោង', 'wifi ព្រលានយន្តហោះ',
    'កន្លែងញ៉ាំនៅព្រលាន', 'ការិយាល័យអន្តោប្រវេសន៍នៅណា',
  ],
  checklist: [
    'what should i pack', 'trip checklist', 'what do i need before i travel',
    'things to prepare for my trip', 'do i have everything ready', 'travel prep list',
    'what documents do i need', 'packing list for cambodia', 'first time travel advice',
    'help me get ready for the trip', 'what should i bring',
    'បញ្ជីត្រៀមដំណើរ', 'ត្រូវយកអ្វីខ្លះ', 'ត្រៀមអ្វីខ្លះមុនទៅ',
    'ឯកសារអ្វីខ្លះត្រូវការ', 'វេចខ្ចប់អ្វីខ្លះ',
  ],
  emergency: [
    'i lost my passport', 'emergency contact number', 'i need a hospital',
    'police number in cambodia', 'i had an accident', 'my wallet was stolen',
    'urgent help needed', 'where is the embassy', 'i need a doctor now',
    'someone robbed me', 'emergency services number',
    'បាត់លិខិតឆ្លងដែន', 'លេខទូរស័ព្ទបន្ទាន់', 'ត្រូវការមន្ទីរពេទ្យ',
    'មានគ្រោះថ្នាក់', 'លួចយកកាបូប',
  ],
  payment: [
    'how can i pay', 'do you accept aba', 'can i pay with wing', 'payment methods',
    'is credit card accepted', 'can i pay in riel', 'do you take khqr',
    'my payment failed', 'is paypal supported', 'how do i checkout',
    'can i pay with usd', 'payment declined what do i do',
    'បង់ប្រាក់យ៉ាងម៉េច', 'ទទួល aba ទេ', 'បង់តាម wing បានទេ',
    'ប្រើកាតបានទេ', 'ការទូទាត់មិនបាន',
  ],
  support: [
    'i need to talk to someone', 'how do i contact support', 'is there a human agent',
    'customer service please', 'can i get help from a person', 'telegram support link',
    'i want to speak to staff', 'contact number', 'how to reach you',
    'this bot isnt helping', 'connect me to support',
    'ចង់និយាយជាមួយបុគ្គលិក', 'ទាក់ទងជំនួយយ៉ាងម៉េច', 'មានមនុស្សពិតទេ',
    'លេខទំនាក់ទំនង', 'ត្រូវការជំនួយ',
  ],
  refund_booking: [
    'can i get a refund', 'i want to cancel my order', 'how do i change my booking',
    'refund policy', 'i bought the wrong plan', 'can i cancel the esim',
    'money back please', 'i want to return this', 'how long does a refund take',
    'change my dates', 'cancel my purchase',
    'សុំប្រាក់វិញបានទេ', 'ចង់លុបចោលការកម្មង់', 'ប្តូរកាលបរិច្ឆេទបានទេ',
    'គោលការណ៍សងប្រាក់វិញ', 'ទិញខុសផែនការ',
  ],
  products: [
    'what do you sell', 'what services do you offer', 'tell me about domner',
    'what can i buy here', 'do you sell sim cards', 'what is domner pro',
    'what plans are available', 'show me your products', 'what does this app do',
    'what features do you have', 'do you do flight booking',
    'អ្នកលក់អ្វីខ្លះ', 'មានសេវាកម្មអ្វីខ្លះ', 'domner ជាអ្វី',
    'មានផលិតផលអ្វីខ្លះ', 'កម្មវិធីនេះធ្វើអ្វី',
  ],
  thanks: [
    'thank you', 'thanks a lot', 'thanks that helped', 'perfect thank you',
    'great thanks', 'ok thanks', 'appreciate it', 'cheers', 'thank you so much',
    'that was helpful thanks', 'nice thanks',
    'អរគុណ', 'អរគុណច្រើន', 'អរគុណបង', 'ល្អណាស់អរគុណ', 'បានហើយអរគុណ',
  ],
};

const lines = [];
for (const [intent, texts] of Object.entries(DATA)) {
  for (const text of texts) lines.push(JSON.stringify({ intent, text }));
}

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/intents.jsonl', lines.join('\n') + '\n');
console.log(`wrote data/intents.jsonl — ${lines.length} examples across ${Object.keys(DATA).length} intents`);

import type { PhraseLanguage } from '@/types';

// Emergency phrase data is bundled with the app so the /emergency page
// keeps working offline.

function buildCategories(t: {
  tourist: string;
  staying: string;
  hotel: string;
  exit: string;
  help: string;
  taxi: string;
  ambulance: string;
  doctor: string;
  allergic: string;
  cost: string;
  address: string;
}) {
  return [
    {
      id: 'immigration',
      title: 'At Immigration',
      titleKm: 'នៅច្រកអន្តោប្រវេសន៍',
      icon: 'stamp',
      phrases: [
        { en: 'I am a tourist', km: 'ខ្ញុំជាភ្ញៀវទេសចរ', translation: t.tourist },
        { en: 'I am staying for 7 days', km: 'ខ្ញុំស្នាក់នៅ ៧ ថ្ងៃ', translation: t.staying },
        { en: 'My hotel is...', km: 'សណ្ឋាគាររបស់ខ្ញុំគឺ...', translation: t.hotel },
      ],
    },
    {
      id: 'lost',
      title: 'If Lost',
      titleKm: 'ប្រសិនបើវង្វេង',
      icon: 'map',
      phrases: [
        { en: 'Where is the exit?', km: 'ច្រកចេញនៅឯណា?', translation: t.exit },
        { en: 'Please help me', km: 'សូមជួយខ្ញុំផង', translation: t.help },
        { en: 'I need a taxi', km: 'ខ្ញុំត្រូវការតាក់ស៊ី', translation: t.taxi },
      ],
    },
    {
      id: 'medical',
      title: 'Medical Emergency',
      titleKm: 'គ្រាអាសន្នផ្នែកវេជ្ជសាស្ត្រ',
      icon: 'heart',
      phrases: [
        { en: 'Call an ambulance', km: 'សូមហៅឡានពេទ្យ', translation: t.ambulance },
        { en: 'I need a doctor', km: 'ខ្ញុំត្រូវការគ្រូពេទ្យ', translation: t.doctor },
        { en: 'I am allergic to...', km: 'ខ្ញុំមានប្រតិកម្មនឹង...', translation: t.allergic },
      ],
    },
    {
      id: 'around',
      title: 'Getting Around',
      titleKm: 'ការធ្វើដំណើរ',
      icon: 'compass',
      phrases: [
        { en: 'How much does this cost?', km: 'តម្លៃប៉ុន្មាន?', translation: t.cost },
        { en: 'Take me to this address', km: 'សូមនាំខ្ញុំទៅអាសយដ្ឋាននេះ', translation: t.address },
      ],
    },
  ];
}

export const phraseLanguages: PhraseLanguage[] = [
  {
    code: 'vi',
    name: 'Vietnamese',
    flag: '🇻🇳',
    categories: buildCategories({
      tourist: 'Tôi là khách du lịch',
      staying: 'Tôi ở lại 7 ngày',
      hotel: 'Khách sạn của tôi là...',
      exit: 'Lối ra ở đâu?',
      help: 'Xin hãy giúp tôi',
      taxi: 'Tôi cần taxi',
      ambulance: 'Gọi xe cứu thương',
      doctor: 'Tôi cần bác sĩ',
      allergic: 'Tôi bị dị ứng với...',
      cost: 'Cái này bao nhiêu tiền?',
      address: 'Đưa tôi đến địa chỉ này',
    }),
  },
  {
    code: 'th',
    name: 'Thai',
    flag: '🇹🇭',
    categories: buildCategories({
      tourist: 'ฉันเป็นนักท่องเที่ยว',
      staying: 'ฉันจะอยู่ 7 วัน',
      hotel: 'โรงแรมของฉันคือ...',
      exit: 'ทางออกอยู่ที่ไหน?',
      help: 'ช่วยฉันด้วย',
      taxi: 'ฉันต้องการแท็กซี่',
      ambulance: 'เรียกรถพยาบาล',
      doctor: 'ฉันต้องการหมอ',
      allergic: 'ฉันแพ้...',
      cost: 'ราคาเท่าไหร่?',
      address: 'พาฉันไปที่อยู่นี้',
    }),
  },
  {
    code: 'zh',
    name: 'Chinese',
    flag: '🇨🇳',
    categories: buildCategories({
      tourist: '我是游客',
      staying: '我要住7天',
      hotel: '我的酒店是...',
      exit: '出口在哪里?',
      help: '请帮帮我',
      taxi: '我需要出租车',
      ambulance: '请叫救护车',
      doctor: '我需要医生',
      allergic: '我对...过敏',
      cost: '这个多少钱?',
      address: '请带我去这个地址',
    }),
  },
  {
    code: 'ja',
    name: 'Japanese',
    flag: '🇯🇵',
    categories: buildCategories({
      tourist: '私は観光客です',
      staying: '7日間滞在します',
      hotel: '私のホテルは...です',
      exit: '出口はどこですか?',
      help: '助けてください',
      taxi: 'タクシーが必要です',
      ambulance: '救急車を呼んでください',
      doctor: '医者が必要です',
      allergic: '私は...アレルギーです',
      cost: 'これはいくらですか?',
      address: 'この住所までお願いします',
    }),
  },
  {
    code: 'en',
    name: 'English (Singapore)',
    flag: '🇸🇬',
    categories: buildCategories({
      tourist: 'I am a tourist',
      staying: 'I am staying for 7 days',
      hotel: 'My hotel is...',
      exit: 'Where is the exit?',
      help: 'Please help me',
      taxi: 'I need a taxi',
      ambulance: 'Call an ambulance',
      doctor: 'I need a doctor',
      allergic: 'I am allergic to...',
      cost: 'How much does this cost?',
      address: 'Take me to this address',
    }),
  },
];

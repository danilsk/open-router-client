export interface Language {
  name: string;
  native: string;
  code: string;
  nonLatin?: boolean;
  variants?: string[];
  flag: string;
}

export const LANGUAGES: Language[] = [
  { name: 'English', native: 'English', code: 'en', flag: '🇬🇧', variants: ['American', 'British', 'Australian', 'Canadian', 'Irish', 'Indian'] },
  { name: 'Spanish', native: 'Español', code: 'es', flag: '🇪🇸', variants: ['Spain', 'Mexico', 'Argentina', 'Colombia', 'Latin American (neutral)'] },
  { name: 'Georgian', native: 'ქართული', code: 'ka', flag: '🇬🇪', nonLatin: true },
  { name: 'French', native: 'Français', code: 'fr', flag: '🇫🇷', variants: ['France', 'Canada (Québec)', 'Belgium', 'Switzerland'] },
  { name: 'German', native: 'Deutsch', code: 'de', flag: '🇩🇪', variants: ['Germany', 'Austria', 'Switzerland'] },
  { name: 'Italian', native: 'Italiano', code: 'it', flag: '🇮🇹' },
  { name: 'Portuguese', native: 'Português', code: 'pt', flag: '🇵🇹', variants: ['Brazil', 'Portugal'] },
  { name: 'Russian', native: 'Русский', code: 'ru', flag: '🇷🇺', nonLatin: true },
  { name: 'Ukrainian', native: 'Українська', code: 'uk', flag: '🇺🇦', nonLatin: true },
  { name: 'Polish', native: 'Polski', code: 'pl', flag: '🇵🇱' },
  { name: 'Czech', native: 'Čeština', code: 'cs', flag: '🇨🇿' },
  { name: 'Dutch', native: 'Nederlands', code: 'nl', flag: '🇳🇱', variants: ['Netherlands', 'Belgium (Flemish)'] },
  { name: 'Swedish', native: 'Svenska', code: 'sv', flag: '🇸🇪' },
  { name: 'Norwegian', native: 'Norsk', code: 'no', flag: '🇳🇴' },
  { name: 'Danish', native: 'Dansk', code: 'da', flag: '🇩🇰' },
  { name: 'Finnish', native: 'Suomi', code: 'fi', flag: '🇫🇮' },
  { name: 'Greek', native: 'Ελληνικά', code: 'el', flag: '🇬🇷', nonLatin: true },
  { name: 'Turkish', native: 'Türkçe', code: 'tr', flag: '🇹🇷' },
  { name: 'Armenian', native: 'Հայերեն', code: 'hy', flag: '🇦🇲', nonLatin: true },
  { name: 'Azerbaijani', native: 'Azərbaycanca', code: 'az', flag: '🇦🇿' },
  { name: 'Hebrew', native: 'עברית', code: 'he', flag: '🇮🇱', nonLatin: true },
  { name: 'Arabic', native: 'العربية', code: 'ar', flag: '🇸🇦', nonLatin: true, variants: ['Modern Standard', 'Egyptian', 'Levantine', 'Gulf', 'Moroccan'] },
  { name: 'Persian', native: 'فارسی', code: 'fa', flag: '🇮🇷', nonLatin: true },
  { name: 'Hindi', native: 'हिन्दी', code: 'hi', flag: '🇮🇳', nonLatin: true },
  { name: 'Bengali', native: 'বাংলা', code: 'bn', flag: '🇧🇩', nonLatin: true },
  { name: 'Urdu', native: 'اردو', code: 'ur', flag: '🇵🇰', nonLatin: true },
  { name: 'Thai', native: 'ไทย', code: 'th', flag: '🇹🇭', nonLatin: true },
  { name: 'Vietnamese', native: 'Tiếng Việt', code: 'vi', flag: '🇻🇳' },
  { name: 'Indonesian', native: 'Bahasa Indonesia', code: 'id', flag: '🇮🇩' },
  { name: 'Malay', native: 'Bahasa Melayu', code: 'ms', flag: '🇲🇾' },
  { name: 'Tagalog', native: 'Tagalog', code: 'tl', flag: '🇵🇭' },
  { name: 'Chinese', native: '中文', code: 'zh', flag: '🇨🇳', nonLatin: true, variants: ['Mandarin (Simplified)', 'Mandarin (Traditional, Taiwan)', 'Cantonese'] },
  { name: 'Japanese', native: '日本語', code: 'ja', flag: '🇯🇵', nonLatin: true },
  { name: 'Korean', native: '한국어', code: 'ko', flag: '🇰🇷', nonLatin: true },
  { name: 'Hungarian', native: 'Magyar', code: 'hu', flag: '🇭🇺' },
  { name: 'Romanian', native: 'Română', code: 'ro', flag: '🇷🇴' },
  { name: 'Bulgarian', native: 'Български', code: 'bg', flag: '🇧🇬', nonLatin: true },
  { name: 'Serbian', native: 'Српски', code: 'sr', flag: '🇷🇸', nonLatin: true },
  { name: 'Croatian', native: 'Hrvatski', code: 'hr', flag: '🇭🇷' },
  { name: 'Catalan', native: 'Català', code: 'ca', flag: '🇦🇩' },
  { name: 'Swahili', native: 'Kiswahili', code: 'sw', flag: '🇰🇪' },
  { name: 'Kazakh', native: 'Қазақша', code: 'kk', flag: '🇰🇿', nonLatin: true },
  { name: 'Uzbek', native: 'Oʻzbekcha', code: 'uz', flag: '🇺🇿' },
];

export const LEVELS = [
  { id: 'A1', label: 'A1 · Beginner' },
  { id: 'A2', label: 'A2 · Elementary' },
  { id: 'B1', label: 'B1 · Intermediate' },
  { id: 'B2', label: 'B2 · Upper intermediate' },
  { id: 'C1', label: 'C1 · Advanced' },
  { id: 'C2', label: 'C2 · Mastery' },
];

export const findLanguage = (name: string) => LANGUAGES.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
export const langCode = (name: string) => findLanguage(name)?.code;
export const isNonLatin = (name: string) => findLanguage(name)?.nonLatin ?? false;
export const flagOf = (name: string) => findLanguage(name)?.flag ?? '🌐';

export interface Accent {
  id: string;
  label: string;
  language: string;
  locale?: string;
  flag: string;
  features: string;
}

export const ACCENTS: Accent[] = [
  { id: 'en-US', label: 'General American', language: 'English', locale: 'en-US', flag: '🇺🇸', features: 'rhotic R, flapped T (water → wader), cot–caught merger, TRAP vowel /æ/ in "can\'t", "dance"' },
  { id: 'en-GB', label: 'British (RP)', language: 'English', locale: 'en-GB', flag: '🇬🇧', features: 'non-rhotic (car → cah), TRAP–BATH split (bath /bɑː/), crisp T, GOAT vowel /əʊ/, LOT vowel /ɒ/' },
  { id: 'en-AU', label: 'Australian', language: 'English', locale: 'en-AU', flag: '🇦🇺', features: 'non-rhotic, raised/fronted vowels, FACE vowel /æɪ/, PRICE vowel /ɒe/, rising terminal intonation' },
  { id: 'en-IE', label: 'Irish', language: 'English', flag: '🇮🇪', features: 'rhotic R, dental TH (think → tink), clear L, monophthong FACE /eː/ and GOAT /oː/' },
  { id: 'en-SC', label: 'Scottish', language: 'English', flag: '🏴', features: 'tapped/trilled R, no FOOT–GOOSE contrast, monophthong FACE/GOAT, glottal stops' },
  { id: 'en-CA', label: 'Canadian', language: 'English', flag: '🇨🇦', features: 'rhotic, Canadian raising (about, write), cot–caught merger' },
  { id: 'en-IN', label: 'Indian English', language: 'English', locale: 'en-IN', flag: '🇮🇳', features: 'retroflex T/D, syllable-timed rhythm, monophthong vowels, clear R' },
  { id: 'es-ES', label: 'Castilian Spanish', language: 'Spanish', locale: 'es-ES', flag: '🇪🇸', features: 'distinción (z/ce/ci → /θ/), apical S, strong J /x/' },
  { id: 'es-MX', label: 'Mexican Spanish', language: 'Spanish', locale: 'es-MX', flag: '🇲🇽', features: 'seseo, clear consonants, intonation patterns of central Mexico' },
  { id: 'es-AR', label: 'Rioplatense Spanish', language: 'Spanish', flag: '🇦🇷', features: 'sheísmo (ll/y → /ʃ/), Italian-like intonation, voseo stress' },
  { id: 'fr-FR', label: 'Parisian French', language: 'French', locale: 'fr-FR', flag: '🇫🇷', features: 'uvular R, nasal vowels, liaison, final-syllable stress' },
  { id: 'pt-BR', label: 'Brazilian Portuguese', language: 'Portuguese', locale: 'pt-BR', flag: '🇧🇷', features: 'palatalized T/D before i (tia → chia), open vowels, nasal diphthongs' },
  { id: 'pt-PT', label: 'European Portuguese', language: 'Portuguese', locale: 'pt-PT', flag: '🇵🇹', features: 'vowel reduction, S → /ʃ/ at syllable end, closed vowels' },
  { id: 'de-DE', label: 'Standard German', language: 'German', locale: 'de-DE', flag: '🇩🇪', features: 'uvular R, final devoicing, ich-/ach-Laut, long vs short vowels' },
  { id: 'it-IT', label: 'Standard Italian', language: 'Italian', locale: 'it-IT', flag: '🇮🇹', features: 'double consonants, pure vowels, trilled R' },
];

export const findAccent = (id: string) => ACCENTS.find((a) => a.id === id);

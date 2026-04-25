export type LoremLanguage = 'english' | 'vietnamese' | 'spanish' | 'french' | 'german' | 'japanese' | 'chinese';

// ── Word banks ────────────────────────────────────────────────────────────────

const EN_WORDS = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
  'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
  'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
  'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come',
  'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how',
  'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
  'any', 'these', 'give', 'day', 'most', 'us', 'great', 'between', 'need',
  'large', 'often', 'hand', 'high', 'place', 'hold', 'turn', 'without',
  'follow', 'act', 'why', 'ask', 'men', 'change', 'went', 'light',
  'kind', 'off', 'play', 'spell', 'air', 'away', 'animal', 'house',
  'point', 'page', 'letter', 'mother', 'answer', 'found', 'study',
  'still', 'learn', 'plant', 'cover', 'food', 'sun', 'four', 'between',
  'state', 'keep', 'eye', 'never', 'last', 'let', 'thought', 'city',
  'tree', 'cross', 'farm', 'hard', 'start', 'might', 'story', 'saw',
  'far', 'sea', 'draw', 'left', 'late', 'run', 'while', 'press',
  'close', 'night', 'real', 'life', 'few', 'north', 'open', 'seem',
  'together', 'next', 'white', 'children', 'begin', 'got', 'walk',
  'example', 'ease', 'paper', 'group', 'always', 'music', 'those',
  'both', 'mark', 'until', 'mile', 'river', 'car', 'feet', 'care',
  'second', 'book', 'carry', 'took', 'science', 'eat', 'room', 'friend',
  'idea', 'body', 'fish', 'mountain', 'once', 'base', 'hear', 'horse',
  'cut', 'sure', 'watch', 'color', 'face', 'wood', 'main', 'enough',
  'plain', 'girl', 'usual', 'young', 'ready', 'above', 'ever', 'red',
  'list', 'though', 'feel', 'talk', 'bird', 'soon', 'dog', 'family',
  'direct', 'leave', 'song', 'measure', 'door', 'product', 'black',
  'short', 'class', 'wind', 'question', 'happen', 'complete', 'ship',
  'area', 'half', 'rock', 'order', 'fire', 'south', 'problem', 'piece',
  'told', 'knew', 'pass', 'since', 'top', 'whole', 'king', 'space',
  'heard', 'best', 'hour', 'better', 'true', 'during', 'hundred', 'five',
  'remember', 'step', 'early', 'west', 'ground', 'interest', 'reach',
  'fast', 'sing', 'listen', 'six', 'table', 'travel', 'less', 'morning',
  'ten', 'simple', 'several', 'toward', 'war', 'lay', 'against', 'pattern',
  'slow', 'center', 'love', 'person', 'money', 'serve', 'appear', 'road',
  'map', 'rain', 'rule', 'pull', 'cold', 'notice', 'voice', 'power',
  'town', 'fine', 'drive', 'dark', 'machine', 'note', 'wait', 'plan',
  'figure', 'star', 'field', 'rest', 'able', 'done', 'beauty', 'stood',
  'front', 'teach', 'week', 'final', 'gave', 'green', 'oh', 'quick',
  'develop', 'ocean', 'warm', 'free', 'minute', 'strong', 'special',
  'behind', 'clear', 'tail', 'produce', 'fact', 'street', 'inch',
  'multiply', 'nothing', 'course', 'stay', 'wheel', 'full', 'force',
  'blue', 'object', 'decide', 'surface', 'deep', 'moon', 'island',
  'foot', 'system', 'busy', 'test', 'record', 'boat', 'common', 'gold',
  'possible', 'plane', 'age', 'dry', 'wonder', 'laugh', 'thousand',
  'ran', 'check', 'game', 'shape', 'equate', 'hot', 'miss', 'brought',
  'heat', 'snow', 'tire', 'bring', 'yes', 'distant', 'fill', 'east',
  'paint', 'language', 'among', 'grand', 'ball', 'yet', 'wave', 'drop',
  'heart', 'am', 'present', 'heavy', 'dance', 'engine', 'position',
  'arm', 'wide', 'sail', 'material', 'size', 'vary', 'settle', 'speak',
  'weight', 'general', 'ice', 'matter', 'circle', 'pair', 'include',
  'divide', 'syllable', 'felt', 'perhaps', 'pick', 'sudden', 'count',
];

const VI_WORDS = [
  'và', 'của', 'là', 'có', 'được', 'trong', 'những', 'với', 'để', 'này',
  'đó', 'các', 'không', 'đã', 'một', 'về', 'cho', 'người', 'từ', 'như',
  'khi', 'đây', 'theo', 'ra', 'rất', 'tôi', 'thì', 'mà', 'nhưng', 'hay',
  'bạn', 'họ', 'chúng', 'sẽ', 'vì', 'nếu', 'còn', 'cũng', 'đến', 'lại',
  'thế', 'vẫn', 'sau', 'trên', 'làm', 'cần', 'nên', 'hơn', 'đi', 'biết',
  'hết', 'dù', 'bao', 'mình', 'chỉ', 'thời', 'gian', 'năm', 'ngày', 'lúc',
  'điều', 'việc', 'thấy', 'phải', 'qua', 'nói', 'cuộc', 'sống', 'đời',
  'nước', 'giới', 'mọi', 'người', 'xã', 'hội', 'đất', 'nước', 'công',
  'học', 'sinh', 'gia', 'đình', 'nhà', 'trường', 'bạn', 'bè', 'tình',
  'yêu', 'hạnh', 'phúc', 'thành', 'công', 'tương', 'lai', 'hiện', 'tại',
  'quá', 'khứ', 'kinh', 'nghiệm', 'tri', 'thức', 'phát', 'triển', 'sáng',
  'tạo', 'đổi', 'mới', 'tiến', 'bộ', 'khoa', 'học', 'công', 'nghệ',
  'môi', 'trường', 'thiên', 'nhiên', 'con', 'văn', 'hóa', 'nghệ', 'thuật',
  'âm', 'nhạc', 'thơ', 'ca', 'hội', 'họa', 'điện', 'ảnh', 'sách', 'báo',
  'tin', 'tức', 'thông', 'truyền', 'mạng', 'kỹ', 'năng', 'giáo', 'dục',
  'đào', 'tạo', 'nghiên', 'cứu', 'phân', 'tích', 'đánh', 'giá', 'kết',
  'quả', 'mục', 'tiêu', 'kế', 'hoạch', 'chiến', 'lược', 'giải', 'pháp',
  'thực', 'hiện', 'quản', 'lý', 'lãnh', 'đạo', 'hợp', 'tác', 'đối',
  'doanh', 'nghiệp', 'kinh', 'doanh', 'thị', 'sản', 'phẩm', 'dịch', 'vụ',
  'khách', 'hàng', 'chất', 'lượng', 'hiệu', 'lợi', 'ích', 'giá', 'trị',
  'ý', 'nghĩa', 'tầm', 'quan', 'trọng', 'cơ', 'hội', 'thách', 'thức',
  'khó', 'khăn', 'vấn', 'đề', 'quyết', 'xử', 'phòng', 'ngừa', 'bảo',
  'vệ', 'an', 'toàn', 'sức', 'khỏe', 'bệnh', 'viện', 'thuốc', 'điều',
  'trị', 'phục', 'hồi', 'tăng', 'trưởng', 'bền', 'vững', 'xanh', 'sạch',
  'đẹp', 'tốt', 'hiện', 'đại', 'văn', 'minh', 'tiên', 'tiến', 'thịnh',
  'vượng', 'phồn', 'vinh', 'dân', 'tộc', 'lịch', 'sử', 'truyền', 'thống',
  'bản', 'sắc', 'cộng', 'đồng', 'liên', 'kết', 'chia', 'sẻ', 'yêu',
  'thương', 'nhân', 'ái', 'trách', 'nhiệm', 'đóng', 'góp', 'xây', 'dựng',
  'phát', 'huy', 'tinh', 'thần', 'nỗ', 'lực', 'cố', 'gắng', 'vươn', 'lên',
];

const ES_WORDS = [
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'en', 'y', 'a',
  'que', 'es', 'por', 'con', 'no', 'su', 'sus', 'como', 'pero', 'al',
  'lo', 'se', 'más', 'yo', 'mi', 'si', 'hay', 'muy', 'me', 'este',
  'fue', 'ser', 'son', 'del', 'tiene', 'para', 'bien', 'hasta', 'todo',
  'ha', 'ya', 'uno', 'cuando', 'sobre', 'años', 'también', 'otro',
  'estar', 'entre', 'así', 'tiempo', 'donde', 'mayor', 'forma', 'país',
  'lugar', 'parte', 'vida', 'mundo', 'hacer', 'poder', 'querer', 'dar',
  'gran', 'mismo', 'cada', 'tanto', 'nuevo', 'bajo', 'sin', 'ella',
  'solo', 'aquí', 'dentro', 'fuera', 'antes', 'después', 'algo', 'nada',
  'siempre', 'nunca', 'todos', 'muchos', 'poco', 'mucho', 'noche', 'día',
  'trabajo', 'casa', 'familia', 'ciudad', 'gente', 'amor', 'agua', 'luz',
  'nombre', 'voz', 'ojo', 'mano', 'cabeza', 'corazón', 'alma', 'camino',
  'cielo', 'tierra', 'mar', 'sol', 'luna', 'flor', 'árbol', 'montaña',
  'río', 'viento', 'fuego', 'piedra', 'nube', 'sueño', 'esperanza', 'fe',
  'paz', 'guerra', 'historia', 'cultura', 'arte', 'música', 'libro',
  'palabra', 'verdad', 'mentira', 'bien', 'mal', 'miedo', 'alegría',
  'tristeza', 'fuerza', 'poder', 'libertad', 'justicia', 'razón', 'ideas',
  'pensamiento', 'momento', 'número', 'pueblo', 'gobierno', 'ley', 'orden',
  'cambio', 'futuro', 'pasado', 'presente', 'realidad', 'posible', 'claro',
  'grande', 'pequeño', 'largo', 'corto', 'nuevo', 'viejo', 'joven', 'mejor',
  'peor', 'primero', 'último', 'durante', 'mientras', 'aunque', 'porque',
  'sino', 'pues', 'entonces', 'ahora', 'luego', 'tarde', 'temprano',
  'junto', 'través', 'manera', 'vez', 'caso', 'hecho', 'punto', 'tipo',
  'persona', 'hombre', 'mujer', 'niño', 'amigo', 'madre', 'padre', 'hijo',
];

const FR_WORDS = [
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'en',
  'est', 'que', 'qui', 'pas', 'ne', 'il', 'je', 'tu', 'nous', 'vous',
  'ils', 'sur', 'avec', 'dans', 'par', 'pour', 'au', 'aux', 'mais',
  'ou', 'donc', 'car', 'aussi', 'plus', 'très', 'bien', 'même', 'encore',
  'tout', 'tous', 'autre', 'peu', 'ici', 'maintenant', 'toujours', 'après',
  'avant', 'depuis', 'pendant', 'entre', 'sans', 'vers', 'sous', 'contre',
  'monde', 'temps', 'fois', 'vie', 'homme', 'femme', 'enfant', 'pays',
  'ville', 'maison', 'jour', 'nuit', 'matin', 'soir', 'an', 'année',
  'travail', 'famille', 'ami', 'amour', 'eau', 'lumière', 'nom', 'voix',
  'main', 'tête', 'cœur', 'âme', 'chemin', 'ciel', 'terre', 'mer',
  'soleil', 'lune', 'fleur', 'arbre', 'montagne', 'rivière', 'vent',
  'feu', 'pierre', 'nuage', 'rêve', 'espoir', 'foi', 'paix', 'guerre',
  'histoire', 'culture', 'art', 'musique', 'livre', 'mot', 'vérité',
  'liberté', 'justice', 'raison', 'pensée', 'moment', 'peuple', 'loi',
  'ordre', 'changement', 'futur', 'passé', 'présent', 'réalité', 'possible',
  'grand', 'petit', 'long', 'court', 'nouveau', 'vieux', 'jeune', 'meilleur',
  'premier', 'dernier', 'pendant', 'alors', 'maintenant', 'tard', 'tôt',
  'ensemble', 'manière', 'chose', 'fait', 'point', 'type', 'personne',
  'mère', 'père', 'fils', 'fille', 'gouvernement', 'société', 'corps',
  'idée', 'force', 'pouvoir', 'joie', 'tristesse', 'peur', 'danger',
  'nature', 'science', 'technologie', 'éducation', 'santé', 'argent',
  'question', 'réponse', 'problème', 'solution', 'place', 'route', 'voyage',
  'couleur', 'forme', 'bruit', 'silence', 'regard', 'sourire', 'larme',
];

const DE_WORDS = [
  'der', 'die', 'das', 'ein', 'eine', 'und', 'in', 'ist', 'von', 'mit',
  'nicht', 'zu', 'es', 'er', 'sie', 'wir', 'ich', 'du', 'auf', 'an',
  'für', 'dem', 'den', 'im', 'als', 'auch', 'sich', 'war', 'dass', 'so',
  'aber', 'noch', 'nach', 'bei', 'um', 'durch', 'kann', 'wenn', 'dann',
  'werden', 'bis', 'sehr', 'wie', 'vor', 'über', 'unter', 'muss', 'kein',
  'mehr', 'schon', 'hier', 'jetzt', 'immer', 'gut', 'neu', 'groß', 'man',
  'Jahr', 'Zeit', 'Welt', 'Mensch', 'Arbeit', 'Tag', 'Land', 'Haus',
  'Kind', 'Leben', 'Stadt', 'Weg', 'Hand', 'Recht', 'Teil', 'Abend',
  'Nacht', 'Morgen', 'Wort', 'Buch', 'Geld', 'Baum', 'Liebe', 'Herz',
  'Seele', 'Kraft', 'Freund', 'Familie', 'Mutter', 'Vater', 'Sohn',
  'Tochter', 'Himmel', 'Erde', 'Meer', 'Sonne', 'Mond', 'Stern', 'Licht',
  'Feuer', 'Wasser', 'Luft', 'Blume', 'Baum', 'Berg', 'Fluss', 'Wind',
  'Traum', 'Hoffnung', 'Glaube', 'Frieden', 'Krieg', 'Geschichte',
  'Kultur', 'Kunst', 'Musik', 'Wahrheit', 'Freiheit', 'Gerechtigkeit',
  'Gedanke', 'Moment', 'Volk', 'Gesetz', 'Ordnung', 'Wandel', 'Zukunft',
  'Vergangenheit', 'Gegenwart', 'Wirklichkeit', 'Möglichkeit', 'Freude',
  'Trauer', 'Angst', 'Stille', 'Stärke', 'Natur', 'Wissenschaft',
  'Technik', 'Bildung', 'Gesundheit', 'Frage', 'Antwort', 'Problem',
  'Lösung', 'Platz', 'Reise', 'Farbe', 'Form', 'Stimme', 'Lächeln',
  'klein', 'lang', 'kurz', 'alt', 'jung', 'erste', 'letzte', 'gemeinsam',
  'einfach', 'schwer', 'wichtig', 'schön', 'wahr', 'frei', 'stark',
  'offen', 'tief', 'hoch', 'schnell', 'langsam', 'früh', 'spät',
];

// Japanese uses no spaces between words; tokens are joined with ''
const JA_WORDS = [
  '今日', '明日', '昨日', '時間', '場所', '人', '仕事', '学校', '友達', '家族',
  '言葉', '気持ち', '心', '体', '頭', '手', '足', '目', '声', '夢',
  '希望', '愛', '幸せ', '未来', '過去', '現在', '社会', '世界', '文化',
  '自然', '科学', '技術', '生活', '経験', '知識', '思い', '感情', '理由',
  '方法', '問題', '答え', '力', '夜', '朝', '空', '海', '山', '道',
  '光', '水', '音', '色', '花', '木', '鳥', '魚', '人生', '平和',
  '自由', '美', '真実', '友情', '信頼', '勇気', '笑顔', '涙', '時代',
  '歴史', '文明', '国', '町', '村', '川', '森', '星', '月', '太陽',
  '風', '雨', '雪', '火', '土', '春', '夏', '秋', '冬', '朝日',
  '夕日', '夜明け', '夕暮れ', '宇宙', '地球', '命', '旅', '出会い',
  '別れ', '記憶', '忘れ', '始まり', '終わり', '変化', '成長', '挑戦',
  '努力', '才能', '夢中', '情熱', '誠実', '謙虚', '感謝', '思いやり',
  '共感', '創造', '発見', '革新', '協力', '連帯', '調和', '幸運',
];

// Chinese uses no spaces between words; tokens are joined with ''
const ZH_WORDS = [
  '今天', '明天', '昨天', '时间', '地方', '人', '工作', '学校', '朋友', '家人',
  '语言', '心情', '心', '身体', '头', '手', '脚', '眼睛', '声音', '梦想',
  '希望', '爱', '幸福', '未来', '过去', '现在', '社会', '世界', '文化',
  '自然', '科学', '技术', '生活', '经验', '知识', '感情', '理由', '方法',
  '问题', '答案', '力量', '夜晚', '早上', '天空', '大海', '山', '路',
  '光', '水', '声音', '颜色', '花', '树', '鸟', '鱼', '人生', '和平',
  '自由', '美丽', '真理', '思想', '友谊', '信任', '勇气', '笑容', '眼泪',
  '时代', '历史', '文明', '国家', '城市', '村庄', '河流', '森林', '星星',
  '月亮', '太阳', '风', '雨', '雪', '火', '土地', '春天', '夏天', '秋天',
  '冬天', '宇宙', '地球', '生命', '旅行', '相遇', '离别', '记忆', '遗忘',
  '开始', '结束', '变化', '成长', '挑战', '努力', '才华', '热情', '诚实',
  '谦虚', '感恩', '关怀', '创造', '发现', '创新', '合作', '团结', '幸运',
  '智慧', '善良', '勤奋', '坚持', '梦想', '目标', '精神', '气质', '品格',
];

// ── Language config ───────────────────────────────────────────────────────────

interface LangConfig {
  words: string[];
  /** Character placed between words within a sentence */
  joinChar: string;
  /** Sentence terminator */
  terminator: string;
}

export const LANG_CONFIG: Record<LoremLanguage, LangConfig> = {
  english:    { words: EN_WORDS, joinChar: ' ', terminator: '.' },
  vietnamese: { words: VI_WORDS, joinChar: ' ', terminator: '.' },
  spanish:    { words: ES_WORDS, joinChar: ' ', terminator: '.' },
  french:     { words: FR_WORDS, joinChar: ' ', terminator: '.' },
  german:     { words: DE_WORDS, joinChar: ' ', terminator: '.' },
  japanese:   { words: JA_WORDS, joinChar: '', terminator: '。' },
  chinese:    { words: ZH_WORDS, joinChar: '', terminator: '。' },
};

// ── Core helpers ──────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function buildSentence(config: LangConfig, wordCount: number): string {
  const tokens: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    tokens.push(pick(config.words));
  }
  const body = tokens.join(config.joinChar);
  const result = config.joinChar === ' ' ? capitalize(body) : body;
  return result + config.terminator;
}

export function buildParagraph(config: LangConfig, totalWords: number): string {
  const sentences: string[] = [];
  let remaining = totalWords;
  while (remaining > 0) {
    const len = Math.min(remaining, Math.floor(Math.random() * 10) + 6);
    sentences.push(buildSentence(config, len));
    remaining -= len;
  }
  return sentences.join(config.joinChar === ' ' ? ' ' : '');
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateText(language: LoremLanguage, wordCount: number, paragraphCount: number): string {
  const config = LANG_CONFIG[language];
  const wordsPerParagraph = Math.max(1, Math.round(wordCount / paragraphCount));
  const paragraphs: string[] = [];
  let remaining = wordCount;
  for (let i = 0; i < paragraphCount; i++) {
    const pw = i < paragraphCount - 1 ? wordsPerParagraph : Math.max(1, remaining);
    paragraphs.push(buildParagraph(config, pw));
    remaining -= wordsPerParagraph;
  }
  return paragraphs.join('\n\n');
}

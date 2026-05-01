// Per-locale override pools for FieldTypes where @faker-js/faker has poor or
// no localized data and silently falls back to English. Empirically determined
// by sampling each (locale, field) combination — see probe in dev history.
//
// Scope is intentionally narrow: only fields that visibly produce English text
// when the user has selected vi/ja. Brand-name fields (Manufacturer, Model,
// Vehicle), system identifiers (URL, Email, IP, Username, FileName, MimeType,
// SKU, UUID, MAC), and finance fields (CreditCard*, Bitcoin*) are left to
// faker — those are global/Latin by convention.

import type { Faker } from '@faker-js/faker';
import type { FieldType } from '../types';
import type { MockLocale } from './mockDataGenerator';

type OverrideValue = readonly string[] | ((fk: Faker) => string);

const VI_PRODUCT_ADJ = ['Cao cấp', 'Sang trọng', 'Tinh tế', 'Bền bỉ', 'Tiện lợi', 'Tự nhiên', 'Hiện đại', 'Cổ điển', 'Đa năng', 'Mềm mại', 'Mạnh mẽ', 'Thanh lịch'] as const;
const VI_PRODUCT_MATERIAL = ['Gỗ', 'Kim loại', 'Nhựa', 'Vải', 'Da', 'Thủy tinh', 'Gốm sứ', 'Tre', 'Cao su', 'Bông', 'Nhôm', 'Thép'] as const;
const VI_PRODUCT = ['Áo', 'Quần', 'Giày', 'Túi xách', 'Đồng hồ', 'Điện thoại', 'Máy tính', 'Bàn', 'Ghế', 'Đèn', 'Sách', 'Mũ', 'Khăn', 'Ấm trà'] as const;

const JA_PRODUCT_ADJ = ['上質な', '高級な', 'シンプルな', 'モダンな', '伝統的な', '快適な', '優雅な', '丈夫な', '軽量な', 'スタイリッシュな', '実用的な', '繊細な'] as const;
const JA_PRODUCT_MATERIAL = ['木材', '金属', 'プラスチック', '布', '革', 'ガラス', '陶器', '竹', 'ゴム', '綿', 'アルミニウム', '鋼'] as const;
const JA_PRODUCT = ['シャツ', 'ズボン', '靴', 'バッグ', '時計', '電話', 'パソコン', 'テーブル', '椅子', 'ランプ', '本', '帽子', 'タオル', '湯呑み'] as const;

const pick = <T,>(fk: Faker, list: readonly T[]): T => fk.helpers.arrayElement(list as T[]);

const viDescription = (fk: Faker): string => {
  const product = pick(fk, VI_PRODUCT).toLowerCase();
  const adj = pick(fk, VI_PRODUCT_ADJ).toLowerCase();
  const material = pick(fk, VI_PRODUCT_MATERIAL).toLowerCase();
  const templates = [
    `${pick(fk, VI_PRODUCT)} ${adj} được làm từ ${material}, mang lại sự thoải mái và phong cách cho người dùng.`,
    `Sản phẩm ${product} với chất liệu ${material} cao cấp, thiết kế ${adj} và bền bỉ theo thời gian.`,
    `${pick(fk, VI_PRODUCT)} bằng ${material} — lựa chọn hoàn hảo cho gia đình hiện đại, phong cách ${adj}.`,
    `Được chế tác từ ${material} chọn lọc, ${product} này nổi bật với thiết kế ${adj} và độ bền vượt trội.`,
  ];
  return pick(fk, templates);
};

const jaDescription = (fk: Faker): string => {
  const product = pick(fk, JA_PRODUCT);
  const adj = pick(fk, JA_PRODUCT_ADJ);
  const material = pick(fk, JA_PRODUCT_MATERIAL);
  const templates = [
    `${material}を使用した${adj}${product}。日常生活に最適です。`,
    `高品質な${material}で作られた${product}は、${adj}デザインで人気です。`,
    `${adj}${product}は、${material}の質感が魅力です。`,
    `毎日を彩る${adj}${product}。素材には${material}を使用しています。`,
  ];
  return pick(fk, templates);
};

export const LOCALE_OVERRIDES: Partial<Record<MockLocale, Partial<Record<FieldType, OverrideValue>>>> = {
  vi: {
    Color: ['đỏ', 'xanh dương', 'xanh lá', 'vàng', 'tím', 'cam', 'hồng', 'nâu', 'đen', 'trắng', 'xám', 'be'],
    Department: ['Điện tử', 'Thời trang', 'Thực phẩm', 'Nhà cửa', 'Sách', 'Đồ chơi', 'Thể thao', 'Sức khỏe', 'Làm đẹp', 'Ô tô & Xe máy', 'Văn phòng phẩm', 'Mẹ & Bé'],
    ProductAdjective: VI_PRODUCT_ADJ,
    ProductMaterial: VI_PRODUCT_MATERIAL,
    Product: VI_PRODUCT,
    ProductName: (fk) => `${pick(fk, VI_PRODUCT)} ${pick(fk, VI_PRODUCT_ADJ)} bằng ${pick(fk, VI_PRODUCT_MATERIAL).toLowerCase()}`,
    ProductDescription: viDescription,
    AnimalType: ['mèo', 'chó', 'thỏ', 'chim', 'cá', 'hươu', 'sư tử', 'voi', 'khỉ', 'gấu', 'cáo', 'sói', 'ngựa', 'bò'],
    Prefix: ['Anh', 'Chị', 'Ông', 'Bà', 'Cô', 'Chú', 'Em'],
    Suffix: [''],
    JobTitle: ['Kỹ sư phần mềm', 'Nhân viên kinh doanh', 'Quản lý dự án', 'Kế toán trưởng', 'Giám đốc nhân sự', 'Trưởng phòng marketing', 'Chuyên viên tư vấn', 'Lập trình viên', 'Nhà thiết kế đồ họa', 'Bác sĩ', 'Giáo viên', 'Luật sư', 'Kiến trúc sư', 'Nhân viên ngân hàng'],
    Gender: ['Nam', 'Nữ', 'Khác'],
  },
  ja: {
    Department: ['電子機器', 'ファッション', '食品', '家具', '本', 'おもちゃ', 'スポーツ', '健康', '美容', '自動車', '文房具', 'ベビー用品'],
    ProductAdjective: JA_PRODUCT_ADJ,
    ProductMaterial: JA_PRODUCT_MATERIAL,
    Product: JA_PRODUCT,
    ProductName: (fk) => `${pick(fk, JA_PRODUCT_MATERIAL)}の${pick(fk, JA_PRODUCT_ADJ)}${pick(fk, JA_PRODUCT)}`,
    ProductDescription: jaDescription,
    AnimalType: ['猫', '犬', 'うさぎ', '鳥', '魚', '鹿', 'ライオン', '象', '猿', '熊', 'きつね', '狼', '馬', '牛'],
    Prefix: ['さん', '様', '先生', '君', 'ちゃん'],
    JobTitle: ['ソフトウェアエンジニア', '営業担当', 'プロジェクトマネージャー', '会計士', '人事部長', 'マーケティングマネージャー', 'コンサルタント', 'プログラマー', 'デザイナー', '医師', '教師', '弁護士', '建築家', '銀行員'],
    Gender: ['男性', '女性', 'その他'],
  },
};

export function getLocaleOverride(locale: MockLocale, field: FieldType, fk: Faker): string | null {
  const override = LOCALE_OVERRIDES[locale]?.[field];
  if (override === undefined) return null;
  if (typeof override === 'function') return override(fk);
  return pick(fk, override);
}

export type ClientCategory = "shein" | "chino" | "local";

export const CLIENT_CATEGORY_LABELS: Record<ClientCategory, string> = {
  shein: "SHEIN",
  chino: "CHINO",
  local: "LOCAL",
};

/** Distinct from the delivered/failed/pending status palette (green/red/blue) used elsewhere. */
export const CLIENT_CATEGORY_COLORS: Record<ClientCategory, string> = {
  shein: "#111827",
  chino: "#d97706",
  local: "#0d9488",
};

// CJK Unified Ideographs, Hiragana/Katakana, and Hangul Syllables.
const CJK_REGEX = /[一-鿿぀-ヿ가-힯]/;

const CHINESE_COURIERS = ["yun express", "yanwen", "sf express", "shunyou"];

/** Common Chinese-surname romanizations — matched as a whole token against the seller name. */
const PINYIN_SURNAMES = new Set([
  "wang", "li", "zhang", "liu", "chen", "yang", "huang", "zhao", "wu", "zhou", "xu", "sun", "ma", "zhu",
  "hu", "guo", "he", "gao", "lin", "luo", "zheng", "liang", "xie", "song", "tang", "han", "cao", "deng",
  "feng", "peng", "zeng", "cai", "pan", "yuan", "yu", "dong", "yao", "shen", "jiang", "cui", "tan", "lu",
  "fan", "liao", "jia", "xia", "wei", "fu", "fang", "zou", "meng", "shi", "xiong", "qin", "qiu", "jin", "du",
]);

function hasPinyinSurname(sellerName: string): boolean {
  const tokens = sellerName.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
  return tokens.some((t) => PINYIN_SURNAMES.has(t));
}

/**
 * SHEIN packages come through "Infinite Remit" regardless of market/seller
 * naming, so that check wins outright. Everything else is flagged as a
 * Chinese client by CJK script, a recognized Chinese-surname romanization, a
 * Chinese courier name, or a Chinese marketplace (AliExpress/Temu); anything
 * left over is a local client.
 */
export function classifyClient(marketPlaceName: string, sellerName: string): ClientCategory {
  const market = marketPlaceName.toLowerCase();
  const seller = sellerName.toLowerCase();

  if (market.includes("infinite remit") || seller.includes("infinite remit")) return "shein";

  const combined = `${market} ${seller}`;
  const isChinese =
    CJK_REGEX.test(marketPlaceName) ||
    CJK_REGEX.test(sellerName) ||
    hasPinyinSurname(sellerName) ||
    CHINESE_COURIERS.some((courier) => combined.includes(courier)) ||
    combined.includes("aliexpress") ||
    combined.includes("temu");

  return isChinese ? "chino" : "local";
}

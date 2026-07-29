import {
  CONSTRUCTION_MANAGEMENT_PATTERNS,
  DOMAINS,
  type DomainId,
  type DomainKnowledge,
} from "@/constant/domain-knowledge";

/**
 * 依契約內容挑選領域知識（純函式，無 I/O，便於單元測試）。
 *
 * 為何要挑而不是全給 ——
 * 六個領域的詞彙全塞進提示詞約兩千字，既排擠契約本文的篇幅，
 * 也會讓模型看到橋梁詞彙而在污水廠契約裡冒出「橋台施作」。
 * 只注入命中的那一組，提示詞短、干擾也少。
 */

export type DomainMatch = {
  domain: DomainKnowledge | null;
  /** 命中的關鍵詞，供說明判斷依據。 */
  hits: string[];
  /** 是否為工程施作契約（相對於委託專業服務）。 */
  isConstruction: boolean;
};

/** 命中門檻：至少要有一個關鍵詞，避免無依據地套用某領域。 */
export const MIN_HITS = 1;

/**
 * 由契約文字判斷所屬領域。
 *
 * 以關鍵詞出現「次數」而非「種類」計分：契約標題與工程概要會反覆
 * 提到主要標的，次數比種類更能反映主題。同分時取排序在前者，
 * 讓結果穩定可預期。
 */
export function matchDomain(text: string | null | undefined): DomainMatch {
  const source = text ?? "";
  if (!source.trim()) {
    return { domain: null, hits: [], isConstruction: false };
  }

  let best: { domain: DomainKnowledge; score: number; hits: string[] } | null =
    null;

  for (const domain of DOMAINS) {
    const hits: string[] = [];
    let score = 0;
    for (const keyword of domain.keywords) {
      // 逐次計數：split 比 RegExp 安全，關鍵詞含括號等字元時不必跳脫
      const count = source.split(keyword).length - 1;
      if (count > 0) {
        hits.push(keyword);
        score += count;
      }
    }
    if (hits.length >= MIN_HITS && (!best || score > best.score)) {
      best = { domain, score, hits };
    }
  }

  if (!best) return { domain: null, hits: [], isConstruction: false };
  return {
    domain: best.domain,
    hits: best.hits,
    isConstruction: best.domain.id !== "service",
  };
}

/** 提示詞中每類詞彙最多列出幾項，避免灌爆篇幅。 */
export const MAX_TERMS_PER_GROUP = 14;

/**
 * 參考工程分項的注入上限。
 *
 * 知識庫有五百多項，全數注入約六千字，會排擠契約本文的篇幅，
 * 也讓模型在一堆不相關的分項裡挑選。改為依契約內文計分後只取前段。
 */
export const MAX_WORK_ITEM_HINTS = 30;

/**
 * 依契約內文挑出相關的參考工程分項。
 *
 * 計分方式：把分項名稱切成二字詞，數有幾個出現在契約中。
 * 二字詞是中文工程術語的自然單位（沉箱、澆置、護岸、刮泥），
 * 比整串比對寬鬆（契約不會出現「沉箱第一單元下沉作業」這串完整字），
 * 又比單字比對嚴格（單字「水」「工」會讓幾乎所有項目都命中）。
 */
export function rankWorkItems(
  items: string[],
  text: string | null | undefined,
  max: number = MAX_WORK_ITEM_HINTS,
): string[] {
  const source = text ?? "";
  if (!source.trim() || items.length === 0) return items.slice(0, max);

  const scored = items.map((item, index) => {
    let score = 0;
    for (let i = 0; i + 2 <= item.length; i += 1) {
      const bigram = item.slice(i, i + 2);
      if (source.includes(bigram)) score += 1;
    }
    // index 作為次要鍵：同分時維持原始順序，結果穩定可預期
    return { item, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  // 完全沒命中的項目不注入 —— 給無關的分項只會誤導
  const hit = scored.filter((s) => s.score > 0);
  const pool = hit.length > 0 ? hit : scored;
  return pool.slice(0, max).map((s) => s.item);
}

const list = (items: string[]) =>
  items.slice(0, MAX_TERMS_PER_GROUP).join("、");

/**
 * 組出要注入提示詞的領域知識段落。
 *
 * 措辭刻意是「參考用語」而非「應輸出的項目」——
 * 這是詞彙庫，不是答案；契約沒提到的構造物不該因為列在這裡就被寫出來。
 */
export function domainBrief(
  match: DomainMatch,
  /** 契約內文；用於挑出相關的參考分項。未給則只列詞彙。 */
  contractText?: string | null,
): string | null {
  const d = match.domain;
  if (!d) return null;

  const parts: string[] = [
    `【領域參考：${d.label}】以下是這類工程的實務用語，僅供你選用貼近實務的說法，` +
      `**不是應輸出的清單** —— 契約沒提到的項目一律不得寫入。`,
  ];
  if (d.structures.length) {
    parts.push(`常見構造物／單元：${list(d.structures)}`);
  }
  if (d.sequences.length) {
    parts.push(`常見工序：${list(d.sequences)}`);
  }
  if (d.equipment.length) {
    parts.push(`常見設備／材料（多需送審與檢驗）：${list(d.equipment)}`);
  }
  if (d.workItems.length && contractText) {
    const picked = rankWorkItems(d.workItems, contractText);
    if (picked.length) {
      parts.push(
        `與本契約較相關的參考工程分項（共 ${d.workItems.length} 項中取 ${picked.length} 項）：\n` +
          picked.map((w) => `- ${w}`).join("\n"),
      );
    }
  }
  return parts.join("\n");
}

/**
 * 工程分項的組織方式說明。
 *
 * 真實監造報告顯示分項是「構造物單元 × 工序」，例如
 * 「沉箱第一單元下沉作業」「沉箱第二單元內模組立」——
 * 而非泛用的「沉箱工程」。單元編號是實務上排程與計價的最小單位。
 */
export function workItemShapeBrief(match: DomainMatch): string | null {
  if (!match.isConstruction) return null;
  return [
    "【工程分項的組織方式】",
    "施作類契約的工程分項應為「構造物單元 × 工序」，而非只寫構造物或只寫工序。",
    "例如「沉箱第一單元下沉作業」「沉箱第二單元內模組立」「聯合機房地盤改良」，",
    "而不是籠統的「沉箱工程」或泛用的「鋼筋組立」。",
    "契約若把構造物分為數個單元或分區（第一單元、第二單元、A 區、B 區），",
    "請逐一展開 —— 那是實務上排程、查驗與估驗計價的最小單位。",
  ].join("\n");
}

/**
 * 施作契約常見的管理類履約事項。
 *
 * 一律附上「須有契約依據」的限制：這些是實務慣例，不是必然義務。
 * 少了這個限制，模型會把慣例當契約義務寫進去，使用者無從分辨。
 */
export function managementPatternBrief(match: DomainMatch): string | null {
  if (!match.isConstruction) return null;
  return [
    "【施作契約常見的管理類應辦事項】以下型態在公共工程契約中普遍存在，",
    "請逐項回到契約查證：**找得到對應條款才列入，找不到就不列**。",
    ...CONSTRUCTION_MANAGEMENT_PATTERNS.map((p) => `- ${p}`),
    "契約常以「表定提送日期」訂定各項計畫書與材料設備的送審期限，",
    "送審未通過者須於期限內再次提送 —— 這類期限即為履約事項的期限來源。",
  ].join("\n");
}

/** 供進度回報說明判讀依據。 */
export function describeMatch(match: DomainMatch): string | null {
  if (!match.domain) return null;
  return `依契約用語判定為「${match.domain.label}」（命中：${match.hits
    .slice(0, 4)
    .join("、")}）`;
}

/** 供測試與除錯：列出所有領域 id。 */
export function domainIds(): DomainId[] {
  return DOMAINS.map((d) => d.id);
}

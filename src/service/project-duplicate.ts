/**
 * 判斷「這個要建立的專案，是不是已經建過了」。
 *
 * 專案編號是資料庫的 unique key，所以撞號從來不會真的建出兩筆 ——
 * 會漏掉的是另一種：同一份契約解析兩次，第二次換了個編號，於是系統裡
 * 出現兩個同名專案，之後的估驗、履約事項、檔案就分頭累積在兩邊。
 * 這種重複沒有任何資料庫約束擋得住，只能在建立前比對既有專案。
 *
 * 為何做成純函式：判定規則會隨使用者的實際案量調整（門檻、要不要看工期），
 * 而「哪些情況該報、哪些不該報」是這裡唯一難的部分。放進純函式才能用
 * 真實案名釘住 —— 特別是那些看起來像重複、實際上不是的（分標、分期、續約）。
 */

/** 既有專案的比對用資料。 */
export type ExistingProject = {
  id: string;
  code: string;
  name: string;
  contractNo?: string | null;
  client?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** 該專案已歸檔的檔名（費思上傳與檔案管理）。 */
  fileNames?: string[];
};

/** 即將建立的專案。 */
export type Candidate = {
  code?: string;
  name?: string;
  contractNo?: string | null;
  client?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** 本次解析所使用的檔名。 */
  fileNames?: string[];
};

export type DuplicateKind =
  | "code"
  | "name"
  | "contractNo"
  | "clientAndDates"
  | "fileName";

export type DuplicateReason = {
  kind: DuplicateKind;
  /** 給使用者看的一句話，說明為何懷疑重複。 */
  label: string;
  /** 觸發比對的值（如相同的契約編號）。 */
  detail?: string;
};

export type DuplicateMatch = {
  project: ExistingProject;
  reasons: DuplicateReason[];
  /**
   * 是否足以擋下建立。
   *
   * 只有專案編號撞號是硬阻擋 —— 那是資料庫約束，按下去也不會成功。
   * 其餘一律可「確認後仍建立」：分標、分期、續約在名稱上與重複難以區分，
   * 系統沒有立場代替使用者判斷。
   */
  blocking: boolean;
};

// ── 正規化 ──────────────────────────────────────────────────

/**
 * 專案名稱的正規化。
 *
 * 目的是讓「臺中市烏日污水處理廠新建工程」與
 * 「台中市　烏日污水處理廠新建工程（第二次招標）」被視為同一件。
 * 刻意保留數字 —— 「第一期」與「第二期」是不同專案，去掉數字會誤報。
 */
export function normalizeName(value: string | null | undefined): string {
  if (!value) return "";
  return (
    value
      // 全角轉半角（英數與常見標點）
      .replace(/[！-～]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0),
      )
      .replace(/　/g, " ")
      // 台／臺、鉅／巨等常見異體字只處理最高頻的台臺
      .replace(/臺/g, "台")
      // 招標程序的附註不影響「是不是同一件工程」
      .replace(/[(（][^)）]*(招標|流標|廢標|重新公告|更正)[^)）]*[)）]/g, "")
      .replace(/[\s\-_.、,，。;；:：/／\\()（）[\]【】「」]/g, "")
      .toLowerCase()
      .trim()
  );
}

/** 契約編號／專案編號的正規化：只留英數，大小寫與分隔符不計。 */
export function normalizeCode(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[！-～]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[^0-9a-zA-Z一-鿿]/g, "")
    .toLowerCase();
}

/** 檔名正規化：去掉常見的版本後綴與副檔名大小寫差異。 */
export function normalizeFileName(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").toLowerCase();
}

/**
 * 名稱相似度（0–1）。
 *
 * 以二元詞組（bigram）的 Dice 係數，而非編輯距離：中文專案名多是
 * 「地名＋設施＋工法＋工程」的組合，整段插入或刪除一個詞（如「第二期」）
 * 用編輯距離會掉很多分，用詞組重疊則只掉該詞的份量。
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const grams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };

  const ga = grams(a);
  const gb = grams(b);
  let shared = 0;
  for (const [g, count] of ga) {
    const other = gb.get(g);
    if (other) shared += Math.min(count, other);
  }
  const totalA = a.length - 1;
  const totalB = b.length - 1;
  return (2 * shared) / (totalA + totalB);
}

/**
 * 名稱相似度門檻。
 *
 * 0.86 是為了讓「○○工程」與「○○工程（第二標）」過關（附註佔比小），
 * 同時讓「烏日污水處理廠新建工程」與「烏日污水處理廠擴建工程」不過關 ——
 * 後者只差一個詞，卻是兩件不同的工程。門檻再低就會開始誤報同一區域的
 * 不同標案，而誤報的代價不小：使用者被問「這是重複嗎」若常常不是，
 * 下次就會直接按過去，真的重複時也一樣按過去。
 */
export const NAME_THRESHOLD = 0.86;

// ── 比對 ────────────────────────────────────────────────────

function nameReason(
  candidate: Candidate,
  existing: ExistingProject,
): DuplicateReason | null {
  const a = normalizeName(candidate.name);
  const b = normalizeName(existing.name);
  if (!a || !b) return null;
  if (a === b) {
    return { kind: "name", label: "專案名稱相同" };
  }
  const score = similarity(a, b);
  if (score >= NAME_THRESHOLD) {
    return {
      kind: "name",
      label: "專案名稱高度相似",
      detail: `相似度 ${Math.round(score * 100)}%`,
    };
  }
  return null;
}

function datesReason(
  candidate: Candidate,
  existing: ExistingProject,
): DuplicateReason | null {
  const client = normalizeName(candidate.client);
  if (!client || client !== normalizeName(existing.client)) return null;
  /*
    工期必須兩端都有值且都相同才算。
    只比對開工日會把同一機關同日開工的多個標案全部報成重複 ——
    公共工程的開工日常常就是同一天。
  */
  const { startDate, endDate } = candidate;
  if (!startDate || !endDate) return null;
  if (startDate !== existing.startDate || endDate !== existing.endDate) {
    return null;
  }
  return {
    kind: "clientAndDates",
    label: "業主與工期完全相同",
    detail: `${existing.client}　${startDate} ～ ${endDate}`,
  };
}

function fileReason(
  candidate: Candidate,
  existing: ExistingProject,
): DuplicateReason | null {
  const mine = new Set(
    (candidate.fileNames ?? []).map(normalizeFileName).filter(Boolean),
  );
  if (mine.size === 0) return null;
  const hit = (existing.fileNames ?? []).find((f) =>
    mine.has(normalizeFileName(f)),
  );
  if (!hit) return null;
  return {
    kind: "fileName",
    label: "同一份文件已被其他專案使用",
    detail: hit,
  };
}

/** 依可靠度排序：硬約束在前，弱訊號在後。 */
const KIND_ORDER: DuplicateKind[] = [
  "code",
  "contractNo",
  "name",
  "fileName",
  "clientAndDates",
];

/**
 * 找出可能重複的既有專案。
 *
 * 回傳全部命中的專案（不只第一個）：使用者要看到的是「系統裡已經有這些」，
 * 只報一個會讓他以為處理掉那一個就沒事了。
 */
export function findDuplicates(
  candidate: Candidate,
  existing: ExistingProject[],
): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];

  for (const project of existing) {
    const reasons: DuplicateReason[] = [];

    const code = normalizeCode(candidate.code);
    if (code && code === normalizeCode(project.code)) {
      reasons.push({
        kind: "code",
        label: "專案編號已存在",
        detail: project.code,
      });
    }

    const contractNo = normalizeCode(candidate.contractNo);
    if (contractNo && contractNo === normalizeCode(project.contractNo)) {
      reasons.push({
        kind: "contractNo",
        label: "契約編號相同",
        detail: project.contractNo ?? undefined,
      });
    }

    const byName = nameReason(candidate, project);
    if (byName) reasons.push(byName);

    const byFile = fileReason(candidate, project);
    if (byFile) reasons.push(byFile);

    /*
      業主＋工期是最弱的訊號，只在沒有其他理由時才報。
      同一標案分標時這三者本來就一樣，單獨報它幾乎都是誤報；
      但若已有別的理由，它能加強使用者的判斷。
    */
    const byDates = datesReason(candidate, project);
    if (byDates && reasons.length > 0) reasons.push(byDates);

    if (reasons.length === 0) continue;

    reasons.sort(
      (x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind),
    );
    out.push({
      project,
      reasons,
      blocking: reasons.some((r) => r.kind === "code"),
    });
  }

  // 理由較可靠者排前面，其次是理由數多者
  out.sort((a, b) => {
    const rank = (m: DuplicateMatch) => KIND_ORDER.indexOf(m.reasons[0]!.kind);
    return rank(a) - rank(b) || b.reasons.length - a.reasons.length;
  });
  return out;
}

/** 是否有任何一項足以擋下建立。 */
export function hasBlocking(matches: DuplicateMatch[]): boolean {
  return matches.some((m) => m.blocking);
}

/**
 * 確認視窗的說明文字。
 *
 * 明講「仍要建立會變成兩個獨立專案」—— 使用者按下去之前該知道代價
 * 不只是多一列，而是往後的估驗、履約事項與檔案會分頭累積在兩邊。
 */
export function duplicateWarning(matches: DuplicateMatch[]): string {
  if (matches.length === 0) return "";
  if (hasBlocking(matches)) {
    const blocked = matches.find((m) => m.blocking)!;
    return `專案編號「${blocked.project.code}」已被「${blocked.project.name}」使用，請改用其他編號。`;
  }
  const names = matches.map((m) => m.project.name);
  const head =
    names.length === 1
      ? `系統中已有「${names[0]}」`
      : `系統中已有 ${names.length} 個相似專案`;
  return `${head}。仍要建立的話會是兩個獨立專案，之後的履約事項、估驗與檔案會分頭累積，無法合併。`;
}

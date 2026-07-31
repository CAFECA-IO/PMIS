/**
 * 費思在畫面上的停泊位置與其保留區。
 *
 * 為什麼需要這一份共用定義 ——
 * 右下角同時是兩件事的慣用位置：全站的費思入口（浮動）與頁面的主要動作
 * （表單動作列的右端）。先前兩邊各自寫死座標，於是專案建置頁的
 * 「確認並建立專案」被費思的膠囊整個蓋住，而兩邊的程式碼都看不出衝突。
 *
 * 規則定在此處：**右下角屬於費思**，頁面的動作列必須讓出這塊。
 * 動作列不要自己算，一律用 FormActionBar（見 components/ui/form-action-bar）。
 *
 * 另一個被這份定義收斂的問題是尺寸散落：面板寬度 400／440 曾寫在三個檔案、
 * 面板高度 600 還留在通知元件裡（那是費思還是浮動卡片時的舊值，
 * 早已不成立）。任何與費思尺寸有關的數字都應該只出現在這裡。
 */

/** 收合按鈕與視窗邊緣的距離（對應 bottom-6 / right-6 的 1.5rem）。 */
export const DOCK_INSET = "1.5rem";

/** 收合按鈕的直徑（對應 size-12 的 3rem）。 */
export const DOCK_SIZE = "3rem";

/**
 * 動作列右端需讓出的寬度＝按鈕直徑＋兩側邊距。
 *
 * 不精算到剛好貼齊：按鈕有陰影與 hover 放大（scale-105），
 * 留一點餘裕，滑鼠移過去時才不會蓋到旁邊的按鈕。
 */
export const DOCK_RESERVE = "5.5rem";

/** 收合按鈕的定位。 */
export const FAITH_DOCK_POSITION = "fixed bottom-6 right-6";

/**
 * 費思展開後的面板寬度。
 *
 * 展開時面板是版面裡真正的一欄（見 ai-panel 的 flex 欄），
 * 會實際壓縮 main，故此時**沒有**浮動元素需要迴避 —— 保留區只在收合時生效。
 */
export const PANE_WIDTH_CLASS = "lg:w-[400px] xl:w-[440px]";
export const PANE_WIDTH_PX = { lg: 400, xl: 440 } as const;

/**
 * 浮層（置中對話框）避開費思欄位的內距。
 * 面板展開時對話框仍以整個視窗置中，會被面板壓到一半。
 */
export const PANE_RESERVE_CLASS = "lg:pr-[400px] xl:pr-[440px]";

/**
 * 彈出通知的定位：疊在收合按鈕之上。
 *
 * 面板展開時往左退到面板之外（而非往上跑）——
 * 面板已是全高的一欄，往上移不會讓通知離開它的範圍。
 */
export const TOAST_BOTTOM = "6rem";
export const TOAST_RIGHT_COLLAPSED = "right-6";
export const TOAST_RIGHT_EXPANDED = "right-6 lg:right-[424px] xl:right-[464px]";

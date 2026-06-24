import { db, WORDS_COLLECTION, submitWord, clearAllWords } from "./firebase";
import { collection, onSnapshot, query } from "firebase/firestore";

interface PlacedWord {
  text: string;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  rotate: boolean; // 是否旋轉 90 度
}

// 停用詞清單 (過濾常見無意義詞彙)
const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "你", "他", "她", "它", "我們", "你們", "他們", 
  "這", "那", "之", "與", "及", "和", "或", "且", "而", "但", "因", "以", "於", 
  "至", "由", "自", "往", "向", "在", "用", "被", "把", "給", "對", "向", "為",
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "of"
]);

// 簡單斷詞引擎 (支援中英文)
function segmentText(text: string): Map<string, number> {
  const wordCounts = new Map<string, number>();
  
  // 1. 英文字詞與數字匹配
  const englishWords = text.match(/[a-zA-Z0-9'-]+/g) || [];
  englishWords.forEach(word => {
    const cleanWord = word.toLowerCase().trim();
    if (cleanWord.length > 1 && !STOP_WORDS.has(cleanWord)) {
      wordCounts.set(cleanWord, (wordCounts.get(cleanWord) || 0) + 1);
    }
  });

  // 2. 中文詞彙提取 (匹配 2 至 4 個漢字的詞，並以滑動窗口做假分詞)
  // 這裡我們也支援單字但如果它不在停用詞中。
  // 我們先移除所有英文和標點，保留漢字。
  const chineseText = text.replace(/[^\u4e00-\u9fa5]/g, " ");
  const segments = chineseText.split(/\s+/);
  
  segments.forEach(seg => {
    if (!seg) return;
    
    // 如果段落本身很短（如 2~4 字），直接當作一個詞
    if (seg.length >= 2 && seg.length <= 4) {
      if (!STOP_WORDS.has(seg)) {
        wordCounts.set(seg, (wordCounts.get(seg) || 0) + 1);
      }
      return;
    }

    // 長句子做滑動分詞 (2 字與 3 字)
    for (let i = 0; i < seg.length; i++) {
      // 雙字詞
      if (i + 1 < seg.length) {
        const word2 = seg.substring(i, i + 2);
        if (!STOP_WORDS.has(word2)) {
          wordCounts.set(word2, (wordCounts.get(word2) || 0) + 0.5); // 權重微調，避免雙字過度膨脹
        }
      }
      // 三字詞
      if (i + 2 < seg.length) {
        const word3 = seg.substring(i, i + 3);
        if (!STOP_WORDS.has(word3)) {
          wordCounts.set(word3, (wordCounts.get(word3) || 0) + 0.8);
        }
      }
    }
  });

  // 四捨五入詞頻並過濾掉低於 1 次的假分詞
  const finalCounts = new Map<string, number>();
  wordCounts.forEach((count, word) => {
    const rounded = Math.round(count);
    if (rounded >= 1) {
      finalCounts.set(word, rounded);
    }
  });

  return finalCounts;
}

// 隨機 HSL 色彩產生器 (與暗黑背景產生高質感漸層)
function getRandomColor(): string {
  const hues = [200, 220, 240, 260, 280, 300, 320]; // 藍、靛、紫、品紅等冷調發光色
  const hue = hues[Math.floor(Math.random() * hues.length)];
  const saturation = 85 + Math.floor(Math.random() * 15); // 85% - 100%
  const lightness = 60 + Math.floor(Math.random() * 15);   // 60% - 75%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// 檢測兩個旋轉/非旋轉矩形是否重疊 (簡化為軸對齊邊界框 AABB 碰撞，保證不重合)
function isOverlap(w1: PlacedWord, w2: PlacedWord, padding: number = 4): boolean {
  // 將 padding 計算在內
  const pad = padding;
  return !(
    w1.x + w1.width / 2 + pad < w2.x - w2.width / 2 ||
    w1.x - w1.width / 2 - pad > w2.x + w2.width / 2 ||
    w1.y + w1.height / 2 + pad < w2.y - w2.height / 2 ||
    w1.y - w1.height / 2 - pad > w2.y + w2.height / 2
  );
}

class WordCloud {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private words: { text: string; count: number }[] = [];
  private placedWords: PlacedWord[] = [];
  private padding: number = 8;
  private hoveredWord: PlacedWord | null = null;
  private tooltipEl: HTMLElement;

  constructor(canvasId: string, tooltipId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.tooltipEl = document.getElementById(tooltipId)!;

    this.resizeCanvas();
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this.layoutAndRender();
    });

    // 監聽滑鼠移動，實現 Hover 高亮與 Tooltip
    this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    this.canvas.addEventListener("mouseleave", () => this.handleMouseLeave());
  }

  private resizeCanvas() {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = Math.max(500, rect.height);
  }

  // 設定原始數據並重新佈局與渲染
  public setWords(rawWords: { text: string; count: number }[]) {
    this.words = rawWords;
    this.layoutAndRender();
  }

  // 阿基米德螺旋線擺放算法 (Archimedean Spiral Algorithm)
  private layoutAndRender() {
    this.placedWords = [];
    if (this.words.length === 0) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawEmptyState();
      return;
    }

    const maxCount = Math.max(...this.words.map(w => w.count));
    const minCount = Math.min(...this.words.map(w => w.count));
    
    // 計算字體大小範圍
    const maxFontSize = Math.min(80, this.canvas.width / 10);
    const minFontSize = 14;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    this.words.forEach(word => {
      // 依頻率按比例映射出字體大小
      let fontSize = minFontSize;
      if (maxCount !== minCount) {
        fontSize = minFontSize + ((word.count - minCount) / (maxCount - minCount)) * (maxFontSize - minFontSize);
      }

      this.ctx.font = `bold ${Math.round(fontSize)}px "Outfit", "Noto Sans TC", sans-serif`;
      const metrics = this.ctx.measureText(word.text);
      
      // 考慮文字旋轉 90 度的寬高調換
      const rotate = Math.random() < 0.25; // 25% 的機率讓文字垂直排列
      const w = rotate ? fontSize * 1.2 : metrics.width;
      const h = rotate ? metrics.width : fontSize * 1.2;

      let placed = false;
      let t = 0; // 螺旋線參數

      // 螺旋線搜尋不重疊位置
      while (!placed && t < 1500) {
        // 阿基米德螺旋線公式
        const theta = 0.15 * t;
        const r = 0.4 * t;
        const x = centerX + r * Math.cos(theta);
        const y = centerY + r * Math.sin(theta);

        const tempWord: PlacedWord = {
          text: word.text,
          count: word.count,
          x: x,
          y: y,
          width: w,
          height: h,
          fontSize: fontSize,
          color: getRandomColor(),
          rotate: rotate
        };

        // 檢查是否與已放置的其他字詞碰撞，且不能超出畫布邊界
        const boundaryCollision = 
          x - w / 2 < 10 || x + w / 2 > this.canvas.width - 10 ||
          y - h / 2 < 10 || y + h / 2 > this.canvas.height - 10;

        let collision = boundaryCollision;
        if (!collision) {
          for (const placedWord of this.placedWords) {
            if (isOverlap(tempWord, placedWord, this.padding)) {
              collision = true;
              break;
            }
          }
        }

        if (!collision) {
          this.placedWords.push(tempWord);
          placed = true;
        }

        t += 3; // 逐步向外搜尋
      }
    });

    this.render();
  }

  // 繪製 Canvas 畫面
  private render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.placedWords.forEach(word => {
      this.ctx.save();
      
      // 平移到字詞中心點
      this.ctx.translate(word.x, word.y);
      if (word.rotate) {
        this.ctx.rotate(Math.PI / 2);
      }

      // 如果當前為 Hover 狀態，加上發光陰影
      const isHovered = this.hoveredWord && this.hoveredWord.text === word.text;
      if (isHovered) {
        this.ctx.shadowColor = word.color;
        this.ctx.shadowBlur = 25;
        this.ctx.fillStyle = "#ffffff"; // Hover 時變成亮白
      } else {
        this.ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        this.ctx.shadowBlur = 4;
        this.ctx.fillStyle = word.color;
      }

      this.ctx.font = `bold ${Math.round(isHovered ? word.fontSize * 1.15 : word.fontSize)}px "Outfit", "Noto Sans TC", sans-serif`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(word.text, 0, 0);

      this.ctx.restore();
    });
  }

  private drawEmptyState() {
    this.ctx.save();
    this.ctx.fillStyle = "#9ca3af";
    this.ctx.font = '16px "Outfit", "Noto Sans TC", sans-serif';
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("目前尚無資料，快在右方輸入詞彙以建立文字雲！", this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.restore();
  }

  // 偵測滑鼠移動並處理 Hover 事件
  private handleMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let foundWord: PlacedWord | null = null;

    // 由後往前尋找，讓層級高的先被偵測
    for (let i = this.placedWords.length - 1; i >= 0; i--) {
      const w = this.placedWords[i];
      if (
        mx >= w.x - w.width / 2 && mx <= w.x + w.width / 2 &&
        my >= w.y - w.height / 2 && my <= w.y + w.height / 2
      ) {
        foundWord = w;
        break;
      }
    }

    if (foundWord !== this.hoveredWord) {
      this.hoveredWord = foundWord;
      this.render(); // 重新繪製以更新 Hover 狀態
    }

    if (foundWord) {
      // 顯示 Tooltip
      this.tooltipEl.style.opacity = "1";
      this.tooltipEl.style.left = `${e.clientX - rect.left + 15}px`;
      this.tooltipEl.style.top = `${e.clientY - rect.top + 15}px`;
      this.tooltipEl.innerHTML = `<strong>${foundWord.text}</strong><br/>出現次數：${foundWord.count} 次`;
      this.canvas.style.cursor = "pointer";
    } else {
      this.tooltipEl.style.opacity = "0";
      this.canvas.style.cursor = "default";
    }
  }

  private handleMouseLeave() {
    this.hoveredWord = null;
    this.tooltipEl.style.opacity = "0";
    this.canvas.style.cursor = "default";
    this.render();
  }
}

// --- 初始化 App 邏輯 ---
document.addEventListener("DOMContentLoaded", () => {
  const wordCloud = new WordCloud("wordCloudCanvas", "cloudTooltip");

  const wordInput = document.getElementById("wordInput") as HTMLInputElement;
  const textInput = document.getElementById("textInput") as HTMLTextAreaElement;
  const submitBtn = document.getElementById("submitBtn") as HTMLButtonElement;
  
  const statCount = document.getElementById("statCount")!;
  const statUnique = document.getElementById("statUnique")!;
  const wordListContainer = document.getElementById("wordListContainer") as HTMLUListElement;

  // 即時監聽 Firestore 的 wordcloud collection
  const q = query(collection(db, WORDS_COLLECTION));
  onSnapshot(q, (snapshot) => {
    const rawTexts: string[] = [];
    let totalInputCount = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.text) {
        rawTexts.push(data.text);
        totalInputCount++;
      }
    });

    // 將所有歷史資料進行整合與詞頻統計
    const wordFrequency = new Map<string, number>();

    rawTexts.forEach((text) => {
      // 針對每一筆資料進行分詞
      const segs = segmentText(text);
      segs.forEach((count, word) => {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + count);
      });
    });

    // 轉為 word-cloud 可讀之陣列格式，並按詞頻降序排列
    const finalWords = Array.from(wordFrequency.entries())
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);

    // 更新 UI 數據與文字雲
    statCount.textContent = totalInputCount.toString();
    statUnique.textContent = finalWords.length.toString();
    wordCloud.setWords(finalWords);

    // 更新詞彙頻率清單
    wordListContainer.innerHTML = "";
    finalWords.forEach(word => {
      const li = document.createElement("li");
      li.className = "word-item";
      
      const textSpan = document.createElement("span");
      textSpan.textContent = word.text;
      
      const countSpan = document.createElement("span");
      countSpan.className = "word-item-count";
      countSpan.textContent = `${word.count}次`;
      
      li.appendChild(textSpan);
      li.appendChild(countSpan);
      
      // 點擊直接填入輸入框，方便使用者操作
      li.addEventListener("click", () => {
        wordInput.value = word.text;
        wordInput.focus();
      });
      
      wordListContainer.appendChild(li);
    });
  });

  // 送出按鈕點擊事件
  submitBtn.addEventListener("click", async () => {
    const singleWord = wordInput.value.trim();
    const paragraphText = textInput.value.trim();

    if (!singleWord && !paragraphText) {
      alert("請輸入單一詞彙或貼上整段文章！");
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "<span>⏳ 正在送出資料...</span>";

    try {
      if (singleWord) {
        // 直接送出單一詞彙，並設定較大權重
        await submitWord(singleWord, 2);
        wordInput.value = "";
      }

      if (paragraphText) {
        // 送出整段文章
        await submitWord(paragraphText, 1);
        textInput.value = "";
      }
    } catch (err) {
      console.error("Firebase Error:", err);
      alert("送出失敗，請確認 Firebase 資料庫或網路連線！");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // 重設資料庫事件
  const statUniqueContainer = document.getElementById("statUniqueContainer")!;
  statUniqueContainer.addEventListener("click", async () => {
    if (confirm("⚠️ 您確定要清空並重設文字雲資料庫嗎？此操作將會刪除所有歷史詞彙！")) {
      const originalText = statUnique.textContent;
      try {
        statUniqueContainer.style.pointerEvents = "none";
        statUnique.textContent = "🧹 清空中...";
        await clearAllWords();
        statUnique.textContent = "0";
        alert("資料庫已成功清空！");
      } catch (err) {
        console.error("Reset Error:", err);
        statUnique.textContent = originalText || "0";
        alert("重設失敗，請確認資料庫權限或連線！");
      } finally {
        statUniqueContainer.style.pointerEvents = "auto";
      }
    }
  });
});


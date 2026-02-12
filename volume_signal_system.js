/**
 * 📊 量價交易訊號系統 (Volume-Price Trading Signal System)
 * 功能：偵測黃金/死亡交叉並評估成交量強度
 * 量先行於價，量能確認趨勢
 */

class VolumeSignalSystem {
  constructor() {
    this.data = [];
    this.signals = [];
  }

  /**
   * 從 CSV 數據解析股票數據
   * @param {String} csvContent - CSV 檔案內容
   * @returns {Array} 解析後的股票數據陣列
   */
  parseCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    this.data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return {
        date: values[0],
        open: parseFloat(values[1]),
        high: parseFloat(values[2]),
        low: parseFloat(values[3]),
        close: parseFloat(values[4]),
        volume: parseInt(values[5])
      };
    });
    
    return this.data;
  }

  /**
   * 計算簡單移動平均線 (SMA)
   * 優化版本：使用滑動窗口算法 O(n) 複雜度
   * @param {Number} period - 周期數
   * @returns {Array} SMA 值陣列
   */
  calculateSMA(period) {
    const result = new Array(this.data.length);
    
    // 初始化第一個窗口的和
    let sum = 0;
    for (let i = 0; i < period && i < this.data.length; i++) {
      sum += this.data[i].close;
    }
    
    // 填充結果前期的 null
    for (let i = 0; i < period - 1; i++) {
      result[i] = null;
    }
    
    // 設置第一個有效值
    if (this.data.length >= period) {
      result[period - 1] = sum / period;
    }
    
    // 滑動窗口計算後續值
    for (let i = period; i < this.data.length; i++) {
      sum = sum - this.data[i - period].close + this.data[i].close;
      result[i] = sum / period;
    }
    
    return result;
  }

  /**
   * 計算平均成交量
   * 優化版本：使用滑動窗口算法 O(n) 複雜度
   * @param {Number} period - 周期數
   * @returns {Array} 平均成交量陣列
   */
  calculateAverageVolume(period) {
    const result = new Array(this.data.length);
    
    // 初始化第一個窗口的和
    let sum = 0;
    for (let i = 0; i < period && i < this.data.length; i++) {
      sum += this.data[i].volume;
    }
    
    // 填充結果前期的 null
    for (let i = 0; i < period - 1; i++) {
      result[i] = null;
    }
    
    // 設置第一個有效值
    if (this.data.length >= period) {
      result[period - 1] = sum / period;
    }
    
    // 滑動窗口計算後續值
    for (let i = period; i < this.data.length; i++) {
      sum = sum - this.data[i - period].volume + this.data[i].volume;
      result[i] = sum / period;
    }
    
    return result;
  }

  /**
   * 評估成交量強度 (1-10 分)
   * @param {Number} currentVolume - 當前成交量
   * @param {Number} avgVolume - 平均成交量
   * @returns {Object} 成交量評估結果
   */
  evaluateVolumeStrength(currentVolume, avgVolume) {
    const ratio = currentVolume / avgVolume;
    let strength, level, comment;

    if (ratio >= 1.5) {
      strength = 10;
      level = '🔴 放量 (極強)';
      comment = '市場共識強烈，轉折信號可信度高';
    } else if (ratio >= 1.2) {
      strength = 8;
      level = '🟠 帶量 (強)';
      comment = '買賣雙方意願明確，訊號具有參考價值';
    } else if (ratio >= 1.0) {
      strength = 6;
      level = '🟡 均量 (中)';
      comment = '成交量正常，訊號尚可參考';
    } else if (ratio >= 0.7) {
      strength = 3;
      level = '🔵 萎縮 (弱)';
      comment = '買氣不足，假突破風險高';
    } else {
      strength = 1;
      level = '⚫ 無量 (極弱)';
      comment = '成交量極低，接盤俠稀少，趨勢持續但風險大';
    }

    return { strength, level, ratio: ratio.toFixed(2), comment };
  }

  /**
   * 偵測黃金交叉和死亡交叉
   * @param {Number} shortPeriod - 短期均線周期 (預設: 20)
   * @param {Number} longPeriod - 長期均線周期 (預設: 50)
   * @param {Number} volumePeriod - 成交量評估周期 (預設: 20)
   * @returns {Array} 交叉訊號陣列
   */
  detectCrossovers(shortPeriod = 20, longPeriod = 50, volumePeriod = 20) {
    const shortMA = this.calculateSMA(shortPeriod);
    const longMA = this.calculateSMA(longPeriod);
    const avgVolume = this.calculateAverageVolume(volumePeriod);

    this.signals = [];

    for (let i = 1; i < this.data.length; i++) {
      // 前一根 K 線的值
      const prevShortMA = shortMA[i - 1];
      const prevLongMA = longMA[i - 1];
      
      // 當前 K 線的值
      const currShortMA = shortMA[i];
      const currLongMA = longMA[i];
      const currVolume = this.data[i].volume;
      const currAvgVolume = avgVolume[i];

      // 確保都有數值
      if (!prevShortMA || !currShortMA || !currLongMA) continue;

      // 使用 epsilon 避免浮點精度誤差
      const epsilon = 1e-10;
      
      // 黃金交叉：短線從下穿過長線
      if ((prevShortMA - prevLongMA) < epsilon && (currShortMA - currLongMA) > epsilon) {
        const volumeInfo = this.evaluateVolumeStrength(currVolume, currAvgVolume);
        
        let signalType = '';
        let confidence = 0;
        
        if (volumeInfo.strength >= 8) {
          signalType = '🟢 強勢黃金交叉 (帶量上穿)';
          confidence = 95;
        } else if (volumeInfo.strength >= 6) {
          signalType = '🟢 黃金交叉 (均量)';
          confidence = 70;
        } else {
          signalType = '🟡 弱勢黃金交叉 (無量)';
          confidence = 35;
        }

        this.signals.push({
          date: this.data[i].date,
          type: signalType,
          crossType: '黃金交叉 (Golden Cross)',
          price: this.data[i].close,
          shortMA: currShortMA.toFixed(2),
          longMA: currLongMA.toFixed(2),
          volume: currVolume.toLocaleString(),
          volumeInfo: volumeInfo,
          confidence: confidence,
          recommendation: this._getRecommendation('golden', volumeInfo.strength),
          description: this._getDescription('golden', volumeInfo)
        });
      }

      // 死亡交叉：短線從上穿過長線
      else if ((prevShortMA - prevLongMA) > -epsilon && (currShortMA - currLongMA) < -epsilon) {
        const volumeInfo = this.evaluateVolumeStrength(currVolume, currAvgVolume);
        
        let signalType = '';
        let confidence = 0;
        
        if (volumeInfo.strength >= 8) {
          signalType = '🔴 恐慌性死亡交叉 (放量下殺)';
          confidence = 95;
        } else if (volumeInfo.strength >= 6) {
          signalType = '🔴 死亡交叉 (均量)';
          confidence = 70;
        } else {
          signalType = '🟠 陰跌死亡交叉 (無量)';
          confidence = 35;
        }

        this.signals.push({
          date: this.data[i].date,
          type: signalType,
          crossType: '死亡交叉 (Death Cross)',
          price: this.data[i].close,
          shortMA: currShortMA.toFixed(2),
          longMA: currLongMA.toFixed(2),
          volume: currVolume.toLocaleString(),
          volumeInfo: volumeInfo,
          confidence: confidence,
          recommendation: this._getRecommendation('death', volumeInfo.strength),
          description: this._getDescription('death', volumeInfo)
        });
      }
    }

    return this.signals;
  }

  /**
   * 根據訊號類型和成交量強度生成建議
   * @private
   */
  _getRecommendation(crossType, volumeStrength) {
    if (crossType === 'golden') {
      if (volumeStrength >= 8) return '💰 強烈買入信號 - 轉強確認';
      if (volumeStrength >= 6) return '👍 可考慮買入 - 訊號尚可';
      return '⚠️ 謹慎 - 假突破風險';
    } else {
      if (volumeStrength >= 8) return '⛔ 強烈賣出信號 - 轉弱確認';
      if (volumeStrength >= 6) return '👎 考慮賣出 - 訊號尚可';
      return '⚠️ 謹慎 - 可能持續陰跌';
    }
  }

  /**
   * 生成詳細描述
   * @private
   */
  _getDescription(crossType, volumeInfo) {
    if (crossType === 'golden') {
      if (volumeInfo.strength >= 8) {
        return `📈 帶量黃金交叉：短期均線向上突破長期均線，且成交量較大。${volumeInfo.comment}這通常意味著換手成功，後續支撐力道強勁，趨勢具持續性。`;
      } else if (volumeInfo.strength >= 6) {
        return `📈 黃金交叉：短期均線向上突破長期均線，成交量正常。可以作為參考信號，但需要觀察後續走勢確認。`;
      } else {
        return `📉 無量黃金交叉：交叉訊號出現但成交量不足。${volumeInfo.comment}這種假突破容易演變成昙花一現的反彈，需要謹慎。`;
      }
    } else {
      if (volumeInfo.strength >= 8) {
        return `📉 放量死亡交叉：短期均線向下突破長期均線，且成交量較大。${volumeInfo.comment}持股者不計成本逃命，後續可能有較深回檔，上方套牢壓力沈重。`;
      } else if (volumeInfo.strength >= 6) {
        return `📉 死亡交叉：短期均線向下突破長期均線，成交量正常。可以作為參考信號，但需要觀察後續走勢確認。`;
      } else {
        return `📉 無量死亡交叉 (陰跌)：交叉訊號出現但成交量不足。${volumeInfo.comment}無量下跌更須警惕，接盤俠極少，買盤完全撤退。在美股中，這種情況有時會持續很久。`;
      }
    }
  }

  /**
   * 生成詳細分析報告
   */
  generateReport(shortPeriod = 20, longPeriod = 50) {
    const signals = this.detectCrossovers(shortPeriod, longPeriod);
    
    return {
      stockData: this.data,
      signals: signals,
      summary: {
        totalSignals: signals.length,
        goldenCrosses: signals.filter(s => s.crossType === '黃金交叉 (Golden Cross)').length,
        deathCrosses: signals.filter(s => s.crossType === '死亡交叉 (Death Cross)').length,
        strongSignals: signals.filter(s => s.confidence >= 80).length,
        mediumSignals: signals.filter(s => s.confidence >= 60 && s.confidence < 80).length,
        weakSignals: signals.filter(s => s.confidence < 60).length
      }
    };
  }

  /**
   * 輸出格式化的訊號表格 (用於 HTML 顯示)
   */
  getSignalsTable() {
    let html = `
      <table class="signals-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>訊號類型</th>
            <th>收盤價</th>
            <th>短期均線</th>
            <th>長期均線</th>
            <th>成交量</th>
            <th>成交量評估</th>
            <th>信心度</th>
            <th>建議</th>
          </tr>
        </thead>
        <tbody>
    `;

    this.signals.forEach(signal => {
      const confidenceColor = signal.confidence >= 80 ? 'high' : 
                            signal.confidence >= 60 ? 'medium' : 'low';
      
      html += `
        <tr class="signal-${signal.crossType === '黃金交叉 (Golden Cross)' ? 'golden' : 'death'}">
          <td>${signal.date}</td>
          <td>${signal.type}</td>
          <td>${signal.price.toFixed(2)}</td>
          <td>${signal.shortMA}</td>
          <td>${signal.longMA}</td>
          <td>${signal.volume}</td>
          <td>
            <div class="volume-badge">${signal.volumeInfo.level}</div>
            <div class="volume-ratio">比例: ${signal.volumeInfo.ratio}x</div>
          </td>
          <td><span class="confidence-${confidenceColor}">${signal.confidence}%</span></td>
          <td>${signal.recommendation}</td>
        </tr>
        <tr class="signal-detail">
          <td colspan="9">
            <strong>詳細說明：</strong> ${signal.description}
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    return html;
  }

  /**
   * 輸出 JSON 格式的訊號
   */
  getSignalsJSON() {
    return JSON.stringify(this.signals, null, 2);
  }

  /**
   * 驗證 CSV 數據是否包含 ADX 計算所需的欄位
   * @returns {Object} { isValid: boolean, missingFields: array, message: string }
   */
  validateDataForADX() {
    if (!this.data || this.data.length === 0) {
      return { isValid: false, missingFields: [], message: '❌ 無數據' };
    }

    const firstRecord = this.data[0];
    const missingFields = [];

    if (firstRecord.high === undefined || isNaN(firstRecord.high)) missingFields.push('High');
    if (firstRecord.low === undefined || isNaN(firstRecord.low)) missingFields.push('Low');
    if (firstRecord.close === undefined || isNaN(firstRecord.close)) missingFields.push('Close');
    if (firstRecord.volume === undefined) missingFields.push('Volume');

    if (missingFields.length > 0) {
      return { 
        isValid: false, 
        missingFields: missingFields, 
        message: `❌ 缺少欄位: ${missingFields.join(', ')}` 
      };
    }

    if (this.data.length < 28) {
      return { 
        isValid: false, 
        missingFields: [], 
        message: `❌ 數據不足 (需要至少28根K線計算ADX，目前${this.data.length}根)` 
      };
    }

    return { isValid: true, missingFields: [], message: '✅ 數據完整，可計算ADX' };
  }

  /**
   * 計算 ATR (Average True Range)
   * @param {Number} period - 周期（通常14）
   * @returns {Array} ATR 值陣列
   */
  calculateATR(period = 14) {
    const atr = new Array(this.data.length);
    
    // 計算 True Range
    const tr = new Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
      if (i === 0) {
        tr[i] = this.data[i].high - this.data[i].low;
      } else {
        const hl = this.data[i].high - this.data[i].low;
        const hc = Math.abs(this.data[i].high - this.data[i - 1].close);
        const lc = Math.abs(this.data[i].low - this.data[i - 1].close);
        tr[i] = Math.max(hl, hc, lc);
      }
    }

    // 計算 ATR
    let sum = 0;
    for (let i = 0; i < period && i < this.data.length; i++) {
      sum += tr[i];
    }
    atr[period - 1] = sum / period;

    for (let i = period; i < this.data.length; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    return atr;
  }

  /**
   * 計算 ADX (Average Directional Index) - 用於識別趨勢強度
   * 過濾掉弱趨勢中的假訊號
   * @param {Number} period - 周期（通常14）
   * @returns {Object} { plus_di, minus_di, adx } - 三條線數據
   */
  calculateADX(period = 14) {
    const length = this.data.length;
    const plus_di = new Array(length).fill(0);
    const minus_di = new Array(length).fill(0);
    const adx = new Array(length).fill(0);

    // 計算 +DM 和 -DM
    const plus_dm = new Array(length).fill(0);
    const minus_dm = new Array(length).fill(0);

    for (let i = 1; i < length; i++) {
      const up = this.data[i].high - this.data[i - 1].high;
      const down = this.data[i - 1].low - this.data[i].low;

      plus_dm[i] = (up > down && up > 0) ? up : 0;
      minus_dm[i] = (down > up && down > 0) ? down : 0;
    }

    // 計算 ATR
    const atr = this.calculateATR(period);

    // 計算平滑的 +DM 和 -DM
    let sum_plus_dm = 0, sum_minus_dm = 0;
    for (let i = 0; i < period; i++) {
      sum_plus_dm += plus_dm[i];
      sum_minus_dm += minus_dm[i];
    }

    let smooth_plus_dm = sum_plus_dm;
    let smooth_minus_dm = sum_minus_dm;

    // 計算初始的 +DI 和 -DI
    if (atr[period - 1] !== 0) {
      plus_di[period - 1] = (smooth_plus_dm / atr[period - 1]) * 100;
      minus_di[period - 1] = (smooth_minus_dm / atr[period - 1]) * 100;
    }

    // 後續平滑計算
    for (let i = period; i < length; i++) {
      smooth_plus_dm = smooth_plus_dm - plus_dm[i - period] + plus_dm[i];
      smooth_minus_dm = smooth_minus_dm - minus_dm[i - period] + minus_dm[i];

      if (atr[i] !== 0) {
        plus_di[i] = (smooth_plus_dm / atr[i]) * 100;
        minus_di[i] = (smooth_minus_dm / atr[i]) * 100;
      }
    }

    // 計算 DI 和 ADX
    const di = new Array(length).fill(0);
    for (let i = period - 1; i < length; i++) {
      const di_sum = plus_di[i] + minus_di[i];
      di[i] = di_sum !== 0 ? Math.abs(plus_di[i] - minus_di[i]) / di_sum * 100 : 0;
    }

    // 計算平滑的 ADX
    let sum_di = 0;
    for (let i = period - 1; i < period - 1 + period && i < length; i++) {
      sum_di += di[i];
    }
    
    if (period - 1 + period <= length) {
      adx[period - 1 + period - 1] = sum_di / period;
    }

    // 後續平滑計算
    for (let i = period - 1 + period; i < length; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + di[i]) / period;
    }

    return { plus_di, minus_di, adx };
  }

  /**
   * 評估 ADX 強度
   * @param {Number} adxValue - ADX 值
   * @returns {Object} { level, description }
   */
  assessADXStrength(adxValue) {
    if (adxValue >= 40) {
      return { level: '非常強', emoji: '🔴', strength: 4 };
    } else if (adxValue >= 25) {
      return { level: '強勢', emoji: '🟠', strength: 3 };
    } else if (adxValue >= 20) {
      return { level: '中等', emoji: '🟡', strength: 2 };
    } else {
      return { level: '弱勢', emoji: '🔵', strength: 1 };
    }
  }

  /**
   * 生成 SMA + ADX + 成交量 的複合交易訊號
   * @param {Number} shortMA - 短期MA
   * @param {Number} longMA - 長期MA
   * @param {Number} minADX - 最小ADX閾值（過濾弱勢訊號）
   * @param {Number} minVolumeRatio - 最小成交量比例
   * @returns {Array} 經過過濾的交易訊號
   */
  generateSMA_ADX_VolumeSignals(shortMA = 20, longMA = 50, minADX = 25, minVolumeRatio = 1.0) {
    // 計算指標
    const shortSMA = this.calculateSMA(shortMA);
    const longSMA = this.calculateSMA(longMA);
    const adxData = this.calculateADX(14);
    
    // 計算平均成交量（不包含當天）
    const avgVolumes = new Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
      if (i < 20) {
        avgVolumes[i] = null;
      } else {
        const sum = this.data.slice(i - 20, i).reduce((acc, d) => acc + d.volume, 0);
        avgVolumes[i] = sum / 20;
      }
    }

    const signals = [];

    for (let i = 1; i < this.data.length; i++) {
      // ✅ 修正：檢查 null/undefined，0 值也是有效的
      if (shortSMA[i] === null || shortSMA[i] === undefined ||
          longSMA[i] === null || longSMA[i] === undefined ||
          adxData.adx[i] === null || adxData.adx[i] === undefined) {
        continue;
      }

      const prevShortSMA = shortSMA[i - 1];
      const prevLongSMA = longSMA[i - 1];
      
      // ✅ 修正：前一根也要檢查
      if (prevShortSMA === null || prevShortSMA === undefined ||
          prevLongSMA === null || prevLongSMA === undefined) {
        continue;
      }

      const currShortSMA = shortSMA[i];
      const currLongSMA = longSMA[i];
      const currADX = adxData.adx[i];
      const adxStrength = this.assessADXStrength(currADX);

      // ✅ 修正：成交量比例的計算和驗證
      const avgVolume = avgVolumes[i];
      const volumeRatio = avgVolume && avgVolume > 0 ? this.data[i].volume / avgVolume : null;
      
      // ✅ 修正：成交量驗證邏輯 - 如果 avgVolume 為 null（早期數據），視為有效
      const volumeValid = !volumeRatio || volumeRatio >= minVolumeRatio;

      // 黃金交叉：短MA從下穿過長MA
      if (prevShortSMA <= prevLongSMA && currShortSMA > currLongSMA) {
        const isValid = currADX >= minADX && volumeValid;
        
        signals.push({
          date: this.data[i].date,
          type: '黃金交叉',
          action: '買入',
          price: this.data[i].close,
          volume: this.data[i].volume,
          volumeRatio: volumeRatio ? volumeRatio.toFixed(2) : 'N/A',
          adx: currADX.toFixed(2),
          adxLevel: adxStrength.level,
          shortSMA: currShortSMA.toFixed(2),
          longSMA: currLongSMA.toFixed(2),
          isValid: isValid,
          reason: isValid ? 
            `✅ ADX=${currADX.toFixed(1)} (${adxStrength.level}) 成交量=${volumeRatio?.toFixed(2)}倍` :
            `❌ ${currADX < minADX ? `ADX=${currADX.toFixed(1)} (過弱，需≥${minADX})` : `成交量=${volumeRatio?.toFixed(2)}倍 (不足，需≥${minVolumeRatio})`}`
        });
      }

      // 死亡交叉：短MA從上穿過長MA
      if (prevShortSMA >= prevLongSMA && currShortSMA < currLongSMA) {
        const isValid = currADX >= minADX && volumeValid;
        
        signals.push({
          date: this.data[i].date,
          type: '死亡交叉',
          action: '賣出',
          price: this.data[i].close,
          volume: this.data[i].volume,
          volumeRatio: volumeRatio ? volumeRatio.toFixed(2) : 'N/A',
          adx: currADX.toFixed(2),
          adxLevel: adxStrength.level,
          shortSMA: currShortSMA.toFixed(2),
          longSMA: currLongSMA.toFixed(2),
          isValid: isValid,
          reason: isValid ? 
            `✅ ADX=${currADX.toFixed(1)} (${adxStrength.level}) 成交量=${volumeRatio?.toFixed(2)}倍` :
            `❌ ${currADX < minADX ? `ADX=${currADX.toFixed(1)} (過弱，需≥${minADX})` : `成交量=${volumeRatio?.toFixed(2)}倍 (不足，需≥${minVolumeRatio})`}`
        });
      }
    }

    return signals;
  }
}

// 例子：在瀏覽器中使用
window.VolumeSignalSystem = VolumeSignalSystem;

// 如果是 Node.js 環境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VolumeSignalSystem;
}

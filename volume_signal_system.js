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
   * @param {Number} period - 周期數
   * @returns {Array} SMA 值陣列
   */
  calculateSMA(period) {
    return this.data.map((_, index) => {
      if (index < period - 1) return null;
      
      const sum = this.data
        .slice(index - period + 1, index + 1)
        .reduce((acc, d) => acc + d.close, 0);
      
      return sum / period;
    });
  }

  /**
   * 計算平均成交量
   * @param {Number} period - 周期數
   * @returns {Array} 平均成交量陣列
   */
  calculateAverageVolume(period) {
    return this.data.map((_, index) => {
      if (index < period - 1) return null;
      
      const sum = this.data
        .slice(index - period + 1, index + 1)
        .reduce((acc, d) => acc + d.volume, 0);
      
      return sum / period;
    });
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

      // 黃金交叉：短線從下穿過長線
      if (prevShortMA <= prevLongMA && currShortMA > currLongMA) {
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
      else if (prevShortMA >= prevLongMA && currShortMA < currLongMA) {
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
}

// ==================== 使用示例 ====================

// 例子：在瀏覽器中使用
window.VolumeSignalSystem = VolumeSignalSystem;

// 如果是 Node.js 環境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VolumeSignalSystem;
}

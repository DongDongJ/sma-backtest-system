/**
 * 📈 VIX-SMA 歷史重演分析系統
 * 功能：分析VIX與SMA報酬的歷史規律，預測未來策略參數
 * 
 * 核心邏輯：
 * - VIX低迷年份 (<15): 市場自滿 → 單向趨勢 → SMA大賺
 * - VIX暴漲年份 (>20): 恐慌拋售 → 震盪劇烈 → SMA被洗盤
 * - VIX急降年份: 恐慌結束信號 → 用極端參數捕捉反彈
 */

class VIXSMAAnalyzer {
  constructor() {
    this.vixData = [];          // VIX數據
    this.stockData = [];         // 股票價格數據
    this.analysisResults = [];   // 分析結果
    this.historicalPatterns = []; // 檢測到的歷史規律
  }

  /**
   * 從 CSV 解析 VIX 數據
   * 格式：Date, VIX_Open, VIX_High, VIX_Low, VIX_Close
   */
  parseVIXData(csvContent) {
    const lines = csvContent.trim().split('\n');
    this.vixData = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < 5) continue;

      this.vixData.push({
        date: values[0],
        open: parseFloat(values[1]),
        high: parseFloat(values[2]),
        low: parseFloat(values[3]),
        close: parseFloat(values[4]),
        avg: (parseFloat(values[1]) + parseFloat(values[2]) + parseFloat(values[3]) + parseFloat(values[4])) / 4
      });
    }

    return this.vixData;
  }

  /**
   * 分類年份 VIX 特徵
   * @param {Number} minYear - 最小年份 (篩選用)
   * @param {Number} maxYear - 最大年份 (篩選用)
   * @returns {Object} { 低迷年份, 高波動年份, 急降年份, 特殊年份 }
   */
  classifyVIXYears(minYear = null, maxYear = null) {
    if (this.vixData.length === 0) return { error: 'VIX數據不足' };

    const yearGroups = {};

    // 按年份分組 VIX 數據
    this.vixData.forEach(vix => {
      // 支援多種日期格式：YYYY/MM/DD, YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY 等
      let year = null;
      
      if (vix.date.includes('/')) {
        const parts = vix.date.split('/');
        // 檢查是否是 YYYY/MM/DD 格式
        if (parts[0].length === 4) {
          year = parts[0];
        } else if (parts[2] && parts[2].length === 4) {
          // MM/DD/YYYY 格式
          year = parts[2];
        }
      } else if (vix.date.includes('-')) {
        const parts = vix.date.split('-');
        if (parts[0].length === 4) {
          year = parts[0];
        }
      } else {
        year = vix.date.substring(0, 4);
      }
      
      // 年份篩選
      if (!year) return;
      const yearNum = parseInt(year);
      if (minYear && yearNum < minYear) return;
      if (maxYear && yearNum > maxYear) return;

      if (!yearGroups[year]) {
        yearGroups[year] = {
          vixValues: [],
          dates: []
        };
      }
      yearGroups[year].vixValues.push(vix.avg || vix.close);
      yearGroups[year].dates.push(vix.date);
    });

    const yearClassification = {
      lowVolatility: [],     // 低迷年份 (avg < 15)
      highVolatility: [],    // 高波動年份 (max > 20 或 avg > 18)
      sharptRise: [],        // 急速上升 (VIX上升 > 50%)
      sharpDrop: [],         // 急速下降 (VIX下降 > 50%)
      extreme: []            // 極端年份 (max > 30 && min < 15)
    };

    Object.keys(yearGroups).forEach(year => {
      const values = yearGroups[year].vixValues;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b) / values.length;
      const start = values[0];
      const end = values[values.length - 1];
      const changeRate = Math.abs((end - start) / start);

      const yearInfo = { year, min, max, avg, start, end, changeRate, dates: yearGroups[year].dates };

      // 分類邏輯 (互斥優先級順序)
      // 優先級 1: 極端年份 (max > 30 && min < 15) - 最特殊
      if (max > 30 && min < 15) {
        yearClassification.extreme.push(yearInfo);
      }
      // 優先級 2: 低波動年份 (avg < 15) - 最平穩
      else if (avg < 15) {
        yearClassification.lowVolatility.push(yearInfo);
      }
      // 優先級 3: 高波動年份 (其他年份)
      else {
        yearClassification.highVolatility.push(yearInfo);
      }

      // 單獨檢測急速變化 (可與上述重疊)
      if (changeRate > 0.5 && end > start) {
        yearClassification.sharptRise.push(yearInfo);
      }

      if (changeRate > 0.5 && end < start) {
        yearClassification.sharpDrop.push(yearInfo);
      }
    });

    return yearClassification;
  }

  /**
   * 檢測歷史重演規律
   * @param {Array} backtestResults - SMA 回測結果
   * @param {Object} vixClassification - VIX 年份分類
   * @returns {Array} 檢測到的規律
   */
  detectHistoricalPatterns(backtestResults, vixClassification) {
    const patterns = [];

    // 規律 1: 低 VIX 年份 → 高報酬
    if (vixClassification.lowVolatility.length > 0) {
      const lowVIXReturns = backtestResults
        .filter(r => {
          const year = r.dates?.[0]?.substring(0, 4);
          return vixClassification.lowVolatility.some(v => v.year === year);
        })
        .map(r => r.returnRate);

      if (lowVIXReturns.length > 0) {
        const avgReturn = lowVIXReturns.reduce((a, b) => a + b) / lowVIXReturns.length;
        const successRate = lowVIXReturns.filter(r => r > 0).length / lowVIXReturns.length;

        patterns.push({
          type: '低VIX年份效應',
          description: '市場自滿 → 單向趨勢 → SMA 大賺',
          avgReturn: avgReturn.toFixed(2),
          successRate: (successRate * 100).toFixed(1),
          confidence: successRate >= 0.75 ? '高' : successRate >= 0.5 ? '中' : '低',
          recommendation: successRate >= 0.75 ? '💰 強烈建議：低VIX期間使用SMA策略' : '⚠️ 謹慎：成功率不高',
          yearCount: vixClassification.lowVolatility.length
        });
      }
    }

    // 規律 2: 高波動 VIX 年份 → 低報酬
    if (vixClassification.highVolatility.length > 0) {
      const highVIXReturns = backtestResults
        .filter(r => {
          const year = r.dates?.[0]?.substring(0, 4);
          return vixClassification.highVolatility.some(v => v.year === year);
        })
        .map(r => r.returnRate);

      if (highVIXReturns.length > 0) {
        const avgReturn = highVIXReturns.reduce((a, b) => a + b) / highVIXReturns.length;
        const failureRate = highVIXReturns.filter(r => r < 0).length / highVIXReturns.length;

        patterns.push({
          type: '高VIX年份陷阱',
          description: '恐慌拋售 → 震盪劇烈 → SMA 被洗盤',
          avgReturn: avgReturn.toFixed(2),
          failureRate: (failureRate * 100).toFixed(1),
          confidence: failureRate >= 0.6 ? '高' : failureRate >= 0.4 ? '中' : '低',
          recommendation: failureRate >= 0.6 ? '⛔ 強烈警告：高VIX期間謹慎使用SMA' : '⚠️ 需謹慎',
          yearCount: vixClassification.highVolatility.length
        });
      }
    }

    // 規律 3: 極端年份 (最可能大賺或大賠)
    if (vixClassification.extreme.length > 0) {
      const extremeReturns = backtestResults
        .filter(r => {
          const year = r.dates?.[0]?.substring(0, 4);
          return vixClassification.extreme.some(v => v.year === year);
        })
        .map(r => r.returnRate);

      if (extremeReturns.length > 0) {
        const maxReturn = Math.max(...extremeReturns);
        const minReturn = Math.min(...extremeReturns);
        const volatility = Math.sqrt(
          extremeReturns.reduce((sum, r) => sum + Math.pow(r - (extremeReturns.reduce((a, b) => a + b) / extremeReturns.length), 2), 0) / extremeReturns.length
        );

        patterns.push({
          type: '極端VIX年份',
          description: 'VIX 振盪劇烈 → 用極端參數捕捉反彈機會',
          maxReturn: maxReturn.toFixed(2),
          minReturn: minReturn.toFixed(2),
          volatility: volatility.toFixed(2),
          recommendation: maxReturn > 50 ? '⭐⭐⭐ 機會年份：尋找極端參數 (8, 227) 組合' : '⚠️ 風險年份：需要動態調整參數',
          yearCount: vixClassification.extreme.length
        });
      }
    }

    this.historicalPatterns = patterns;
    return patterns;
  }

  /**
   * 推薦最佳 SMA 參數基於 VIX 環境
   */
  recommendOptimalParameters(vixClassification, backtestResults) {
    const recommendations = {
      lowVIX: {
        description: '低VIX市場自滿 → 單向趨勢明顯',
        strategies: [
          {
            parameters: '(9, 21)', // 標準短期/中期
            description: '平衡型 - 平穩獲利',
            expectedReturn: '40-60%',
            riskLevel: '低',
            reason: '捕捉清晰的單向趨勢'
          },
          {
            parameters: '(5, 20)',
            description: '激進型 - 快速入場',
            expectedReturn: '60-90%',
            riskLevel: '中',
            reason: '快速反應市場自滿期間的持續漲勢'
          }
        ]
      },
      
      highVIX: {
        description: '高VIX市場恐慌 → 震盪劇烈',
        strategies: [
          {
            parameters: '(20, 50)', // 長期參數
            description: '防守型 - 減少被洗盤',
            expectedReturn: '10-30%',
            riskLevel: '中',
            reason: '較長週期過濾假突破'
          },
          {
            parameters: '(30, 60)',
            description: '超長期 - 最大化降噪',
            expectedReturn: '5-25%',
            riskLevel: '低',
            reason: '完全忽略短期噪音'
          }
        ]
      },
      
      extreme: {
        description: '極端VIX振盪 → 反彈機會',
        strategies: [
          {
            parameters: '(8, 227)', // 用戶提供的極端參數
            description: '反彈捕捉型 - 專門設計',
            expectedReturn: '100-200%',
            riskLevel: '高',
            reason: '超短MA快速捕捉V型反轉起點，超長MA確認大趨勢'
          },
          {
            parameters: '(8, 144)',
            description: '改進型反彈',
            expectedReturn: '80-150%',
            riskLevel: '高',
            reason: '平衡反應速度和趨勢確認'
          }
        ]
      }
    };

    return recommendations;
  }

  /**
   * 生成詳細分析報告
   * @param {Array} backtestResults - 回測結果
   * @param {Number} minYear - 最小年份 (用於統計總年份)
   * @param {Number} maxYear - 最大年份 (用於統計總年份)
   */
  generateReport(backtestResults, minYear = null, maxYear = null) {
    if (this.vixData.length === 0) {
      return { error: '缺少VIX數據' };
    }

    const vixClassification = this.classifyVIXYears(minYear, maxYear);
    const patterns = this.detectHistoricalPatterns(backtestResults, vixClassification);
    const recommendations = this.recommendOptimalParameters(vixClassification, backtestResults);

    // 計算篩選後的年份總數
    const filteredYears = new Set();
    Object.values(vixClassification).forEach(yearArray => {
      if (Array.isArray(yearArray)) {
        yearArray.forEach(yearInfo => {
          if (yearInfo.year) filteredYears.add(yearInfo.year);
        });
      }
    });

    return {
      vixClassification,
      patterns,
      recommendations,
      summary: {
        totalYears: filteredYears.size,  // 使用篩選後的年份數
        lowVIXYears: vixClassification.lowVolatility.length,
        highVIXYears: vixClassification.highVolatility.length,
        extremeYears: vixClassification.extreme.length
      }
    };
  }

  /**
   * 按年份分組 VIX 數據 (輔助函數)
   */
  groupVIXByYear() {
    const groups = {};
    this.vixData.forEach(v => {
      const year = v.date.substring(0, 4);
      if (!groups[year]) groups[year] = [];
      groups[year].push(v);
    });
    return groups;
  }

  /**
   * 輸出 HTML 報告
   * @param {Array} backtestResults - 回測結果
   * @param {Number} minYear - 最小年份
   * @param {Number} maxYear - 最大年份
   */
  getHTMLReport(backtestResults, minYear = null, maxYear = null) {
    const report = this.generateReport(backtestResults, minYear, maxYear);
    if (report.error) {
      return `<div class="error-box"><strong>❌ 錯誤:</strong> ${report.error}</div>`;
    }

    let html = `
      <div class="vix-analysis-container">
        <h3>📊 VIX-SMA 歷史重演分析</h3>
        
        <div class="summary-grid">
          <div class="stat-card">
            <div class="stat-label">分析年份</div>
            <div class="stat-value">${report.summary.totalYears}年</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">低VIX年份</div>
            <div class="stat-value" style="color: #4caf50;">${report.summary.lowVIXYears}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">高VIX年份</div>
            <div class="stat-value" style="color: #ff9800;">${report.summary.highVIXYears}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">極端年份</div>
            <div class="stat-value" style="color: #f44336;">${report.summary.extremeYears}</div>
          </div>
        </div>

        <h4>🔍 檢測到的規律</h4>
        <div class="patterns-container">
    `;

    report.patterns.forEach(pattern => {
      html += `
        <div class="pattern-card">
          <div class="pattern-type">${pattern.type}</div>
          <div class="pattern-description">${pattern.description}</div>
          <div class="pattern-stats">
            ${pattern.avgReturn ? `<span>平均報酬: <strong>${pattern.avgReturn}%</strong></span>` : ''}
            ${pattern.successRate ? `<span>成功率: <strong>${pattern.successRate}%</strong></span>` : ''}
            ${pattern.failureRate ? `<span>失敗率: <strong>${pattern.failureRate}%</strong></span>` : ''}
            ${pattern.confidence ? `<span>信心度: <strong>${pattern.confidence}</strong></span>` : ''}
            ${pattern.yearCount ? `<span>樣本數: <strong>${pattern.yearCount}年</strong></span>` : ''}
          </div>
          <div class="pattern-recommendation">${pattern.recommendation}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }
}

// 導出模組
window.VIXSMAAnalyzer = VIXSMAAnalyzer;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VIXSMAAnalyzer;
}

/**
 * VIX-SMA 分析集成模塊
 * 負責 UI 交互、數據驗證、分析流程控制
 */

let vixAnalyzer = null;
let vixCSVData = null;
let stockCSVDataVIX = null;

/**
 * 處理 VIX 文件上傳
 */
function handleVIXFileUpload() {
  const fileInput = document.getElementById('vixFile');
  const file = fileInput.files[0];

  if (!file) return;

  document.getElementById('vixFileName').textContent = `✅ 已選擇: ${file.name}`;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      const lines = content.trim().split('\n');

      if (lines.length < 2) {
        showErrorVIX('❌ CSV 格式錯誤：至少需要標題行和數據行');
        return;
      }

      vixCSVData = {
        content: content,
        lines: lines,
        headers: lines[0].split(',').map(h => h.trim())
      };

      console.log('✅ VIX 數據已加載:', lines.length - 1, '行');
    } catch (error) {
      showErrorVIX('❌ 文件解析失敗: ' + error.message);
    }
  };
  reader.readAsText(file);
}

/**
 * 處理股票數據上傳
 */
function handleStockFileVIXUpload() {
  const fileInput = document.getElementById('stockFileVIX');
  const file = fileInput.files[0];

  if (!file) return;

  document.getElementById('stockFileVIXName').textContent = `✅ 已選擇: ${file.name}`;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      const lines = content.trim().split('\n');

      if (lines.length < 2) {
        showErrorVIX('❌ CSV 格式錯誤：至少需要標題行和數據行');
        return;
      }

      stockCSVDataVIX = {
        content: content,
        lines: lines,
        headers: lines[0].split(',').map(h => h.trim())
      };

      console.log('✅ 股票數據已加載:', lines.length - 1, '行');
    } catch (error) {
      showErrorVIX('❌ 文件解析失敗: ' + error.message);
    }
  };
  reader.readAsText(file);
}

/**
 * 驗證數據完整性
 */
function validateVIXData() {
  const errorDiv = document.getElementById('errorVIX');
  errorDiv.classList.remove('show');

  if (!vixCSVData) {
    showErrorVIX('❌ 請先上傳 VIX 數據');
    return false;
  }

  if (!stockCSVDataVIX) {
    showErrorVIX('❌ 請先上傳股票價格數據');
    return false;
  }

  return true;
}

/**
 * 執行 VIX-SMA 分析
 */
function runVIXAnalysis() {
  if (!validateVIXData()) return;

  const loadingDiv = document.getElementById('loadingVIX');
  const resultsDiv = document.getElementById('resultsVIX');
  const errorDiv = document.getElementById('errorVIX');

  loadingDiv.classList.add('show');
  resultsDiv.classList.remove('show');
  errorDiv.classList.remove('show');

  setTimeout(() => {
    try {
      // 初始化分析器
      vixAnalyzer = new VIXSMAAnalyzer();

      // 解析 VIX 數據
      const vixParsed = vixAnalyzer.parseVIXData(vixCSVData.content);
      console.log('✅ VIX 數據解析完成:', vixParsed.length, '天');

      // 驗證股票數據格式
      const stockData = parseStockDataVIX(stockCSVDataVIX.content);
      console.log('✅ 股票數據解析完成:', stockData.length, '天');

      // 生成回測結果 (簡化版)
      const backtestResults = generateSimulatedBacktestResults(stockData);
      console.log('✅ 生成模擬回測結果:', backtestResults.length, '組合');

      // 自動同步年份範圍：如果移動平均線模式有設定，就使用相同的年份
      let minYear = parseInt(document.getElementById('vixMinYear')?.value || 1990);
      let maxYear = parseInt(document.getElementById('vixMaxYear')?.value || 2030);
      
      const startDate2 = document.getElementById('startDate2')?.value;
      const endDate2 = document.getElementById('endDate2')?.value;
      if (startDate2 && endDate2) {
        const startYear = new Date(startDate2).getFullYear();
        const endYear = new Date(endDate2).getFullYear();
        minYear = startYear;
        maxYear = endYear;
        
        // 更新UI顯示已同步
        if (document.getElementById('vixMinYear')) {
          document.getElementById('vixMinYear').value = minYear;
        }
        if (document.getElementById('vixMaxYear')) {
          document.getElementById('vixMaxYear').value = maxYear;
        }
        console.log('🔄 已同步年份範圍至SMA模式的設定: ' + minYear + '-' + maxYear);
      }
      
      // 執行歷史規律分析
      const vixClassification = vixAnalyzer.classifyVIXYears(minYear, maxYear);
      console.log('✅ VIX 分類完成 (年份範圍: ' + minYear + '-' + maxYear + '):', {
        低迷年份: vixClassification.lowVolatility.length,
        高波動年份: vixClassification.highVolatility.length,
        極端年份: vixClassification.extreme.length
      });

      const patterns = vixAnalyzer.detectHistoricalPatterns(backtestResults, vixClassification);
      console.log('✅ 檢測到規律:', patterns.length, '個');

      // 生成報告 (傳入年份範圍以正確統計)
      const reportHTML = vixAnalyzer.getHTMLReport(backtestResults, minYear, maxYear);

      // 顯示結果
      resultsDiv.innerHTML = reportHTML;
      resultsDiv.classList.add('show');
      loadingDiv.classList.remove('show');

      // 顯示額外分析統計
      displayVIXStatistics(vixClassification, backtestResults);
      
      // 顯示組合圖表 (股票價格 + MA + VIX + S&P500) - 完全同步 SMA 模式設定
      displayCombinedChart(stockData, vixParsed);

    } catch (error) {
      console.error('❌ 分析失敗:', error);
      showErrorVIX('❌ 分析過程出錯: ' + error.message);
      loadingDiv.classList.remove('show');
    }
  }, 100);
}

/**
 * 解析股票數據
 */
function parseStockDataVIX(csvContent) {
  const lines = csvContent.trim().split('\n');
  const data = [];

  // 跳過標題行
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 5) continue;

    data.push({
      date: values[0],
      open: parseFloat(values[1]),
      high: parseFloat(values[2]),
      low: parseFloat(values[3]),
      close: parseFloat(values[4]),
      volume: values.length > 5 ? parseInt(values[5]) : 0
    });
  }

  return data;
}

/**
 * 生成模擬回測結果 (用於演示)
 * 實際使用時應與 SMA 回測引擎集成
 */
function generateSimulatedBacktestResults(stockData) {
  const results = [];

  // 生成不同参数组合的模拟结果
  for (let shortMA = 5; shortMA <= 30; shortMA += 5) {
    for (let longMA = 20; longMA <= 200; longMA += 20) {
      if (longMA <= shortMA) continue;

      // 模拟回報 = 隨機 + 参数相关性
      const baseReturn = 40 + Math.random() * 60;
      const adjustment = (shortMA < 10 ? 10 : -5) + (longMA > 100 ? 15 : -10);
      const returnRate = baseReturn + adjustment;

      results.push({
        shortMA: shortMA,
        longMA: longMA,
        returnRate: returnRate,
        finalValue: 10000 * (1 + returnRate / 100),
        tradeCount: Math.floor(Math.random() * 30 + 5),
        dates: stockData.map(d => d.date)
      });
    }
  }

  return results;
}

/**
 * 顯示 VIX 統計信息
 */
function displayVIXStatistics(vixClassification, backtestResults) {
  let statsHTML = `
    <div class="vix-stats-section">
      <h4>📊 VIX 分類統計</h4>
      <div class="stats-grid">
  `;

  // 低VIX年份統計
  if (vixClassification.lowVolatility.length > 0) {
    const lowVIXStats = `
      <div class="stat-card">
        <div class="stat-title">📍 低VIX年份 (平均 &lt;15)</div>
        <div class="stat-count">${vixClassification.lowVolatility.length} 年</div>
        <div class="stat-years">${vixClassification.lowVolatility.map(y => y.year).join(', ')}</div>
        <div class="stat-insight">✅ 單向趨勢明顯 → SMA 大賺年份</div>
      </div>
    `;
    statsHTML += lowVIXStats;
  }

  // 高VIX年份統計
  if (vixClassification.highVolatility.length > 0) {
    const highVIXStats = `
      <div class="stat-card">
        <div class="stat-title">🔴 高VIX年份 (平均 &gt;18)</div>
        <div class="stat-count">${vixClassification.highVolatility.length} 年</div>
        <div class="stat-years">${vixClassification.highVolatility.map(y => y.year).join(', ')}</div>
        <div class="stat-insight">⚠️ 震盪劇烈 → SMA 被洗盤年份</div>
      </div>
    `;
    statsHTML += highVIXStats;
  }

  // 極端年份統計
  if (vixClassification.extreme.length > 0) {
    const extremeStats = `
      <div class="stat-card">
        <div class="stat-title">🌪️ 極端年份 (VIX 15↔82)</div>
        <div class="stat-count">${vixClassification.extreme.length} 年</div>
        <div class="stat-years">${vixClassification.extreme.map(y => y.year).join(', ')}</div>
        <div class="stat-insight">⭐ 反彈機會 → 極端參數大賺年份</div>
      </div>
    `;
    statsHTML += extremeStats;
  }

  statsHTML += `
      </div>
    </div>
  `;

  const resultsDiv = document.getElementById('resultsVIX');
  resultsDiv.innerHTML = statsHTML + resultsDiv.innerHTML;
}

/**
 * 顯示組合圖表：股票價格 + MA + VIX + S&P500
 * 僅在 VIX 分析模式下使用
 * 100% 同步 SMA 模式的日期、參數、初始資金
 */
function displayCombinedChart(stockData, vixData) {
  // 從 SMA 模式讀取日期範圍（強制要求）
  const startDate2 = document.getElementById('startDate2')?.value;
  const endDate2 = document.getElementById('endDate2')?.value;
  
  if (!startDate2 || !endDate2) {
    console.warn('⚠️ 請先在移動平均線模式中設定日期範圍');
    return;
  }

  // 規範化日期格式為 YYYY-MM-DD (用於一致的字符串比較，確保月份和日期都是2位數)
  const normalizeDateFormat = (dateStr) => {
    if (!dateStr) return '';
    
    // 替換 / 為 -
    let normalized = dateStr.replace(/\//g, '-');
    
    if (!normalized.includes('-')) {
      return normalized; // 格式不明確，直接返回
    }
    
    const parts = normalized.split('-').map(p => p.trim());
    
    // 判斷日期格式
    if (parts[0].length === 4) {
      // 已是 YYYY-MM-DD 或 YYYY-M-D 格式
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    } else if (parts[2].length === 4) {
      // MM/DD/YYYY 或 M/D/YYYY 或 DD/MM/YYYY 格式
      // 判斷是 MM/DD/YYYY 還是 DD/MM/YYYY
      // 假設第一個數字 <= 12 時是月份，> 12 時是日期
      let month, day, year;
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      
      if (first > 12) {
        // DD/MM/YYYY
        day = first;
        month = second;
      } else if (second > 12) {
        // MM/DD/YYYY
        month = first;
        day = second;
      } else {
        // 都 <= 12，假設是 MM/DD/YYYY (美國格式)
        month = first;
        day = second;
      }
      
      year = parts[2];
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    return normalized;
  };

  const startDate = normalizeDateFormat(startDate2);
  const endDate = normalizeDateFormat(endDate2);
  const startYear = new Date(startDate).getFullYear();
  const endYear = new Date(endDate).getFullYear();
  const displayYearRange = startYear === endYear ? `${startYear}` : `${startYear}-${endYear}`;
  
  console.log('📅 使用 SMA 模式的日期範圍:', startDate, '至', endDate);
  console.log(`📊 原始股票數據: ${stockData.length} 筆，日期範圍：${stockData[0]?.date} 至 ${stockData[stockData.length-1]?.date}`);
  console.log(`📊 原始VIX數據: ${vixData.length} 筆，日期範圍：${vixData[0]?.date} 至 ${vixData[vixData.length-1]?.date}`);
  
  // 調試：顯示前5個和後5個原始數據的日期和標準化後的日期
  console.log('🔍 股票數據前5個:', stockData.slice(0, 5).map(d => `${d.date} -> ${normalizeDateFormat(d.date)}`));
  console.log('🔍 股票數據後5個:', stockData.slice(-5).map(d => `${d.date} -> ${normalizeDateFormat(d.date)}`));

  // 篩選日期範圍內的數據 (確保數據日期格式一致)
  const filteredStock = stockData.filter(d => {
    const dataDate = normalizeDateFormat(d.date);
    const isInRange = dataDate >= startDate && dataDate <= endDate;
    return isInRange;
  });

  const filteredVIX = vixData.filter(d => {
    const dataDate = normalizeDateFormat(d.date);
    return dataDate >= startDate && dataDate <= endDate;
  });

  console.log(`✅ 篩選結果: 股票數據 ${filteredStock.length} 筆, VIX數據 ${filteredVIX.length} 筆`);
  if (filteredStock.length > 0) {
    console.log(`   篩選後股票日期範圍: ${filteredStock[0]?.date} 至 ${filteredStock[filteredStock.length-1]?.date}`);
    console.log(`   篩選後標準化日期: ${normalizeDateFormat(filteredStock[0]?.date)} 至 ${normalizeDateFormat(filteredStock[filteredStock.length-1]?.date)}`);
  }

  if (filteredStock.length === 0 || filteredVIX.length === 0) {
    console.warn('⚠️ 沒有符合日期範圍的數據');
    return;
  }

  // 確保數據按日期升序排列（從最早到最新）
  filteredStock.sort((a, b) => {
    const dateA = normalizeDateFormat(a.date);
    const dateB = normalizeDateFormat(b.date);
    return dateA.localeCompare(dateB);
  });

  filteredVIX.sort((a, b) => {
    const dateA = normalizeDateFormat(a.date);
    const dateB = normalizeDateFormat(b.date);
    return dateA.localeCompare(dateB);
  });

  console.log(`✅ 排序完成後 - 股票日期範圍: ${filteredStock[0]?.date} 至 ${filteredStock[filteredStock.length-1]?.date}`);

  // 從 localStorage 讀取最佳參數
  const yearKey = startYear === endYear ? startYear : `${startYear}-${endYear}`;
  const bestParamsJSON = localStorage.getItem(`bestMAParams_${yearKey}`);
  let bestParams = null;
  let paramSource = '預設參數';
  
  if (bestParamsJSON) {
    try {
      bestParams = JSON.parse(bestParamsJSON);
      paramSource = `SMA回測結果 (${bestParams.dateRange})`;
      console.log('✅ 已加載保存的最佳參數:', bestParams);
    } catch (e) {
      console.warn('⚠️ 無法解析保存的參數，使用預設值');
    }
  }

  // 使用最佳參數，如果沒有則使用預設值
  let shortMA = bestParams ? bestParams.shortMA : 9;
  let longMA = bestParams ? bestParams.longMA : 21;
  
  // 重要：如果 MA 參數大於數據長度，自動調整為合理值
  const dataLength = filteredStock.length;
  if (shortMA >= dataLength) {
    shortMA = Math.max(2, Math.floor(dataLength * 0.2)); // 使用數據長度的 20%
    console.warn(`⚠️ 短期MA參數(${bestParams?.shortMA || 9})超過數據長度(${dataLength}), 已自動調整為 ${shortMA}`);
  }
  if (longMA >= dataLength) {
    longMA = Math.max(shortMA + 1, Math.floor(dataLength * 0.5)); // 使用數據長度的 50%
    console.warn(`⚠️ 長期MA參數(${bestParams?.longMA || 21})超過數據長度(${dataLength}), 已自動調整為 ${longMA}`);
  }
  
  console.log(`📊 使用MA參數：短期=${shortMA}天, 長期=${longMA}天 (來源: ${paramSource})`);

  // ⭐ 重要改進：使用【完整的原始股票數據】計算 MA（與 SMA 模式一致）
  // 這樣即使選定的日期範圍很短，MA 也能在起始日期就有有效值
  console.log(`🔍 計算 MA: 使用完整的 ${stockData.length} 筆原始股票數據`);
  const allStockMA_short = calculateMovingAverage(stockData, shortMA);
  const allStockMA_long = calculateMovingAverage(stockData, longMA);
  console.log(`   短期 MA 計算完成，有效值: ${allStockMA_short.filter(v => v !== null).length}/${allStockMA_short.length}`);
  console.log(`   長期 MA 計算完成，有效值: ${allStockMA_long.filter(v => v !== null).length}/${allStockMA_long.length}`);
  
  // 根據過濾的日期範圍，找到對應的索引
  let startIndex = -1;
  let endIndex = -1;
  
  // 找到第一個 >= startDate 的索引
  for (let i = 0; i < stockData.length; i++) {
    if (normalizeDateFormat(stockData[i].date) >= startDate) {
      startIndex = i;
      break;
    }
  }
  
  // 找到最後一個 <= endDate 的索引
  for (let i = stockData.length - 1; i >= 0; i--) {
    if (normalizeDateFormat(stockData[i].date) <= endDate) {
      endIndex = i;
      break;
    }
  }
  
  console.log(`📍 日期範圍索引: startIndex=${startIndex}, endIndex=${endIndex}`);
  if (startIndex !== -1) console.log(`   [${startIndex}]: ${stockData[startIndex].date}`);
  if (endIndex !== -1) console.log(`   [${endIndex}]: ${stockData[endIndex].date}`);
  
  // 驗證索引有效性
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    console.error(`❌ 無法找到符合日期範圍的數據 (startIndex=${startIndex}, endIndex=${endIndex})`);
    return;
  }
  
  // 從完整的 MA 陣列中提取對應日期範圍的 MA 值
  const shortMAValues = allStockMA_short.slice(startIndex, endIndex + 1);
  const longMAValues = allStockMA_long.slice(startIndex, endIndex + 1);
  
  console.log(`📊 提取 MA 值: [${startIndex}, ${endIndex+1}), 共 ${shortMAValues.length} 個點`);
  
  // 檢查 MA 值是否有效
  const validShortMACount = shortMAValues.filter(v => v !== null && v !== undefined).length;
  const validLongMACount = longMAValues.filter(v => v !== null && v !== undefined).length;
  console.log(`✅ MA 計算結果: 短期MA有效值 ${validShortMACount}/${shortMAValues.length}, 長期MA有效值 ${validLongMACount}/${longMAValues.length}`);
  
  if (validShortMACount === 0 || validLongMACount === 0) {
    console.error('❌ MA 值計算失敗，資料不足或參數錯誤');
    return;
  }

  // 生成模擬 S&P500 數據 (基於股票價格比例)
  const spData = filteredStock.map((d, i) => ({
    ...d,
    sp500: d.close * 0.8 + Math.random() * 10 // 模擬數據
  }));

  // 使用股票日期作為主軸，匹配 VIX 數據（防止日期不對齐）
  const vixDataMap = {};
  filteredVIX.forEach(v => {
    const normalizedDate = normalizeDateFormat(v.date);
    vixDataMap[normalizedDate] = v;
  });

  // 為每個股票日期找到對應的 VIX 數據（如果沒有則使用前一個有效值）
  const alignedVIXData = [];
  let lastValidVIX = null;
  for (const stockD of filteredStock) {
    const normalizedStockDate = normalizeDateFormat(stockD.date);
    if (vixDataMap[normalizedStockDate]) {
      lastValidVIX = vixDataMap[normalizedStockDate];
      alignedVIXData.push(vixDataMap[normalizedStockDate]);
    } else if (lastValidVIX) {
      // 如果該日期沒有 VIX 數據，使用上一個有效值（例如週末沒有股票交易）
      alignedVIXData.push(lastValidVIX);
    } else {
      alignedVIXData.push(null); // 開始沒有 VIX 數據
    }
  }

  console.log(`✅ VIX 數據對齐完成: ${alignedVIXData.filter(v => v !== null).length}/${filteredStock.length} 筆對齐`);

  // 構建 Plotly 數據
  const trace1 = {
    x: filteredStock.map(d => d.date),
    y: filteredStock.map(d => d.close),
    name: '股票收盤價',
    type: 'scatter',
    mode: 'lines',
    line: { color: '#1f77b4', width: 2 },
    yaxis: 'y1'
  };

  const trace2 = {
    x: filteredStock.map(d => d.date),
    y: shortMAValues,
    name: `短期MA(${shortMA}天) - ${paramSource}`,
    type: 'scatter',
    mode: 'lines',
    line: { color: '#ff7f0e', width: 2, dash: 'dash' },
    yaxis: 'y1'
  };

  const trace3 = {
    x: filteredStock.map(d => d.date),
    y: longMAValues,
    name: `長期MA(${longMA}天) - ${paramSource}`,
    type: 'scatter',
    mode: 'lines',
    line: { color: '#2ca02c', width: 2, dash: 'dot' },
    yaxis: 'y1'
  };

  const trace4 = {
    x: filteredStock.map(d => d.date),
    y: alignedVIXData.map(v => v ? v.close : null),
    name: 'VIX恐慌指數',
    type: 'scatter',
    mode: 'lines',
    line: { color: '#d62728', width: 2 },
    yaxis: 'y2'
  };

  const trace5 = {
    x: spData.map(d => d.date),
    y: spData.map(d => d.sp500),
    name: '標準普爾500指數',
    type: 'scatter',
    mode: 'lines',
    line: { color: '#9467bd', width: 2, dash: 'dashdot' },
    yaxis: 'y3'
  };

  // 偵測交叉訊號
  const { goldenCrosses, deathCrosses } = detectCrossovers(shortMAValues, longMAValues, filteredStock.map(d => d.date));
  
  // 黃金交叉標記
  const trace6 = {
    x: goldenCrosses.map(gc => filteredStock[gc.index].date),
    y: goldenCrosses.map(gc => filteredStock[gc.index].close),
    mode: 'markers',
    type: 'scatter',
    name: '黃金交叉',
    marker: {
      size: 12,
      color: '#4caf50',
      symbol: 'triangle-up',
      line: { color: '#2e7d32', width: 2 }
    },
    yaxis: 'y1',
    hovertemplate: '<b>黃金交叉</b><br>日期: %{x}<br>價格: %{y:.2f}<extra></extra>'
  };

  // 死亡交叉標記
  const trace7 = {
    x: deathCrosses.map(dc => filteredStock[dc.index].date),
    y: deathCrosses.map(dc => filteredStock[dc.index].close),
    mode: 'markers',
    type: 'scatter',
    name: '死亡交叉',
    marker: {
      size: 12,
      color: '#f44336',
      symbol: 'triangle-down',
      line: { color: '#c62828', width: 2 }
    },
    yaxis: 'y1',
    hovertemplate: '<b>死亡交叉</b><br>日期: %{x}<br>價格: %{y:.2f}<extra></extra>'
  };

  // 期末平倉標記
  const trace8 = {
    x: [filteredStock[filteredStock.length - 1].date],
    y: [filteredStock[filteredStock.length - 1].close],
    mode: 'markers',
    type: 'scatter',
    name: '期末平倉',
    marker: {
      size: 12,
      color: '#1f77b4',
      symbol: 'square',
      line: { color: '#1a5490', width: 2 }
    },
    yaxis: 'y1'
  };

  const data = [trace1, trace2, trace3, trace4, trace5, trace6, trace7, trace8];

  const layout = {
    title: `📊 VIX恐慌指數分析：股票、MA(${shortMA},${longMA})、VIX、S&P500 (${displayYearRange}年) | ${paramSource}`,
    hovermode: 'x',
    xaxis: {
      title: '日期'
    },
    yaxis: {
      title: '股票價格 / MA',
      titlefont: { color: '#1f77b4' },
      tickfont: { color: '#1f77b4' }
    },
    yaxis2: {
      title: 'VIX恐慌指數',
      titlefont: { color: '#d62728' },
      tickfont: { color: '#d62728' },
      overlaying: 'y',
      side: 'right'
    },
    yaxis3: {
      title: 'S&P500',
      titlefont: { color: '#9467bd' },
      tickfont: { color: '#9467bd' },
      overlaying: 'y',
      side: 'right',
      anchor: 'free',
      position: 0.85
    },
    margin: {
      r: 100,
      l: 80
    }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false
  };

  // 調試：檢查 trace2 和 trace3 (MA 線)
  console.log(`📈 Trace2 (短期MA): ${trace2.y.length} 個點, 有效值: ${trace2.y.filter(v => v !== null).length}`);
  console.log(`📈 Trace3 (長期MA): ${trace3.y.length} 個點, 有效值: ${trace3.y.filter(v => v !== null).length}`);
  console.log('🎨 所有 Trace 內容:', data.map((t, i) => `Trace${i+1}: ${t.name} - ${t.y.length}個點`));

  // 創建圖表容器
  const resultsDiv = document.getElementById('resultsVIX');
  const chartContainer = document.createElement('div');
  chartContainer.id = 'vixCombinedChart';
  chartContainer.style.marginTop = '30px';
  chartContainer.style.marginBottom = '30px';
  chartContainer.style.padding = '15px';
  chartContainer.style.backgroundColor = '#f5f5f5';
  chartContainer.style.borderRadius = '8px';
  chartContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
  chartContainer.style.height = '600px';

  resultsDiv.appendChild(chartContainer);

  // 繪製圖表
  Plotly.newPlot('vixCombinedChart', data, layout, config);
  console.log('✅ 組合圖表已繪製');
}

/**
 * 計算移動平均線
 * @param {Array} data - 股票數據
 * @param {Number} period - 周期
 * @returns {Array} MA 值（可能包含null）
 */
function calculateMovingAverage(data, period) {
  return data.map((_, index) => {
    if (index < period - 1) return null;
    const sum = data
      .slice(index - period + 1, index + 1)
      .reduce((acc, d) => acc + d.close, 0);
    return sum / period;
  });
}

/**
 * 偵測黃金交叉和死亡交叉
 * @param {Array} shortMA - 短期MA值
 * @param {Array} longMA - 長期MA值
 * @param {Array} dates - 日期
 * @returns {Object} { goldenCrosses, deathCrosses }
 */
function detectCrossovers(shortMA, longMA, dates) {
  const goldenCrosses = [];
  const deathCrosses = [];
  
  for (let i = 1; i < shortMA.length; i++) {
    const prevShort = shortMA[i - 1];
    const currShort = shortMA[i];
    const prevLong = longMA[i - 1];
    const currLong = longMA[i];
    
    // 跳過null值
    if (!prevShort || !currShort || !prevLong || !currLong) continue;
    
    // 黃金交叉：短期MA從下方穿過長期MA
    if (prevShort <= prevLong && currShort > currLong) {
      goldenCrosses.push({ date: dates[i], index: i });
    }
    // 死亡交叉：短期MA從上方穿過長期MA
    else if (prevShort >= prevLong && currShort < currLong) {
      deathCrosses.push({ date: dates[i], index: i });
    }
  }
  
  return { goldenCrosses, deathCrosses };
}

/**
 * 顯示錯誤信息
 */
function showErrorVIX(message) {
  const errorDiv = document.getElementById('errorVIX');
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

/**
 * 生成示例數據 (用於演示)
 */
function generateSampleVIXData() {
  const sampleVIX = `Date,VIX_Open,VIX_High,VIX_Low,VIX_Close
2024-01-01,13,15,12,14
2024-02-01,14,16,13,15
2023-01-01,18,22,16,20
2023-02-01,20,25,18,22
2022-01-01,20,35,19,32
2022-02-01,32,38,30,35
2020-03-01,15,82,14,80
2020-04-01,80,82,20,25
2019-01-01,12,18,11,15
2019-02-01,15,18,12,14
2018-01-01,10,50,10,35
2018-02-01,35,50,10,20
2017-01-01,9,11,8,10
2017-02-01,10,12,9,11
2015-01-01,12,53,12,48
2015-02-01,48,53,20,25
2014-01-01,11,20,10,18
2014-02-01,18,20,11,15`;

  const sampleStock = `Date,Open,High,Low,Close,Volume
2024-01-01,150,155,149,154,1000000
2024-02-01,154,160,153,159,1100000
2023-01-01,140,145,138,143,900000
2023-02-01,143,148,142,147,950000
2022-01-01,130,135,125,128,800000
2022-02-01,128,135,120,130,1200000
2020-03-01,60,65,55,62,2000000
2020-04-01,62,75,61,73,1800000
2019-01-01,130,145,128,144,1000000
2019-02-01,144,155,143,153,1100000
2018-01-01,120,145,100,140,1500000
2018-02-01,140,150,105,135,1400000
2017-01-01,100,120,99,118,800000
2017-02-01,118,135,117,133,900000
2015-01-01,80,95,75,92,600000
2015-02-01,92,98,75,85,800000
2014-01-01,70,85,68,80,500000
2014-02-01,80,90,78,88,550000`;

  return { sampleVIX, sampleStock };
}

/**
 * 加載示例數據 (用於快速測試)
 */
function loadSampleData() {
  const { sampleVIX, sampleStock } = generateSampleVIXData();

  vixCSVData = {
    content: sampleVIX,
    lines: sampleVIX.split('\n'),
    headers: sampleVIX.split('\n')[0].split(',')
  };

  stockCSVDataVIX = {
    content: sampleStock,
    lines: sampleStock.split('\n'),
    headers: sampleStock.split('\n')[0].split(',')
  };

  document.getElementById('vixFileName').textContent = '✅ 已加載示例 VIX 數據';
  document.getElementById('stockFileVIXName').textContent = '✅ 已加載示例股票數據';

  console.log('✅ 示例數據已加載');
}

// 頁面加載完成後初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ VIX 集成模塊已加載');

  // 可選：自動加載示例數據用於測試
  // loadSampleData();
});

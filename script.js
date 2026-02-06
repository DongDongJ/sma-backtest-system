let csvData2 = null;
let allOptimizationResults = [];
let currentView = 'top';
// 緩存年份分析的排名結果，避免重複計算
let cachedMildParametersResults = null;
let cachedMildParametersStockSymbol = null;
let chartState = {
    visible: { price: true, shortMA: true, longMA: true, trades: true, volume: true },
    chartData: null,
    canvas: null,
    ctx: null,
    padding: null,
    chartWidth: 0,
    chartHeight: 0,
    minPrice: 0,
    maxPrice: 0,
    priceRange: 0,
    minVolume: 0,
    maxVolume: 0,
    volumeRange: 0,
    volumeColors: [],  // 存儲每根成交量柱的顏色
    zoomLevel: 1,  // 縮放等級 (1 = 正常)
    panX: 0  // 水平平移
};

document.addEventListener('DOMContentLoaded', function() {
    const displayCountSelect = document.getElementById('displayCount');
    const customCountInput = document.getElementById('customCount');
    const showVolumeCheckbox = document.getElementById('showVolume');
    
    if (displayCountSelect) {
        displayCountSelect.addEventListener('change', function() {
            customCountInput.disabled = (this.value !== 'custom');
        });
    }
    
    if (showVolumeCheckbox) {
        showVolumeCheckbox.addEventListener('change', function() {
            const volumePeriodGroup = document.getElementById('volumePeriodGroup');
            if (volumePeriodGroup) {
                volumePeriodGroup.style.display = this.checked ? 'block' : 'none';
            }
        });
    }
});

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tab).classList.add('active');
}

function handleFileUpload(mode) {
    // 確保 mode 是字符串，並標準化為：2, Volume, Yearly 等
    mode = String(mode).trim();
    
    // 調試：檢查是否正確
    console.log('📁 上傳模式:', mode);
    
    const fileInput = document.getElementById(`csvFile${mode}`);
    if (!fileInput) {
        console.error(`❌ 找不到檔案輸入框: csvFile${mode}`);
        return;
    }
    
    const file = fileInput.files[0];
    
    if (!file) {
        console.warn('❌ 未選擇檔案');
        return;
    }

    console.log('✅ 檔案已選擇:', file.name);
    
    const fileNameElement = document.getElementById(`fileName${mode}`);
    if (fileNameElement) {
        fileNameElement.textContent = `已選擇: ${file.name}`;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                console.error('❌ CSV 檔案格式不正確或太短');
                return;
            }
            
            const headers = lines[0].split(',').map(h => h.trim());
            
            const stockSelect = document.getElementById(`stockSelect${mode}`);
            if (!stockSelect) {
                console.error(`❌ 找不到股票選擇框: stockSelect${mode}`);
                return;
            }
            
            stockSelect.innerHTML = '<option value="">選擇股票數據</option>';
            
            // 檢查是否是新格式 (包含 Date, Close, Volume 等欄位)
            const hasNewFormat = headers.includes('Date') && headers.includes('Close') && headers.includes('Volume');
            
            console.log('📊 CSV 格式:', hasNewFormat ? '新格式' : '舊格式');
            
            if (hasNewFormat) {
                // 新格式：提取檔案名中的股票代碼
                const fileName = file.name.replace('.csv', '').split('_')[0];
                const option = document.createElement('option');
                option.value = fileName;
                option.textContent = `${fileName} (K線數據: ${lines.length - 1} 根)`;
                stockSelect.appendChild(option);
                stockSelect.value = fileName;
                console.log('✅ 自動選擇股票:', fileName);
            } else {
                // 舊格式：直接使用欄位名稱
                headers.slice(1).forEach(header => {
                    if (header) {
                        const option = document.createElement('option');
                        option.value = header;
                        option.textContent = header;
                        stockSelect.appendChild(option);
                    }
                });
                console.log('✅ 載入', stockSelect.children.length - 1, '個股票');
            }

            csvData2 = { headers, lines, format: hasNewFormat ? 'new' : 'old' };
            console.log('✅ 數據已保存到 csvData2');
        } catch (error) {
            console.error('❌ 處理檔案時出錯:', error);
        }
    };
    
    reader.onerror = function(error) {
        console.error('❌ 讀取檔案失敗:', error);
    };
    
    reader.readAsText(file);
}

function parseCSVData(csvData, stockSymbol) {
    const dates = [];
    const closes = [];
    const volumes = [];
    const opens = [];
    
    // 新格式處理 (Date, Open, High, Low, Close, Volume)
    if (csvData.format === 'new') {
        const closeColIndex = csvData.headers.indexOf('Close');
        const volumeColIndex = csvData.headers.indexOf('Volume');
        const openColIndex = csvData.headers.indexOf('Open');
        
        if (closeColIndex === -1) return null;
        
        for (let i = 1; i < csvData.lines.length; i++) {
            const line = csvData.lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            if (values.length > closeColIndex && values[0]) {
                const date = values[0];
                const close = parseFloat(values[closeColIndex]);
                const volume = volumeColIndex !== -1 ? parseInt(values[volumeColIndex]) : 0;
                const open = openColIndex !== -1 ? parseFloat(values[openColIndex]) : close;
                
                if (!isNaN(close) && close > 0) {
                    dates.push(date);
                    closes.push(close);
                    volumes.push(volume);
                    opens.push(open);
                }
            }
        }
        
        return { dates, closes, volumes, opens };
    }
    
    // 舊格式處理
    const targetCol = csvData.headers.indexOf(stockSymbol);
    if (targetCol === -1) return null;

    for (let i = 1; i < csvData.lines.length; i++) {
        const values = csvData.lines[i].split(',');
        if (values.length > targetCol && values[0] && values[targetCol]) {
            const date = values[0].trim();
            const close = parseFloat(values[targetCol]);
            if (date && !isNaN(close) && close > 0) {
                dates.push(date);
                closes.push(close);
            }
        }
    }

    return { dates, closes, volumes: [], opens: [] };
}

// 計算手續費
function calculateCommissionAmount(price, shares, useCommission) {
    if (!useCommission) return 0.0;
    
    const commission = price * shares * 0.0008; //0.08%
    const minCommission = 0.0;
    return Math.max(commission, minCommission);
}

/**
 * 根據收盤價與昨日開盤/收盤計算成交量的顏色
 * @param {Array} dates - 日期數組
 * @param {Array} closes - 收盤價數組
 * @param {Array} opens - 開盤價數組
 * @returns {Array} 顏色數組 (紅色: 上漲, 綠色: 下跌, 黃色: 平盤)
 */
function calculateVolumeColors(dates, closes, opens) {
    const colors = [];
    
    for (let i = 0; i < closes.length; i++) {
        if (i === 0) {
            // 第一根K線無法判斷，默認為灰色
            colors.push('#999999');
            continue;
        }
        
        const today = closes[i];
        const yesterday = closes[i - 1];
        const open = opens && opens[i] ? opens[i] : yesterday;
        
        // 今天收盤 > 昨天開盤 = 紅色 (上漲)
        // 今天收盤 = 昨天開盤 = 黃色 (平盤)
        // 今天收盤 < 昨天收盤 = 綠色 (下跌)
        
        const tolerance = 0.001; // 浮點數比較容差
        
        if (Math.abs(today - open) < tolerance) {
            colors.push('#FFD700'); // 黃色 - 平盤
        } else if (today > open) {
            colors.push('#EF5350'); // 紅色 - 上漲
        } else {
            colors.push('#66BB6A'); // 綠色 - 下跌
        }
    }
    
    return colors;
}

/**
 * 偵測價量關係類型 (8種情況)
 * @param {Array} closes - 收盤價數組
 * @param {Array} volumes - 成交量數組
 * @param {Number} index - 當前K線索引
 * @returns {Object} { type, description, signal }
 */
function detectPriceVolumeRelation(closes, volumes, index) {
    if (index === 0) {
        return {
            type: '初始K線',
            description: '無法判斷',
            signal: 'neutral',
            emoji: '📍'
        };
    }

    // 計算平均成交量 (最近20根，包含今天)
    const lookbackPeriod = Math.min(20, index + 1);
    let avgVolume = 0;
    for (let i = Math.max(0, index - lookbackPeriod + 1); i <= index; i++) {
        avgVolume += volumes[i];
    }
    avgVolume /= lookbackPeriod;

    const currentPrice = closes[index];
    const previousPrice = closes[index - 1];
    const currentVolume = volumes[index];
    
    // 判斷價格方向 (容差: 0.5%)
    const priceChangePct = (currentPrice - previousPrice) / previousPrice;
    const priceTolerance = 0.005;
    
    let priceDirection = 'flat'; // 'up', 'down', 'flat'
    if (priceChangePct > priceTolerance) priceDirection = 'up';
    else if (priceChangePct < -priceTolerance) priceDirection = 'down';

    // 判斷成交量方向
    const volumeRatio = currentVolume / avgVolume;
    const volumeTolerance = 1.0;
    
    let volumeDirection = 'normal'; // 'up', 'down'
    if (volumeRatio > 1.2) volumeDirection = 'up';
    else if (volumeRatio < 0.8) volumeDirection = 'down';

    // 判斷是否創高/創低
    let isNewHigh = true, isNewLow = true;
    for (let i = Math.max(0, index - 20); i < index; i++) {
        if (closes[i] >= currentPrice) isNewHigh = false;
        if (closes[i] <= currentPrice) isNewLow = false;
    }

    // 8種情況判斷
    if (priceDirection === 'up' && volumeDirection === 'up') {
        return {
            type: '買點信號',
            description: '價格上升 + 成交量增加 → 買盤湧入，可考慮進場',
            signal: 'strong_bullish',
            emoji: '🟢'
        };
    }
    else if (priceDirection === 'down' && volumeDirection === 'up') {
        return {
            type: '賣點信號',
            description: '價格下跌 + 成交量增加 → 拋售洶湧，應及時出場',
            signal: 'strong_bearish',
            emoji: '🔴'
        };
    }
    else if ((priceDirection === 'up' || priceDirection === 'flat') && volumeDirection === 'down') {
        if (isNewHigh) {
            return {
                type: '賣點警告',
                description: '價格創新高 + 成交量萎縮 → 頂部風險高，準備減倉',
                signal: 'divergence_bearish',
                emoji: '⚠️'
            };
        } else {
            return {
                type: '減倉信號',
                description: '價格上升 + 成交量減弱 → 上漲乏力，應考慮減倉',
                signal: 'weak_bullish',
                emoji: '🟡'
            };
        }
    }
    else if (priceDirection === 'down' && volumeDirection === 'down') {
        if (isNewLow) {
            return {
                type: '買點機會',
                description: '價格創新低 + 成交量萎縮 → 底部出現機會，可佈局',
                signal: 'divergence_bullish',
                emoji: '💚'
            };
        } else {
            return {
                type: '止跌前兆',
                description: '下跌力道衰退 + 成交量萎縮 → 拋售力竭，可能反彈',
                signal: 'weak_bearish',
                emoji: '🟣'
            };
        }
    }
    else if (priceDirection === 'flat' && volumeDirection === 'down') {
        return {
            type: '觀望信號',
            description: '價格整理 + 成交量萎縮 → 蓄勢待發，靜待突破',
            signal: 'neutral',
            emoji: '⏸️'
        };
    }
    else {
        return {
            type: '不詳',
            description: '無法明確判斷',
            signal: 'neutral',
            emoji: '❓'
        };
    }
}

// 計算 SMA
function computeMA(closes, window, type = 'SMA') {
    if (type === 'SMA') {
        const ma = [];
        if (closes.length < window) return ma;

        let sum = 0;
        for (let i = 0; i < window; i++) {
            sum += closes[i];
        }
        ma.push(sum / window);

        for (let i = window; i < closes.length; i++) {
            sum += closes[i];
            sum -= closes[i - window];
            ma.push(sum / window);
        }
        return ma;
    } else if (type === 'EMA') {
        const ma = [];
        if (closes.length < window) return ma;

        const alpha = 2.0 / (window + 1);
        let sum = 0;
        for (let i = 0; i < window; i++) {
            sum += closes[i];
        }
        ma.push(sum / window);

        for (let i = window; i < closes.length; i++) {
            ma.push(alpha * closes[i] + (1 - alpha) * ma[ma.length - 1]);
        }
        return ma;
    } else if (type === 'WMA') {
        return computeWMA(closes, window);
    }
}

// 計算 WMA (加權移動平均)
function computeWMA(closes, window) {
    const wma = [];
    if (closes.length < window) return wma;

    // 計算權重總和 (1 + 2 + 3 + ... + window)
    let weightSum = 0;
    for (let i = 1; i <= window; i++) {
        weightSum += i;
    }

    // 計算第一個 WMA 值（包含 closes[window-1] 即第一個窗口的今日）
    let weightedSum = 0;
    for (let i = 0; i < window; i++) {
        weightedSum += closes[i] * (i + 1);
    }
    wma.push(weightedSum / weightSum);

    // 滑動計算後續 WMA 值（包含 closes[i] 即當日）
    // 公式：(最新價×n + 次新×(n-1) + ... + 最舊×1) / (n + (n-1) + ... + 1)
    for (let i = window; i < closes.length; i++) {
        weightedSum = 0;
        // 從最舊（closes[i-window+1]）到最新（closes[i]）
        for (let j = 0; j < window; j++) {
            const idx = i - window + 1 + j;           // 從舊到新的索引
            const weight = j + 1;                     // 權重從1到window
            weightedSum += closes[idx] * weight;
        }
        wma.push(weightedSum / weightSum);
    }
    return wma;
}

function backtest(dates, closes, shortMA_window, longMA_window, initialCash, outputStartIdx, endIdx, shortMAType = 'SMA', longMAType = 'SMA', useCommission = false) {
    const shortMA = computeMA(closes, shortMA_window, shortMAType);
    const longMA = computeMA(closes, longMA_window, longMAType);

    let cash = initialCash;
    let shares = 0;
    const trades = [];
    let tradeCount = 0;
    let totalCommission = 0;
    let buyCommissionRecord = 0;

    for (let i = outputStartIdx; i <= endIdx; i++) {
        const shortMAIdx = i - (shortMA_window - 1);
        const longMAIdx = i - (longMA_window - 1);

        if (shortMAIdx < 1 || longMAIdx < 1 || i === outputStartIdx ||
            shortMAIdx >= shortMA.length || longMAIdx >= longMA.length) {
            continue;
        }

        const prevShortMAIdx = shortMAIdx - 1;
        const prevLongMAIdx = longMAIdx - 1;

        const currShortMA = shortMA[shortMAIdx];
        const currLongMA = longMA[longMAIdx];
        const prevShortMA = shortMA[prevShortMAIdx];
        const prevLongMA = longMA[prevLongMAIdx];
        const currPrice = closes[i];

        if (prevShortMA === null || prevShortMA === undefined || 
            prevLongMA === null || prevLongMA === undefined ||
            currShortMA === null || currShortMA === undefined ||
            currLongMA === null || currLongMA === undefined) {
            continue;
        }

        // 黃金交叉 - 但避免在最後一天買入（避免當天買入當天賣出浪費手續費）
        const isGoldenCross = prevShortMA <= prevLongMA && currShortMA > currLongMA;
        const isDeathCross = prevShortMA >= prevLongMA && currShortMA < currLongMA;
        
        if (isGoldenCross && shares === 0 && i < endIdx) {
            const effectivePrice = useCommission ? currPrice * 1.0008 : currPrice;
            shares = Math.floor(cash / effectivePrice);
            const cost = shares * currPrice;
            cash -= cost;
            buyCommissionRecord = calculateCommissionAmount(currPrice, shares, useCommission);
            cash -= buyCommissionRecord;
            tradeCount++;

            trades.push({
                date: dates[i],
                action: '買入',
                price: currPrice,
                shares: shares,
                buyCommission: buyCommissionRecord,
                sellCommission: 0,
                cashAfter: cash
            });
        }
        // 死亡交叉
        else if (isDeathCross && shares > 0) {
            const sellCommissionRecord = calculateCommissionAmount(currPrice, shares, useCommission);
            const revenue = shares * currPrice;
            cash += revenue - sellCommissionRecord;  // ✅ 只扣賣出手續費
            
            totalCommission += buyCommissionRecord + sellCommissionRecord;

            trades.push({
                date: dates[i],
                action: '賣出',
                price: currPrice,
                shares: shares,
                buyCommission: 0,
                sellCommission: sellCommissionRecord,
                cashAfter: cash
            });

            shares = 0;
            buyCommissionRecord = 0;
            tradeCount++;
        }
    }

    let finalValue = cash;
    if (shares > 0) {
        const sellCommissionRecord = calculateCommissionAmount(closes[endIdx], shares, useCommission);
        const revenue = shares * closes[endIdx];
        finalValue = cash + revenue - sellCommissionRecord;  // ✅ 只扣賣出手續費
        totalCommission += buyCommissionRecord + sellCommissionRecord;
        
        trades.push({
            date: dates[endIdx],
            action: '期末賣出',
            price: closes[endIdx],
            shares: shares,
            buyCommission: 0,
            sellCommission: sellCommissionRecord,
            cashAfter: finalValue
        });
        tradeCount++;
    }

    const returnRate = ((finalValue - initialCash) / initialCash) * 100;

    return {
        shortMA: shortMA_window,
        longMA: longMA_window,
        shortMAType: shortMAType,
        longMAType: longMAType,
        finalValue,
        returnRate,
        tradeCount,
        totalCommission,
        trades
    };
}

function showError(mode, message) {
    const errorDiv = document.getElementById(`error${mode}`);
    errorDiv.textContent = '⚠ ' + message;
    errorDiv.classList.add('show');
    setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

function initChart(dates, prices, shortMA, longMA, trades, canvasId = 'mainChart', volumes = null, opens = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 400 * dpr;
    ctx.scale(dpr, dpr);

    chartState.canvas = canvas;
    chartState.ctx = ctx;
    chartState.chartData = { dates, prices, shortMA, longMA, trades, volumes: volumes || [], opens: opens || [] };
    chartState.padding = { top: 40, right: 30, bottom: 80, left: 60 };
    
    // 計算成交量顏色
    if (volumes && volumes.length > 0) {
        chartState.volumeColors = calculateVolumeColors(dates, prices, opens);
    }
    
    // 重置縮放和平移
    chartState.zoomLevel = 1;
    chartState.panX = 0;
    
    draw();

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        document.getElementById('chartTooltip').style.display = 'none';
    });
    canvas.addEventListener('wheel', handleChartZoom);
}

function draw() {
    const { ctx, canvas, chartData, padding, visible } = chartState;
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    
    ctx.clearRect(0, 0, width, height);

    // 優化：不建立臨時陣列，直接計算最小值和最大值
    let minP = Infinity;
    let maxP = -Infinity;
    
    if (visible.price) {
        for (const val of chartData.prices) {
            if (val < minP) minP = val;
            if (val > maxP) maxP = val;
        }
    }
    
    if (visible.shortMA) {
        for (const val of chartData.shortMA) {
            if (val !== null && val < minP) minP = val;
            if (val !== null && val > maxP) maxP = val;
        }
    }
    
    if (visible.longMA) {
        for (const val of chartData.longMA) {
            if (val !== null && val < minP) minP = val;
            if (val !== null && val > maxP) maxP = val;
        }
    }
    
    minP = minP * 0.98;
    maxP = maxP * 1.02;
    
    chartState.minPrice = minP;
    chartState.maxPrice = maxP;
    chartState.priceRange = maxP - minP;
    chartState.chartWidth = width - padding.left - padding.right;
    chartState.chartHeight = height - padding.top - padding.bottom;

    const getX = (i) => padding.left + (i / (chartData.dates.length - 1)) * chartState.chartWidth;
    const getY = (v) => padding.top + chartState.chartHeight - ((v - minP) / chartState.priceRange) * chartState.chartHeight;

    // 計算成交量的縮放 (佔高度的 30%)
    const volumeHeightPercent = 0.30;
    const volumeAreaHeight = chartState.chartHeight * volumeHeightPercent;
    const priceAreaHeight = chartState.chartHeight * (1 - volumeHeightPercent);
    
    // 調整 getY 函數以適應成交量區域
    const getYPrice = (v) => padding.top + priceAreaHeight - ((v - minP) / chartState.priceRange) * priceAreaHeight;
    
    // 計算成交量軸範圍
    if (visible.volume && chartData.volumes && chartData.volumes.length > 0) {
        const validVolumes = chartData.volumes.filter(v => v > 0);
        if (validVolumes.length > 0) {
            chartState.minVolume = Math.min(...validVolumes);
            chartState.maxVolume = Math.max(...validVolumes) * 1.2;
            chartState.volumeRange = chartState.maxVolume - chartState.minVolume;
        }
    }

    ctx.strokeStyle = '#f0f0f0';
    ctx.beginPath();
    for(let i=0; i<=5; i++) {
        const y = padding.top + (i / 5) * priceAreaHeight;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartState.chartWidth, y);
        ctx.fillStyle = '#999';
        ctx.font = '12px Arial';
        ctx.fillText((maxP - (i/5)*chartState.priceRange).toFixed(1), padding.left - 45, y + 4);
    }
    ctx.stroke();

    // 繪製成交量背景和網格
    if (visible.volume && chartData.volumes && chartData.volumes.length > 0) {
        ctx.fillStyle = 'rgba(200, 200, 200, 0.05)';
        ctx.fillRect(padding.left, padding.top + priceAreaHeight, chartState.chartWidth, volumeAreaHeight);
        
        // 成交量網格線
        ctx.strokeStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + priceAreaHeight);
        ctx.lineTo(padding.left + chartState.chartWidth, padding.top + priceAreaHeight);
        ctx.stroke();
    }

    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    
    const avgDateLength = chartData.dates.reduce((sum, d) => sum + d.length, 0) / chartData.dates.length;
    const charWidth = 6.5;
    const labelWidth = avgDateLength * charWidth;
    const minLabelSpacing = labelWidth * 1.2;
    const maxLabels = Math.max(8, Math.floor(chartState.chartWidth / minLabelSpacing));
    const dateStep = Math.max(1, Math.ceil(chartData.dates.length / maxLabels));
    
    for(let i=0; i<chartData.dates.length; i+=dateStep) {
        const x = getX(i);
        ctx.save();
        ctx.translate(x, padding.top + priceAreaHeight + 15);
        ctx.rotate(Math.PI / 4);
        ctx.fillText(chartData.dates[i], 0, 0);
        ctx.restore();
    }

    // 繪製成交量柱狀圖
    if (visible.volume && chartData.volumes && chartData.volumes.length > 0) {
        drawVolumeColumns(getX, padding, priceAreaHeight, volumeAreaHeight);
    }

    // 使用調整後的 Y 座標繪製價格線
    if (visible.price) drawDataLine(chartData.prices, '#666', 2, getYPrice);
    if (visible.shortMA) drawDataLine(chartData.shortMA, '#ff9800', 1.5, getYPrice);
    if (visible.longMA) drawDataLine(chartData.longMA, '#4caf50', 1.5, getYPrice);

    chartData.trades.forEach(t => {
        const idx = chartData.dates.indexOf(t.date);
        if (idx !== -1) {
            const x = getX(idx);
            const y = getYPrice(t.price);
            ctx.lineWidth = 1;

            if (t.action === '買入' && visible.buy) {
                ctx.fillStyle = '#4caf50';
                ctx.beginPath();
                ctx.moveTo(x, y - 10);
                ctx.lineTo(x - 7, y + 5);
                ctx.lineTo(x + 7, y + 5);
                ctx.closePath();
                ctx.fill();
            } else if (t.action === '賣出' && visible.sell) {
                ctx.fillStyle = '#f44336';
                ctx.beginPath();
                ctx.moveTo(x, y + 10);
                ctx.lineTo(x - 7, y - 5);
                ctx.lineTo(x + 7, y - 5);
                ctx.closePath();
                ctx.fill();
            } else if (t.action === '期末賣出' && visible.end) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(x - 5, y - 5, 10, 10);
            }
        }
    });
}

function drawVolumeColumns(getX, padding, priceAreaHeight, volumeAreaHeight) {
    const { ctx, chartData } = chartState;
    const volumeBottom = padding.top + priceAreaHeight;
    
    // 每根柱的寬度
    const barWidth = Math.max(1, Math.min(8, chartState.chartWidth / chartData.dates.length * 0.7));
    
    for (let i = 0; i < chartData.volumes.length; i++) {
        const volume = chartData.volumes[i];
        if (volume <= 0 || !chartState.volumeColors[i]) continue;
        
        // 計算柱高度
        const normalizedVolume = (volume - chartState.minVolume) / (chartState.volumeRange || 1);
        const barHeight = Math.max(1, normalizedVolume * volumeAreaHeight);
        
        const x = getX(i);
        const y = volumeBottom - barHeight;
        
        // 繪製成交量柱
        ctx.fillStyle = chartState.volumeColors[i];
        ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);
    }
}

function drawDataLine(data, color, lineWidth, getYFunc = null) {
    const { ctx, chartData } = chartState;
    const getX = (i) => chartState.padding.left + (i / (chartData.dates.length - 1)) * chartState.chartWidth;
    const defaultGetY = (v) => chartState.padding.top + chartState.chartHeight - ((v - chartState.minPrice) / chartState.priceRange) * chartState.chartHeight;
    const getY = getYFunc || defaultGetY;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    let first = true;
    for(let i=0; i<data.length; i++) {
        if (data[i] === null) continue;
        if (first) {
            ctx.moveTo(getX(i), getY(data[i]));
            first = false;
        } else {
            ctx.lineTo(getX(i), getY(data[i]));
        }
    }
    ctx.stroke();
}

function toggleSeries(series) {
    chartState.visible[series] = !chartState.visible[series];
    const legendItem = document.querySelector(`.legend-item[data-series="${series}"]`);
    legendItem.classList.toggle('hidden');
    draw();
}

function handleMouseMove(e) {
    const rect = chartState.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const { padding, chartWidth, chartData } = chartState;
    
    if (mouseX < padding.left || mouseX > padding.left + chartWidth) return;

    const idx = Math.round(((mouseX - padding.left) / chartWidth) * (chartData.dates.length - 1));
    const tooltip = document.getElementById('chartTooltip');
    
    let html = `<div class="tooltip-date">${chartData.dates[idx]}</div>`;
    html += `<div class="tooltip-item"><span>價格:</span> <span class="tooltip-value">${chartData.prices[idx].toFixed(30)}</span></div>`;
    
    if (chartData.volumes && chartData.volumes[idx]) {
        html += `<div class="tooltip-item" style="color:#9c27b0"><span>成交量:</span> <span class="tooltip-value">${chartData.volumes[idx].toLocaleString()}</span></div>`;
    }
    
    if (chartData.shortMA[idx]) {
        html += `<div class="tooltip-item" style="color:#ff9800"><span>短均:</span> <span class="tooltip-value">${chartData.shortMA[idx].toFixed(30)}</span></div>`;
    }
    if (chartData.longMA[idx]) {
        html += `<div class="tooltip-item" style="color:#4caf50"><span>長均:</span> <span class="tooltip-value">${chartData.longMA[idx].toFixed(30)}</span></div>`;
    }

    // 添加價量關係分析
    if (chartData.volumes && chartData.volumes.length > 0) {
        const pvRelation = detectPriceVolumeRelation(chartData.prices, chartData.volumes, idx);
        html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">`;
        html += `<div class="tooltip-item" style="color:#ffc107"><span>${pvRelation.emoji}</span> <strong>${pvRelation.type}</strong></div>`;
        html += `<div style="font-size: 12px; color: #bbb; margin-top: 4px; line-height: 1.4;">${pvRelation.description}</div>`;
        html += `</div>`;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
}

function handleChartZoom(e) {
    e.preventDefault();
    
    const { padding, chartWidth } = chartState;
    const rect = chartState.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // 只在圖表區域內縮放
    if (mouseX < padding.left || mouseX > padding.left + chartWidth) return;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;  // 向下滾輪縮小，向上放大
    const newZoom = chartState.zoomLevel * zoomFactor;
    
    // 限制縮放範圍 (0.5x 到 5x)
    if (newZoom < 0.5 || newZoom > 5) return;
    
    chartState.zoomLevel = newZoom;
    draw();
}

function displayOptimizationResults(results, initialCash, stockSymbol, useCommission) {
    console.log('🔍 displayOptimizationResults 被調用，結果數量:', results ? results.length : 0);
    
    if (!results || results.length === 0) {
        console.error('❌ 結果為空！');
        const errorDiv = document.getElementById('error2');
        if (errorDiv) {
            errorDiv.textContent = '❌ 優化結果為空，請檢查參數設置';
            errorDiv.classList.add('show');
        }
        document.getElementById('loading2').classList.remove('show');
        return;
    }
    
    window.cachedOptimizationResults = results;
    console.log('✅ 優化結果已存儲到 cachedOptimizationResults:', results.length, '條');
    
    const resultsDiv = document.getElementById('results2');
    const best = results[0];
    const worst = results[results.length - 1];
    
    const displayCountSelect = document.getElementById('displayCount').value;
    let displayCount;
    if (displayCountSelect === 'custom') {
        displayCount = parseInt(document.getElementById('customCount').value);
    } else {
        displayCount = parseInt(displayCountSelect);
    }
    displayCount = Math.min(displayCount, results.length);
    
    let displayResults = results.slice(0, displayCount);
    if (currentView === 'bottom') {
        displayResults = results.slice(Math.max(0, results.length - displayCount), results.length).reverse();
    }
    
    let html = '<div class="result-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"><h3>🏆 最佳策略 - ' + stockSymbol + '</h3><div class="result-stats">';
    html += '<div class="stat-item"><div class="stat-label">短期均線</div><div class="stat-value">' + best.shortMA + ' 天 (' + best.shortMAType + ')</div></div>';
    html += '<div class="stat-item"><div class="stat-label">長期均線</div><div class="stat-value">' + best.longMA + ' 天 (' + best.longMAType + ')</div></div>';
    html += '<div class="stat-item"><div class="stat-label">初始資金</div><div class="stat-value">$' + initialCash.toFixed(2) + '</div></div>';
    html += '<div class="stat-item"><div class="stat-label">最終資產</div><div class="stat-value">$' + best.finalValue.toFixed(2) + '</div></div>';
    if (useCommission) {
        html += '<div class="stat-item"><div class="stat-label">總手續費</div><div class="stat-value">$' + best.totalCommission.toFixed(2) + '</div></div>';
    }
    html += '<div class="stat-item"><div class="stat-label">報酬率</div><div class="stat-value">' + best.returnRate.toFixed(2) + '%</div></div>';
    html += '<div class="stat-item"><div class="stat-label">交易次數</div><div class="stat-value">' + best.tradeCount + '</div></div>';
    html += '</div></div>';
    
    html += '<div class="view-tabs"><button class="view-tab active" onclick="switchResultView(' + "'top'" + ')">🏆 最佳排名</button>';
    html += '<button class="view-tab" onclick="switchResultView(' + "'bottom'" + ')">💔 最差排名</button></div>';
    html += '<div class="table-container"><table><thead><tr><th>排名</th><th>短期MA</th><th>長期MA</th><th>均線類型</th><th>最終資產</th>';
    if (useCommission) html += '<th>總手續費</th>';
    html += '<th>報酬率</th><th>交易數</th><th>對比工具</th></tr></thead><tbody>';
    
    displayResults.forEach((r, index) => {
        let rank;
        if (currentView === 'bottom') {
            // 最差排名：從總數倒數
            rank = results.length - index;
        } else {
            // 最佳排名：從 1 開始
            rank = results.indexOf(r) + 1;
        }
        
        const detailFunc = 'showDetailedResult(' + r.shortMA + ', ' + r.longMA + ', ' + "'" + r.shortMAType + "'" + ')';
        const compareFunc = 'compareParametersWithRank1(' + r.shortMA + ', ' + r.longMA + ', ' + "'" + r.shortMAType + "'" + ')';
        
        html += '<tr style="cursor: pointer;">';
        html += '<td onclick="' + detailFunc + '">' + rank + '</td>';
        html += '<td onclick="' + detailFunc + '">' + r.shortMA + '</td>';
        html += '<td onclick="' + detailFunc + '">' + r.longMA + '</td>';
        html += '<td onclick="' + detailFunc + '">' + r.shortMAType + '</td>';
        html += '<td onclick="' + detailFunc + '">$' + r.finalValue.toFixed(2) + '</td>';
        if (useCommission) html += '<td onclick="' + detailFunc + '">$' + r.totalCommission.toFixed(2) + '</td>';
        html += '<td onclick="' + detailFunc + '">' + r.returnRate.toFixed(2) + '%</td>';
        html += '<td onclick="' + detailFunc + '">' + r.tradeCount + '</td>';
        html += '<td><button class="btn" onclick="' + compareFunc + '" style="padding: 5px 10px; font-size: 0.85em; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">對比排名1</button></td>';
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    
    resultsDiv.innerHTML = html;
    resultsDiv.classList.add('show');
    
    console.log('✅ 結果已顯示');
}

function showDetailedResult(shortMADays, longMADays, maType = 'SMA') {
    const stockSymbol = document.getElementById('stockSelect2').value;
    const initialCash = parseFloat(document.getElementById('initialCash2').value);
    const startDate = document.getElementById('startDate2').value;
    const endDate = document.getElementById('endDate2').value;
    const useCommission = document.getElementById('useCommission2').checked;

    const data = parseCSVData(csvData2, stockSymbol);
    if (!data) {
        showError(2, '無法解析股票資料');
        return;
    }

    let startIdx = data.dates.indexOf(startDate);
    let endIdx = data.dates.indexOf(endDate);

    if (startIdx === -1) {
        const startDateObj = new Date(startDate);
        for (let i = 0; i < data.dates.length; i++) {
            const currentDate = new Date(data.dates[i]);
            if (currentDate >= startDateObj) {
                startIdx = i;
                break;
            }
        }
        if (startIdx === -1) startIdx = 0;
    }

    if (endIdx === -1) {
        const endDateObj = new Date(endDate);
        for (let i = data.dates.length - 1; i >= 0; i--) {
            const currentDate = new Date(data.dates[i]);
            if (currentDate <= endDateObj) {
                endIdx = i;
                break;
            }
        }
        if (endIdx === -1) endIdx = data.dates.length - 1;
    }

    const longerPeriod = Math.max(shortMADays, longMADays);
    const extraDays = longerPeriod - 1;
    const dataStartIdx = Math.max(0, startIdx - extraDays);
    const outputStartIdx = startIdx - dataStartIdx;

    const expandedDates = data.dates.slice(dataStartIdx, endIdx + 1);
    const expandedCloses = data.closes.slice(dataStartIdx, endIdx + 1);

    const result = backtest(expandedDates, expandedCloses, shortMADays, longMADays, initialCash, outputStartIdx, expandedDates.length - 1, maType, maType, useCommission);

    const shortMA = computeMA(expandedCloses, shortMADays, maType);
    const longMA = computeMA(expandedCloses, longMADays, maType);

    const chartDates = expandedDates.slice(outputStartIdx);
    const chartPrices = expandedCloses.slice(outputStartIdx);
    const chartShortMA = [];
    const chartLongMA = [];
    const chartVolumes = data.volumes && data.volumes.length > 0 ? data.volumes.slice(dataStartIdx + outputStartIdx) : [];
    const chartOpens = data.opens && data.opens.length > 0 ? data.opens.slice(dataStartIdx + outputStartIdx) : [];

    for (let i = outputStartIdx; i < expandedDates.length; i++) {
        const shortIdx = i - (shortMADays - 1);
        const longIdx = i - (longMADays - 1);
        chartShortMA.push(shortIdx >= 0 && shortIdx < shortMA.length ? shortMA[shortIdx] : null);
        chartLongMA.push(longIdx >= 0 && longIdx < longMA.length ? longMA[longIdx] : null);
    }

    // 查找該組合在排名中的位置
    let rankPosition = '未知';
    if (allOptimizationResults && allOptimizationResults.length > 0) {
        for (let i = 0; i < allOptimizationResults.length; i++) {
            const r = allOptimizationResults[i];
            if (r.shortMA === shortMADays && r.longMA === longMADays && r.shortMAType === maType) {
                rankPosition = i + 1;
                break;
            }
        }
    }

    let html = `
        <div class="detail-section">
            <h3>📈 策略詳細分析 - ${stockSymbol}</h3>
            ${rankPosition !== '未知' ? `<div style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #333; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-weight: 600; text-align: center; font-size: 1.1em;">🏅 排名: 第 ${rankPosition} 名</div>` : ''}
            <div class="result-stats">
                <div class="stat-item">
                    <div class="stat-label">短期均線</div>
                    <div class="stat-value">${result.shortMA} 天 (${result.shortMAType})</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">長期均線</div>
                    <div class="stat-value">${result.longMA} 天 (${result.longMAType})</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">初始資金</div>
                    <div class="stat-value">${initialCash.toFixed(2)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">最終資產</div>
                    <div class="stat-value">${result.finalValue.toFixed(2)}</div>
                </div>
                ${useCommission ? `
                <div class="stat-item">
                    <div class="stat-label">總手續費</div>
                    <div class="stat-value">${result.totalCommission.toFixed(2)}</div>
                </div>` : ''}
                <div class="stat-item">
                    <div class="stat-label">報酬率</div>
                    <div class="stat-value">${result.returnRate.toFixed(2)}%</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">交易次數</div>
                    <div class="stat-value">${result.tradeCount}</div>
                </div>
            </div>

            <div class="chart-container">
                <h4>價格與移動平均線圖表</h4>
                <div class="legend">
                    <div class="legend-item" data-series="price" onclick="toggleSeries('price')">
                        <span style="color: #666; font-weight: bold;">──</span> <span>收盤價</span>
                    </div>
                    <div class="legend-item" data-series="shortMA" onclick="toggleSeries('shortMA')">
                        <span style="color: #ff9800; font-weight: bold;">──</span> <span>短期均線</span>
                    </div>
                    <div class="legend-item" data-series="longMA" onclick="toggleSeries('longMA')">
                        <span style="color: #7c4dff; font-weight: bold;">──</span> <span>長期均線</span>
                    </div>
                    ${chartVolumes && chartVolumes.length > 0 ? `
                    <div class="legend-item" data-series="volume" onclick="toggleSeries('volume')">
                        <span style="background: linear-gradient(135deg, #EF5350 0%, #66BB6A 100%); display: inline-block; width: 15px; height: 10px; border-radius: 2px;"></span> <span>成交量</span>
                    </div>
                    ` : ''}
                    <div class="legend-item" data-series="buy" onclick="toggleSeries('buy')">
                        <span style="color: #4caf50;">▲</span> <span>黃金交叉</span>
                    </div>
                    <div class="legend-item" data-series="sell" onclick="toggleSeries('sell')">
                        <span style="color: #f44336;">▼</span> <span>死亡交叉</span>
                    </div>
                    <div class="legend-item" data-series="end" onclick="toggleSeries('end')">
                        <span style="color: #000000;">■</span> <span>期末平倉</span>
                    </div>
                </div>
                <canvas id="strategyChart" class="chart-canvas"></canvas>
            </div>

            ${generateVolumeAnalysis(data, result.trades, shortMADays, longMADays) || ''}

            ${result.trades.length > 0 ? `
                <h4 style="margin-top: 30px;">📋 交易明細</h4>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>日期</th>
                                <th>動作</th>
                                <th>價格</th>
                                <th>股數</th>
                                ${useCommission ? '<th>買入手續費</th><th>賣出手續費</th>' : ''}
                                <th>剩餘現金</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${result.trades.map(trade => `
                                <tr>
                                    <td>${trade.date}</td>
                                    <td style="color: ${trade.action === '買入' ? '#4caf50' : (trade.action === '賣出' ? '#f44336' : '#000')}; font-weight: bold;">${trade.action}</td>
                                    <td>${trade.price.toFixed(2)}</td>
                                    <td>${Math.floor(trade.shares)}</td>
                                    ${useCommission ? `<td>${trade.buyCommission.toFixed(2)}</td><td>${trade.sellCommission.toFixed(2)}</td>` : ''}
                                    <td>${trade.cashAfter.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p style="text-align:center; padding:20px;">⚠️ 此參數組合在該期間無任何交易</p>'}

            <button class="btn" onclick="returnToResults()" style="margin-top: 20px;">
                ⬅️ 返回結果列表
            </button>
        </div>
    `;

    document.getElementById('results2').innerHTML = html;

    setTimeout(() => {
        const showVolume = document.getElementById('showVolume') ? document.getElementById('showVolume').checked : true;
        chartState.visible = { price: true, shortMA: true, longMA: true, buy: true, sell: true, end: true, volume: showVolume };
        initChart(chartDates, chartPrices, chartShortMA, chartLongMA, result.trades, "strategyChart", chartVolumes, chartOpens);
    }, 100);
}

function returnToResults() {
    const stockSymbol = document.getElementById('stockSelect2').value;
    const initialCash = parseFloat(document.getElementById('initialCash2').value);
    const useCommission = document.getElementById('useCommission2').checked;
    displayOptimizationResults(allOptimizationResults, initialCash, stockSymbol, useCommission);
}

/**
 * 對比參數與排名1的差異 - 同時顯示圖表和表格
 */
function compareParametersWithRank1(shortMA, longMA, maType) {
    const stockSymbol = document.getElementById('stockSelect2').value;
    const initialCash = parseFloat(document.getElementById('initialCash2').value);
    const startDate = document.getElementById('startDate2').value;
    const endDate = document.getElementById('endDate2').value;
    const useCommission = document.getElementById('useCommission2').checked;

    if (!csvData2 || !allOptimizationResults || allOptimizationResults.length === 0) {
        showError('2', '無法進行對比，請先完成優化');
        return;
    }

    // 排名1的參數
    const rank1 = allOptimizationResults[0];
    
    const data = parseCSVData(csvData2, stockSymbol);
    
    let startIdx = data.dates.indexOf(startDate);
    let endIdx = data.dates.indexOf(endDate);
    
    // 防守：精確匹配失敗，嘗試日期物件比較（處理不同格式）
    if (startIdx === -1) {
        const startDateObj = new Date(startDate);
        for (let i = 0; i < data.dates.length; i++) {
            const currentDate = new Date(data.dates[i]);
            if (currentDate >= startDateObj) {
                startIdx = i;
                break;
            }
        }
        if (startIdx === -1) {
            startIdx = 0;
        }
    }
    
    if (endIdx === -1) {
        const endDateObj = new Date(endDate);
        for (let i = data.dates.length - 1; i >= 0; i--) {
            const currentDate = new Date(data.dates[i]);
            if (currentDate <= endDateObj) {
                endIdx = i;
                break;
            }
        }
        if (endIdx === -1) {
            endIdx = data.dates.length - 1;
        }
    }
    
    const longerPeriod = Math.max(Math.max(shortMA, longMA), Math.max(rank1.shortMA, rank1.longMA));
    const extraDays = longerPeriod - 1;
    const dataStartIdx = Math.max(0, startIdx - extraDays);
    const outputStartIdx = startIdx - dataStartIdx;

    const expandedDates = data.dates.slice(dataStartIdx, endIdx + 1);
    const expandedCloses = data.closes.slice(dataStartIdx, endIdx + 1);
    
    // 防守：檢查擴展後的數據
    if (expandedDates.length === 0 || expandedCloses.length === 0) {
        console.error('❌ 擴展後數據為空', { expandedDatesLen: expandedDates.length, expandedClosesLen: expandedCloses.length });
        showError('2', '無法獲取該日期範圍的數據');
        return;
    }

    // 回測當前參數
    const currentResult = backtest(expandedDates, expandedCloses, shortMA, longMA, initialCash, outputStartIdx, expandedDates.length - 1, maType, maType, useCommission);
    
    // 回測排名1參數
    const rank1Result = backtest(expandedDates, expandedCloses, rank1.shortMA, rank1.longMA, initialCash, outputStartIdx, expandedDates.length - 1, rank1.shortMAType, rank1.shortMAType, useCommission);

    // 生成對比內容
    let html = `
        <div class="comparison-container" style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📊 參數對比分析 - 交易訊號視覺化</h3>
            
            <!-- 圖表區域 -->
            <div style="margin-bottom: 30px; border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #fafafa;">
                <!-- 圖例和控制按鈕 -->
                <div style="margin-bottom: 15px;">
                    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap;">
                        <span style="font-weight: bold; color: #666;">圖例:</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-block; width: 12px; height: 12px; background: #4caf50; border-radius: 50%;"></span>
                            <span><strong>排名1 買入</strong></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-block; width: 12px; height: 12px; background: #f44336; border-radius: 50%;"></span>
                            <span><strong>排名1 賣出</strong></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-block; width: 12px; height: 12px; background: #2196F3; border-radius: 50%;"></span>
                            <span><strong>對比 買入</strong></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-block; width: 12px; height: 12px; background: #ff9800; border-radius: 50%;"></span>
                            <span><strong>對比 賣出</strong></span>
                        </div>
                    </div>
                    
                    <!-- 訊號控制按鈕 -->
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="trade-signal-toggle" data-signal="rank1-buy" style="background: #4caf50; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">排名1買入 ✓</button>
                        <button class="trade-signal-toggle" data-signal="rank1-sell" style="background: #f44336; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">排名1賣出 ✓</button>
                        <button class="trade-signal-toggle" data-signal="compare-buy" style="background: #2196F3; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">對比買入 ✓</button>
                        <button class="trade-signal-toggle" data-signal="compare-sell" style="background: #ff9800; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">對比賣出 ✓</button>
                    </div>
                </div>
                
                <canvas id="comparisonChart" style="width: 100%; height: 400px; border: 1px solid #e0e0e0; border-radius: 4px;"></canvas>
            </div>
            
            <!-- 數據對比表格 -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <!-- 排名1 -->
                <div style="border: 2px solid #4caf50; padding: 15px; border-radius: 8px; background: #f1f8f4;">
                    <h4 style="color: #4caf50; text-align: center;">🏆 排名1 (當前最佳)</h4>
                    <table style="width: 100%; font-size: 0.9em;">
                        <tr><td><strong>短期MA:</strong></td><td>${rank1.shortMA} 天</td></tr>
                        <tr><td><strong>長期MA:</strong></td><td>${rank1.longMA} 天</td></tr>
                        <tr><td><strong>最終資產:</strong></td><td style="color: #4caf50; font-weight: bold;">$${rank1Result.finalValue.toFixed(2)}</td></tr>
                        <tr><td><strong>報酬率:</strong></td><td style="color: #4caf50; font-weight: bold;">${rank1Result.returnRate.toFixed(2)}%</td></tr>
                        <tr><td><strong>交易次數:</strong></td><td>${rank1Result.tradeCount}</td></tr>
                        <tr><td><strong>第一筆交易:</strong></td><td>${rank1Result.trades.length > 0 ? rank1Result.trades[0].date : 'N/A'}</td></tr>
                        <tr><td><strong>最後一筆交易:</strong></td><td>${rank1Result.trades.length > 0 ? rank1Result.trades[rank1Result.trades.length - 1].date : 'N/A'}</td></tr>
                    </table>
                </div>
                
                <!-- 對比參數 -->
                <div style="border: 2px solid #ff9800; padding: 15px; border-radius: 8px; background: #fff8f3;">
                    <h4 style="color: #ff9800; text-align: center;">⚖️ 對比參數</h4>
                    <table style="width: 100%; font-size: 0.9em;">
                        <tr><td><strong>短期MA:</strong></td><td>${shortMA} 天</td></tr>
                        <tr><td><strong>長期MA:</strong></td><td>${longMA} 天</td></tr>
                        <tr><td><strong>最終資產:</strong></td><td style="color: #ff9800; font-weight: bold;">$${currentResult.finalValue.toFixed(2)}</td></tr>
                        <tr><td><strong>報酬率:</strong></td><td style="color: #ff9800; font-weight: bold;">${currentResult.returnRate.toFixed(2)}%</td></tr>
                        <tr><td><strong>交易次數:</strong></td><td>${currentResult.tradeCount}</td></tr>
                        <tr><td><strong>第一筆交易:</strong></td><td>${currentResult.trades.length > 0 ? currentResult.trades[0].date : 'N/A'}</td></tr>
                        <tr><td><strong>最後一筆交易:</strong></td><td>${currentResult.trades.length > 0 ? currentResult.trades[currentResult.trades.length - 1].date : 'N/A'}</td></tr>
                    </table>
                </div>
            </div>
            
            <!-- 差異分析 -->
            <div style="border-left: 4px solid #2196F3; padding: 15px; background: #e3f2fd; border-radius: 4px; margin-bottom: 20px;">
                <h4>📈 差異分析</h4>
                <table style="width: 100%; font-size: 0.9em;">
                    <tr>
                        <td><strong>獲利差額:</strong></td>
                        <td style="color: ${rank1Result.finalValue > currentResult.finalValue ? '#4caf50' : '#f44336'}; font-weight: bold;">
                            $${(rank1Result.finalValue - currentResult.finalValue).toFixed(2)} 
                            ${rank1Result.finalValue > currentResult.finalValue ? '(排名1更好)' : '(對比參數更好)'}
                        </td>
                    </tr>
                    <tr>
                        <td><strong>報酬率差異:</strong></td>
                        <td style="color: ${rank1Result.returnRate > currentResult.returnRate ? '#4caf50' : '#f44336'}; font-weight: bold;">
                            ${(rank1Result.returnRate - currentResult.returnRate).toFixed(2)}%
                        </td>
                    </tr>
                    <tr>
                        <td><strong>交易次數差異:</strong></td>
                        <td>${Math.abs(rank1Result.tradeCount - currentResult.tradeCount)} 次</td>
                    </tr>
                </table>
            </div>

            <button class="btn" onclick="returnToResults()" style="margin-top: 20px; width: 100%;">
                ⬅️ 回到排名表
            </button>
        </div>
    `;

    document.getElementById('results2').innerHTML = html;
    
    // 初始化訊號可見性狀態
    window.comparisonSignalVisibility = {
        'rank1-buy': true,
        'rank1-sell': true,
        'compare-buy': true,
        'compare-sell': true
    };
    
    // 繪製對比圖表 - 同時顯示兩組參數的交易訊號
    setTimeout(() => {
        // 添加按鈕事件監聽
        const buttons = document.querySelectorAll('.trade-signal-toggle');
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                const signal = this.dataset.signal;
                window.comparisonSignalVisibility[signal] = !window.comparisonSignalVisibility[signal];
                
                // 更新按鈕外觀
                if (window.comparisonSignalVisibility[signal]) {
                    this.style.opacity = '1';
                    this.textContent = this.textContent.replace('✗', '✓');
                } else {
                    this.style.opacity = '0.5';
                    this.textContent = this.textContent.replace('✓', '✗');
                }
                
                // 重繪圖表
                drawComparisonChart(
                    expandedDates.slice(outputStartIdx),
                    expandedCloses.slice(outputStartIdx),
                    rank1Result.trades,
                    currentResult.trades
                );
            });
        });
        
        drawComparisonChart(
            expandedDates.slice(outputStartIdx),
            expandedCloses.slice(outputStartIdx),
            rank1Result.trades,
            currentResult.trades
        );
    }, 0);
}

/**
 * 繪製對比圖表 - 顯示兩組參數的交易訊號
 * @param {array} dates - 日期陣列
 * @param {array} prices - 價格陣列
 * @param {array} trades1 - 排名1的交易紀錄
 * @param {array} trades2 - 對比參數的交易紀錄
 */
function drawComparisonChart(dates, prices, trades1, trades2) {
    const canvas = document.getElementById('comparisonChart');
    if (!canvas) {
        console.error('❌ 找不到 canvas 元素 comparisonChart');
        return;
    }
    
    // 防守檢查：確保數據有效
    if (!dates || !prices || dates.length === 0 || prices.length === 0) {
        console.error('❌ 日期或價格數據為空', { datesLen: dates?.length, pricesLen: prices?.length });
        return;
    }
    
    console.log('📊 繪製對比圖表 - 日期:', dates.length, '筆, 交易1:', trades1?.length, '筆, 交易2:', trades2?.length, '筆');
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 400 * dpr;
    ctx.scale(dpr, dpr);

    const padding = { top: 40, right: 30, bottom: 80, left: 60 };
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    
    // 計算價格範圍 - 添加防守
    if (prices.length === 0) {
        console.error('❌ 價格數組為空');
        return;
    }
    
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    
    // 檢查是否都是 NaN 或無效值
    if (!isFinite(minPrice) || !isFinite(maxPrice)) {
        console.error('❌ 價格範圍無效', { minPrice, maxPrice });
        return;
    }
    
    minPrice = minPrice * 0.98;
    maxPrice = maxPrice * 1.02;
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const priceRange = maxPrice - minPrice;
    
    const getX = (i) => padding.left + (i / (dates.length - 1)) * chartWidth;
    const getY = (price) => padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;

    // 清除畫布
    ctx.clearRect(0, 0, width, height);

    // 繪製背景網格
    ctx.strokeStyle = '#f0f0f0';
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (i / 5) * chartHeight;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.fillStyle = '#999';
        ctx.font = '12px Arial';
        ctx.fillText((maxPrice - (i / 5) * priceRange).toFixed(1), padding.left - 45, y + 4);
    }
    ctx.stroke();

    // 繪製X軸標籤
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    const step = Math.ceil(dates.length / 8);
    for (let i = 0; i < dates.length; i += step) {
        const x = getX(i);
        ctx.save();
        ctx.translate(x, padding.top + chartHeight + 20);
        ctx.rotate(Math.PI / 4);
        ctx.fillText(dates[i], 0, 0);
        ctx.restore();
    }

    // 繪製價格線
    ctx.beginPath();
    ctx.strokeStyle = '#1976D2';
    ctx.lineWidth = 2;
    for (let i = 0; i < prices.length; i++) {
        const x = getX(i);
        const y = getY(prices[i]);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    // 先掃描同一天有訊號的日期
    const tradesMap = {};
    
    // 添加防守：檢查交易數據
    if (!trades1) trades1 = [];
    if (!trades2) trades2 = [];
    
    console.log('🔍 交易1 數據:', trades1.slice(0, 3)); // 只打印前3筆用於調試
    console.log('🔍 交易2 數據:', trades2.slice(0, 3));
    
    trades1.forEach(trade => {
        if (!tradesMap[trade.date]) tradesMap[trade.date] = { rank1: null, compare: null };
        tradesMap[trade.date].rank1 = trade;
    });
    trades2.forEach(trade => {
        if (!tradesMap[trade.date]) tradesMap[trade.date] = { rank1: null, compare: null };
        tradesMap[trade.date].compare = trade;
    });

    // 繪製排名1的交易訊號 (綠色▲買入, 紅色▼賣出)
    trades1.forEach(trade => {
        const idx = dates.indexOf(trade.date);
        if (idx === -1) {
            console.warn('⚠️ 找不到交易日期 trade.date:', trade.date, '在 dates 中');
            return;
        }
        
        const x = getX(idx);
        const y = getY(trade.price);
        const hasBothSignals = tradesMap[trade.date].rank1 && tradesMap[trade.date].compare;
        const offsetY = hasBothSignals ? -8 : 0;  // 同天有兩個訊號時向上偏移
        
        ctx.lineWidth = 1;

        if (trade.action === '買入' && window.comparisonSignalVisibility['rank1-buy']) {
            ctx.fillStyle = '#4caf50';
            ctx.beginPath();
            ctx.moveTo(x, y - 12 + offsetY);
            ctx.lineTo(x - 8, y + 6 + offsetY);
            ctx.lineTo(x + 8, y + 6 + offsetY);
            ctx.closePath();
            ctx.fill();
        } else if ((trade.action === '賣出' || trade.action === '期末賣出') && window.comparisonSignalVisibility['rank1-sell']) {
            ctx.fillStyle = '#f44336';
            ctx.beginPath();
            ctx.moveTo(x, y + 12 + offsetY);
            ctx.lineTo(x - 8, y - 6 + offsetY);
            ctx.lineTo(x + 8, y - 6 + offsetY);
            ctx.closePath();
            ctx.fill();
        }
    });

    // 繪製對比參數的交易訊號 (藍色▲買入, 橙色▼賣出) - 同天訊號時向下堆疊
    trades2.forEach(trade => {
        const idx = dates.indexOf(trade.date);
        if (idx === -1) {
            console.warn('⚠️ 找不到交易日期 trade.date:', trade.date, '在 dates 中');
            return;
        }
        
        const x = getX(idx);
        const y = getY(trade.price);
        const hasBothSignals = tradesMap[trade.date].rank1 && tradesMap[trade.date].compare;
        const offsetY = hasBothSignals ? 8 : 0;  // 同天有兩個訊號時向下偏移
        
        ctx.lineWidth = 1;

        if (trade.action === '買入' && window.comparisonSignalVisibility['compare-buy']) {
            ctx.fillStyle = '#2196F3';
            ctx.beginPath();
            ctx.moveTo(x, y - 12 + offsetY);
            ctx.lineTo(x - 8, y + 6 + offsetY);
            ctx.lineTo(x + 8, y + 6 + offsetY);
            ctx.closePath();
            ctx.fill();
        } else if ((trade.action === '賣出' || trade.action === '期末賣出') && window.comparisonSignalVisibility['compare-sell']) {
            ctx.fillStyle = '#ff9800';
            ctx.beginPath();
            ctx.moveTo(x, y + 12 + offsetY);
            ctx.lineTo(x - 8, y - 6 + offsetY);
            ctx.lineTo(x + 8, y - 6 + offsetY);
            ctx.closePath();
            ctx.fill();
        }
    });

    // 繪製邊框
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight);
}

function runQuickSearch() {
    const shortMADays = parseInt(document.getElementById('quickShortMA').value);
    const longMADays = parseInt(document.getElementById('quickLongMA').value);
    const stockSymbol = document.getElementById('stockSelect2').value;
    const maType = document.getElementById('maType').value;
    const errorDiv = document.getElementById('errorQuick');
    
    errorDiv.classList.remove('show');

    if (!csvData2) {
        errorDiv.textContent = '⚠ 請先上傳 CSV 檔案';
        errorDiv.classList.add('show');
        return;
    }

    if (!stockSymbol) {
        errorDiv.textContent = '⚠ 請選擇股票代碼';
        errorDiv.classList.add('show');
        return;
    }

    showDetailedResult(shortMADays, longMADays, maType);
}

function runOptimization() {
    console.log('🔄 開始新的優化...');
    
    // 清除舊數據
    allOptimizationResults = [];
    window.cachedOptimizationResults = [];
    
    const stockSymbol = document.getElementById('stockSelect2').value;
    const minMA = parseInt(document.getElementById('minMA').value);
    const maxMA = parseInt(document.getElementById('maxMA').value);
    const maType = document.getElementById('maType').value;
    const startDate = document.getElementById('startDate2').value;
    const endDate = document.getElementById('endDate2').value;
    const initialCash = parseFloat(document.getElementById('initialCash2').value);
    const useCommission = document.getElementById('useCommission2').checked;

    if (!csvData2) {
        showError(2, '請先上傳 CSV 檔案');
        return;
    }

    if (!stockSymbol) {
        showError(2, '請選擇股票代碼');
        return;
    }

    if (minMA >= maxMA) {
        showError(2, '最小均線天數必須小於最大均線天數');
        return;
    }

    console.log('📊 參數設置 - minMA:', minMA, 'maxMA:', maxMA, 'maType:', maType);
    
    document.getElementById('loading2').classList.add('show');
    document.getElementById('error2').classList.remove('show');
    document.getElementById('results2').classList.remove('show');

    setTimeout(() => {
        const data = parseCSVData(csvData2, stockSymbol);
        if (!data) {
            showError(2, '無法解析股票資料');
            document.getElementById('loading2').classList.remove('show');
            return;
        }

        let startIdx = data.dates.indexOf(startDate);
        let endIdx = data.dates.indexOf(endDate);

        if (startIdx === -1) {
            const startObj = new Date(startDate);
            startIdx = data.dates.findIndex(d => new Date(d) >= startObj);
        }
        if (endIdx === -1) {
            const endObj = new Date(endDate);
            for (let i = data.dates.length - 1; i >= 0; i--) {
                if (new Date(data.dates[i]) <= endObj) {
                    endIdx = i;
                    break;
                }
            }
        }

        if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
            showError(2, '日期範圍無效或找不到資料');
            document.getElementById('loading2').classList.remove('show');
            return;
        }

        const maxPeriod = maxMA;
        const extraDays = maxPeriod - 1;
        const dataStartIdx = Math.max(0, startIdx - extraDays);
        const outputStartIdx = startIdx - dataStartIdx;
        const expandedDates = data.dates.slice(dataStartIdx, endIdx + 1);
        const expandedCloses = data.closes.slice(dataStartIdx, endIdx + 1);

        console.log('📈 開始迴圈計算...');
        console.log('   數據範圍:', expandedDates.length, '天');
        const totalCalcs = (maxMA - minMA + 1) * (maxMA - minMA + 1);
        console.log('   參數組合數:', totalCalcs);
        
        let calculationCount = 0;
        const startTime = performance.now();
        const BATCH_SIZE = 50; // 每批處理 50 個計算，然後進行垃圾回收
        let batchCount = 0;

        for (let s = minMA; s <= maxMA; s++) {
            for (let l = minMA; l <= maxMA; l++) {
                const result = backtest(expandedDates, expandedCloses, s, l, initialCash, outputStartIdx, expandedDates.length - 1, maType, maType, useCommission);
                allOptimizationResults.push(result);
                
                calculationCount++;
                batchCount++;
                
                // 每批處理後進行垃圾回收提示
                if (batchCount >= BATCH_SIZE) {
                    batchCount = 0;
                    if (window.gc) {
                        window.gc(); // 如果開啟了手動垃圾回收
                    }
                }
                
                // 每 100 個計算打印一次進度
                if (calculationCount % 100 === 0 || calculationCount === totalCalcs) {
                    const elapsed = (performance.now() - startTime) / 1000;
                    const rate = calculationCount / elapsed;
                    const remaining = (totalCalcs - calculationCount) / rate;
                    const memUsage = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) : '?';
                    console.log(`   進度: ${calculationCount}/${totalCalcs} (${Math.round(calculationCount/totalCalcs*100)}%) - 耗時: ${elapsed.toFixed(1)}s, 剩餘: ${remaining.toFixed(1)}s, 記憶體: ${memUsage}MB`);
                }
            }
        }
        
        const totalTime = (performance.now() - startTime) / 1000;
        console.log('✅ 計算完成！總耗時:', totalTime.toFixed(2), '秒，開始排序...');

        allOptimizationResults.sort((a, b) => {
            if (Math.abs(a.finalValue - b.finalValue) > 0.0001) {
                return b.finalValue - a.finalValue;
            }
            const diffA = Math.abs(a.longMA - a.shortMA);
            const diffB = Math.abs(b.longMA - b.shortMA);
            if (diffA !== diffB) {
                return diffB - diffA;
            }
            if (a.shortMA !== b.shortMA) {
                return a.shortMA - b.shortMA;
            }
            return a.longMA - b.longMA;
        });

        // 保存最佳參數到 localStorage （包含年份信息）
        if (allOptimizationResults.length > 0) {
          const bestResult = allOptimizationResults[0];
          const startYear = new Date(startDate).getFullYear();
          const endYear = new Date(endDate).getFullYear();
          const yearKey = startYear === endYear ? startYear : `${startYear}-${endYear}`;
          
          const bestParamsData = {
            shortMA: bestResult.shortMA,
            longMA: bestResult.longMA,
            returnRate: ((bestResult.finalValue - initialCash) / initialCash * 100).toFixed(2),
            finalValue: bestResult.finalValue.toFixed(2),
            dateRange: `${startDate} 至 ${endDate}`,
            year: yearKey,
            stockSymbol: stockSymbol,
            maType: maType,
            savedTime: new Date().toLocaleString('zh-TW')
          };
          
          localStorage.setItem(`bestMAParams_${yearKey}`, JSON.stringify(bestParamsData));
          console.log('💾 已保存最佳參數到 localStorage:', bestParamsData);
        }

        displayOptimizationResults(allOptimizationResults, initialCash, stockSymbol, useCommission);
        console.log('✅ 優化完成！已顯示結果');
        document.getElementById('loading2').classList.remove('show');
    }, 100);
}

function switchResultView(view) {
    currentView = view;
    const stockSymbol = document.getElementById('stockSelect2').value;
    const initialCash = parseFloat(document.getElementById('initialCash2').value);
    const useCommission = document.getElementById('useCommission2').checked;
    displayOptimizationResults(allOptimizationResults, initialCash, stockSymbol, useCommission);
}

// ==================== 量價訊號分析功能 ====================

let volumeCSVData = null;

/**
 * 為詳細回測結果生成成交量分析
 */
function generateVolumeAnalysis(data, trades, shortMADays, longMADays) {
    if (!data || !data.volumes || data.volumes.length === 0) {
        return ''; // 沒有成交量數據，跳過
    }

    const shortMA = computeMA(data.closes, shortMADays);
    const longMA = computeMA(data.closes, longMADays);
    const avgVolume = computeAverageVolume(data.volumes, shortMADays);

    let html = `
        <div class="volume-analysis-section" style="background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h4>📊 成交量強度評估 & 訊號可信度分析</h4>
            <div class="info-box">
                <strong>「量先行於價，量能確認趨勢」</strong> - 本分析評估每次交叉訊號時的成交量強度，以判斷訊號的真實性與後續趨勢的持續力。
            </div>
    `;

    // 分析每一次交易對應的成交量強度
    let tradeAnalysis = [];
    
    for (let i = 0; i < trades.length; i++) {
        const trade = trades[i];
        const dateIdx = data.dates.indexOf(trade.date);
        
        if (dateIdx === -1 || dateIdx < shortMADays) continue;

        const currentVolume = data.volumes[dateIdx];
        const avgVol = avgVolume[dateIdx];
        
        if (!currentVolume || !avgVol) continue;

        const volumeInfo = evaluateVolume(currentVolume, avgVol);
        
        let signalType = '';
        let confidence = 0;

        if (trade.action === '買入') {
            // 黃金交叉
            if (volumeInfo.strength >= 8) {
                signalType = '🟢 強勢黃金交叉';
                confidence = 95;
            } else if (volumeInfo.strength >= 6) {
                signalType = '🟢 黃金交叉 ';
                confidence = 70;
            } else {
                signalType = '🟡 弱勢黃金交叉 ';
                confidence = 35;
            }
        } else {
            // 死亡交叉
            if (volumeInfo.strength >= 8) {
                signalType = '🔴 恐慌性死亡交叉 ';
                confidence = 95;
            } else if (volumeInfo.strength >= 6) {
                signalType = '🔴 死亡交叉 ';
                confidence = 70;
            } else {
                signalType = '🟠 緩跌死亡交叉 ';
                confidence = 35;
            }
        }

        tradeAnalysis.push({
            date: trade.date,
            action: trade.action,
            price: trade.price,
            volume: currentVolume,
            avgVolume: avgVol,
            volumeInfo: volumeInfo,
            signalType: signalType,
            confidence: confidence,
            recommendation: getTradeRecommendation(trade.action, volumeInfo.strength)
        });
    }

    // 顯示交易對應的成交量分析
    if (tradeAnalysis.length > 0) {
        html += `
            <div class="volume-trades-table">
                <h5>交易訊號與成交量強度對照</h5>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                        <tr>
                            <th style="padding: 10px; text-align: left;">日期</th>
                            <th style="padding: 10px; text-align: left;">交易動作</th>
                            <th style="padding: 10px; text-align: left;">成交量</th>
                            <th style="padding: 10px; text-align: left;">量級評估</th>
                            <th style="padding: 10px; text-align: left;">訊號類型</th>
                            <th style="padding: 10px; text-align: left;">信心度</th>
                            <th style="padding: 10px; text-align: left;">建議</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        tradeAnalysis.forEach((ta, idx) => {
            const confidenceColor = ta.confidence >= 80 ? '#4caf50' : 
                                  ta.confidence >= 60 ? '#ff9800' : '#f44336';
            const actionColor = ta.action === '買入' ? '#4caf50' : '#f44336';
            
            html += `
                <tr style="border-bottom: 1px solid #eee; background: ${idx % 2 === 0 ? '#f9f9f9' : 'white'};">
                    <td style="padding: 10px;"><strong>${ta.date}</strong></td>
                    <td style="padding: 10px; color: ${actionColor}; font-weight: bold;">${ta.action}</td>
                    <td style="padding: 10px;">${ta.volume.toLocaleString()}</td>
                    <td style="padding: 10px;">${ta.volumeInfo.level}<br><span style="font-size: 0.85em; color: #666;">${ta.volumeInfo.ratio}x</span></td>
                    <td style="padding: 10px;">${ta.signalType}</td>
                    <td style="padding: 10px;"><span style="background: ${confidenceColor}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${ta.confidence}%</span></td>
                    <td style="padding: 10px;">${ta.recommendation}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    // 統計摘要
    const strongTrades = tradeAnalysis.filter(t => t.confidence >= 80).length;
    const mediumTrades = tradeAnalysis.filter(t => t.confidence >= 60 && t.confidence < 80).length;
    const weakTrades = tradeAnalysis.filter(t => t.confidence < 60).length;

    html += `
        <div style="margin-top: 20px; padding: 15px; background: #f0f7ff; border-radius: 8px; border-left: 4px solid #2196F3;">
            <h5>📈 訊號質量統計</h5>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;">
                <div style="text-align: center;">
                    <div style="font-size: 1.5em; font-weight: bold; color: #4caf50;">${strongTrades}</div>
                    <div style="font-size: 0.9em; color: #666;">強訊號 (≥80%)</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 1.5em; font-weight: bold; color: #ff9800;">${mediumTrades}</div>
                    <div style="font-size: 0.9em; color: #666;">中等訊號 (60-80%)</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 1.5em; font-weight: bold; color: #f44336;">${weakTrades}</div>
                    <div style="font-size: 0.9em; color: #666;">弱訊號 (<60%)</div>
                </div>
            </div>
        </div>
        </div>
    `;

    return html;
}

/**
 * 評估成交量強度
 */
function evaluateVolume(currentVolume, avgVolume) {
    const ratio = currentVolume / avgVolume;
    let strength, level, comment;

    if (ratio >= 1.5) {
        strength = 10;
        level = '🔴 極強)';
        comment = '成交量明顯放大，市場共識強烈';
    } else if (ratio >= 1.2) {
        strength = 8;
        level = '🟠 強';
        comment = '成交量較平常增加，買賣意願明確';
    } else if (ratio >= 1.0) {
        strength = 6;
        level = '🟡 中';
        comment = '成交量正常水平';
    } else if (ratio >= 0.7) {
        strength = 3;
        level = '🔵 弱';
        comment = '成交量低於平均，買氣不足';
    } else {
        strength = 1;
        level = '⚫ 極弱';
        comment = '成交量極低，接盤俠稀少';
    }

    return { strength, level, ratio: ratio.toFixed(2), comment };
}

/**
 * 獲取交易建議
 */
function getTradeRecommendation(action, volumeStrength) {
    if (action === '買入') {
        if (volumeStrength >= 8) return '💰 強烈買入';
        if (volumeStrength >= 6) return '👍 可買入';
        return '⚠️ 謹慎買入';
    } else {
        if (volumeStrength >= 8) return '⛔ 強烈賣出';
        if (volumeStrength >= 6) return '👎 可賣出';
        return '⚠️ 謹慎賣出';
    }
}

/**
 * 計算平均成交量
 */
function computeAverageVolume(volumes, period) {
    return volumes.map((_, index) => {
        if (index < period - 1) return null;
        
        const sum = volumes
            .slice(index - period + 1, index + 1)
            .reduce((acc, v) => acc + v, 0);
        
        return sum / period;
    });
}

function handleVolumeFileUpload() {
    const fileInput = document.getElementById('csvFileVolume');
    const file = fileInput.files[0];
    
    if (!file) return;

    document.getElementById('fileNameVolume').textContent = `已選擇: ${file.name}`;
    document.getElementById('volumeError').textContent = '';

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const csvContent = e.target.result;
            volumeCSVData = csvContent;
            document.getElementById('volumeError').textContent = '';
        } catch (error) {
            document.getElementById('volumeError').textContent = '❌ 檔案解析失敗: ' + error.message;
        }
    };
    reader.readAsText(file);
}

function analyzeVolumeSignals() {
    if (!volumeCSVData) {
        document.getElementById('volumeError').textContent = '❌ 請先上傳 CSV 檔案';
        return;
    }

    const shortPeriod = parseInt(document.getElementById('shortMAPeriod').value) || 20;
    const longPeriod = parseInt(document.getElementById('longMAPeriod').value) || 50;
    const volumePeriod = parseInt(document.getElementById('volumePeriod').value) || 20;

    if (shortPeriod >= longPeriod) {
        document.getElementById('volumeError').textContent = '❌ 短期均線周期必須小於長期均線周期';
        return;
    }

    document.getElementById('volumeLoading').classList.add('show');
    document.getElementById('volumeResults').innerHTML = '';
    document.getElementById('volumeSummary').style.display = 'none';

    setTimeout(() => {
        try {
            // 創建訊號系統實例
            const signalSystem = new VolumeSignalSystem();
            signalSystem.parseCSV(volumeCSVData);
            
            // 進行分析
            const report = signalSystem.generateReport(shortPeriod, longPeriod);
            const signals = signalSystem.detectCrossovers(shortPeriod, longPeriod, volumePeriod);

            // 更新統計摘要
            document.getElementById('totalSignals').textContent = report.summary.totalSignals;
            document.getElementById('goldenCount').textContent = report.summary.goldenCrosses;
            document.getElementById('deathCount').textContent = report.summary.deathCrosses;
            document.getElementById('strongCount').textContent = report.summary.strongSignals;
            document.getElementById('mediumCount').textContent = report.summary.mediumSignals;
            document.getElementById('weakCount').textContent = report.summary.weakSignals;
            document.getElementById('volumeSummary').style.display = 'block';

            // 生成詳細表格
            if (signals.length === 0) {
                document.getElementById('volumeResults').innerHTML = '<div class="info-box">未偵測到交叉訊號。請嘗試調整均線周期。</div>';
            } else {
                let html = `
                    <h3>📋 交叉訊號詳細列表 (共 ${signals.length} 個訊號)</h3>
                    <div class="signals-table-wrapper">
                        <table class="signals-table">
                            <thead>
                                <tr>
                                    <th>序號</th>
                                    <th>日期</th>
                                    <th>訊號類型</th>
                                    <th>收盤價</th>
                                    <th>短期MA</th>
                                    <th>長期MA</th>
                                    <th>成交量</th>
                                    <th>量級評估</th>
                                    <th>信心度</th>
                                    <th>建議</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                signals.forEach((signal, index) => {
                    const confidenceClass = signal.confidence >= 80 ? 'high' : 
                                          signal.confidence >= 60 ? 'medium' : 'low';
                    const signalClass = signal.crossType === '黃金交叉 (Golden Cross)' ? 'golden' : 'death';
                    
                    html += `
                        <tr class="signal-row-${signalClass}">
                            <td>${index + 1}</td>
                            <td><strong>${signal.date}</strong></td>
                            <td>${signal.type}</td>
                            <td>${signal.price.toFixed(2)}</td>
                            <td>${signal.shortMA}</td>
                            <td>${signal.longMA}</td>
                            <td>${signal.volume}</td>
                            <td>${signal.volumeInfo.level}<br><span class="ratio">${signal.volumeInfo.ratio}x</span></td>
                            <td><span class="confidence-${confidenceClass}"><strong>${signal.confidence}%</strong></span></td>
                            <td>${signal.recommendation}</td>
                        </tr>
                        <tr class="detail-row">
                            <td colspan="10">
                                <div class="signal-detail-content">
                                    <strong>📝 詳細說明：</strong><br>
                                    ${signal.description}
                                    <hr>
                                    <strong>🔍 成交量分析：</strong><br>
                                    ${signal.volumeInfo.comment}
                                </div>
                            </td>
                        </tr>
                    `;
                });

                html += `
                            </tbody>
                        </table>
                    </div>
                `;

                document.getElementById('volumeResults').innerHTML = html;
            }

            document.getElementById('volumeError').textContent = '';
        } catch (error) {
            document.getElementById('volumeError').textContent = '❌ 分析失敗: ' + error.message;
            console.error('Error:', error);
        } finally {
            document.getElementById('volumeLoading').classList.remove('show');
        }
    }, 100);
}

// ==================== 年份穩定性分析模組 (新增) ====================

/**
 * 年份穩定性分析
 * 用於找「溫和參數」：在多年回測中都表現穩定、排名一致的參數
 */
function analyzeYearlyStability() {
    console.log('🔍 開始年份穩定性分析...');
    
    const stockSymbol = document.getElementById('stockSelectYearly').value;
    const shortMA = parseInt(document.getElementById('testShortMA').value);
    const longMA = parseInt(document.getElementById('testLongMA').value);
    const maType = document.getElementById('maTypeYearly').value;
    const initialCash = parseFloat(document.getElementById('initialCashYearly').value);
    const useCommission = document.getElementById('useCommissionYearly').checked;
    const startYear = parseInt(document.getElementById('startYearYearly').value);
    const endYear = parseInt(document.getElementById('endYearYearly').value);
    
    if (!csvData2) {
        showError('yearly', '請先上傳 CSV 檔案');
        return;
    }
    
    if (!stockSymbol) {
        showError('yearly', '請選擇股票代碼');
        return;
    }
    
    if (startYear > endYear) {
        showError('yearly', '開始年份不能大於結束年份');
        return;
    }
    
    document.getElementById('loadingYearly').classList.add('show');
    document.getElementById('errorYearly').classList.remove('show');
    document.getElementById('resultsYearly').classList.remove('show');
    
    setTimeout(() => {
        try {
            const data = parseCSVData(csvData2, stockSymbol);
            if (!data) {
                showError('yearly', '無法解析股票資料');
                return;
            }
            
            // 按年份分組數據
            const yearlyData = {};
            for (let year = startYear; year <= endYear; year++) {
                yearlyData[year] = {
                    dates: [],
                    closes: [],
                    startDate: `1/1/${year}`,
                    endDate: `12/31/${year}`
                };
            }
            
            // 填充數據
            for (let i = 0; i < data.dates.length; i++) {
                const date = new Date(data.dates[i]);
                const year = date.getFullYear();
                if (year >= startYear && year <= endYear) {
                    yearlyData[year].dates.push(data.dates[i]);
                    yearlyData[year].closes.push(data.closes[i]);
                }
            }
            
            // 計算每年的回測結果
            const yearlyResults = {};
            const maxPeriod = Math.max(shortMA, longMA);
            const extraDays = maxPeriod - 1;
            
            for (let year = startYear; year <= endYear; year++) {
                const yearData = yearlyData[year];
                if (yearData.closes.length < maxPeriod) {
                    console.warn(`⚠️ ${year}年數據不足，跳過`);
                    continue;
                }
                
                // 找出所有數據中該年年份的起始索引
                let fullStartIdx = 0, fullEndIdx = 0;
                for (let i = 0; i < data.dates.length; i++) {
                    const date = new Date(data.dates[i]);
                    if (date.getFullYear() === year) {
                        if (fullStartIdx === 0) fullStartIdx = i;
                        fullEndIdx = i;
                    }
                }
                
                // 準備擴展的日期和收盤價 (包括前一年的數據用於計算均線)
                const dataStartIdx = Math.max(0, fullStartIdx - extraDays);
                const outputStartIdx = fullStartIdx - dataStartIdx;
                const expandedDates = data.dates.slice(dataStartIdx, fullEndIdx + 1);
                const expandedCloses = data.closes.slice(dataStartIdx, fullEndIdx + 1);
                
                // 回測
                const result = backtest(
                    expandedDates, expandedCloses, shortMA, longMA, 
                    initialCash, outputStartIdx, expandedDates.length - 1, 
                    maType, maType, useCommission
                );
                
                yearlyResults[year] = {
                    year: year,
                    finalValue: result.finalValue,
                    returnRate: result.returnRate,
                    tradeCount: result.tradeCount,
                    ...result
                };
                
                console.log(`✅ ${year}年: 回報 ${result.returnRate.toFixed(2)}% (${result.finalValue.toFixed(2)})`);
            }
            
            // 計算統計數據
            const resultsArray = Object.values(yearlyResults).sort((a, b) => a.year - b.year);
            const returnRates = resultsArray.map(r => r.returnRate);
            const finalValues = resultsArray.map(r => r.finalValue);
            const avgReturnRate = returnRates.reduce((a, b) => a + b, 0) / returnRates.length;
            
            const stats = {
                avgReturnRate: avgReturnRate,
                stdDevReturnRate: Math.sqrt(
                    returnRates.reduce((sum, val) => sum + Math.pow(val - avgReturnRate, 2), 0) / returnRates.length
                ),
                maxReturnRate: Math.max(...returnRates),
                minReturnRate: Math.min(...returnRates),
                positiveYears: returnRates.filter(r => r > 0).length,
                negativeYears: returnRates.filter(r => r < 0).length
            };
            
            displayYearlyAnalysis(resultsArray, stats, shortMA, longMA, maType, stockSymbol);
            
        } catch (error) {
            console.error('年份分析錯誤:', error);
            showError('yearly', '分析出錯: ' + error.message);
        } finally {
            document.getElementById('loadingYearly').classList.remove('show');
        }
    }, 100);
}

/**
 * 顯示年份穩定性分析結果
 */
function displayYearlyAnalysis(yearlyResults, stats, shortMA, longMA, maType, stockSymbol) {
    let html = `
        <div class="yearly-analysis-container">
            <div class="analysis-header">
                <h3>📊 年份穩定性分析結果</h3>
                <p>參數: SMA(${shortMA}, ${longMA}) | ${stockSymbol}</p>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">平均回報率</div>
                    <div class="stat-value ${stats.avgReturnRate >= 0 ? 'positive' : 'negative'}">
                        ${stats.avgReturnRate.toFixed(2)}%
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">標準差</div>
                    <div class="stat-value">
                        ${stats.stdDevReturnRate.toFixed(2)}%
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">最佳年份</div>
                    <div class="stat-value positive">
                        ${stats.maxReturnRate.toFixed(2)}%
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">最差年份</div>
                    <div class="stat-value negative">
                        ${stats.minReturnRate.toFixed(2)}%
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">獲利年份</div>
                    <div class="stat-value positive">
                        ${stats.positiveYears} / ${yearlyResults.length}
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">虧損年份</div>
                    <div class="stat-value negative">
                        ${stats.negativeYears} / ${yearlyResults.length}
                    </div>
                </div>
            </div>
            
            <div class="yearly-table-section">
                <h4>📅 各年份詳細數據</h4>
                <table class="yearly-table">
                    <thead>
                        <tr>
                            <th>年份</th>
                            <th>初始資金</th>
                            <th>最終價值</th>
                            <th>回報率</th>
                            <th>交易次數</th>
                            <th>排名評估</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    yearlyResults.forEach(result => {
        const returnClass = result.returnRate >= 0 ? 'positive' : 'negative';
        const returnSymbol = result.returnRate >= 0 ? '📈' : '📉';
        
        // 簡單評估排名: 如果回報 > 平均 + 標準差，評為「優秀」
        let ranking = '中等';
        if (result.returnRate > stats.avgReturnRate + stats.stdDevReturnRate) {
            ranking = '優秀 ⭐⭐⭐';
        } else if (result.returnRate < stats.avgReturnRate - stats.stdDevReturnRate) {
            ranking = '欠佳 ⚠️';
        }
        
        html += `
            <tr>
                <td><strong>${result.year}</strong></td>
                <td>$10,000</td>
                <td class="${returnClass}">${result.finalValue.toFixed(2)}</td>
                <td class="${returnClass}">${returnSymbol} ${result.returnRate.toFixed(2)}%</td>
                <td>${result.tradeCount}</td>
                <td>${ranking}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
            
            <div class="stability-assessment">
                <h4>🎯 溫和度評估</h4>
                <div class="assessment-details">
    `;
    
    // 評估參數的「溫和度」
    const stabilityScore = 100 - Math.min(stats.stdDevReturnRate, 100); // 標準差越小越好
    const consistencyScore = (stats.positiveYears / yearlyResults.length) * 100; // 獲利年份比例
    const overallScore = (stabilityScore + consistencyScore) / 2;
    
    const assessmentLevel = overallScore >= 70 ? '✅ 非常溫和 - 推薦使用' : 
                           overallScore >= 50 ? '🟡 相對溫和 - 可接受' :
                           '⚠️ 不夠溫和 - 風險較高';
    
    html += `
                    <p><strong>穩定性評分:</strong> ${stabilityScore.toFixed(1)}/100 (基於標準差)</p>
                    <p><strong>一致性評分:</strong> ${consistencyScore.toFixed(1)}/100 (${stats.positiveYears}/${yearlyResults.length}年獲利)</p>
                    <p><strong>綜合評分:</strong> <span class="score">${overallScore.toFixed(1)}/100</span></p>
                    <p><strong>評估結果:</strong> ${assessmentLevel}</p>
                    <p class="assessment-advice">
                        ${overallScore >= 70 ? 
                            '此參數在不同年份表現穩定，標準差低且大多數年份都獲利。適合長期持有策略。' :
                        overallScore >= 50 ?
                            '此參數表現相對一致，但在某些年份表現不佳。可作為輔助參考。' :
                            '此參數在年份間波動較大，存在風險年份。建議尋找其他參數組合。'}
                    </p>
                </div>
            </div>
            
            <div style="margin-top: 30px; text-align: center;">
                <button class="btn" onclick="returnToMildParametersResults()" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                    ← 回到參數排名
                </button>
            </div>
        </div>
    `;
    
    const resultsContainer = document.getElementById('resultsYearly');
    resultsContainer.innerHTML = html;
    resultsContainer.classList.add('show');
}

/**
 * 尋找溫和參數
 * 掃描多個參數組合，找出在各年份都表現穩定的參數
 */
function findMildParameters() {
    console.log('🔍 開始掃描溫和參數...');
    
    const stockSymbol = document.getElementById('stockSelectYearly').value;
    const maType = document.getElementById('maTypeYearly').value;
    const initialCash = parseFloat(document.getElementById('initialCashYearly').value);
    const useCommission = document.getElementById('useCommissionYearly').checked;
    const startYear = parseInt(document.getElementById('startYearYearly').value);
    const endYear = parseInt(document.getElementById('endYearYearly').value);
    const minMA = parseInt(document.getElementById('minMAScan').value || '5');
    const maxMA = parseInt(document.getElementById('maxMAScan').value || '100');
    const step = parseInt(document.getElementById('stepScan').value || '5');
    
    if (!csvData2) {
        showError('yearly', '請先上傳 CSV 檔案');
        return;
    }
    
    if (!stockSymbol) {
        showError('yearly', '請選擇股票代碼');
        return;
    }
    
    document.getElementById('loadingYearly').classList.add('show');
    document.getElementById('errorYearly').classList.remove('show');
    document.getElementById('resultsYearly').classList.remove('show');
    
    setTimeout(() => {
        try {
            const data = parseCSVData(csvData2, stockSymbol);
            if (!data) {
                showError('yearly', '無法解析股票資料');
                return;
            }
            
            const parameterScores = [];
            const totalParams = Math.pow(Math.ceil((maxMA - minMA) / step) + 1, 2);
            let processedCount = 0;
            
            for (let s = minMA; s <= maxMA; s += step) {
                for (let l = minMA; l <= maxMA; l += step) {
                    // 短期MA必須小於長期MA
                    if (s >= l) {
                        continue;
                    }
                    
                    // 計算每個參數組合在各年份的表現
                    const yearlyResults = {};
                    const maxPeriod = Math.max(s, l);
                    const extraDays = maxPeriod - 1;
                    let validYears = 0;
                    
                    for (let year = startYear; year <= endYear; year++) {
                        // 找該年數據範圍
                        let fullStartIdx = -1, fullEndIdx = -1;
                        for (let i = 0; i < data.dates.length; i++) {
                            const date = new Date(data.dates[i]);
                            if (date.getFullYear() === year) {
                                if (fullStartIdx === -1) fullStartIdx = i;
                                fullEndIdx = i;
                            }
                        }
                        
                        if (fullStartIdx === -1 || fullEndIdx - fullStartIdx < maxPeriod) {
                            continue;
                        }
                        
                        const dataStartIdx = Math.max(0, fullStartIdx - extraDays);
                        const outputStartIdx = fullStartIdx - dataStartIdx;
                        const expandedDates = data.dates.slice(dataStartIdx, fullEndIdx + 1);
                        const expandedCloses = data.closes.slice(dataStartIdx, fullEndIdx + 1);
                        
                        const result = backtest(
                            expandedDates, expandedCloses, s, l, 
                            initialCash, outputStartIdx, expandedDates.length - 1, 
                            maType, maType, useCommission
                        );
                        
                        yearlyResults[year] = result.returnRate;
                        validYears++;
                    }
                    
                    if (validYears > 0) {
                        // 計算標準差和一致性
                        const returns = Object.values(yearlyResults);
                        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
                        const stdDev = Math.sqrt(returns.reduce((sum, val) => sum + Math.pow(val - avgReturn, 2), 0) / returns.length);
                        const posYears = returns.filter(r => r > 0).length;
                        const consistency = (posYears / returns.length) * 100;
                        
                        // 獲取用戶選擇的評分條件
                        const useStability = document.getElementById('useStability').checked;
                        const useConsistency = document.getElementById('useConsistency').checked;
                        const useReturn = document.getElementById('useReturn').checked;
                        
                        // 計數選擇的條件數（用於動態分配權重）
                        const selectedCount = (useStability ? 1 : 0) + (useConsistency ? 1 : 0) + (useReturn ? 1 : 0);
                        
                        if (selectedCount === 0) {
                            showError('yearly', '請至少選擇一個評分條件');
                            return;
                        }
                        
                        // 計算各項評分
                        const stabilityScore = 100 - Math.min(stdDev, 100);
                        // avgReturn 已經是百分比數字（如 19.20, 30.43 等）
                        // 直接使用，上限 100 分
                        const avgReturnPercentage = Math.min(Math.abs(avgReturn), 100);
                        
                        // 根據選擇的條件動態計算溫和度評分
                        let mildnessScore = 0;
                        const weight = 1 / selectedCount; // 每個選中條件的權重
                        
                        if (useStability) mildnessScore += stabilityScore * weight;
                        if (useConsistency) mildnessScore += consistency * weight;
                        if (useReturn) mildnessScore += avgReturnPercentage * weight;
                        
                        parameterScores.push({
                            shortMA: s,
                            longMA: l,
                            avgReturn: avgReturn,
                            stdDev: stdDev,
                            consistency: consistency,
                            stabilityScore: stabilityScore,
                            mildnessScore: mildnessScore,
                            validYears: validYears,
                            yearlyResults: yearlyResults,
                            selectedCriteria: {
                                useStability,
                                useConsistency,
                                useReturn,
                                selectedCount
                            }
                        });
                    }
                    
                    processedCount++;
                    if (processedCount % 10 === 0) {
                        console.log(`進度: ${processedCount}/${totalParams}`);
                    }
                }
            }
            
            // 排序：按溫和度評分從高到低
            parameterScores.sort((a, b) => b.mildnessScore - a.mildnessScore);
            
            // 緩存排名結果
            cachedMildParametersResults = parameterScores;
            cachedMildParametersStockSymbol = stockSymbol;
            
            displayMildParameterResults(parameterScores, stockSymbol);
            
        } catch (error) {
            console.error('掃描溫和參數錯誤:', error);
            showError('yearly', '掃描出錯: ' + error.message);
        } finally {
            document.getElementById('loadingYearly').classList.remove('show');
        }
    }, 100);
}

/**
 * 顯示溫和參數掃描結果
 */
function displayMildParameterResults(parameterScores, stockSymbol) {
    // 取得第一個參數的選擇條件（所有參數都使用相同的條件）
    const criteria = parameterScores.length > 0 ? parameterScores[0].selectedCriteria : null;
    
    // 生成評分條件說明
    let criteriaText = '';
    if (criteria) {
        const selected = [];
        if (criteria.useStability) selected.push('穩定性');
        if (criteria.useConsistency) selected.push('一致性');
        if (criteria.useReturn) selected.push('報酬');
        criteriaText = `評分基準：${selected.join(' + ')} (各占 ${(100 / criteria.selectedCount).toFixed(0)}%)`;
    }
    
    let html = `
        <div class="mild-parameters-container">
            <div class="analysis-header">
                <h3>🌿 溫和參數掃描結果</h3>
                <p>找尋在 2014-2024 各年份都表現穩定的參數組合</p>
                ${criteriaText ? `<p style="color: #666; font-size: 0.95em; background: #f0f0f0; padding: 8px 12px; border-radius: 4px; display: inline-block;">${criteriaText}</p>` : ''}
            </div>
            
            <table class="parameters-ranking">
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>短期MA</th>
                        <th>長期MA</th>
                        <th>平均回報</th>
                        <th>標準差</th>
                        <th>一致性</th>
                        <th>溫和度評分</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    parameterScores.slice(0, 20).forEach((param, index) => {
        const returnClass = param.avgReturn >= 0 ? 'positive' : 'negative';
        const mildnessClass = param.mildnessScore >= 70 ? 'excellent' : 
                             param.mildnessScore >= 50 ? 'good' : 'fair';
        
        html += `
            <tr>
                <td><strong>${index + 1}</strong></td>
                <td>${param.shortMA}</td>
                <td>${param.longMA}</td>
                <td class="${returnClass}">${param.avgReturn.toFixed(2)}%</td>
                <td>${param.stdDev.toFixed(2)}%</td>
                <td>${param.consistency.toFixed(1)}%</td>
                <td><span class="score ${mildnessClass}">${param.mildnessScore.toFixed(1)}</span></td>
                <td>
                    <button class="btn-small" onclick="testParameter(${param.shortMA}, ${param.longMA})">
                        詳細檢測
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            
            <div class="guide">
                <h4>🔍 參數說明</h4>
                <ul>
                    <li><strong>標準差:</strong> 越小越好，表示年份間波動小（穩定性高）</li>
                    <li><strong>一致性:</strong> 百分比，代表在多少比例的年份獲利</li>
                    <li><strong>溫和度評分:</strong> 綜合評估，≥70分推薦使用</li>
                    <li>點擊「詳細檢測」可查看該參數的完整年份分析</li>
                </ul>
            </div>
        </div>
    `;
    
    const resultsContainer = document.getElementById('resultsYearly');
    resultsContainer.innerHTML = html;
    resultsContainer.classList.add('show');
}

/**
 * 測試具體參數
 */
function testParameter(shortMA, longMA) {
    document.getElementById('testShortMA').value = shortMA;
    document.getElementById('testLongMA').value = longMA;
    analyzeYearlyStability();
    
    // 滾動到分析結果
    document.getElementById('resultsYearly').scrollIntoView({ behavior: 'smooth' });
}

/**
 * 回到排名結果（直接顯示緩存的結果，不重新計算）
 */
function returnToMildParametersResults() {
    if (cachedMildParametersResults && cachedMildParametersStockSymbol) {
        displayMildParameterResults(cachedMildParametersResults, cachedMildParametersStockSymbol);
        // 滾動到排名結果
        document.getElementById('resultsYearly').scrollIntoView({ behavior: 'smooth' });
    } else {
        // 如果緩存不存在，則重新計算
        findMildParameters();
    }
}

function showError(mode, message) {
    const errorDiv = document.getElementById(`error${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }
}
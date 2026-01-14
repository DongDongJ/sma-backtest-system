let csvData2 = null;
let allOptimizationResults = [];
let currentView = 'top';
let chartState = {
    visible: { price: true, shortMA: true, longMA: true, trades: true },
    chartData: null,
    canvas: null,
    ctx: null,
    padding: null,
    chartWidth: 0,
    chartHeight: 0,
    minPrice: 0,
    maxPrice: 0,
    priceRange: 0
};

document.addEventListener('DOMContentLoaded', function() {
    const displayCountSelect = document.getElementById('displayCount');
    const customCountInput = document.getElementById('customCount');
    
    if (displayCountSelect) {
        displayCountSelect.addEventListener('change', function() {
            customCountInput.disabled = (this.value !== 'custom');
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
    const fileInput = document.getElementById(`csvFile${mode}`);
    const file = fileInput.files[0];
    
    if (!file) return;

    document.getElementById(`fileName${mode}`).textContent = `已選擇:${file.name}`;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const stockSelect = document.getElementById(`stockSelect${mode}`);
        stockSelect.innerHTML = '<option value="">選擇股票代碼</option>';
        
        headers.slice(1).forEach(header => {
            if (header) {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                stockSelect.appendChild(option);
            }
        });

        csvData2 = { headers, lines };
    };
    reader.readAsText(file);
}

function parseCSVData(csvData, stockSymbol) {
    const targetCol = csvData.headers.indexOf(stockSymbol);
    if (targetCol === -1) return null;

    const dates = [];
    const closes = [];

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

    return { dates, closes };
}

// 計算手續費
function calculateCommissionAmount(price, shares, useCommission) {
    if (!useCommission) return 0.0;
    
    const commission = price * shares * 0.0008; //0.08%
    return Math.max(commission, minCommission);
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

    // 計算權重總和
    let weightSum = 0;
    for (let i = 1; i <= window; i++) {
        weightSum += i;
    }

    // 計算第一個 WMA 值
    let weightedSum = 0;
    for (let i = 0; i < window; i++) {
        weightedSum += closes[i] * (i + 1);
    }
    wma.push(weightedSum / weightSum);

    // 滑動計算後續 WMA 值
    for (let i = window; i < closes.length; i++) {
        weightedSum = 0;
        for (let j = 0; j < window; j++) {
            weightedSum += closes[i - window + 1 + j] * (j + 1);
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

        // 黃金交叉
        if (prevShortMA <= prevLongMA && currShortMA > currLongMA && shares === 0) {
            shares = Math.floor(cash / currPrice);
            const cost = shares * currPrice;
            cash -= cost;
            
            buyCommissionRecord = calculateCommissionAmount(currPrice, shares, useCommission);
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
        else if (prevShortMA >= prevLongMA && currShortMA < currLongMA && shares > 0) {
            const sellCommissionRecord = calculateCommissionAmount(currPrice, shares, useCommission);
            const revenue = shares * currPrice;
            cash += revenue - buyCommissionRecord - sellCommissionRecord;
            
            totalCommission += buyCommissionRecord + sellCommissionRecord;

            trades.push({
                date: dates[i],
                action: '賣出',
                price: currPrice,
                shares: shares,
                buyCommission: buyCommissionRecord,
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
        finalValue = cash + revenue - buyCommissionRecord - sellCommissionRecord;
        totalCommission += buyCommissionRecord + sellCommissionRecord;
        
        trades.push({
            date: dates[endIdx],
            action: '期末賣出',
            price: closes[endIdx],
            shares: shares,
            buyCommission: buyCommissionRecord,
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
        trades,
        shortMAData: shortMA,
        longMAData: longMA
    };
}

function showError(mode, message) {
    const errorDiv = document.getElementById(`error${mode}`);
    errorDiv.textContent = '⚠ ' + message;
    errorDiv.classList.add('show');
    setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

function initChart(dates, prices, shortMA, longMA, trades, canvasId = 'mainChart') {
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
    chartState.chartData = { dates, prices, shortMA, longMA, trades };
    chartState.padding = { top: 40, right: 30, bottom: 80, left: 60 };
    
    draw();

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        document.getElementById('chartTooltip').style.display = 'none';
    });
}

function draw() {
    const { ctx, canvas, chartData, padding, visible } = chartState;
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    
    ctx.clearRect(0, 0, width, height);

    const allVals = [];
    if (visible.price) allVals.push(...chartData.prices);
    if (visible.shortMA) allVals.push(...chartData.shortMA.filter(v => v !== null));
    if (visible.longMA) allVals.push(...chartData.longMA.filter(v => v !== null));

    const minP = Math.min(...allVals) * 0.98;
    const maxP = Math.max(...allVals) * 1.02;
    
    chartState.minPrice = minP;
    chartState.maxPrice = maxP;
    chartState.priceRange = maxP - minP;
    chartState.chartWidth = width - padding.left - padding.right;
    chartState.chartHeight = height - padding.top - padding.bottom;

    const getX = (i) => padding.left + (i / (chartData.dates.length - 1)) * chartState.chartWidth;
    const getY = (v) => padding.top + chartState.chartHeight - ((v - minP) / chartState.priceRange) * chartState.chartHeight;

    ctx.strokeStyle = '#f0f0f0';
    ctx.beginPath();
    for(let i=0; i<=5; i++) {
        const y = padding.top + (i / 5) * chartState.chartHeight;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartState.chartWidth, y);
        ctx.fillStyle = '#999';
        ctx.font = '12px Arial';
        ctx.fillText((maxP - (i/5)*chartState.priceRange).toFixed(1), padding.left - 45, y + 4);
    }
    ctx.stroke();

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
        ctx.translate(x, padding.top + chartState.chartHeight + 15);
        ctx.rotate(Math.PI / 4);
        ctx.fillText(chartData.dates[i], 0, 0);
        ctx.restore();
    }

    if (visible.price) drawDataLine(chartData.prices, '#666', 2);
    if (visible.shortMA) drawDataLine(chartData.shortMA, '#ff9800', 1.5);
    if (visible.longMA) drawDataLine(chartData.longMA, '#4caf50', 1.5);

    chartData.trades.forEach(t => {
        const idx = chartData.dates.indexOf(t.date);
        if (idx !== -1) {
            const x = getX(idx);
            const y = getY(t.price);
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

function drawDataLine(data, color, lineWidth) {
    const { ctx, chartData } = chartState;
    const getX = (i) => chartState.padding.left + (i / (chartData.dates.length - 1)) * chartState.chartWidth;
    const getY = (v) => chartState.padding.top + chartState.chartHeight - ((v - chartState.minPrice) / chartState.priceRange) * chartState.chartHeight;

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
    html += `<div class="tooltip-item"><span>價格:</span> <span class="tooltip-value">${chartData.prices[idx].toFixed(2)}</span></div>`;
    
    if (chartData.shortMA[idx]) {
        html += `<div class="tooltip-item" style="color:#ff9800"><span>短均:</span> <span class="tooltip-value">${chartData.shortMA[idx].toFixed(2)}</span></div>`;
    }
    if (chartData.longMA[idx]) {
        html += `<div class="tooltip-item" style="color:#4caf50"><span>長均:</span> <span class="tooltip-value">${chartData.longMA[idx].toFixed(2)}</span></div>`;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
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
    html += '<th>報酬率</th><th>交易數</th></tr></thead><tbody>';
    
    displayResults.forEach((r, index) => {
        let rank;
        if (currentView === 'bottom') {
            rank = results.length - displayCount + index + 1;
        } else {
            rank = results.indexOf(r) + 1;
        }
        
        const detailFunc = 'showDetailedResult(' + r.shortMA + ', ' + r.longMA + ', ' + JSON.stringify(r.shortMAType) + ')';
        html += '<tr style="cursor: pointer;" onclick="' + detailFunc + '">';
        html += '<td>' + rank + '</td>';
        html += '<td>' + r.shortMA + '</td>';
        html += '<td>' + r.longMA + '</td>';
        html += '<td>' + r.shortMAType + '</td>';
        html += '<td>$' + r.finalValue.toFixed(2) + '</td>';
        if (useCommission) html += '<td>$' + r.totalCommission.toFixed(2) + '</td>';
        html += '<td>' + r.returnRate.toFixed(2) + '%</td>';
        html += '<td>' + r.tradeCount + '</td>';
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

    for (let i = outputStartIdx; i < expandedDates.length; i++) {
        const shortIdx = i - (shortMADays - 1);
        const longIdx = i - (longMADays - 1);
        chartShortMA.push(shortIdx >= 0 && shortIdx < shortMA.length ? shortMA[shortIdx] : null);
        chartLongMA.push(longIdx >= 0 && longIdx < longMA.length ? longMA[longIdx] : null);
    }

    let html = `
        <div class="detail-section">
            <h3>📈 策略詳細分析 - ${stockSymbol}</h3>
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
        chartState.visible = { price: true, shortMA: true, longMA: true, buy: true, sell: true, end: true };
        initChart(chartDates, chartPrices, chartShortMA, chartLongMA, result.trades, "strategyChart");
    }, 100);
}

function returnToResults() {
    const stockSymbol = document.getElementById('stockSelect2').value;
    const initialCash = parseFloat(document.getElementById('initialCash2').value);
    const useCommission = document.getElementById('useCommission2').checked;
    displayOptimizationResults(allOptimizationResults, initialCash, stockSymbol, useCommission);
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

        for (let s = minMA; s <= maxMA; s++) {
            for (let l = minMA; l <= maxMA; l++) {
                const result = backtest(expandedDates, expandedCloses, s, l, initialCash, outputStartIdx, expandedDates.length - 1, maType, maType, useCommission);
                allOptimizationResults.push(result);
                
                calculationCount++;
                // 每 100 個計算打印一次進度
                if (calculationCount % 100 === 0 || calculationCount === totalCalcs) {
                    const elapsed = (performance.now() - startTime) / 1000;
                    const rate = calculationCount / elapsed;
                    const remaining = (totalCalcs - calculationCount) / rate;
                    console.log(`   進度: ${calculationCount}/${totalCalcs} (${Math.round(calculationCount/totalCalcs*100)}%) - 耗時: ${elapsed.toFixed(1)}s, 剩餘: ${remaining.toFixed(1)}s`);
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
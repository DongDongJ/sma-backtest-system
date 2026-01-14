let csvDataKD = null;
let allKDResults = [];
let currentKDView = 'top';
let kdChartState = {
    visible: { price: true, k: true, d: true, trades: true },
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
    const displayCountSelect = document.getElementById('displayCountKD');
    const customCountInput = document.getElementById('customCountKD');
    
    if (displayCountSelect) {
        displayCountSelect.addEventListener('change', function() {
            customCountInput.disabled = (this.value !== 'custom');
        });
    }
});

function handleFileUploadKD() {
    const fileInput = document.getElementById('csvFileKD');
    const file = fileInput.files[0];
    
    if (!file) return;

    document.getElementById('fileNameKD').textContent = `已選擇:${file.name}`;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const stockSelect = document.getElementById('stockSelectKD');
        stockSelect.innerHTML = '<option value="">選擇股票代碼</option>';
        
        headers.slice(1).forEach(header => {
            if (header) {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                stockSelect.appendChild(option);
            }
        });

        csvDataKD = { headers, lines };
    };
    reader.readAsText(file);
}

function parseCSVDataKD(csvData, stockSymbol) {
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
function calculateCommissionKD(price, shares, useCommission) {
    if (!useCommission) return 0.0;
    
    const commission = price * shares * 0.003; // 0.3%
    const minCommission = 20.0;
    return Math.max(commission, minCommission);
}

// 計算 KD 指標
function computeKD(closes, N, M1, M2) {
    const kd = {
        rsv: [],
        k: [],
        d: []
    };
    
    const size = closes.length;
    if (size < N) return kd;

    // 計算 RSV (Raw Stochastic Value)
    kd.rsv = new Array(size).fill(0);
    for (let i = N - 1; i < size; i++) {
        let highest = closes[i];
        let lowest = closes[i];

        // 找 N 天內的最高價和最低價
        for (let j = i - N + 1; j <= i; j++) {
            highest = Math.max(highest, closes[j]);
            lowest = Math.min(lowest, closes[j]);
        }

        // 計算 RSV
        if (highest === lowest) {
            kd.rsv[i] = 50.0;
        } else {
            kd.rsv[i] = (closes[i] - lowest) / (highest - lowest) * 100.0;
        }
    }

    // 計算 K 值和 D 值
    kd.k = new Array(size).fill(0);
    kd.d = new Array(size).fill(0);

    // K 值初始化：前 M1 個 K 值取平均
    let kSum = 0.0;
    for (let i = N - 1; i < N - 1 + M1 && i < size; i++) {
        kSum += kd.rsv[i];
    }
    kd.k[N - 1 + M1 - 1] = kSum / M1;

    // K 值平滑計算
    for (let i = N - 1 + M1; i < size; i++) {
        kd.k[i] = kd.k[i - 1] * (M1 - 1) / M1 + kd.rsv[i] * 1.0 / M1;
    }

    // D 值初始化：前 M2 個 K 值取平均
    let dSum = 0.0;
    for (let i = N - 1 + M1 - 1; i < N - 1 + M1 - 1 + M2 && i < size; i++) {
        dSum += kd.k[i];
    }
    kd.d[N - 1 + M1 - 1 + M2 - 1] = dSum / M2;

    // D 值平滑計算
    for (let i = N - 1 + M1 - 1 + M2; i < size; i++) {
        kd.d[i] = kd.d[i - 1] * (M2 - 1) / M2 + kd.k[i] * 1.0 / M2;
    }

    return kd;
}

// KD 回測
function backtestKD(dates, closes, N, M1, M2, initialCash, outputStartIdx, useCommission) {
    const result = {
        N: N,
        M1: M1,
        M2: M2,
        finalValue: 0,
        returnRate: 0,
        tradeCount: 0,
        totalCommission: 0,
        trades: [],
        kdData: null
    };

    const kd = computeKD(closes, N, M1, M2);
    result.kdData = kd;

    // 確定有效數據起始點（K 和 D 都有值）
    const validStartIdx = N - 1 + M1 - 1 + M2 - 1;
    const actualStartIdx = Math.max(outputStartIdx, validStartIdx + 1);

    if (actualStartIdx >= dates.length) {
        result.finalValue = initialCash;
        result.returnRate = 0.0;
        return result;
    }

    // 交易邏輯
    let cash = initialCash;
    let shares = 0;
    let inPosition = false;
    let buyCommissionRecord = 0.0;

    for (let i = actualStartIdx; i < dates.length; i++) {
        if (i < 1 || i >= kd.k.length || i >= kd.d.length) continue;

        const currK = kd.k[i];
        const currD = kd.d[i];
        const prevK = kd.k[i - 1];
        const prevD = kd.d[i - 1];
        const currPrice = closes[i];

        // 金叉：K 從下向上穿過 D，買入
        if (prevK <= prevD && currK > currD && !inPosition && shares === 0) {
            shares = Math.floor(cash / currPrice);
            const cost = shares * currPrice;
            cash -= cost;
            
            buyCommissionRecord = calculateCommissionKD(currPrice, shares, useCommission);
            inPosition = true;
            result.tradeCount++;

            result.trades.push({
                date: dates[i],
                action: '買入',
                price: currPrice,
                shares: shares,
                buyCommission: buyCommissionRecord,
                sellCommission: 0.0,
                cashAfter: cash,
                k: currK,
                d: currD
            });
        }
        // 死叉：K 從上向下穿過 D，賣出
        else if (prevK >= prevD && currK < currD && inPosition && shares > 0) {
            const sellCommissionRecord = calculateCommissionKD(currPrice, shares, useCommission);
            const revenue = shares * currPrice;
            cash += revenue - buyCommissionRecord - sellCommissionRecord;
            
            result.totalCommission += buyCommissionRecord + sellCommissionRecord;
            inPosition = false;
            result.tradeCount++;

            result.trades.push({
                date: dates[i],
                action: '賣出',
                price: currPrice,
                shares: shares,
                buyCommission: buyCommissionRecord,
                sellCommission: sellCommissionRecord,
                cashAfter: cash,
                k: currK,
                d: currD
            });

            shares = 0;
            buyCommissionRecord = 0.0;
        }
    }

    // 最終結算
    result.finalValue = cash;
    if (shares > 0) {
        const sellCommissionRecord = calculateCommissionKD(closes[closes.length - 1], shares, useCommission);
        const revenue = shares * closes[closes.length - 1];
        result.finalValue = cash + revenue - buyCommissionRecord - sellCommissionRecord;
        result.totalCommission += buyCommissionRecord + sellCommissionRecord;

        result.trades.push({
            date: dates[dates.length - 1],
            action: '期末賣出',
            price: closes[closes.length - 1],
            shares: shares,
            buyCommission: buyCommissionRecord,
            sellCommission: sellCommissionRecord,
            cashAfter: result.finalValue,
            k: kd.k[kd.k.length - 1],
            d: kd.d[kd.d.length - 1]
        });

        result.tradeCount++;
    }

    result.returnRate = ((result.finalValue - initialCash) / initialCash) * 100.0;

    return result;
}

function showErrorKD(message) {
    const errorDiv = document.getElementById('errorKD');
    errorDiv.textContent = '⚠ ' + message;
    errorDiv.classList.add('show');
    setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

function initKDChart(dates, prices, kValues, dValues, trades, canvasId = 'kdChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 400 * dpr;
    ctx.scale(dpr, dpr);

    kdChartState.canvas = canvas;
    kdChartState.ctx = ctx;
    kdChartState.chartData = { dates, prices, kValues, dValues, trades };
    kdChartState.padding = { top: 40, right: 30, bottom: 80, left: 60 };
    
    drawKDChart();

    canvas.addEventListener('mousemove', handleKDMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('kdTooltip');
        if (tooltip) tooltip.style.display = 'none';
    });
}

function drawKDChart() {
    const { ctx, canvas, chartData, padding, visible } = kdChartState;
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    
    ctx.clearRect(0, 0, width, height);

    const allVals = [];
    if (visible.price) allVals.push(...chartData.prices);

    const minP = Math.min(...allVals) * 0.98;
    const maxP = Math.max(...allVals) * 1.02;
    
    kdChartState.minPrice = minP;
    kdChartState.maxPrice = maxP;
    kdChartState.priceRange = maxP - minP;
    kdChartState.chartWidth = width - padding.left - padding.right;
    kdChartState.chartHeight = height - padding.top - padding.bottom;

    const getX = (i) => padding.left + (i / (chartData.dates.length - 1)) * kdChartState.chartWidth;
    const getY = (v) => padding.top + kdChartState.chartHeight - ((v - minP) / kdChartState.priceRange) * kdChartState.chartHeight;

    // 繪製網格
    ctx.strokeStyle = '#f0f0f0';
    ctx.beginPath();
    for(let i=0; i<=5; i++) {
        const y = padding.top + (i / 5) * kdChartState.chartHeight;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + kdChartState.chartWidth, y);
        ctx.fillStyle = '#999';
        ctx.font = '12px Arial';
        ctx.fillText((maxP - (i/5)*kdChartState.priceRange).toFixed(1), padding.left - 45, y + 4);
    }
    ctx.stroke();

    // 繪製日期標籤
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    
    const avgDateLength = chartData.dates.reduce((sum, d) => sum + d.length, 0) / chartData.dates.length;
    const charWidth = 6.5;
    const labelWidth = avgDateLength * charWidth;
    const minLabelSpacing = labelWidth * 1.2;
    const maxLabels = Math.max(8, Math.floor(kdChartState.chartWidth / minLabelSpacing));
    const dateStep = Math.max(1, Math.ceil(chartData.dates.length / maxLabels));
    
    for(let i=0; i<chartData.dates.length; i+=dateStep) {
        const x = getX(i);
        ctx.save();
        ctx.translate(x, padding.top + kdChartState.chartHeight + 15);
        ctx.rotate(Math.PI / 4);
        ctx.fillText(chartData.dates[i], 0, 0);
        ctx.restore();
    }

    // 繪製價格線
    if (visible.price) {
        drawKDDataLine(chartData.prices, '#666', 2);
    }

    // 繪製交易標記
    chartData.trades.forEach(t => {
        const idx = chartData.dates.indexOf(t.date);
        if (idx !== -1) {
            const x = getX(idx);
            const y = getY(t.price);
            ctx.lineWidth = 1;

            if (t.action === '買入') {
                ctx.fillStyle = '#4caf50';
                ctx.beginPath();
                ctx.moveTo(x, y - 10);
                ctx.lineTo(x - 7, y + 5);
                ctx.lineTo(x + 7, y + 5);
                ctx.closePath();
                ctx.fill();
            } else if (t.action === '賣出') {
                ctx.fillStyle = '#f44336';
                ctx.beginPath();
                ctx.moveTo(x, y + 10);
                ctx.lineTo(x - 7, y - 5);
                ctx.lineTo(x + 7, y - 5);
                ctx.closePath();
                ctx.fill();
            } else if (t.action === '期末賣出') {
                ctx.fillStyle = '#000000';
                ctx.fillRect(x - 5, y - 5, 10, 10);
            }
        }
    });
}

function drawKDDataLine(data, color, lineWidth) {
    const { ctx, chartData } = kdChartState;
    const getX = (i) => kdChartState.padding.left + (i / (chartData.dates.length - 1)) * kdChartState.chartWidth;
    const getY = (v) => kdChartState.padding.top + kdChartState.chartHeight - ((v - kdChartState.minPrice) / kdChartState.priceRange) * kdChartState.chartHeight;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    let first = true;
    for(let i=0; i<data.length; i++) {
        if (data[i] === null || data[i] === 0) continue;
        if (first) {
            ctx.moveTo(getX(i), getY(data[i]));
            first = false;
        } else {
            ctx.lineTo(getX(i), getY(data[i]));
        }
    }
    ctx.stroke();
}

function handleKDMouseMove(e) {
    const rect = kdChartState.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const { padding, chartWidth, chartData } = kdChartState;
    
    if (mouseX < padding.left || mouseX > padding.left + chartWidth) return;

    const idx = Math.round(((mouseX - padding.left) / chartWidth) * (chartData.dates.length - 1));
    const tooltip = document.getElementById('kdTooltip');
    
    let html = `<div class="tooltip-date">${chartData.dates[idx]}</div>`;
    html += `<div class="tooltip-item"><span>價格:</span> <span class="tooltip-value">${chartData.prices[idx].toFixed(2)}</span></div>`;
    
    if (chartData.kValues[idx]) {
        html += `<div class="tooltip-item" style="color:#2196f3"><span>K值:</span> <span class="tooltip-value">${chartData.kValues[idx].toFixed(2)}</span></div>`;
    }
    if (chartData.dValues[idx]) {
        html += `<div class="tooltip-item" style="color:#ff9800"><span>D值:</span> <span class="tooltip-value">${chartData.dValues[idx].toFixed(2)}</span></div>`;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
}

function displayKDResults(results, initialCash, stockSymbol, useCommission) {
    const resultsDiv = document.getElementById('resultsKD');
    const best = results[0];
    const worst = results[results.length - 1];
    
    const displayCountSelect = document.getElementById('displayCountKD').value;
    let displayCount;
    if (displayCountSelect === 'custom') {
        displayCount = parseInt(document.getElementById('customCountKD').value);
    } else {
        displayCount = parseInt(displayCountSelect);
    }
    displayCount = Math.min(displayCount, results.length);
    
    let html = `
        <div class="result-card">
            <h3>🏆 最佳 KD 策略 - ${stockSymbol}</h3>
            <div class="result-stats">
                <div class="stat-item">
                    <div class="stat-label">N (RSV週期)</div>
                    <div class="stat-value">${best.N}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">M1 (K平滑)</div>
                    <div class="stat-value">${best.M1}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">M2 (D平滑)</div>
                    <div class="stat-value">${best.M2}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">初始資金</div>
                    <div class="stat-value">${initialCash.toFixed(2)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">最終資產</div>
                    <div class="stat-value">${best.finalValue.toFixed(2)}</div>
                </div>
                ${useCommission ? `
                <div class="stat-item">
                    <div class="stat-label">總手續費</div>
                    <div class="stat-value">${best.totalCommission.toFixed(2)}</div>
                </div>` : ''}
                <div class="stat-item">
                    <div class="stat-label">報酬率</div>
                    <div class="stat-value">${best.returnRate.toFixed(2)}%</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">交易次數</div>
                    <div class="stat-value">${best.tradeCount}</div>
                </div>
            </div>
        </div>

        <div class="result-card" style="background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);">
            <h3>💔 最差 KD 策略 - ${stockSymbol}</h3>
            <div class="result-stats">
                <div class="stat-item">
                    <div class="stat-label">N (RSV週期)</div>
                    <div class="stat-value">${worst.N}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">M1 (K平滑)</div>
                    <div class="stat-value">${worst.M1}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">M2 (D平滑)</div>
                    <div class="stat-value">${worst.M2}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">初始資金</div>
                    <div class="stat-value">${initialCash.toFixed(2)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">最終資產</div>
                    <div class="stat-value">${worst.finalValue.toFixed(2)}</div>
                </div>
                ${useCommission ? `
                <div class="stat-item">
                    <div class="stat-label">總手續費</div>
                    <div class="stat-value">${worst.totalCommission.toFixed(2)}</div>
                </div>` : ''}
                <div class="stat-item">
                    <div class="stat-label">報酬率</div>
                    <div class="stat-value">${worst.returnRate.toFixed(2)}%</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">交易次數</div>
                    <div class="stat-value">${worst.tradeCount}</div>
                </div>
            </div>
        </div>

        <div class="view-tabs">
            <button class="view-tab ${currentKDView === 'top' ? 'active' : ''}" onclick="switchKDResultView('top')">
                📈 前 ${displayCount} 名
            </button>
            <button class="view-tab ${currentKDView === 'bottom' ? 'active' : ''}" onclick="switchKDResultView('bottom')">
                📉 倒數 ${displayCount} 名
            </button>
            <button class="view-tab ${currentKDView === 'all' ? 'active' : ''}" onclick="switchKDResultView('all')">
                📋 全部結果 (${results.length})
            </button>
        </div>
    `;

    let displayResults = [];
    let title = '';
    
    if (currentKDView === 'top') {
        displayResults = results.slice(0, displayCount);
        title = `📊 前 ${displayCount} 名最佳 KD 策略`;
    } else if (currentKDView === 'bottom') {
        displayResults = results.slice(-displayCount).reverse();
        title = `📊 倒數 ${displayCount} 名 KD 策略`;
    } else {
        displayResults = results;
        title = `📊 全部 KD 策略結果 (共 ${results.length} 組)`;
    }

    html += `
        <h3>${title}</h3>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>N</th>
                        <th>M1</th>
                        <th>M2</th>
                        <th>最終資產</th>
                        ${useCommission ? '<th>手續費</th>' : ''}
                        <th>報酬率</th>
                        <th>交易次數</th>
                    </tr>
                </thead>
                <tbody>
    `;

    displayResults.forEach((r, index) => {
        let rank;
        if (currentKDView === 'bottom') {
            rank = results.length - displayCount + index + 1;
        } else {
            rank = results.indexOf(r) + 1;
        }
        
        html += `
        <tr style="cursor: pointer;" onclick="showDetailedKDResult(${r.N}, ${r.M1}, ${r.M2})">
            <td>${rank}</td>
            <td>${r.N}</td>
            <td>${r.M1}</td>
            <td>${r.M2}</td>
            <td>${r.finalValue.toFixed(2)}</td>
            ${useCommission ? `<td>${r.totalCommission.toFixed(2)}</td>` : ''}
            <td>${r.returnRate.toFixed(2)}%</td>
            <td>${r.tradeCount}</td>
        </tr>
    `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    resultsDiv.innerHTML = html;
    resultsDiv.classList.add('show');
}

function showDetailedKDResult(N, M1, M2) {
    const stockSymbol = document.getElementById('stockSelectKD').value;
    const initialCash = parseFloat(document.getElementById('initialCashKD').value);
    const startDate = document.getElementById('startDateKD').value;
    const endDate = document.getElementById('endDateKD').value;
    const useCommission = document.getElementById('useCommissionKD').checked;

    const data = parseCSVDataKD(csvDataKD, stockSymbol);
    if (!data) {
        showErrorKD('無法解析股票資料');
        return;
    }

    let startIdx = data.dates.indexOf(startDate);
    let endIdx = data.dates.indexOf(endDate);

    if (startIdx === -1) {
        const startDateObj = new Date(startDate);
        for (let i = 0; i < data.dates.length; i++) {
            if (new Date(data.dates[i]) >= startDateObj) {
                startIdx = i;
                break;
            }
        }
        if (startIdx === -1) startIdx = 0;
    }

    if (endIdx === -1) {
        const endDateObj = new Date(endDate);
        for (let i = data.dates.length - 1; i >= 0; i--) {
            if (new Date(data.dates[i]) <= endDateObj) {
                endIdx = i;
                break;
            }
        }
        if (endIdx === -1) endIdx = data.dates.length - 1;
    }

    const requiredDays = N + M1 + M2 - 2;
    const dataStartIdx = Math.max(0, startIdx - requiredDays);
    const outputStartIdx = startIdx - dataStartIdx;

    const expandedDates = data.dates.slice(dataStartIdx, endIdx + 1);
    const expandedCloses = data.closes.slice(dataStartIdx, endIdx + 1);

    const result = backtestKD(expandedDates, expandedCloses, N, M1, M2, initialCash, outputStartIdx, useCommission);

    const chartDates = expandedDates.slice(outputStartIdx);
    const chartPrices = expandedCloses.slice(outputStartIdx);
    const chartK = result.kdData.k.slice(outputStartIdx);
    const chartD = result.kdData.d.slice(outputStartIdx);

    let html = `
        <div class="detail-section">
            <h3>📈 KD 策略詳細分析 - ${stockSymbol}</h3>
            <div class="result-stats">
                <div class="stat-item">
                    <div class="stat-label">N (RSV週期)</div>
                    <div class="stat-value">${result.N}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">M1 (K平滑)</div>
                    <div class="stat-value">${result.M1}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">M2 (D平滑)</div>
                    <div class="stat-value">${result.M2}</div>
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
                <h4>價格與 KD 指標圖表</h4>
                <div class="legend">
                    <div class="legend-item" data-series="price" onclick="toggleKDSeries('price')">
                        <span style="color: #666; font-weight: bold;">──</span> <span>收盤價</span>
                    </div>
                    <div class="legend-item" data-series="buy">
                        <span style="color: #4caf50;">▲</span> <span>K值金叉(買入)</span>
                    </div>
                    <div class="legend-item" data-series="sell">
                        <span style="color: #f44336;">▼</span> <span>K值死叉(賣出)</span>
                    </div>
                    <div class="legend-item" data-series="end">
                        <span style="color: #000000;">■</span> <span>期末平倉</span>
                    </div>
                </div>
                <canvas id="kdStrategyChart" class="chart-canvas"></canvas>
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
                                <th>K值</th>
                                <th>D值</th>
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
                                    <td>${trade.k.toFixed(2)}</td>
                                    <td>${trade.d.toFixed(2)}</td>
                                    ${useCommission ? `<td>${trade.buyCommission.toFixed(2)}</td><td>${trade.sellCommission.toFixed(2)}</td>` : ''}
                                    <td>${trade.cashAfter.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p style="text-align:center; padding:20px;">⚠️ 此參數組合在該期間無任何交易</p>'}

            <button class="btn" onclick="returnToKDResults()" style="margin-top: 20px;">
                ⬅️ 返回結果列表
            </button>
        </div>
    `;

    document.getElementById('resultsKD').innerHTML = html;

    setTimeout(() => {
        kdChartState.visible = { price: true, k: true, d: true, trades: true };
        initKDChart(chartDates, chartPrices, chartK, chartD, result.trades, "kdStrategyChart");
    }, 100);
}

function returnToKDResults() {
    const stockSymbol = document.getElementById('stockSelectKD').value;
    const initialCash = parseFloat(document.getElementById('initialCashKD').value);
    const useCommission = document.getElementById('useCommissionKD').checked;
    displayKDResults(allKDResults, initialCash, stockSymbol, useCommission);
}

function runQuickSearchKD() {
    const N = parseInt(document.getElementById('quickN').value);
    const M1 = parseInt(document.getElementById('quickM1').value);
    const M2 = parseInt(document.getElementById('quickM2').value);
    const stockSymbol = document.getElementById('stockSelectKD').value;
    const errorDiv = document.getElementById('errorQuickKD');
    
    errorDiv.classList.remove('show');

    if (!csvDataKD) {
        errorDiv.textContent = '⚠ 請先上傳 CSV 檔案';
        errorDiv.classList.add('show');
        return;
    }

    if (!stockSymbol) {
        errorDiv.textContent = '⚠ 請選擇股票代碼';
        errorDiv.classList.add('show');
        return;
    }

    if (N <= 0 || M1 <= 0 || M2 <= 0) {
        errorDiv.textContent = '⚠ 所有參數必須大於 0';
        errorDiv.classList.add('show');
        return;
    }

    showDetailedKDResult(N, M1, M2);
}

function runKDOptimization() {
    const stockSymbol = document.getElementById('stockSelectKD').value;
    const minN = parseInt(document.getElementById('minN').value);
    const maxN = parseInt(document.getElementById('maxN').value);
    const minM = parseInt(document.getElementById('minM').value);
    const maxM = parseInt(document.getElementById('maxM').value);
    const startDate = document.getElementById('startDateKD').value;
    const endDate = document.getElementById('endDateKD').value;
    const initialCash = parseFloat(document.getElementById('initialCashKD').value);
    const useCommission = document.getElementById('useCommissionKD').checked;

    if (!csvDataKD) {
        showErrorKD('請先上傳 CSV 檔案');
        return;
    }

    if (!stockSymbol) {
        showErrorKD('請選擇股票代碼');
        return;
    }

    if (minN >= maxN || minM >= maxM) {
        showErrorKD('最小值必須小於最大值');
        return;
    }

    document.getElementById('loadingKD').classList.add('show');
    document.getElementById('resultsKD').classList.remove('show');

    setTimeout(() => {
        const data = parseCSVDataKD(csvDataKD, stockSymbol);
        if (!data) {
            showErrorKD('無法解析股票資料');
            document.getElementById('loadingKD').classList.remove('show');
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
            showErrorKD('日期範圍無效或找不到資料');
            document.getElementById('loadingKD').classList.remove('show');
            return;
        }

        allKDResults = [];

        for (let N = minN; N <= maxN; N++) {
            for (let M1 = minM; M1 <= maxM; M1++) {
                for (let M2 = minM; M2 <= maxM; M2++) {
                    const requiredDays = N + M1 + M2 - 2;
                    const dataStartIdx = Math.max(0, startIdx - requiredDays);
                    const outputStartIdx = startIdx - dataStartIdx;

                    const expandedDates = data.dates.slice(dataStartIdx, endIdx + 1);
                    const expandedCloses = data.closes.slice(dataStartIdx, endIdx + 1);

                    const result = backtestKD(expandedDates, expandedCloses, N, M1, M2, initialCash, outputStartIdx, useCommission);
                    allKDResults.push(result);
                }
            }
        }

        allKDResults.sort((a, b) => {
            if (Math.abs(a.finalValue - b.finalValue) > 0.0001) {
                return b.finalValue - a.finalValue;
            }
            if (a.N !== b.N) return a.N - b.N;
            if (a.M1 !== b.M1) return a.M1 - b.M1;
            return a.M2 - b.M2;
        });

        displayKDResults(allKDResults, initialCash, stockSymbol, useCommission);
        document.getElementById('loadingKD').classList.remove('show');
    }, 100);
}

function switchKDResultView(view) {
    currentKDView = view;
    const stockSymbol = document.getElementById('stockSelectKD').value;
    const initialCash = parseFloat(document.getElementById('initialCashKD').value);
    const useCommission = document.getElementById('useCommissionKD').checked;
    displayKDResults(allKDResults, initialCash, stockSymbol, useCommission);
}

function toggleKDSeries(series) {
    kdChartState.visible[series] = !kdChartState.visible[series];
    drawKDChart();
}

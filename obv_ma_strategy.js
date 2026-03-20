/**
 * 📊 OBV (On Balance Volume) + MA 整合策略
 * 
 * 核心邏輯：
 * - 計算 OBV (資金流向指標)
 * - 在 OBV 上應用 MA (平滑線)
 * - 以 OBV 穿越 OBV-MA 作為交易信號
 * - 可選：與價格 MA 組合使用
 * 
 * 使用場景：
 * 1. OBV 上穿 OBV-MA = 買入信號
 * 2. OBV 下穿 OBV-MA = 賣出信號
 * 3. OBV 與價格背離 = 反轉警告
 */

/**
 * 計算 OBV (On Balance Volume)
 * @param {Array} closes - 收盤價陣列
 * @param {Array} volumes - 成交量陣列
 * @returns {Array} OBV 陣列
 */
function calculateOBV(closes, volumes) {
    if (closes.length !== volumes.length) {
        throw new Error('收盤價和成交量陣列長度不符');
    }
    
    const obv = new Array(closes.length);
    obv[0] = volumes[0]; // 第一個 OBV 等於第一個成交量
    
    for (let i = 1; i < closes.length; i++) {
        if (closes[i] > closes[i - 1]) {
            // 收盤價上升，加上成交量
            obv[i] = obv[i - 1] + volumes[i];
        } else if (closes[i] < closes[i - 1]) {
            // 收盤價下降，減去成交量
            obv[i] = obv[i - 1] - volumes[i];
        } else {
            // 收盤價不變，OBV 保持不變
            obv[i] = obv[i - 1];
        }
    }
    
    return obv;
}

/**
 * 計算 OBV 移動平均線
 * @param {Array} obv - OBV 陣列
 * @param {Number} period - 移動平均周期 (預設 14)
 * @returns {Array} OBV-MA 陣列
 */
function calculateOBV_MA(obv, period = 14) {
    return computeMA(obv, period, 'SMA');
}

/**
 * 檢測 OBV 穿越信號
 * @param {Array} obv - OBV 陣列
 * @param {Array} obvMA - OBV-MA 陣列
 * @returns {Array} 信號陣列 (1 = 上穿買入, -1 = 下穿賣出, 0 = 無信號)
 */
function detectOBV_MACrossover(obv, obvMA) {
    const signals = new Array(obv.length).fill(0);
    
    for (let i = 1; i < obv.length; i++) {
        // 上穿信號 (OBV 穿過 OBV-MA 從下到上)
        if (obv[i - 1] <= obvMA[i - 1] && obv[i] > obvMA[i]) {
            signals[i] = 1;
        }
        // 下穿信號 (OBV 穿過 OBV-MA 從上到下)
        else if (obv[i - 1] >= obvMA[i - 1] && obv[i] < obvMA[i]) {
            signals[i] = -1;
        }
    }
    
    return signals;
}

/**
 * 檢測價格-OBV 背離 (改進版)
 * 
 * 背離類型：
 * 1. 經典背離 - 最近 2 個局部高點/低點的比較
 * 2. 隱含背離 - 短期背離信號
 * 
 * @param {Array} closes - 收盤價陣列
 * @param {Array} obv - OBV 陣列
 * @param {Number} window - 檢測窗口 (預設 20)
 * @returns {Array} 背離警告 (true = 檢測到背離, false = 無背離)
 */
function detectPriceOBVDivergence(closes, obv, window = 20) {
    const divergence = new Array(closes.length).fill(false);
    
    for (let i = window; i < closes.length; i++) {
        // 方法 1：直接比較窗口內最高/最低
        const priceWindow = closes.slice(i - window, i + 1);
        const obvWindow = obv.slice(i - window, i + 1);
        
        const priceMax = Math.max(...priceWindow);
        const obvMax = Math.max(...obvWindow);
        const priceMin = Math.min(...priceWindow);
        const obvMin = Math.min(...obvWindow);
        
        // 檢測看跌背離：價格創新高但 OBV 未創新高
        if (closes[i] === priceMax && obv[i] < obvMax) {
            divergence[i] = true;
            continue;
        }
        
        // 檢測看漲背離：價格創新低但 OBV 未創新低
        if (closes[i] === priceMin && obv[i] > obvMin) {
            divergence[i] = true;
            continue;
        }
        
        // 方法 2：檢測短期背離 (5 日窗口)
        const shortWindow = 5;
        if (i >= shortWindow) {
            const shortPriceWindow = closes.slice(i - shortWindow, i + 1);
            const shortObvWindow = obv.slice(i - shortWindow, i + 1);
            
            const shortPriceMax = Math.max(...shortPriceWindow);
            const shortObvMax = Math.max(...shortObvWindow);
            const shortPriceMin = Math.min(...shortPriceWindow);
            const shortObvMin = Math.min(...shortObvWindow);
            
            // 短期看跌背離
            if (closes[i] >= shortPriceMax * 0.98 && obv[i] < shortObvMax * 0.95) {
                divergence[i] = true;
                continue;
            }
            
            // 短期看漲背離
            if (closes[i] <= shortPriceMin * 1.02 && obv[i] > shortObvMin * 1.05) {
                divergence[i] = true;
            }
        }
    }
    
    return divergence;
}

/**
 * OBV + MA 整合回測 (簡單版本)
 * 
 * @param {Array} dates - 日期陣列
 * @param {Array} closes - 收盤價陣列
 * @param {Array} volumes - 成交量陣列
 * @param {Number} obvMA_period - OBV 移動平均周期 (預設 14)
 * @param {Number} initialCash - 初始資金
 * @param {Boolean} useCommission - 是否計算手續費
 * @param {Number} commissionRate - 手續費率 (預設 0.008)
 * @returns {Object} 回測結果
 */
function backtestOBV_MA_Simple(
    dates, closes, volumes,
    obvMA_period = 14,
    initialCash = 10000,
    useCommission = false,
    commissionRate = 0.0008
) {
    // 計算 OBV 及其 MA
    const obv = calculateOBV(closes, volumes);
    const obvMA = calculateOBV_MA(obv, obvMA_period);
    
    // 檢測穿越信號
    const signals = detectOBV_MACrossover(obv, obvMA);
    
    // 檢測背離
    const divergence = detectPriceOBVDivergence(closes, obv);
    
    let cash = initialCash;
    let shares = 0;
    const trades = [];
    let totalCommission = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let buyCommissionRecord = 0;
    
    for (let i = 0; i < dates.length; i++) {
        if (signals[i] === 1) {
            // 買入信號
            if (cash > closes[i]) {
                const effectivePrice = useCommission ? closes[i] * (1 + commissionRate) : closes[i];
                const buyShares = Math.floor(cash / effectivePrice);
                
                if (buyShares > 0) {
                    const buyCommission = useCommission ? closes[i] * buyShares * commissionRate : 0;
                    buyCommissionRecord = buyCommission;
                    
                    cash -= closes[i] * buyShares + buyCommission;
                    shares += buyShares;
                    totalCommission += buyCommission;
                    trades.push({
                        date: dates[i],
                        type: 'BUY',
                        price: closes[i],
                        quantity: buyShares,
                        cash: cash,
                        shares: shares,
                        obv: obv[i],
                        obvMA: obvMA[i],
                        divergence: divergence[i],
                        buyCommission: buyCommission,
                        sellCommission: 0
                    });
                }
            }
        } else if (signals[i] === -1) {
            // 賣出信號
            if (shares > 0) {
                const salePrice = closes[i];
                const revenue = salePrice * shares;
                const sellCommission = useCommission ? salePrice * shares * commissionRate : 0;
                
                const tradeProfit = revenue - sellCommission - (cash - (revenue - sellCommission));
                if (tradeProfit > 0) winningTrades++;
                else if (tradeProfit < 0) losingTrades++;
                
                cash += revenue - sellCommission;
                totalCommission += sellCommission;
                
                buyCommissionRecord = 0;
                
                trades.push({
                    date: dates[i],
                    type: 'SELL',
                    price: closes[i],
                    quantity: shares,
                    cash: cash,
                    shares: 0,
                    obv: obv[i],
                    obvMA: obvMA[i],
                    divergence: divergence[i],
                    buyCommission: 0,
                    sellCommission: sellCommission
                });
                
                shares = 0;
            }
        }
    }
    
    // 平倉
    if (shares > 0) {
        const finalPrice = closes[closes.length - 1];
        const closeCommission = useCommission ? finalPrice * shares * commissionRate : 0;
        cash += finalPrice * shares - closeCommission;
        totalCommission += closeCommission;
        trades.push({
            date: dates[dates.length - 1],
            type: 'CLOSE',
            price: finalPrice,
            quantity: shares,
            cash: cash,
            shares: 0,
            closeCommission: closeCommission
        });
        shares = 0;
    }
    
    const finalValue = cash;
    const profit = finalValue - initialCash;
    const returnRate = (profit / initialCash) * 100;
    
    return {
        trades: trades,
        finalValue: finalValue,
        profit: profit,
        returnRate: returnRate,
        totalCommission: totalCommission,
        winningTrades: winningTrades,
        losingTrades: losingTrades,
        tradeCount: trades.length,
        obv: obv,
        obvMA: obvMA,
        signals: signals,
        divergence: divergence
    };
}

/**
 * OBV + 雙 MA (價格 MA + OBV MA) 整合回測 (進階版本)
 * 
 * 整合邏輯：
 * 1. 價格 MA 交叉判斷趨勢方向
 * 2. OBV MA 交叉判斷成交量確認
 * 3. 當兩者同向時發出交易信號
 * 
 * @param {Array} dates - 日期陣列
 * @param {Array} closes - 收盤價陣列
 * @param {Array} volumes - 成交量陣列
 * @param {Number} shortMA_period - 短期價格 MA 周期 (預設 9)
 * @param {Number} longMA_period - 長期價格 MA 周期 (預設 21)
 * @param {Number} obvMA_period - OBV MA 周期 (預設 14)
 * @param {Number} initialCash - 初始資金
 * @param {Boolean} useCommission - 是否計算手續費
 * @returns {Object} 回測結果
 */
function backtestOBV_DualMA(
    dates, closes, volumes,
    shortMA_period = 9,
    longMA_period = 21,
    obvMA_period = 14,
    initialCash = 10000,
    useCommission = false,
    commissionRate = 0.0008
) {
    // 計算價格 MA
    const shortMA = computeMA(closes, shortMA_period, 'SMA');
    const longMA = computeMA(closes, longMA_period, 'SMA');
    
    // 計算 OBV 及其 MA
    const obv = calculateOBV(closes, volumes);
    const obvMA = calculateOBV_MA(obv, obvMA_period);
    
    // 生成信號
    const priceSignals = new Array(closes.length).fill(0);  // 價格 MA 信號
    const obvSignals = new Array(obv.length).fill(0);       // OBV MA 信號
    const combinedSignals = new Array(closes.length).fill(0); // 組合信號
    
    for (let i = 1; i < closes.length; i++) {
        // 價格 MA 信號
        if (shortMA[i - 1] <= longMA[i - 1] && shortMA[i] > longMA[i]) {
            priceSignals[i] = 1; // 黃金交叉
        } else if (shortMA[i - 1] >= longMA[i - 1] && shortMA[i] < longMA[i]) {
            priceSignals[i] = -1; // 死亡交叉
        }
        
        // OBV MA 信號
        if (obv[i - 1] <= obvMA[i - 1] && obv[i] > obvMA[i]) {
            obvSignals[i] = 1; // 上穿
        } else if (obv[i - 1] >= obvMA[i - 1] && obv[i] < obvMA[i]) {
            obvSignals[i] = -1; // 下穿
        }
        
        // 組合信號 (雙重確認)
        if (priceSignals[i] === 1 && obvSignals[i] === 1) {
            combinedSignals[i] = 1; // 強買信號
        } else if (priceSignals[i] === -1 && obvSignals[i] === -1) {
            combinedSignals[i] = -1; // 強賣信號
        }
    }
    
    let cash = initialCash;
    let shares = 0;
    const trades = [];
    let profitableTrades = 0;
    let unprofitableTrades = 0;
    let totalCommission = 0;
    let buyCommissionRecord = 0;
    
    for (let i = 0; i < dates.length; i++) {
        if (combinedSignals[i] === 1) {
            // 買入
            if (cash > closes[i]) {
                const effectivePrice = useCommission ? closes[i] * (1 + commissionRate) : closes[i];
                const buyShares = Math.floor(cash / effectivePrice);
                
                if (buyShares > 0) {
                    const buyCommission = useCommission ? closes[i] * buyShares * commissionRate : 0;
                    buyCommissionRecord = buyCommission;
                    
                    cash -= closes[i] * buyShares + buyCommission;
                    shares += buyShares;
                    totalCommission += buyCommission;
                    
                    trades.push({
                        date: dates[i],
                        type: 'BUY',
                        price: closes[i],
                        quantity: buyShares,
                        shortMA: shortMA[i],
                        longMA: longMA[i],
                        obv: obv[i],
                        obvMA: obvMA[i],
                        buyCommission: buyCommission,
                        sellCommission: 0
                    });
                }
            }
        } else if (combinedSignals[i] === -1) {
            // 賣出
            if (shares > 0) {
                const salePrice = closes[i];
                const revenue = salePrice * shares;
                const sellCommission = useCommission ? salePrice * shares * commissionRate : 0;
                
                cash += revenue - sellCommission;
                totalCommission += sellCommission;
                
                buyCommissionRecord = 0;
                
                trades.push({
                    date: dates[i],
                    type: 'SELL',
                    price: closes[i],
                    quantity: shares,
                    shortMA: shortMA[i],
                    longMA: longMA[i],
                    obv: obv[i],
                    obvMA: obvMA[i],
                    buyCommission: 0,
                    sellCommission: sellCommission
                });
                
                shares = 0;
            }
        }
    }
    
    // 平倉
    if (shares > 0) {
        const finalPrice = closes[closes.length - 1];
        const closeCommission = useCommission ? finalPrice * shares * commissionRate : 0;
        cash += finalPrice * shares - closeCommission;
        totalCommission += closeCommission;
        shares = 0;
    }
    
    const finalValue = cash;
    const profit = finalValue - initialCash;
    const returnRate = (profit / initialCash) * 100;
    
    return {
        trades: trades,
        finalValue: finalValue,
        profit: profit,
        returnRate: returnRate,
        totalCommission: totalCommission,
        profitableTrades: profitableTrades,
        unprofitableTrades: unprofitableTrades,
        tradeCount: trades.length,
        // 工具數據
        shortMA: shortMA,
        longMA: longMA,
        obv: obv,
        obvMA: obvMA,
        priceSignals: priceSignals,
        obvSignals: obvSignals,
        combinedSignals: combinedSignals
    };
}

/**
 * 生成 OBV + MA 分析報告
 */
function generateOBV_MA_Report(result) {
    let report = '\n📊 ===== OBV + MA 策略分析報告 =====\n';
    report += `\n💰 績效指標：\n`;
    report += `   最終資產: $${result.finalValue.toFixed(2)}\n`;
    report += `   獲利: $${result.profit.toFixed(2)}\n`;
    report += `   報酬率: ${result.returnRate.toFixed(2)}%\n`;
    report += `   總手續費: $${result.totalCommission.toFixed(2)}\n`;
    report += `\n📈 交易統計：\n`;
    report += `   總交易筆數: ${result.tradeCount}\n`;
    report += `   獲利交易: ${result.profitableTrades || 'N/A'}\n`;
    report += `   虧損交易: ${result.unprofitableTrades || 'N/A'}\n`;
    
    if (result.trades.length > 0) {
        report += `\n🔄 交易記錄 (前 10 筆)：\n`;
        result.trades.slice(0, 10).forEach((trade, idx) => {
            report += `   ${idx + 1}. [${trade.date}] ${trade.type} @ $${trade.price.toFixed(2)} × ${trade.quantity}\n`;
        });
    }
    
    return report;
}

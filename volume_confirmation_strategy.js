/**
 * 📊 方案 A：成交量確認制 (最安全版本)
 * 
 * 核心邏輯：
 * - 只在放量 (成交量 > 1.2倍平均) 時執行買入/賣出
 * - 無量交叉信號被直接跳過 (不交易)
 * - 大幅減少假信號
 * 
 * 適合：新手、保守型投資者
 */

/**
 * 成交量確認制回測
 * @param {Array} dates - 日期陣列
 * @param {Array} closes - 收盤價陣列
 * @param {Array} volumes - 成交量陣列
 * @param {Number} shortMA_window - 短期均線周期
 * @param {Number} longMA_window - 長期均線周期
 * @param {Number} initialCash - 初始資金
 * @param {Boolean} useCommission - 是否計算手續費
 * @param {Number} outputStartIdx - 實際交易開始索引（跳過計算均線用的前置數據）
 * @param {Number} volumeMultiplier - 放量倍數條件 (預設 1.2)
 * @param {Number} volumeMAWindow - 平均成交量計算周期 (預設 20 天)
 * @returns {Object} 回測結果
 */
function backtestWithVolumeConfirmation(
    dates, closes, volumes,
    shortMA_window, longMA_window,
    initialCash = 10000,
    useCommission = false,
    outputStartIdx = 0,
    volumeMultiplier = 1.2,
    volumeMAWindow = 20
) {
    // 計算均線
    const shortMA = computeMA(closes, shortMA_window, 'SMA');
    const longMA = computeMA(closes, longMA_window, 'SMA');
    
    // 計算平均成交量（可自訂天數）
    const avgVolume = calculateAverageVolumeArray(volumes, volumeMAWindow);

    let cash = initialCash;
    let shares = 0;
    const trades = [];
    let tradeCount = 0;
    let totalCommission = 0;
    let buyCommissionRecord = 0;
    
    // 統計成交量
    let volumeConfirmedBuys = 0;  // 放量買入
    let volumeConfirmedSells = 0; // 放量賣出
    let skippedSignals = 0;       // 跳過的無量信號

    const endIdx = closes.length - 1;

    for (let i = outputStartIdx; i <= endIdx; i++) {
        const shortMAIdx = i - (shortMA_window - 1);
        const longMAIdx = i - (longMA_window - 1);

        // 檢查索引是否有效
        if (shortMAIdx < 0 || longMAIdx < 0 || i === 0 ||
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
        const currVolume = volumes[i] || 0;
        const currAvgVolume = avgVolume[i] || 0;

        // 檢查 MA 值是否有效
        if (prevShortMA === null || prevShortMA === undefined ||
            prevLongMA === null || prevLongMA === undefined ||
            currShortMA === null || currShortMA === undefined ||
            currLongMA === null || currLongMA === undefined) {
            continue;
        }

        const epsilon = 1e-10;
        const isGoldenCross = (prevShortMA - prevLongMA) < epsilon && (currShortMA - currLongMA) > epsilon;
        const isDeathCross = (prevShortMA - prevLongMA) > -epsilon && (currShortMA - currLongMA) < -epsilon;

        // 計算成交量比例
        const volumeRatio = currAvgVolume > 0 ? currVolume / currAvgVolume : 1;
        const isVolumeConfirmed = volumeRatio >= volumeMultiplier; // 放量條件：成交量 > volumeMultiplier倍平均

        // 黃金交叉
        if (isGoldenCross && shares === 0 && i < endIdx) {
            if (isVolumeConfirmed) {
                // ✅ 帶量黃金交叉 - 買入
                volumeConfirmedBuys++;
                
                // 複製原 SMA 的買入邏輯
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
                    volume: currVolume,
                    volumeRatio: volumeRatio.toFixed(2) + 'x',
                    volumeStatus: '✅ 放量確認',
                    buyCommission: buyCommissionRecord,
                    sellCommission: 0,
                    cashAfter: cash
                });
            } else {
                // ❌ 無量黃金交叉 - 跳過
                skippedSignals++;
                trades.push({
                    date: dates[i],
                    action: '跳過',
                    price: currPrice,
                    shares: 0,
                    volume: currVolume,
                    volumeRatio: volumeRatio.toFixed(2) + 'x',
                    volumeStatus: '❌ 無量 (跳過)',
                    reason: '成交量不足 1.2 倍平均',
                    buyCommission: 0,
                    sellCommission: 0,
                    cashAfter: cash
                });
            }
        }
        // 死亡交叉
        else if (isDeathCross && shares > 0) {
            if (isVolumeConfirmed) {
                // ✅ 帶量死亡交叉 - 賣出
                volumeConfirmedSells++;
                
                // 複製原 SMA 的賣出邏輯
                const sellCommissionRecord = calculateCommissionAmount(currPrice, shares, useCommission);
                const revenue = shares * currPrice;
                cash += revenue - sellCommissionRecord;
                totalCommission += buyCommissionRecord + sellCommissionRecord;

                trades.push({
                    date: dates[i],
                    action: '賣出',
                    price: currPrice,
                    shares: shares,
                    volume: currVolume,
                    volumeRatio: volumeRatio.toFixed(2) + 'x',
                    volumeStatus: '✅ 放量確認',
                    buyCommission: 0,
                    sellCommission: sellCommissionRecord,
                    cashAfter: cash
                });

                shares = 0;
                buyCommissionRecord = 0;
                tradeCount++;
            } else {
                // ❌ 無量死亡交叉 - 繼續持股
                skippedSignals++;
                trades.push({
                    date: dates[i],
                    action: '持股觀望',
                    price: currPrice,
                    shares: shares,
                    volume: currVolume,
                    volumeRatio: volumeRatio.toFixed(2) + 'x',
                    volumeStatus: '❌ 無量 (繼續持股)',
                    reason: '成交量不足 1.2 倍平均，等待放量賣出',
                    buyCommission: 0,
                    sellCommission: 0,
                    cashAfter: cash
                });
            }
        }
    }

    // 期末平倉
    let finalValue = cash;
    if (shares > 0) {
        const sellCommissionRecord = calculateCommissionAmount(closes[endIdx], shares, useCommission);
        const revenue = shares * closes[endIdx];
        finalValue = cash + revenue - sellCommissionRecord;
        totalCommission += buyCommissionRecord + sellCommissionRecord;

        trades.push({
            date: dates[endIdx],
            action: '期末賣出',
            price: closes[endIdx],
            shares: shares,
            buyCommission: 0,
            sellCommission: sellCommissionRecord,
            cashAfter: finalValue,
            volume: volumes[endIdx] || 0,
            volumeRatio: '終',
            volumeStatus: '期末平倉'
        });
        tradeCount++;
    }

    const returnRate = ((finalValue - initialCash) / initialCash) * 100;

    return {
        shortMA: shortMA_window,
        longMA: longMA_window,
        shortMAType: 'SMA',
        longMAType: 'SMA',
        volumeMultiplier: volumeMultiplier,
        volumeMAWindow: volumeMAWindow,
        finalValue: finalValue,
        returnRate: returnRate,
        tradeCount: tradeCount,
        totalCommission: totalCommission,
        cash: cash,
        shares: shares,
        trades: trades,
        volumeStats: {
            confirmedBuys: volumeConfirmedBuys,
            confirmedSells: volumeConfirmedSells,
            skippedSignals: skippedSignals
        }
    };
}

/**
 * 計算平均成交量陣列 (50日)
 */
function calculateAverageVolumeArray(volumes, period = 50) {
    const result = new Array(volumes.length).fill(0);
    
    let sum = 0;
    for (let i = 0; i < period && i < volumes.length; i++) {
        sum += volumes[i];
    }
    
    for (let i = period - 1; i < volumes.length; i++) {
        if (i > period - 1) {
            sum = sum - volumes[i - period] + volumes[i];
        }
        result[i] = sum / period;
    }
    
    return result;
}

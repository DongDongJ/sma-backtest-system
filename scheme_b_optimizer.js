/**
 * 🔥 方案 B：終極優化 - 遍歷所有短MA + 長MA + 放量倍數 + 周期組合
 */

/**
 * 方案B優化配置
 */
const SCHEME_B_CONFIG = {
    shortMARange: { min: 1, max: 256, step: 1 },
    longMARange: { min: 1, max: 256, step: 1 },
    volumeMultiplierRange: { min: 1.1, max: 2.0, step: 0.1 },
    volumeMAWindowRange: { min: 5, max: 50, step: 5 }
};

/**
 * 方案B優化：同時遍歷所有參數
 */
function optimizeSchemeB(
    dates, closes, volumes,
    shortMAMin = 1, shortMAMax = 256,
    longMAMin = 1, longMAMax = 256,
    initialCash = 10000,
    useCommission = false,
    onProgress = null,
    outputStartIdx = 0  // ✅ 新增：回測起始位置
) {
    console.log(`🔥 方案B開始：遍歷MA(${shortMAMin}~${shortMAMax}/${longMAMin}~${longMAMax}) + 成交量參數...`);
    const startTime = performance.now();

    const results = [];
    let bestResult = null;
    let testedCount = 0;
    let validCount = 0;

    // 生成所有組合
    const combinations = [];
    for (let shortMA = shortMAMin; shortMA <= shortMAMax; shortMA++) {
        for (let longMA = longMAMin; longMA <= longMAMax; longMA++) {
            // ✅ 測試所有組合 (包含短MA > 長MA 的非傳統配置)
            
            // ✅ 修正浮點數精度問題：直接列舉放量倍數
            const volumeMultipliers = [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];
            
            for (let mult of volumeMultipliers) {
                for (let period = 5; period <= 50; period += 5) {
                    combinations.push({
                        shortMA,
                        longMA,
                        volumeMultiplier: parseFloat(mult.toFixed(2)),
                        volumeMAWindow: period
                    });
                }
            }
        }
    }

    const totalCombinations = combinations.length;
    console.log(`📊 共 ${totalCombinations.toLocaleString()} 個參數組合`);

    // 遍歷每個組合
    combinations.forEach((params, idx) => {
        try {
            testedCount++;

            const result = backtestWithVolumeConfirmation(
                dates, closes, volumes,
                params.shortMA, params.longMA,
                initialCash,
                useCommission,
                outputStartIdx,  // ✅ 改為傳入正確的起始位置
                params.volumeMultiplier,
                params.volumeMAWindow
            );

            // 計算統計數據
            let winCount = 0, lossCount = 0;
            let totalWin = 0, totalLoss = 0;
            let maxDrawdown = 0;
            let peakCash = initialCash;

            if (result.trades && result.trades.length > 0) {
                let lastBuyPrice = null;
                let lastBuyCash = initialCash;

                result.trades.forEach(trade => {
                    if (trade.action === '買入') {
                        lastBuyPrice = trade.price;
                        lastBuyCash = trade.cashAfter;
                    } else if (trade.action === '賣出' || trade.action === '期末賣出') {
                        if (lastBuyPrice !== null) {
                            const profitRate = (trade.cashAfter - lastBuyCash) / lastBuyCash;
                            if (profitRate > 0) {
                                winCount++;
                                totalWin += profitRate;
                            } else {
                                lossCount++;
                                totalLoss += Math.abs(profitRate);
                            }
                            lastBuyPrice = null;
                        }
                    }

                    if (trade.cashAfter !== undefined) {
                        if (trade.cashAfter > peakCash) peakCash = trade.cashAfter;
                        const drawdown = (peakCash - trade.cashAfter) / peakCash;
                        maxDrawdown = Math.max(maxDrawdown, drawdown);
                    }
                });
            }

            const totalTrades = winCount + lossCount;
            const winRate = totalTrades > 0 ? (winCount / totalTrades * 100) : 0;
            const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? 999 : 0);

            const resultObj = {
                rank: 0,
                shortMA: params.shortMA,
                longMA: params.longMA,
                volumeMultiplier: params.volumeMultiplier,
                volumeMAWindow: params.volumeMAWindow,
                finalCash: result.finalValue || initialCash,  // ✅ 改為 finalValue
                returnRate: result.returnRate || 0,
                tradeCount: result.trades ? result.trades.length : 0,
                winRate: winRate,
                maxDrawdown: maxDrawdown * 100,
                profitFactor: profitFactor
            };

            results.push(resultObj);
            validCount++;

            if (!bestResult || resultObj.returnRate > bestResult.returnRate) {
                bestResult = resultObj;
            }

            // 進度回調
            if (onProgress && (idx + 1) % Math.max(100, Math.floor(totalCombinations / 50)) === 0) {
                const percent = Math.floor((idx + 1) / totalCombinations * 100);
                onProgress(idx + 1, totalCombinations, bestResult, percent);
            }

            if ((idx + 1) % 1000 === 0) {
                console.log(`⏳ 進度: ${idx + 1}/${totalCombinations} (${((idx + 1) / totalCombinations * 100).toFixed(1)}%)`);
            }

        } catch (error) {
            console.warn(`⚠️ 組合失敗 [${params.shortMA}/${params.longMA}, ${params.volumeMultiplier}x, ${params.volumeMAWindow}天]`);
        }
    });

    // 排序 - 與方案A保持一致，按最終資產值排序
    results.sort((a, b) => {
        if (Math.abs(a.finalCash - b.finalCash) > 0.0001) {
            return b.finalCash - a.finalCash;  // 最終資產值高的排前
        }
        // 次要條件：returnRate高的排前
        return b.returnRate - a.returnRate;
    });
    results.forEach((r, idx) => r.rank = idx + 1);

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`✅ 方案B完成！測試 ${validCount}/${testedCount} 個組合，耗時 ${duration}秒`);

    return {
        allResults: results,
        bestParameters: bestResult,
        totalCombinations: totalCombinations,
        validResults: validCount,
        duration: duration,
        timestamp: new Date().toLocaleString('zh-TW')
    };
}

/**
 * 生成方案B結果HTML表格
 */
function generateSchemeBResultsHTML(result, topN = 50) {
    const results = result.allResults.slice(0, topN);
    const best = result.bestParameters;

    let html = `
    <div style="margin-top: 20px; border: 3px solid #e91e63; border-radius: 8px; padding: 15px; background: #fce4ec;">
        <h3 style="color: #c2185b; margin-top: 0;">🔥 方案B結果 - 所有參數組合 Top ${topN}</h3>
        <p style="color: #666; margin-bottom: 15px;">
            ⏱️ 耗時 ${result.duration}秒 | 📊 ${result.validResults}/${result.totalCombinations} 個組合
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: white;">
            <thead style="background: #c2185b; color: white; position: sticky; top: 0;">
                <tr>
                    <th style="border: 1px solid #ddd; padding: 6px;">排名</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">短MA</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">長MA</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">放量倍數</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">周期</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">最終資產</th>
                    <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">報酬率</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">交易次</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">勝率</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">最大回檔</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">獲利係數</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach((r, idx) => {
        const isBest = r.rank === 1;
        const bg = isBest ? '#fff59d' : 'white';
        const icon = isBest ? '⭐ ' : '';

        html += `<tr style="background: ${bg}; ${isBest ? 'font-weight: bold; border: 2px solid gold;' : ''}">
            <td style="border: 1px solid #ddd; padding: 6px;">${icon}${r.rank}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.shortMA}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.longMA}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.volumeMultiplier.toFixed(2)}x</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.volumeMAWindow}天</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: right; color: ${r.finalCash > 10000 ? '#00b500' : '#ff0000'}; font-weight: bold;">
                $${r.finalCash.toFixed(0)}
            </td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: right; color: ${r.returnRate > 0 ? '#00b500' : '#ff0000'}; font-weight: bold;">
                ${r.returnRate.toFixed(2)}%
            </td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.tradeCount}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.winRate.toFixed(1)}%</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.maxDrawdown.toFixed(2)}%</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${r.profitFactor.toFixed(2)}</td>
        </tr>`;
    });

    html += `</tbody></table>`;

    html += `<div style="margin-top: 15px; padding: 12px; background: #fff59d; border-radius: 5px;">
        <h4 style="color: #f57f17; margin: 0;">🏆 最優參數</h4>
        <p style="margin: 5px 0;">短MA: ${best.shortMA} | 長MA: ${best.longMA} | 放量: ${best.volumeMultiplier.toFixed(2)}x | 周期: ${best.volumeMAWindow}天</p>
        <p style="margin: 5px 0; color: #00b500; font-weight: bold;">最終資產: $${best.finalCash.toFixed(0)} | 報酬率: ${best.returnRate.toFixed(2)}% | 交易次: ${best.tradeCount}</p>
        <p style="margin: 5px 0;">勝率: ${best.winRate.toFixed(1)}% | 最大回檔: ${best.maxDrawdown.toFixed(2)}% | 獲利係數: ${best.profitFactor.toFixed(2)}</p>
    </div>`;

    return html;
}

console.log('✅ scheme_b_optimizer.js 已載入');

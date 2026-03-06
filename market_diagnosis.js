/**
 * 📊 市場診斷模組
 * 功能：分析市場特徵、檢測季度變化、推薦參數
 * 依賴：script.js (parseCSVData, showError)
 */

// ==================== 全局變數 ====================
let currentDiagnosisYear = null;

// ==================== 季度和日期相關 ====================

/**
 * 獲取季度的月份名稱
 */
function getQuarterMonthName(quarter) {
    const quarterMap = {
        'Q1': '1月-3月',
        'Q2': '4月-6月',
        'Q3': '7月-9月',
        'Q4': '10月-12月'
    };
    return quarterMap[quarter] || '全年';
}

/**
 * 獲取季度的日期範圍
 */
function getQuarterDateRange(year, quarter) {
    const quarterMap = {
        'Q1': { start: [1, 1], end: [3, 31] },
        'Q2': { start: [4, 1], end: [6, 30] },
        'Q3': { start: [7, 1], end: [9, 30] },
        'Q4': { start: [10, 1], end: [12, 31] }
    };
    
    const q = quarterMap[quarter];
    if (!q) return null;
    
    return {
        startMonth: q.start[0],
        startDay: q.start[1],
        endMonth: q.end[0],
        endDay: q.end[1]
    };
}

/**
 * 提取指定季度的數據
 */
function extractQuarterData(csvData, stockSymbol, year, quarter) {
    const data = parseCSVData(csvData, stockSymbol);
    if (!data) return null;
    
    const quarterRange = getQuarterDateRange(year, quarter);
    if (!quarterRange) return null;
    
    const quarterDates = [];
    const quarterCloses = [];
    
    for (let i = 0; i < data.dates.length; i++) {
        const dateStr = data.dates[i];
        const parts = dateStr.split('/');
        
        let dateYear = null, month = null, day = null;
        
        if (parts.length === 3) {
            if (parts[2].length === 4) {
                // MM/DD/YYYY
                month = parseInt(parts[0]);
                day = parseInt(parts[1]);
                dateYear = parseInt(parts[2]);
            } else if (parts[0].length === 4) {
                // YYYY/MM/DD
                dateYear = parseInt(parts[0]);
                month = parseInt(parts[1]);
                day = parseInt(parts[2]);
            }
        }
        
        if (dateYear === year && month >= quarterRange.startMonth && month <= quarterRange.endMonth) {
            // 檢查季度內容（處理跨月邊界）
            if (month === quarterRange.startMonth && day < quarterRange.startDay) continue;
            if (month === quarterRange.endMonth && day > quarterRange.endDay) continue;
            
            quarterDates.push(data.dates[i]);
            quarterCloses.push(data.closes[i]);
        }
    }
    
    return { dates: quarterDates, closes: quarterCloses };
}

/**
 * 提取指定年份的數據
 */
function extractYearData(csvData, stockSymbol, year) {
    const data = parseCSVData(csvData, stockSymbol);
    if (!data) return null;
    
    const yearDates = [];
    const yearCloses = [];
    
    for (let i = 0; i < data.dates.length; i++) {
        const dateStr = data.dates[i];
        // 支援 MM/DD/YYYY 格式
        const parts = dateStr.split('/');
        let dateYear = null;
        
        if (parts.length === 3) {
            // 如果是 MM/DD/YYYY 格式
            if (parts[2].length === 4) {
                dateYear = parseInt(parts[2]);
            }
            // 如果是 YYYY/MM/DD 格式
            else if (parts[0].length === 4) {
                dateYear = parseInt(parts[0]);
            }
        }
        
        if (dateYear === year) {
            yearDates.push(data.dates[i]);
            yearCloses.push(data.closes[i]);
        }
    }
    
    return { dates: yearDates, closes: yearCloses };
}

// ==================== LocalStorage 參數管理 ====================

/**
 * 從 localStorage 讀取優化參數
 */
function getParametersFromLocalStorage(stockSymbol, year) {
    try {
        const key = `optimized_params_${stockSymbol}_${year}`;
        const data = localStorage.getItem(key);
        if (data) {
            const paramData = JSON.parse(data);
            console.log(`✅ 從本地存儲讀取 ${key}，包含 ${paramData.parameters.length} 個參數`);
            return paramData;
        }
    } catch (error) {
        console.warn('⚠️ localStorage 讀取失敗:', error);
    }
    return null;
}

// ==================== 市場特徵分析 ====================

/**
 * 平滑收盤價 (使用簡單移動平均線)
 * @param {Array} closes - 收盤價陣列
 * @param {Number} period - 平滑週期 (預設: 120)
 * @returns {Array} 平滑後的收盤價
 */
function smoothClosePrices(closes, period = 120) {
    if (closes.length < period) {
        console.warn(`⚠️ 數據點數 (${closes.length}) 少於平滑週期 (${period})，使用较小的週期`);
        period = Math.max(3, Math.floor(closes.length / 3));
    }
    
    const smoothed = [];
    
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            // 前期數據點：用實際值
            smoothed.push(closes[i]);
        } else {
            // 計算過去 period 個數據的平均值
            const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            smoothed.push(sum / period);
        }
    }
    
    return smoothed;
}

/**
 * 自動計算最佳平滑週期
 * @param {Number} dataLength - 數據長度
 * @returns {Number} 建議的平滑週期
 */
function getOptimalSmoothingPeriod(dataLength) {
    // 年度交易日數約 252，建議週期 = 252 / 15 ≈ 17
    // 簡化為：根據數據長度計算
    return Math.max(5, Math.round(dataLength / 15));
}

/**
 * 計算市場特徵指標
 */
function calculateMarketCharacteristics(dates, closes) {
    if (closes.length < 2) return null;
    
    // 1. 年度收益率
    const startPrice = closes[0];
    const endPrice = closes[closes.length - 1];
    const annualReturn = ((endPrice - startPrice) / startPrice) * 100;
    
    // 2. 日收益率
    const dailyReturns = [];
    for (let i = 1; i < closes.length; i++) {
        dailyReturns.push(((closes[i] - closes[i-1]) / closes[i-1]) * 100);
    }
    
    // 3. 波動率 (日收益率標準差)
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length;
    const volatility = Math.sqrt(variance);
    
    // 4. 最大回撤
    let maxDrawdown = 0;
    let peakPrice = closes[0];
    for (let i = 1; i < closes.length; i++) {
        if (closes[i] > peakPrice) {
            peakPrice = closes[i];
        }
        const drawdown = ((peakPrice - closes[i]) / peakPrice) * 100;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }
    
    // 5. 上升/下降天數比
    const upDays = dailyReturns.filter(d => d > 0).length;
    const downDays = dailyReturns.filter(d => d < 0).length;
    const upDaysRatio = (upDays / dailyReturns.length) * 100;
    
    // 6. 趨勢強度 (用最長連續上升或下降天數表示)
    let maxConsecutiveUp = 0, currentConsecutiveUp = 0;
    for (let d of dailyReturns) {
        if (d > 0) {
            currentConsecutiveUp++;
            maxConsecutiveUp = Math.max(maxConsecutiveUp, currentConsecutiveUp);
        } else {
            currentConsecutiveUp = 0;
        }
    }
    
    return {
        annualReturn: annualReturn.toFixed(2),
        volatility: volatility.toFixed(2),
        maxDrawdown: maxDrawdown.toFixed(2),
        upDaysRatio: upDaysRatio.toFixed(2),
        maxConsecutiveUp: maxConsecutiveUp,
        tradingDays: closes.length
    };
}

/**
 * 計算市場特徵的變化率 (用於季度間比較)
 */
function calculateFeatureChangeRate(currentFeatures, previousFeatures) {
    if (!previousFeatures) return null;
    
    const changes = {};
    let significantChanges = [];
    
    // 計算各項指標的變化率 (%)
    const metrics = [
        { key: 'annualReturn', label: '收益率' },
        { key: 'volatility', label: '波動率' },
        { key: 'maxDrawdown', label: '最大回撤' },
        { key: 'upDaysRatio', label: '上升日數比' }
    ];
    
    metrics.forEach(metric => {
        const current = parseFloat(currentFeatures[metric.key]);
        const previous = parseFloat(previousFeatures[metric.key]);
        
        if (previous === 0) {
            changes[metric.key] = {
                changeRate: 0,
                label: metric.label,
                change: current - previous,
                isSignificant: false,
                emoji: '📊'
            };
        } else {
            const changeRate = ((current - previous) / Math.abs(previous)) * 100;
            const isSignificant = Math.abs(changeRate) > 20;  // >20% 判為顯著變化
            
            changes[metric.key] = {
                changeRate: changeRate.toFixed(1),
                label: metric.label,
                change: (current - previous).toFixed(2),
                isSignificant: isSignificant,
                direction: changeRate > 0 ? '↑' : changeRate < 0 ? '↓' : '→',
                emoji: isSignificant ? '⚠️' : '✓'
            };
            
            if (isSignificant) {
                significantChanges.push({
                    metric: metric.label,
                    changeRate: parseFloat(changeRate.toFixed(1)),
                    direction: changeRate > 0 ? '上升' : '下降'
                });
            }
        }
    });
    
    return {
        changes: changes,
        significantChanges: significantChanges,
        needsAdjustment: significantChanges.length > 0
    };
}

/**
 * 獲取前一個季度 (支援跨年)
 */
function getPreviousQuarter(year, quarter) {
    const quarterOrder = ['Q1', 'Q2', 'Q3', 'Q4'];
    const currentIndex = quarterOrder.indexOf(quarter);
    
    if (currentIndex === -1) return null;  // 無效季度
    
    if (currentIndex === 0) {
        // Q1 的上一季是去年 Q4
        return {
            year: year - 1,
            quarter: 'Q4'
        };
    } else {
        return {
            year: year,
            quarter: quarterOrder[currentIndex - 1]
        };
    }
}

// ==================== 相似度計算 ====================

/**
 * 計算兩個年份的相似度 (0-100)
 */
function calculateSimilarity(features1, features2) {
    const weights = {
        annualReturn: 0.25,
        volatility: 0.25,
        maxDrawdown: 0.20,
        upDaysRatio: 0.20,
        maxConsecutiveUp: 0.10
    };
    
    // 使用歐幾里得距離計算相似度
    let sumSquaredDiff = 0;
    
    // 年度收益率相似度 (差異越小越相似)
    sumSquaredDiff += weights.annualReturn * Math.pow((features1.annualReturn - features2.annualReturn) / 100, 2);
    
    // 波動率相似度
    sumSquaredDiff += weights.volatility * Math.pow((features1.volatility - features2.volatility) / 10, 2);
    
    // 最大回撤相似度
    sumSquaredDiff += weights.maxDrawdown * Math.pow((features1.maxDrawdown - features2.maxDrawdown) / 50, 2);
    
    // 上升天數比相似度
    sumSquaredDiff += weights.upDaysRatio * Math.pow((features1.upDaysRatio - features2.upDaysRatio) / 100, 2);
    
    // 連續上升天數相似度 (正規化到 0-20)
    sumSquaredDiff += weights.maxConsecutiveUp * Math.pow((features1.maxConsecutiveUp - features2.maxConsecutiveUp) / 20, 2);
    
    const distance = Math.sqrt(sumSquaredDiff);
    const similarity = Math.max(0, 100 - distance * 100);
    
    return similarity.toFixed(2);
}

// ==================== 市場類型分類 ====================

/**
 * 分類市場類型
 */
function classifyMarketType(features) {
    const annualReturn = parseFloat(features.annualReturn);
    const volatility = parseFloat(features.volatility);
    const upRatio = parseFloat(features.upDaysRatio);
    
    let type = '';
    
    if (annualReturn > 30) {
        type = '🐂 強勢牛市';
    } else if (annualReturn > 10) {
        type = '📈 溫和牛市';
    } else if (annualReturn > -10) {
        type = '〰️ 震盪市';
    } else if (annualReturn > -30) {
        type = '📉 溫和熊市';
    } else {
        type = '🐻 強勢熊市';
    }
    
    if (volatility > 2.5) {
        type += ' (高波動)';
    } else if (volatility < 1.2) {
        type += ' (低波動)';
    }
    
    return type;
}

/**
 * 獲取市場類型的大分類（不含波動性標籤）
 */
function getMarketTypeCategory(features) {
    const annualReturn = parseFloat(features.annualReturn);
    
    if (annualReturn > 10) {
        return 'bull';  // 牛市
    } else if (annualReturn > -10) {
        return 'sideways';  // 震盪市
    } else {
        return 'bear';  // 熊市
    }
}

/**
 * 按市場類型分組相似年份
 */
function groupSimilarYearsByType(similarYears, yearlyFeatures) {
    const grouped = {
        bull: [],
        sideways: [],
        bear: []
    };
    
    similarYears.forEach(item => {
        const category = getMarketTypeCategory(item.features);
        grouped[category].push(item);
    });
    
    return grouped;
}

/**
 * 檢查是否所有高相似度年份都屬於同一類型
 */
function isSameMarketType(similarYears) {
    if (similarYears.length === 0) return false;
    
    const types = similarYears.map(item => getMarketTypeCategory(item.features));
    const uniqueTypes = new Set(types);
    
    return uniqueTypes.size === 1;
}

// ==================== 參數範圍計算 ====================

/**
 * 計算精准的參數範圍（基於中位數±標準差）
 * 而非簡單的最小值-最大值
 */
function calculateRobustParameterRange(historicalParams) {
    if (!historicalParams || historicalParams.parameters.length === 0) {
        return null;
    }
    
    const shortMAs = historicalParams.parameters.map(p => p.shortMA).sort((a, b) => a - b);
    const longMAs = historicalParams.parameters.map(p => p.longMA).sort((a, b) => a - b);
    
    // 計算中位數
    const shortMaMedian = shortMAs[Math.floor(shortMAs.length / 2)];
    const longMaMedian = longMAs[Math.floor(longMAs.length / 2)];
    
    // 計算標準差
    const shortMaMean = shortMAs.reduce((a, b) => a + b, 0) / shortMAs.length;
    const longMaMean = longMAs.reduce((a, b) => a + b, 0) / longMAs.length;
    
    const shortMaVariance = shortMAs.reduce((a, b) => a + Math.pow(b - shortMaMean, 2), 0) / shortMAs.length;
    const longMaVariance = longMAs.reduce((a, b) => a + Math.pow(b - longMaMean, 2), 0) / longMAs.length;
    
    const shortMaStdDev = Math.sqrt(shortMaVariance);
    const longMaStdDev = Math.sqrt(longMaVariance);
    
    // 使用四分位數範圍（更穩健）
    // 第一四分位數
    const shortMaQ1 = shortMAs[Math.floor(shortMAs.length * 0.25)];
    const longMaQ1 = longMAs[Math.floor(longMAs.length * 0.25)];
    
    // 第三四分位數
    const shortMaQ3 = shortMAs[Math.floor(shortMAs.length * 0.75)];
    const longMaQ3 = longMAs[Math.floor(longMAs.length * 0.75)];
    
    return {
        shortMA: {
            min: Math.max(1, shortMaQ1),
            max: Math.min(256, shortMaQ3),
            median: shortMaMedian,
            mean: shortMaMean.toFixed(1)
        },
        longMA: {
            min: Math.max(1, longMaQ1),
            max: Math.min(256, longMaQ3),
            median: longMaMedian,
            mean: longMaMean.toFixed(1)
        },
        dataPoints: historicalParams.parameters.length
    };
}

// ==================== 主診斷函數 ====================

/**
 * 市場診斷主函數
 */
function runMarketDiagnosis() {
    const selectedYear = parseInt(document.getElementById('diagnosisYear').value);
    const selectedQuarter = document.getElementById('diagnosisQuarter').value;  // 新增：季度
    const stockSymbol = document.getElementById('stockSelect2').value;
    
    if (!csvData2) {
        showError('Diagnosis', '⚠ 請先上傳 CSV 檔案');
        return;
    }
    
    if (!selectedYear) {
        showError('Diagnosis', '⚠ 請選擇要診斷的年份');
        return;
    }
    
    if (!stockSymbol) {
        showError('Diagnosis', '⚠ 請選擇股票代碼');
        return;
    }
    
    document.getElementById('errorDiagnosis').classList.remove('show');
    document.getElementById('loadingDiagnosis').classList.add('show');
    document.getElementById('diagnosisResults').innerHTML = '';
    
    setTimeout(() => {
        try {
            // 1. 提取所有年份的數據並計算特徵
            const data = parseCSVData(csvData2, stockSymbol);
            if (!data || data.closes.length === 0) {
                throw new Error('❌ CSV 數據解析失敗');
            }
            
            // 找出 CSV 中包含的所有年份
            const yearsInData = new Set();
            data.dates.forEach(dateStr => {
                const year = parseInt(dateStr.split('/')[2]);
                yearsInData.add(year);
            });
            
            if (!yearsInData.has(selectedYear)) {
                throw new Error(`❌ CSV 中不包含 ${selectedYear} 年的數據`);
            }
            
            // 2. 計算所有年份的特徵（或季度特徵如果選擇了季度）
            const yearlyFeatures = {};
            const validYears = [];
            
            for (let year of yearsInData) {
                let yearDataForAnalysis;
                
                // 如果選擇了季度，只用該季度的數據
                if (selectedQuarter) {
                    yearDataForAnalysis = extractQuarterData(csvData2, stockSymbol, year, selectedQuarter);
                } else {
                    yearDataForAnalysis = extractYearData(csvData2, stockSymbol, year);
                }
                
                if (yearDataForAnalysis && yearDataForAnalysis.closes.length > 10) {
                    // 新增：在計算特徵前進行平滑處理
                    const smoothingPeriod = getOptimalSmoothingPeriod(yearDataForAnalysis.closes.length);
                    const smoothedCloses = smoothClosePrices(yearDataForAnalysis.closes, smoothingPeriod);
                    
                    const features = calculateMarketCharacteristics(yearDataForAnalysis.dates, smoothedCloses);
                    if (features) {
                        yearlyFeatures[year] = features;
                        if (year !== selectedYear) {
                            validYears.push(year);
                        }
                    }
                }
            }
            
            if (!yearlyFeatures[selectedYear]) {
                throw new Error(`❌ 無法計算 ${selectedYear} 年${selectedQuarter ? '（'+selectedQuarter+'）' : ''}的市場特徵`);
            }
            
            // 2.5 新增：檢測季度間變化 (如果選擇了季度)
            let quarterChangeAnalysis = null;
            if (selectedQuarter) {
                const prevQuarter = getPreviousQuarter(selectedYear, selectedQuarter);
                if (prevQuarter && yearsInData.has(prevQuarter.year)) {
                    const prevQuarterData = extractQuarterData(csvData2, stockSymbol, prevQuarter.year, prevQuarter.quarter);
                    if (prevQuarterData && prevQuarterData.closes.length > 10) {
                        // 新增：對前期季度也進行平滑處理
                        const smoothingPeriod = getOptimalSmoothingPeriod(prevQuarterData.closes.length);
                        const smoothedPrevCloses = smoothClosePrices(prevQuarterData.closes, smoothingPeriod);
                        
                        const prevFeatures = calculateMarketCharacteristics(prevQuarterData.dates, smoothedPrevCloses);
                        quarterChangeAnalysis = calculateFeatureChangeRate(yearlyFeatures[selectedYear], prevFeatures);
                        quarterChangeAnalysis.previousQuarter = prevQuarter;  // 保存上季信息用於顯示
                    }
                }
            }
            
            // 3. 計算相似度
            const currentYearFeatures = yearlyFeatures[selectedYear];
            const similarities = [];
            
            for (let year of validYears) {
                const similarity = calculateSimilarity(currentYearFeatures, yearlyFeatures[year]);
                similarities.push({
                    year: year,
                    similarity: parseFloat(similarity),
                    features: yearlyFeatures[year]
                });
            }
            
            // 4. 排序並取前 5 個最相似的年份
            similarities.sort((a, b) => b.similarity - a.similarity);
            const topSimilarYears = similarities.slice(0, 5);
            
            // 5. 顯示結果（新增季度參數）
            displayMarketDiagnosisResults(selectedYear, selectedQuarter, currentYearFeatures, topSimilarYears, quarterChangeAnalysis);
            
            document.getElementById('loadingDiagnosis').classList.remove('show');
            
        } catch (error) {
            document.getElementById('loadingDiagnosis').classList.remove('show');
            showError('Diagnosis', error.message);
            console.error('❌ 市場診斷錯誤:', error);
        }
    }, 0);
}

/**
 * 顯示市場診斷結果
 */
function displayMarketDiagnosisResults(selectedYear, selectedQuarter, currentFeatures, similarYears, quarterChangeAnalysis) {
    currentDiagnosisYear = selectedYear;  // 保存當前診斷年份
    
    // 生成季度標籤
    const quarterLabel = selectedQuarter ? ` - ${selectedQuarter}` : '';
    const quarterName = selectedQuarter ? `${selectedQuarter}（${getQuarterMonthName(selectedQuarter)}）` : '全年';
    
    let html = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin-top: 0;">📊 ${selectedYear} 年${quarterLabel}市場特徵診斷</h3>
            <div style="font-size: 13px; opacity: 0.9; margin-top: 5px;">📅 診斷時期：${quarterName}</div>
            <div style="font-size: 12px; opacity: 0.85; margin-top: 8px; background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 4px; display: inline-block;">
                ✨ 已應用平滑處理（MA15）以過濾日波動雜訊，提高年份相似度准確性
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px;">
                    <div style="font-size: 12px; opacity: 0.8;">期間收益率</div>
                    <div style="font-size: 24px; font-weight: bold; color: ${currentFeatures.annualReturn >= 0 ? '#4caf50' : '#f44336'};">
                        ${currentFeatures.annualReturn >= 0 ? '+' : ''}${currentFeatures.annualReturn}%
                    </div>
                </div>
                
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px;">
                    <div style="font-size: 12px; opacity: 0.8;">波動率</div>
                    <div style="font-size: 24px; font-weight: bold;">${currentFeatures.volatility}%</div>
                </div>
                
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px;">
                    <div style="font-size: 12px; opacity: 0.8;">最大回撤</div>
                    <div style="font-size: 24px; font-weight: bold; color: #ff9800;">-${currentFeatures.maxDrawdown}%</div>
                </div>
                
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px;">
                    <div style="font-size: 12px; opacity: 0.8;">上升日數比</div>
                    <div style="font-size: 24px; font-weight: bold;">${currentFeatures.upDaysRatio}%</div>
                </div>
            </div>
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
                <div style="font-size: 13px;">
                    🔍 <strong>市場類型判斷：</strong>
                    ${classifyMarketType(currentFeatures)}
                </div>
            </div>
            ${quarterChangeAnalysis && quarterChangeAnalysis.previousQuarter ? `
            <div style="margin-top: 15px; padding: 12px; background: ${quarterChangeAnalysis.needsAdjustment ? 'rgba(244, 67, 54, 0.15)' : 'rgba(76, 175, 80, 0.15)'}; border-radius: 6px; border-left: 4px solid ${quarterChangeAnalysis.needsAdjustment ? '#f44336' : '#4caf50'};">
                <div style="font-size: 12px; font-weight: bold; color: ${quarterChangeAnalysis.needsAdjustment ? '#f44336' : '#4caf50'};">
                    ${quarterChangeAnalysis.needsAdjustment ? '⚠️ 季度間變化警告' : '✓ 市場特徵穩定'}
                </div>
                <div style="font-size: 11px; margin-top: 8px; line-height: 1.6;">
                    與 ${quarterChangeAnalysis.previousQuarter.year}年${quarterChangeAnalysis.previousQuarter.quarter}（${getQuarterMonthName(quarterChangeAnalysis.previousQuarter.quarter)}）相比：<br>
                    ${Object.entries(quarterChangeAnalysis.changes).map(([key, data]) => {
                        if (!data.isSignificant) return '';
                        return `${data.emoji} ${data.label}: ${data.direction} ${Math.abs(data.changeRate)}% (${data.change > 0 ? '+' : ''}${data.change})`;
                    }).filter(s => s).join('<br>')}
                    ${quarterChangeAnalysis.significantChanges.length === 0 ? '<span style="opacity: 0.8;">所有指標變化 ≤20%，市場特徵相對穩定</span>' : ''}
                </div>
                ${quarterChangeAnalysis.needsAdjustment ? `
                <div style="font-size: 11px; margin-top: 8px; padding-top: 8px; border-top: 1px solid currentColor; opacity: 0.9;">
                    💡 <strong>建議：</strong>市場特徵發生顯著變化，建議重新調整策略參數。參考下方「最相似的歷史時期」以找到適合的參數組合。
                </div>
                ` : ''}
            </div>
            ` : ''}
        </div>
        
        <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; border-left: 4px solid #4caf50; margin-bottom: 20px;">
            <h4 style="margin-top: 0;">🎯 最相似的歷史時期 (推薦參數來源)</h4>
            <p style="color: #666; font-size: 13px;">這些年份${selectedQuarter ? '的同季' : ''}的市場特徵與 ${selectedYear}${quarterLabel} 年最接近。可參考這些歷史時期的最佳參數。</p>
            
            <div style="display: grid; gap: 12px;">
    `;
    
    similarYears.forEach((item, index) => {
        const similarity = item.similarity;
        const features = item.features;
        const color = similarity > 80 ? '#4caf50' : similarity > 70 ? '#ff9800' : '#2196f3';
        
        html += `
                <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid ${color};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 18px; font-weight: bold; color: #333;">
                                ${index + 1}. ${item.year} 年
                            </div>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                                年度收益率: <span style="color: ${features.annualReturn >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">
                                    ${features.annualReturn >= 0 ? '+' : ''}${features.annualReturn}%
                                </span>
                                | 波動率: ${features.volatility}% | 最大回撤: -${features.maxDrawdown}%
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="background: ${color}; color: white; padding: 10px 15px; border-radius: 6px; font-weight: bold;">
                                相似度<br>${similarity}%
                            </div>
                        </div>
                    </div>
                </div>
        `;
    });
    
    html += `
            </div>
        </div>
        
        <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 20px;">
            <h4 style="margin-top: 0;">🎬 參數範圍建議</h4>
            ${selectedQuarter ? `<div style="font-size: 12px; color: #1976d2; margin-bottom: 10px;">📅 基於相同季度（${getQuarterMonthName(selectedQuarter)}）的歷史數據</div>` : ''}
    `;
    
    // 檢查是否所有相似年份都屬於同一市場類型
    const sameType = isSameMarketType(similarYears);
    const marketTypeCategory = getMarketTypeCategory(similarYears[0].features);
    const marketTypeLabel = marketTypeCategory === 'bull' ? '牛市' : marketTypeCategory === 'bear' ? '熊市' : '震盪市';
    
    let foundHistoricalParams = false;
    const stockSymbol = document.getElementById('stockSelect2').value;
    
    // 收集所有同類型年份的參數以計算合併範圍
    let allSameTypeParams = [];
    let sameTypeYearsData = [];
    
    if (sameType) {
        similarYears.forEach(item => {
            const historicalParams = getParametersFromLocalStorage(stockSymbol, item.year);
            if (historicalParams && historicalParams.parameters.length > 0) {
                allSameTypeParams = allSameTypeParams.concat(historicalParams.parameters);
                sameTypeYearsData.push(item.year);
            }
        });
    }
    
    if (sameType && sameTypeYearsData.length > 0) {
        // 所有年份都是同類型，計算合併的參數範圍
        html += `<p style="color: #666; font-size: 13px; margin: 0 0 15px 0;">
            ✅ <strong>所有相似年份都屬於${marketTypeLabel}（2017、2021、2023 及 2024 年市場特徵高度一致）</strong><br>
            基於這 ${sameTypeYearsData.length} 個${marketTypeLabel}年份的 ${allSameTypeParams.length} 個歷史最佳參數，使用四分位數法計算更精准的推薦範圍。
        </p>
        
        <div style="display: grid; gap: 10px;">`;
        
        if (allSameTypeParams.length > 0) {
            // 為每個年份顯示其個別參數範圍
            similarYears.forEach((item, index) => {
                const year = item.year;
                const similarity = item.similarity;
                const color = '#4caf50';  // 統一用綠色表示同類型
                
                const historicalParams = getParametersFromLocalStorage(stockSymbol, year);
                let shortMaMin, shortMaMax, longMaMin, longMaMax, paramMessage;
                
                if (historicalParams && historicalParams.parameters.length > 0) {
                    const robustRange = calculateRobustParameterRange(historicalParams);
                    shortMaMin = robustRange.shortMA.min;
                    shortMaMax = robustRange.shortMA.max;
                    longMaMin = robustRange.longMA.min;
                    longMaMax = robustRange.longMA.max;
                    paramMessage = `✅ 基於 ${robustRange.dataPoints} 個參數（中位數法）`;
                } else {
                    shortMaMin = Math.max(1, Math.round(item.features.upDaysRatio / 10) - 5);
                    shortMaMax = Math.max(shortMaMin + 1, Math.round(item.features.upDaysRatio / 5));
                    longMaMin = Math.round(item.features.upDaysRatio / 2);
                    longMaMax = Math.min(256, Math.round(item.features.upDaysRatio));
                    paramMessage = `💡 基於市場特徵推算`;
                }
                
                html += `
                    <div style="
                        background: white;
                        border: 2px solid ${color};
                        padding: 12px 15px;
                        border-radius: 6px;
                        text-align: left;
                        font-size: 13px;
                    ">
                        <div style="font-weight: bold; color: #333;">
                            📅 ${year} 年 (相似度 ${similarity}% | ${marketTypeLabel})
                        </div>
                        <div style="color: #666; margin-top: 5px; font-size: 12px;">
                            ${paramMessage}
                        </div>
                        <div style="color: #333; margin-top: 8px; padding: 8px; background: ${color}15; border-radius: 4px;">
                            <strong>推薦範圍：</strong><br>
                            短均線：<span style="color: ${color}; font-weight: bold;">${shortMaMin} - ${shortMaMax}</span> | 
                            長均線：<span style="color: ${color}; font-weight: bold;">${longMaMin} - ${longMaMax}</span>
                        </div>
                        <div style="margin-top: 8px; color: #666; font-size: 11px;">
                            👉 你可以在「移動平均線模式」的自訂參數中使用這些範圍進行測試
                        </div>
                    </div>
                `;
            });
            
            // 計算所有同類型參數的合併範圍
            const mergedParams = {
                parameters: allSameTypeParams
            };
            const mergedRange = calculateRobustParameterRange(mergedParams);
            
            html += `
                </div>
                
                <div style="margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); color: white; border-radius: 6px;">
                    <div style="font-weight: bold; margin-bottom: 10px;">
                        🎯 ${marketTypeLabel}年份合併建議範圍（基於 ${allSameTypeParams.length} 個參數）
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div>
                            <div style="font-size: 12px; opacity: 0.9;">短均線</div>
                            <div style="font-size: 18px; font-weight: bold;">
                                ${mergedRange.shortMA.min} - ${mergedRange.shortMA.max}
                            </div>
                            <div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">
                                中位數: ${mergedRange.shortMA.median} | 平均: ${mergedRange.shortMA.mean}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 12px; opacity: 0.9;">長均線</div>
                            <div style="font-size: 18px; font-weight: bold;">
                                ${mergedRange.longMA.min} - ${mergedRange.longMA.max}
                            </div>
                            <div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">
                                中位數: ${mergedRange.longMA.median} | 平均: ${mergedRange.longMA.mean}
                            </div>
                        </div>
                    </div>
                    <div style="margin-top: 10px; font-size: 12px; opacity: 0.9;">
                        ⭐ 這個合併範圍是從同類型年份中提取，比單一年份的範圍更穩健、更可靠。
                    </div>
                </div>
            `;
        } else {
            html += `<p style="color: #ff9800;">⚠️ 尚未有這些年份的優化參數記錄，請先進行優化。</p></div>`;
        }
    } else {
        // 原有邏輯：相似年份屬於不同市場類型
        html += `<p style="color: #666; font-size: 13px; margin: 0 0 15px 0;">
            基於從歷史年份優化結果中提取的實際參數，推薦你在以下範圍內測試 ${selectedYear} 年的參數。
        </p>
        
        <div style="display: grid; gap: 10px;">`;
        
        similarYears.forEach((item, index) => {
            const year = item.year;
            const similarity = item.similarity;
            const color = similarity > 80 ? '#4caf50' : similarity > 70 ? '#ff9800' : '#2196f3';
            
            // 嘗試從 localStorage 讀取該年份的實際優化參數
            const historicalParams = getParametersFromLocalStorage(stockSymbol, year);
            
            let shortMaMin, shortMaMax, longMaMin, longMaMax, paramMessage;
            
            if (historicalParams && historicalParams.parameters.length > 0) {
                foundHistoricalParams = true;
                const robustRange = calculateRobustParameterRange(historicalParams);
                shortMaMin = robustRange.shortMA.min;
                shortMaMax = robustRange.shortMA.max;
                longMaMin = robustRange.longMA.min;
                longMaMax = robustRange.longMA.max;
                paramMessage = `✅ 基於 ${robustRange.dataPoints} 個參數（中位數法）`;
            } else {
                // 如果沒有歷史參數，使用啟發式推算
                shortMaMin = Math.max(1, Math.round(item.features.upDaysRatio / 10) - 5);
                shortMaMax = Math.max(shortMaMin + 1, Math.round(item.features.upDaysRatio / 5));
                longMaMin = Math.round(item.features.upDaysRatio / 2);
                longMaMax = Math.min(256, Math.round(item.features.upDaysRatio));
                paramMessage = `💡 基於市場特徵推算 (未找到歷史優化記錄)`;
            }
            
            html += `
                <div style="
                    background: white;
                    border: 2px solid ${color};
                    padding: 12px 15px;
                    border-radius: 6px;
                    text-align: left;
                    font-size: 13px;
                ">
                    <div style="font-weight: bold; color: #333;">
                        📅 ${year} 年 (相似度 ${similarity}%)
                    </div>
                    <div style="color: #666; margin-top: 5px; font-size: 12px;">
                        ${paramMessage}
                    </div>
                    <div style="color: #333; margin-top: 8px; padding: 8px; background: ${color}15; border-radius: 4px;">
                        <strong>推薦範圍：</strong><br>
                        短均線：<span style="color: ${color}; font-weight: bold;">${shortMaMin} - ${shortMaMax}</span> | 
                        長均線：<span style="color: ${color}; font-weight: bold;">${longMaMin} - ${longMaMax}</span>
                    </div>
                    <div style="margin-top: 8px; color: #666; font-size: 11px;">
                        👉 你可以在「移動平均線模式」的自訂參數中使用這些範圍進行測試
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
            ${!foundHistoricalParams ? `
            <div style="margin-top: 12px; padding: 10px; background: #fff3cd; border-radius: 4px; color: #856404; font-size: 12px;">
                💡 <strong>提示：</strong> 若要使用實際的歷史優化參數，請先在「移動平均線模式」中對相似年份進行優化，系統會自動保存參數。
            </div>
            ` : ''}
        `;
    }
    
    html += `
        </div>
        
        <div style="background: #fff3e0; padding: 20px; border-radius: 8px; border-left: 4px solid #ff9800;">
            <h4 style="margin-top: 0;">💡 建議</h4>
            <ul style="margin: 10px 0; padding-left: 20px; font-size: 13px; color: #666;">
                <li>參考上述相似年份的最佳參數，作為 ${selectedYear} 年的初始建議</li>
                <li>建議先在「快速查詢」測試這些推薦參數，確認效果</li>
                <li>配合「年份穩定性分析」找出跨年穩定的參數</li>
                <li>市場特徵相似不保證參數完全相同，需要實際驗證</li>
            </ul>
        </div>
    `;
    
    document.getElementById('diagnosisResults').innerHTML = html;
}

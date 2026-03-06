/**
 * 滑動窗口分析
 * 用於驗證交易策略在不同時期的穩定性
 */

/**
 * 運行滑動窗口分析
 */
function runWalkForwardAnalysis() {
    const errorDiv = document.getElementById('errorWF');
    const loadingDiv = document.getElementById('loadingWF');
    const resultsDiv = document.getElementById('resultsWF');
    
    errorDiv.textContent = '';
    errorDiv.className = 'error';
    resultsDiv.innerHTML = '';
    resultsDiv.classList.remove('show');  // 隱藏之前的結果
    
    if (!csvData2 || csvData2.lines.length < 2) {
        errorDiv.textContent = '❌ 請先上傳 CSV 檔案';
        errorDiv.className = 'error show';
        return;
    }
    
    const stockSymbol = document.getElementById('stockSelectWF').value;
    if (!stockSymbol) {
        errorDiv.textContent = '❌ 請選擇股票';
        errorDiv.className = 'error show';
        return;
    }
    
    console.log(`📊 開始解析: 格式=${csvData2.format}, 股票=${stockSymbol}, 行數=${csvData2.lines.length}`);
    
    // 嘗試用現有parseCSVData解析（支持多股票CSV），如果失敗則用簡單解析
    let parsedData = parseCSVData(csvData2, stockSymbol);
    if (!parsedData) {
        console.warn(`⚠️ parseCSVData 失敗，嘗試簡單解析...`);
        parsedData = parseCSVDataSimple(csvData2, stockSymbol);
    }
    
    if (!parsedData || parsedData.dates.length === 0) {
        errorDiv.textContent = `❌ 無法解析 CSV 數據。請檢查 CSV 格式是否正確。`;
        errorDiv.className = 'error show';
        console.error('❌ 解析失敗，無法獲取數據');
        return;
    }
    
    console.log(`✅ 解析成功: 獲得 ${parsedData.dates.length} 根K線`);
    
    if (parsedData.dates.length < 50) {
        errorDiv.textContent = `❌ 數據不足 (只有 ${parsedData.dates.length} 根K線)，至少需要 50 根K線`;
        errorDiv.className = 'error show';
        return;
    }
    
    const windowSize = parseInt(document.getElementById('windowSizeWF').value);
    const trainingRatio = parseInt(document.getElementById('trainingRatioWF').value) / 100;
    const stepSize = parseInt(document.getElementById('stepSizeWF').value);
    const minMA = parseInt(document.getElementById('minMAWF').value);
    const maxMA = parseInt(document.getElementById('maxMAWF').value);
    const initialCash = parseFloat(document.getElementById('initialCashWF').value);
    const maType = document.getElementById('maTypeWF').value;
    const useCommission = document.getElementById('useCommissionWF').checked;
    
    if (windowSize > parsedData.dates.length) {
        errorDiv.textContent = `❌ 窗口大小 (${windowSize}) 超過數據長度 (${parsedData.dates.length})`;
        errorDiv.className = 'error show';
        return;
    }
    
    if (minMA >= maxMA) {
        errorDiv.textContent = '❌ 最小均線天數必須小於最大均線天數';
        errorDiv.className = 'error show';
        return;
    }
    
    loadingDiv.style.display = 'block';
    
    // 預估計算時間
    const estimatedWindows = Math.ceil((parsedData.dates.length - windowSize) / stepSize) + 1;
    const estimatedParamCombinations = (maxMA - minMA + 1) * (maxMA - minMA) / 2;
    const estimatedSeconds = Math.max(5, Math.ceil(estimatedWindows * estimatedParamCombinations / 50)); // 粗略估計
    
    console.log(`🚀 開始執行滑動窗口分析`);
    console.log(`   窗口=${windowSize}, 訓練比=${(trainingRatio*100).toFixed(0)}%, 步進=${stepSize}`);
    console.log(`   預計 ${estimatedWindows} 個窗口，參數組合~${estimatedParamCombinations}，預計耗時 ~${estimatedSeconds}秒`);
    
    const progressDiv = document.getElementById('progressWF');
    if (progressDiv) {
        progressDiv.textContent = `預計 ${estimatedWindows} 個窗口，實時進度請查看瀏覽器控制台（F12）...`;
    }
    
    // 用Promise讓計算非阻塞，避免UI卡住
    Promise.resolve().then(() => {
        const startTime = Date.now();
        const results = performWalkForwardAnalysis(
            parsedData.dates,
            parsedData.closes,
            windowSize,
            trainingRatio,
            stepSize,
            minMA,
            maxMA,
            initialCash,
            maType,
            useCommission
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        loadingDiv.style.display = 'none';
        console.log(`✅ 滑動窗口分析完成！耗時 ${duration}秒，生成 ${results.windows.length} 個窗口結果`);
        console.log('🔍 準備呼叫 displayWalkForwardResults()');
        console.log('🔍 results 物件:', results);
        displayWalkForwardResults(results, stockSymbol, maType);
        console.log('🔍 displayWalkForwardResults() 已完成');
    }).catch(error => {
        loadingDiv.style.display = 'none';
        console.error('❌ 完整錯誤信息:', error);
        console.error('❌ 堆疊:', error.stack);
        errorDiv.textContent = `❌ 錯誤: ${error.message}`;
        errorDiv.className = 'error show';
    });
}

/**
 * 簡單 CSV 解析（支援最基础的格式：日期、股票名稱、收盤價）
 * 以及多股票格式（Date, AAPL, AMGN, AMZN, ...）
 */
function parseCSVDataSimple(csvData, stockSymbol) {
    const dates = [];
    const closes = [];
    
    try {
        const headers = csvData.headers;
        
        // **策略 1：尋找名稱完全或部分匹配的列**
        let closeColIndex = -1;
        let dateColIndex = -1;
        
        // 尋找 Date 列
        for (let i = 0; i < headers.length; i++) {
            const h = headers[i].toLowerCase();
            if (h === 'date' || h === '日期') {
                dateColIndex = i;
                break;
            }
        }
        if (dateColIndex === -1) dateColIndex = 0; // 默認第一列
        
        // 尋找股票列（轉換為大寫進行匹配，支持多股票 CSV）
        const stockUpper = stockSymbol.toUpperCase();
        for (let i = 0; i < headers.length; i++) {
            const h = headers[i].toUpperCase();
            if (h === stockUpper) {
                closeColIndex = i;
                console.log(`✅ 在多股票 CSV 中找到列: ${stockSymbol} (索引=${closeColIndex})`);
                break;
            }
        }
        
        // **策略 2：如果找不到（單列模式），尋找 Close/收盤/Price**
        if (closeColIndex === -1) {
            for (let i = 0; i < headers.length; i++) {
                const h = headers[i].toLowerCase();
                if (h.includes('close') || h.includes('收盤') || h.includes('price')) {
                    closeColIndex = i;
                    console.log(`✅ 找到收盤價列: ${headers[i]} (索引=${closeColIndex})`);
                    break;
                }
            }
        }
        
        // **策略 3：用最後一列作為收盤價**
        if (closeColIndex === -1) {
            closeColIndex = headers.length - 1;
            console.warn(`⚠️ 使用默認列作為收盤價: ${headers[closeColIndex]} (索引=${closeColIndex})`);
        }
        
        console.log(`📊 CSV 結構: Date列=${dateColIndex} (${headers[dateColIndex]}), 收盤價列=${closeColIndex} (${headers[closeColIndex]})`);
        
        // 解析數據
        for (let i = 1; i < csvData.lines.length; i++) {
            const line = csvData.lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            
            if (values.length > Math.max(dateColIndex, closeColIndex)) {
                const date = values[dateColIndex];
                const closeStr = values[closeColIndex];
                
                if (date && closeStr) {
                    const close = parseFloat(closeStr);
                    if (!isNaN(close) && close > 0) {
                        dates.push(date);
                        closes.push(close);
                    }
                }
            }
        }
        
        // ⚠️ **NEW：如果數據不足，嘗試找最完整的股票列**
        if (dates.length < 100) {
            console.warn(`⚠️ 股票 ${stockSymbol} 只有 ${dates.length} 條有效數據，正在掃描其他股票...`);
            
            // 掃描所有股票列，找最完整的
            const stockStats = {};
            for (let colIdx = 1; colIdx < headers.length; colIdx++) {
                if (colIdx === dateColIndex) continue;
                
                let count = 0;
                const tempDates = [];
                const tempCloses = [];
                
                for (let i = 1; i < csvData.lines.length; i++) {
                    const line = csvData.lines[i].trim();
                    if (!line) continue;
                    const values = line.split(',').map(v => v.trim());
                    
                    if (values.length > colIdx && values[dateColIndex]) {
                        const close = parseFloat(values[colIdx]);
                        if (!isNaN(close) && close > 0) {
                            count++;
                            tempDates.push(values[dateColIndex]);
                            tempCloses.push(close);
                        }
                    }
                }
                
                if (count >= 100) {
                    stockStats[headers[colIdx]] = { count, dates: tempDates, closes: tempCloses, colIdx };
                }
            }
            
            // 找數據最多的股票
            if (Object.keys(stockStats).length > 0) {
                const bestStock = Object.entries(stockStats).sort((a, b) => b[1].count - a[1].count)[0];
                console.log(`✅ 自動切換到股票: ${bestStock[0]} (${bestStock[1].count} 條有效數據)`);
                
                dates.length = 0;
                closes.length = 0;
                dates.push(...bestStock[1].dates);
                closes.push(...bestStock[1].closes);
            }
        }
        
        console.log(`✅ 簡單解析成功: ${dates.length} 根K線 | 股票: ${stockSymbol}`);
        return dates.length > 0 ? { dates, closes, volumes: [], opens: [], highs: [], lows: [] } : null;
    } catch (error) {
        console.error('❌ 簡單解析失敗:', error);
        return null;
    }
}

/**
 * 執行行走式向前分析的核心邏輯
 */
function performWalkForwardAnalysis(dates, closes, windowSize, trainingRatio, stepSize, minMA, maxMA, initialCash, maType, useCommission) {
    if (dates.length < windowSize) {
        throw new Error(`數據長度 (${dates.length}) 小於窗口大小 (${windowSize})`);
    }
    
    const windows = [];
    
    // 生成所有窗口
    for (let startIdx = 0; startIdx + windowSize <= dates.length; startIdx += stepSize) {
        const endIdx = startIdx + windowSize;
        const trainingEndIdx = startIdx + Math.floor(windowSize * trainingRatio);
        
        windows.push({
            windowNum: windows.length + 1,
            startIdx,
            endIdx,
            trainingEndIdx,
            startDate: dates[startIdx],
            endDate: dates[endIdx - 1],
            trainingDate: dates[trainingEndIdx - 1],
            testingDate: dates[endIdx - 1]
        });
    }
    
    if (windows.length === 0) {
        throw new Error('無法生成窗口，請檢查窗口配置');
    }
    
    console.log(`📊 生成 ${windows.length} 個窗口，開始優化...`);
    
    const allResults = [];
    let previousParams = null;
    
    // 對每個窗口進行分析
    for (let w = 0; w < windows.length; w++) {
        const window = windows[w];
        const trainingCloses = closes.slice(window.startIdx, window.trainingEndIdx);
        const testingCloses = closes.slice(window.trainingEndIdx, window.endIdx);
        const testingDates = dates.slice(window.trainingEndIdx, window.endIdx);
        
        console.log(`  🔧 窗口 #${w+1}/${windows.length}: 訓練=${trainingCloses.length} 根, 測試=${testingCloses.length} 根`);
        
        // 在訓練期優化參數
        const optimizedParams = findBestParameters(
            trainingCloses,
            minMA,
            maxMA,
            initialCash,
            maType,
            useCommission
        );
        
        // 在測試期測試新優化的參數
        let newParamsResult = null;
        try {
            newParamsResult = backtest(
                testingDates,
                testingCloses,
                optimizedParams.shortMA,
                optimizedParams.longMA,
                initialCash,
                Math.max(optimizedParams.shortMA, optimizedParams.longMA),
                testingCloses.length - 1,
                maType,
                maType,
                useCommission
            );
        } catch (e) {
            console.warn(`  ⚠️ 窗口 #${w+1} 測試新參數失敗:`, e.message);
            newParamsResult = {returnRate: 0, finalValue: initialCash, tradeCount: 0, totalCommission: 0};
        }
        
        // 用前一個窗口的參數在當前測試期測試
        let previousParamsResult = null;
        if (previousParams) {
            try {
                previousParamsResult = backtest(
                    testingDates,
                    testingCloses,
                    previousParams.shortMA,
                    previousParams.longMA,
                    initialCash,
                    Math.max(previousParams.shortMA, previousParams.longMA),
                    testingCloses.length - 1,
                    maType,
                    maType,
                    useCommission
                );
            } catch (e) {
                console.warn(`  ⚠️ 窗口 #${w+1} 測試前期參數失敗:`, e.message);
                previousParamsResult = null;
            }
        }
        
        const windowResult = {
            windowNum: window.windowNum,
            trainingPeriod: `${window.startDate} ~ ${window.trainingDate}`,
            testingPeriod: `${window.testingDate}`,
            trainingSize: trainingCloses.length,
            testingSize: testingCloses.length,
            
            // 新優化的參數
            optimizedParams: {
                shortMA: optimizedParams.shortMA,
                longMA: optimizedParams.longMA
            },
            newParamsPerformance: {
                returnRate: newParamsResult.returnRate,
                finalValue: newParamsResult.finalValue,
                tradeCount: newParamsResult.tradeCount,
                totalCommission: newParamsResult.totalCommission
            },
            
            // 前一個窗口的參數（如果存在）
            previousParams: previousParams ? {
                shortMA: previousParams.shortMA,
                longMA: previousParams.longMA
            } : null,
            previousParamsPerformance: previousParamsResult ? {
                returnRate: previousParamsResult.returnRate,
                finalValue: previousParamsResult.finalValue,
                tradeCount: previousParamsResult.tradeCount,
                totalCommission: previousParamsResult.totalCommission
            } : null,
            
            // 變化比較
            performanceChange: previousParamsResult ? {
                returnRateChange: newParamsResult.returnRate - previousParamsResult.returnRate,
                returnRateChangeRatio: previousParamsResult.returnRate !== 0 ? 
                    ((newParamsResult.returnRate - previousParamsResult.returnRate) / Math.abs(previousParamsResult.returnRate)) * 100 : 0
            } : null
        };
        
        allResults.push(windowResult);
        previousParams = optimizedParams;
        
        console.log(`    ✅ 完成 (新參數: ${optimizedParams.shortMA},${optimizedParams.longMA} => ${newParamsResult.returnRate.toFixed(2)}%)`);
    }
    
    console.log(`✅ 所有窗口計算完成！`);
    
    return {
        windows: allResults,
        totalWindows: windows.length,
        initialCash: initialCash,
        configuration: {
            windowSize,
            trainingRatio: (trainingRatio * 100).toFixed(0),
            stepSize,
            minMA,
            maxMA,
            maType
        }
    };
}

/**
 * 找到最佳參數組合
 * 允許任意組合（shortMA可以>=longMA），實現完整的 (maxMA-minMA+1)² 搜索空間
 */
function findBestParameters(closes, minMA, maxMA, initialCash, maType, useCommission) {
    if (closes.length < Math.max(minMA, maxMA) * 2) {
        console.warn(`⚠️ 數據太少 (${closes.length} 根), 無法計算 MA, 返回默認參數`);
        return {shortMA: Math.min(minMA, closes.length / 3), longMA: Math.min(maxMA, closes.length / 2), returnRate: 0};
    }
    
    let bestResult = null;
    let bestReturnRate = -Infinity;
    
    // 創建虛擬dates用於優化
    const fakeDates = Array.from({length: closes.length}, (_, i) => `D${i}`);
    
    // 允許任意組合：shortMA 和 longMA 獨立遍歷
    // 實現真正的 (maxMA-minMA+1) × (maxMA-minMA+1) 搜索空間
    for (let shortMA = minMA; shortMA <= maxMA; shortMA++) {
        for (let longMA = minMA; longMA <= maxMA; longMA++) {
            try {
                const result = backtest(
                    fakeDates,
                    closes,
                    shortMA,
                    longMA,
                    initialCash,
                    Math.max(longMA, shortMA),
                    closes.length - 1,
                    maType,
                    maType,
                    useCommission
                );
                
                if (result.returnRate > bestReturnRate) {
                    bestReturnRate = result.returnRate;
                    bestResult = {
                        shortMA,
                        longMA,
                        returnRate: result.returnRate
                    };
                }
            } catch (e) {
                console.debug(`⚠️ 參數 (${shortMA},${longMA}) 跳過`);
                continue;
            }
        }
    }
    
    if (!bestResult) {
        // 如果都失敗，返回簡單的中間值參數
        const mid1 = Math.floor((minMA + maxMA) / 3);
        const mid2 = Math.floor((minMA + maxMA) * 2 / 3);
        bestResult = {shortMA: Math.max(minMA, mid1), longMA: Math.max(Math.min(maxMA, mid2), mid1 + 1), returnRate: 0};
    }
    
    console.log(`✅ 找到最優參數: SMA(${bestResult.shortMA},${bestResult.longMA}) 收益率=${bestResult.returnRate.toFixed(2)}%`);
    return bestResult;
}

/**
 * 顯示行走式向前分析結果
 */
function displayWalkForwardResults(results, stockSymbol, maType) {
    console.log('🔍 displayWalkForwardResults() 被調用');
    const resultsDiv = document.getElementById('resultsWF');
    console.log('🔍 resultsDiv:', resultsDiv);
    console.log('🔍 results:', results);
    console.log('🔍 results.windows:', results ? results.windows : 'N/A');
    
    if (!resultsDiv) {
        console.error('❌ 找不到結果容器 resultsWF');
        // 嘗試找到任何有 "results" 在ID中的元素
        const allDivs = document.querySelectorAll('[id*="results"]');
        console.log('🔍 找到的所有 results* 元素:', allDivs);
        return;
    }
    
    // 清除之前的內容並確保visible
    resultsDiv.innerHTML = '';
    resultsDiv.classList.remove('show');
    resultsDiv.classList.add('show');
    
    if (!results || !results.windows || results.windows.length === 0) {
        console.error('❌ 無有效結果', results);
        resultsDiv.innerHTML = '<p style="color: red;">❌ 無法生成結果，請查看控制台日誌。</p>';
        console.log('🔍 已設置錯誤消息');
        return;
    }
    
    try {
        let html = `
            <div style="margin-top: 30px;">
                <h3>📊 行走式向前驗證結果</h3>
                <p><strong>股票:</strong> ${stockSymbol} | <strong>均線類型:</strong> ${maType} | <strong>初始資金:</strong> $${results.initialCash}</p>
                <p><strong>窗口配置:</strong> 大小=${results.configuration.windowSize}天, 訓練=${results.configuration.trainingRatio}%, 步進=${results.configuration.stepSize}天</p>
                <p style="color: #888; font-size: 12px;">共 ${results.windows.length} 個窗口</p>
                
                <div style="overflow-x: auto; margin-top: 20px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
                                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">窗口</th>
                                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">訓練期</th>
                                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">測試期</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">最優參數</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">新參數收益率</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">前期參數</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">前期參數收益率</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">收益率變化</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        results.windows.forEach(wr => {
            try {
                // 強制轉換為數字，確保顏色邏輯正確
                const newReturnValue = parseFloat(wr.newParamsPerformance.returnRate) || 0;
                const prevReturnValue = wr.previousParamsPerformance ? parseFloat(wr.previousParamsPerformance.returnRate) || 0 : null;
                const changeValue = wr.performanceChange ? parseFloat(wr.performanceChange.returnRateChange) || 0 : null;
                
                const newReturnColor = newReturnValue >= 0 ? '#66BB6A' : '#EF5350';
                const prevReturnColor = prevReturnValue !== null && prevReturnValue >= 0 ? '#66BB6A' : '#EF5350';
                const changeColor = changeValue === null ? '#999' : changeValue >= 0 ? '#66BB6A' : '#EF5350';
                
                html += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">#${wr.windowNum}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${wr.trainingPeriod}<br><span style="color: #888;">共 ${wr.trainingSize} 根K線</span></td>
                        <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${wr.testingPeriod}<br><span style="color: #888;">共 ${wr.testingSize} 根K線</span></td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">SMA(${wr.optimizedParams.shortMA},${wr.optimizedParams.longMA})</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: ${newReturnColor}; font-weight: bold;">${newReturnValue.toFixed(2)}%</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                            ${wr.previousParams ? `SMA(${wr.previousParams.shortMA},${wr.previousParams.longMA})` : '<span style="color: #888;">-</span>'}
                        </td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${prevReturnColor} !important; background-color: ${prevReturnValue < 0 ? '#FFE5E5' : '#E8F5E9'} !important;">
                            ${wr.previousParamsPerformance ? `${prevReturnValue.toFixed(2)}%` : '-'}
                        </td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; ${wr.performanceChange ? `color: ${changeColor}; font-weight: bold;` : 'color: #888;'}">
                            ${wr.performanceChange ? `${changeValue.toFixed(2)}% (${wr.performanceChange.returnRateChangeRatio.toFixed(1)}%)` : '-'}
                        </td>
                    </tr>
                `;
            } catch (e) {
                console.warn('⚠️ 某個窗口行渲染失敗:', e);
            }
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 5px;">
                    <h4>📈 分析摘要</h4>
                    ${generateWalkForwardSummary(results)}
                </div>
            </div>
        `;
        
        resultsDiv.innerHTML = html;
        resultsDiv.classList.add('show');  // 添加show類使其可見
        console.log('✅ 結果已成功渲染');
    } catch (error) {
        console.error('❌ 渲染結果失敗:', error);
        console.error('❌ 錯誤堆棧:', error.stack);
        console.log('🔍 嘗試設置錯誤消息...');
        resultsDiv.innerHTML = `<p style="color: red;">❌ 渲染結果時出錯: ${error.message}</p>`;
        resultsDiv.classList.add('show');  // 確保錯誤消息也可見
        console.log('🔍 錯誤消息已設置，請刷新頁面查看');
    }
}

/**
 * 生成行走式向前分析摘要
 */
function generateWalkForwardSummary(results) {
    const windows = results.windows;
    
    // 計算統計信息
    const newParamsReturns = windows.map(w => w.newParamsPerformance.returnRate);
    const avgNewReturn = newParamsReturns.reduce((a, b) => a + b, 0) / newParamsReturns.length;
    const positiveCount = newParamsReturns.filter(r => r > 0).length;
    
    let summary = `
        <ul style="line-height: 1.8;">
            <li><strong>總窗口數:</strong> ${windows.length}</li>
            <li><strong>新優化參數平均收益率:</strong> <span style="color: ${avgNewReturn >= 0 ? '#66BB6A' : '#EF5350'}; font-weight: bold;">${avgNewReturn.toFixed(2)}%</span></li>
            <li><strong>正收益窗口:</strong> ${positiveCount}/${windows.length} (${(positiveCount/windows.length*100).toFixed(1)}%)</li>
    `;
    
    // 如果有前期參數的比較
    const windowsWithPrev = windows.filter(w => w.previousParamsPerformance);
    if (windowsWithPrev.length > 0) {
        const performanceChanges = windowsWithPrev.map(w => w.performanceChange.returnRateChange);
        const avgChange = performanceChanges.reduce((a, b) => a + b, 0) / performanceChanges.length;
        const improvementCount = performanceChanges.filter(c => c > 0).length;
        
        summary += `
            <li><strong>與前期參數對比:</strong></li>
            <ul style="margin-left: 20px; line-height: 1.8;">
                <li>平均收益率變化: <span style="color: ${avgChange >= 0 ? '#66BB6A' : '#EF5350'}; font-weight: bold;">${avgChange.toFixed(2)}%</span></li>
                <li>新參數更優的窗口: ${improvementCount}/${windowsWithPrev.length} (${(improvementCount/windowsWithPrev.length*100).toFixed(1)}%)</li>
                <li><strong>結論:</strong> ${avgChange > 0 ? '✅ 新優化參數表現更好，策略在改進' : '⚠️ 新優化參數表現下降，可能過擬合'}</li>
            </ul>
        `;
    }
    
    summary += `
            <li style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
                <strong>策略穩定性評估:</strong><br>
                ${evaluateStrategyStability(windows)}
            </li>
        </ul>
    `;
    
    return summary;
}

/**
 * 評估策略穩定性
 */
function evaluateStrategyStability(windows) {
    const returns = windows.map(w => w.newParamsPerformance.returnRate);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - (returns.reduce((a,b) => a+b)/returns.length), 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    const avgReturn = returns.reduce((a, b) => a + b) / returns.length;
    const sharpeRatio = avgReturn / (volatility || 1); // 簡化的夏普比率
    
    let assessment = '';
    if (volatility < 5) {
        assessment = '🟢 穩定：策略在不同時期的表現相對穩定';
    } else if (volatility < 15) {
        assessment = '🟡 中等：策略表現波動較大';
    } else {
        assessment = '🔴 不穩定：策略表現波動很大，可靠性較低';
    }
    
    return assessment + `<br>波動率: ${volatility.toFixed(2)}% | Sharpe比率: ${sharpeRatio.toFixed(2)}`;
}

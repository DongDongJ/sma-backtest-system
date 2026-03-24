/**
 * 方案B UI整合模塊
 */

console.log('🔥 方案B UI模塊載入中...');

let schemeBInProgress = false;

/**
 * 運行方案B
 */
function runSchemeB() {
    if (schemeBInProgress) {
        alert('⏳ 優化已在運行中...');
        return;
    }

    const errorDiv = document.getElementById('error2');
    const loadingDiv = document.getElementById('loading2');
    const resultsDiv = document.getElementById('results2');
    
    errorDiv.textContent = '';
    resultsDiv.innerHTML = '';
    
    if (!csvData2 || csvData2.lines.length < 2) {
        errorDiv.textContent = '❌ 請先上傳 CSV 檔案';
        errorDiv.className = 'error show';
        return;
    }
    
    const stockSymbol = document.getElementById('stockSelect2').value;
    if (!stockSymbol) {
        errorDiv.textContent = '❌ 請選擇股票';
        errorDiv.className = 'error show';
        return;
    }

    // 獲取短/長MA範圍
    const shortMAMin = parseInt(document.getElementById('shortMAMin')?.value || 1) || 1;
    const shortMAMax = parseInt(document.getElementById('shortMAMax')?.value || 256) || 256;
    const longMAMin = parseInt(document.getElementById('longMAMin')?.value || 1) || 1;
    const longMAMax = parseInt(document.getElementById('longMAMax')?.value || 256) || 256;
    
    const initialCash = parseFloat(document.getElementById('initialCash2')?.value || 10000) || 10000;
    const useCommission = document.getElementById('useCommission2')?.checked || false;
    const startDateStr = document.getElementById('startDate2')?.value || '';
    const endDateStr = document.getElementById('endDate2')?.value || '';

    if (shortMAMin >= shortMAMax || longMAMin >= longMAMax) {
        errorDiv.textContent = '❌ 最大值必須大於最小值';
        errorDiv.className = 'error show';
        return;
    }

    // 解析CSV
    let parsedData = parseCSVData(csvData2, stockSymbol);
    if (!parsedData) {
        parsedData = parseCSVDataSimple(csvData2, stockSymbol);
    }
    
    if (!parsedData || parsedData.dates.length === 0) {
        errorDiv.textContent = '❌ 無法解析 CSV 數據';
        errorDiv.className = 'error show';
        return;
    }

    // ✅ 改進：使用與方案A相同的數據處理方式
    // 找到日期範圍在原始數據中的索引
    let startIdx = parsedData.dates.indexOf(startDateStr);
    let endIdx = parsedData.dates.indexOf(endDateStr);
    
    if (startIdx === -1) {
        const startDateObj = new Date(startDateStr);
        for (let i = 0; i < parsedData.dates.length; i++) {
            if (new Date(parsedData.dates[i]) >= startDateObj) {
                startIdx = i;
                break;
            }
        }
    }
    
    if (endIdx === -1) {
        const endDateObj = new Date(endDateStr);
        for (let i = parsedData.dates.length - 1; i >= 0; i--) {
            if (new Date(parsedData.dates[i]) <= endDateObj) {
                endIdx = i;
                break;
            }
        }
    }
    
    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
        errorDiv.textContent = '❌ 日期範圍無效或找不到資料';
        errorDiv.className = 'error show';
        return;
    }
    
    // 計算需要提前的天數（用於計算MA的預熱期）
    const maxPeriod = Math.max(shortMAMax, longMAMax);
    const extraDays = maxPeriod - 1;
    const dataStartIdx = Math.max(0, startIdx - extraDays);
    const outputStartIdx = startIdx - dataStartIdx;
    
    // 提取擴展後的數據（包含預熱期）
    const expandedDates = parsedData.dates.slice(dataStartIdx, endIdx + 1);
    const expandedCloses = parsedData.closes.slice(dataStartIdx, endIdx + 1);
    const expandedVolumes = parsedData.volumes && parsedData.volumes.length > 0 
        ? parsedData.volumes.slice(dataStartIdx, endIdx + 1) 
        : [];

    if (expandedDates.length < 50) {
        errorDiv.textContent = '❌ 數據不足（需至少50根K線）';
        errorDiv.className = 'error show';
        return;
    }

    // 計算組合數
    const shortCount = (shortMAMax - shortMAMin) + 1;
    const longCount = (longMAMax - longMAMin) + 1;
    const realCount = shortCount * longCount;  // ✅ 測試所有組合 (包含shortMA > longMA)
    const totalCombinations = realCount * 10 * 10; // 10種放量倍數 × 10種周期
    const estimatedSeconds = Math.max(30, Math.floor(totalCombinations / 10000));

    const msg = `🔥 方案 B - 參數設定確認\n\n` +
                `📊 短期天數（短MA）: ${shortMAMin} ~ ${shortMAMax} (共 ${shortCount} 個)\n` +
                `📊 長期天數（長MA）: ${longMAMin} ~ ${longMAMax} (共 ${longCount} 個)\n` +
                `\n💰 放量倍數: 1.1x ~ 2.0x (共 10 種)\n` +
                `⏰ 成交量周期: 5天 ~ 50天 (共 10 種)\n` +
                `\n📈 計算方式:\n` +
                `${shortCount} × ${longCount} × 10 × 10 = ${totalCombinations.toLocaleString()} 組合\n` +
                `\n⏱️ 預計耗時: ${estimatedSeconds}~${estimatedSeconds * 3} 秒\n\n` +
                `確定繼續優化？`;
    if (!confirm(msg)) return;

    schemeBInProgress = true;
    loadingDiv.style.display = 'block';
    const progressText = document.querySelector('#loading2 p');
    if (progressText) {
        progressText.id = 'schemeBProgress';
    }

    setTimeout(() => {
        try {
            const optimizationResult = optimizeSchemeB(
                expandedDates, expandedCloses, expandedVolumes,  // ✅ 使用擴展後的數據
                shortMAMin, shortMAMax,
                longMAMin, longMAMax,
                initialCash,
                useCommission,
                (current, total, best, percent) => {
                    const prog = document.getElementById('schemeBProgress');
                    if (prog) {
                        prog.textContent = `⏳ 進度 ${percent}% | 已測 ${current.toLocaleString()}/${total.toLocaleString()} | 最佳: ${best.returnRate.toFixed(2)}%`;
                    }
                },
                outputStartIdx  // ✅ 傳遞正確的起始位置
            );

            const html = generateSchemeBResultsHTML(optimizationResult, 50);
            resultsDiv.innerHTML = html;
            resultsDiv.classList.add('show');
            
            loadingDiv.style.display = 'none';
            console.log('✅ 方案B完成！');

        } catch (error) {
            console.error('❌ 出錯:', error);
            errorDiv.textContent = `❌ 出錯: ${error.message}`;
            errorDiv.className = 'error show';
            loadingDiv.style.display = 'none';
        } finally {
            schemeBInProgress = false;
        }
    }, 100);
}

console.log('✅ scheme_b_integration.js 已載入');

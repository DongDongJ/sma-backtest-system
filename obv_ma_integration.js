/**
 * 💧 OBV + MA 分析事件處理和 UI 集成
 */

// 初始化時直接設置策略選擇事件
console.log('📌 初始化 OBV + MA 模塊...');

// 直接設置初始狀態
function initializeOBVStrategy() {
    const obvStrategySelect = document.getElementById('obvStrategy');
    const simpleParams = document.getElementById('obvSimpleParams');
    const dualParams = document.getElementById('obvDualParams');
    
    if (obvStrategySelect && simpleParams && dualParams) {
        // 設置初始狀態（簡單版）
        simpleParams.style.display = 'block';
        dualParams.style.display = 'none';
        
        // 添加變化事件監聽
        obvStrategySelect.addEventListener('change', function() {
            console.log('🔄 策略已更改為:', this.value);
            
            if (this.value === 'simple') {
                simpleParams.style.display = 'block';
                dualParams.style.display = 'none';
            } else {
                simpleParams.style.display = 'none';
                dualParams.style.display = 'block';
            }
        });
        
        console.log('✅ OBV 策略選擇已初始化');
    } else {
        console.warn('⚠️ 無法找到 OBV 參數元素');
    }
}

// DOM 加載時初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeOBVStrategy();
});

/**
 * 根據日期範圍過濾數據
 */
function filterDataByDateRange(dates, closes, volumes, startDateStr, endDateStr) {
    console.log('🔍 開始日期範圍過濾...');
    
    // 如果沒有指定日期範圍，返回全部數據
    if (!startDateStr && !endDateStr) {
        console.log('✅ 未指定日期範圍，使用全部數據');
        return {
            dates: dates,
            closes: closes,
            volumes: volumes,
            success: false
        };
    }
    
    let startIdx = 0;
    let endIdx = dates.length - 1;
    
    // 尋找開始日期
    if (startDateStr) {
        startIdx = dates.indexOf(startDateStr);
        if (startIdx === -1) {
            // 如果找不到精確日期，尋找最接近的日期
            try {
                const startDateObj = new Date(startDateStr.replace(/\//g, '-'));
                for (let i = 0; i < dates.length; i++) {
                    const currentDate = new Date(dates[i].replace(/\//g, '-'));
                    if (currentDate >= startDateObj) {
                        startIdx = i;
                        console.log(`✅ 開始日期: ${startDateStr} → 找到 ${dates[i]}`);
                        break;
                    }
                }
                if (startIdx === -1) {
                    console.warn(`⚠️ 開始日期 ${startDateStr} 未found，使用第一天`);
                    startIdx = 0;
                }
            } catch (e) {
                console.warn(`⚠️ 開始日期格式錯誤: ${startDateStr}`);
                startIdx = 0;
            }
        } else {
            console.log(`✅ 開始日期: ${startDateStr}`);
        }
    }
    
    // 尋找結束日期
    if (endDateStr) {
        endIdx = dates.indexOf(endDateStr);
        if (endIdx === -1) {
            // 如果找不到精確日期，尋找最接近的日期
            try {
                const endDateObj = new Date(endDateStr.replace(/\//g, '-'));
                for (let i = dates.length - 1; i >= 0; i--) {
                    const currentDate = new Date(dates[i].replace(/\//g, '-'));
                    if (currentDate <= endDateObj) {
                        endIdx = i;
                        console.log(`✅ 結束日期: ${endDateStr} → 找到 ${dates[i]}`);
                        break;
                    }
                }
                if (endIdx === -1) {
                    console.warn(`⚠️ 結束日期 ${endDateStr} 未found，使用最後一天`);
                    endIdx = dates.length - 1;
                }
            } catch (e) {
                console.warn(`⚠️ 結束日期格式錯誤: ${endDateStr}`);
                endIdx = dates.length - 1;
            }
        } else {
            console.log(`✅ 結束日期: ${endDateStr}`);
        }
    }
    
    // 驗證範圍
    if (startIdx > endIdx) {
        console.error('❌ 開始日期晚於結束日期，使用全部數據');
        return {
            dates: dates,
            closes: closes,
            volumes: volumes,
            success: false
        };
    }
    
    // 提取範圍內的數據
    const filteredDates = dates.slice(startIdx, endIdx + 1);
    const filteredCloses = closes.slice(startIdx, endIdx + 1);
    const filteredVolumes = volumes.slice(startIdx, endIdx + 1);
    
    console.log(`✅ 過濾結果: ${filteredDates.length} 行 (${startIdx} → ${endIdx})`);
    console.log(`   日期: ${filteredDates[0]} 到 ${filteredDates[filteredDates.length - 1]}`);
    
    return {
        dates: filteredDates,
        closes: filteredCloses,
        volumes: filteredVolumes,
        success: true
    };
}

/**
 * 文件上傳處理 - 支持 OBV 模式
 */
function handleOBVFileUpload() {
    handleFileUpload('OBV');
}

/**
 * 執行 OBV + MA 回測分析
 */
function runOBV_MA_Analysis() {
    console.log('🚀 開始 OBV + MA 分析...');
    
    const errorDiv = document.getElementById('errorOBV');
    const loadingDiv = document.getElementById('loadingOBV');
    const resultsDiv = document.getElementById('resultsOBV');
    
    console.log('🔎 元素查找結果:');
    console.log('   errorDiv:', errorDiv ? '✅ 找到' : '❌ 未找到');
    console.log('   loadingDiv:', loadingDiv ? '✅ 找到' : '❌ 未找到');
    console.log('   resultsDiv:', resultsDiv ? '✅ 找到' : '❌ 未找到');
    
    // 清空之前的結果
    if (errorDiv) errorDiv.innerHTML = '';
    if (errorDiv) errorDiv.style.display = 'none';
    if (resultsDiv) resultsDiv.innerHTML = '';
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
        resultsDiv.classList.remove('show');
    }
    if (loadingDiv) {
        loadingDiv.style.display = 'block';
        console.log('✅ 加載指示器已顯示');
    }
    
    try {
        console.log('📋 獲取用戶輸入...');
        
        // 獲取用戶輸入
        const stockSymbol = document.getElementById('stockSelectOBV').value;
        const strategy = document.getElementById('obvStrategy').value;
        const initialCash = parseFloat(document.getElementById('initialCashOBV').value);
        const useCommission = document.getElementById('useCommissionOBV').checked;
        
        console.log('✅ 用戶輸入:', {stockSymbol, strategy, initialCash, useCommission});
        console.log('📊 csvData2 狀態:', csvData2 ? '已加載' : '未加載');
        
        if (!stockSymbol || !csvData2) {
            throw new Error('❌ 請先上傳 CSV 檔案並選擇股票代碼');
        }
        
        console.log('🔍 解析股票數據...');
        
        // 使用 parseCSVData 函數解析數據（與其他 tabs 一致）
        const stockData = parseCSVData(csvData2, stockSymbol);
        console.log('📈 解析結果:', stockData ? `成功 (${stockData.dates ? stockData.dates.length : 0} 筆)` : '失敗');
        
        if (!stockData || !stockData.dates || stockData.dates.length === 0) {
            throw new Error(`❌ 找不到股票 ${stockSymbol} 的數據，請確認股票代碼正確`);
        }
        
        const dates = stockData.dates;
        const closes = stockData.closes;
        const volumes = stockData.volumes;
        
        console.log(`📊 數據統計: ${dates.length} 行，最新價格: $${closes[closes.length - 1]}`);
        
        // 獲取日期範圍
        const startDateStr = document.getElementById('startDateOBV').value;
        const endDateStr = document.getElementById('endDateOBV').value;
        
        console.log(`📅 日期範圍設定: ${startDateStr || '(未設定)'} 到 ${endDateStr || '(未設定)'}`);
        
        // 應用日期過濾
        let filteredResult = filterDataByDateRange(
            dates, closes, volumes, 
            startDateStr, endDateStr
        );
        
        if (filteredResult.success) {
            console.log(`✅ 日期過濾完成: ${filteredResult.dates.length} 行數據`);
        } else {
            console.log(`⚠️ 日期過濾未應用，使用全部數據`);
            filteredResult = {
                dates: dates,
                closes: closes,
                volumes: volumes,
                success: false
            };
        }
        
        const filteredDates = filteredResult.dates;
        const filteredCloses = filteredResult.closes;
        const filteredVolumes = filteredResult.volumes;
        
        if (closes.length < 50) {
            throw new Error(`❌ 數據不足，至少需要 50 條記錄 (目前: ${closes.length} 條)`);
        }
        
        if (filteredCloses.length < 50) {
            throw new Error(`❌ 過濾後數據不足，至少需要 50 條記錄 (目前: ${filteredCloses.length} 條)`);
        }
        
        console.log('⚙️ 開始回測計算...');
        
        let result;
        
        if (strategy === 'simple') {
            // 簡單版：僅 OBV-MA 交叉
            const obvMA_period = parseInt(document.getElementById('obvMA_Period').value);
            console.log(`🔄 簡單版回測 (OBV-MA: ${obvMA_period} 天)`);
            
            if (typeof backtestOBV_MA_Simple !== 'function') {
                throw new Error('❌ backtestOBV_MA_Simple 函數未定義');
            }
            
            result = backtestOBV_MA_Simple(
                filteredDates, filteredCloses, filteredVolumes,
                obvMA_period,
                initialCash,
                useCommission
            );
        } else {
            // 進階版：雙 MA 確認
            const shortMA_period = parseInt(document.getElementById('shortMA_OBV').value);
            const longMA_period = parseInt(document.getElementById('longMA_OBV').value);
            const obvMA_period = parseInt(document.getElementById('obvMA_Period2').value);
            
            console.log(`🔄 進階版回測 (短MA: ${shortMA_period}, 長MA: ${longMA_period}, OBV-MA: ${obvMA_period})`);
            
            if (typeof backtestOBV_DualMA !== 'function') {
                throw new Error('❌ backtestOBV_DualMA 函數未定義');
            }
            
            result = backtestOBV_DualMA(
                filteredDates, filteredCloses, filteredVolumes,
                shortMA_period,
                longMA_period,
                obvMA_period,
                initialCash,
                useCommission
            );
        }
        
        // 計算背離統計
        let divergenceCount = 0;
        if (result.trades && result.trades.length > 0) {
            result.trades.forEach(trade => {
                if (trade.divergence) {
                    divergenceCount++;
                }
            });
        }
        
        console.log('✅ 回測完成!', {
            finalValue: result.finalValue,
            profit: result.profit,
            returnRate: result.returnRate,
            trades: result.trades ? result.trades.length : 0,
            divergences: divergenceCount
        });
        console.log(`🔍 背離檢測: ${divergenceCount} 個交易點檢測到背離`);
        
        // 隱藏載入狀態
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
            console.log('✅ 加載指示器已隱藏');
        }
        
        // 等待 DOM 更新後顯示結果
        setTimeout(() => {
            console.log('📺 準備顯示結果...');
            displayOBV_MA_Results(result, strategy, stockSymbol);
        }, 100);
        
    } catch (error) {
        console.log('❌ 發生錯誤...');
        
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
            console.log('✅ 加載指示器已隱藏');
        }
        
        console.error('❌ OBV 分析錯誤:', error);
        console.error('📋 錯誤堆棧:', error.stack);
        
        if (errorDiv) {
            errorDiv.innerHTML = `❌ ${error.message}`;
            errorDiv.style.display = 'block';
            errorDiv.style.backgroundColor = '#ffebee';
            errorDiv.style.color = '#c62828';
            errorDiv.style.padding = '15px';
            errorDiv.style.borderRadius = '8px';
            errorDiv.style.marginTop = '15px';
            console.log('✅ 錯誤信息已顯示');
            
            // 滾動到錯誤位置
            errorDiv.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

/**
 * 顯示 OBV + MA 分析結果
 */
function displayOBV_MA_Results(result, strategy, stockSymbol) {
    console.log('📺 開始顯示結果...');
    console.log('   股票:', stockSymbol);
    console.log('   策略:', strategy);
    console.log('   回測結果:', result);
    
    const resultsDiv = document.getElementById('resultsOBV');
    
    if (!resultsDiv) {
        console.error('❌ 找不到結果容器 #resultsOBV');
        alert('❌ 找不到結果容器，請重新整理頁面');
        return;
    }
    
    console.log('✅ 找到結果容器');
    
    try {
        // 第 1 部分：標題和績效指標
        let html = `<div style="padding: 20px; background: #f5f5f5; border-radius: 8px;">`;
        html += `<h3 style="margin: 0 0 15px 0; color: #1e88e5;">📊 ${stockSymbol} - ${strategy === 'simple' ? '簡單版 (OBV-MA 交叉)' : '進階版 (雙 MA 確認)'} 分析結果</h3>`;
        
        // 計算背離統計
        let divergenceTrades = 0;
        let divergenceCount = 0;
        if (result.trades && result.trades.length > 0) {
            result.trades.forEach(trade => {
                if (trade.divergence) {
                    divergenceCount++;
                    if (trade.type === 'BUY' || trade.type === 'SELL') {
                        divergenceTrades++;
                    }
                }
            });
        }
        const divergencePercentage = result.tradeCount > 0 ? (divergenceTrades / result.tradeCount) * 100 : 0;
        
        // 績效指標卡片
        html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">`;
        
        // 最終資產
        html += `<div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #4caf50;">`;
        html += `<div style="font-size: 12px; color: #666; margin-bottom: 5px;">💰 最終資產</div>`;
        html += `<div style="font-size: 20px; font-weight: bold; color: #4caf50;">$${result.finalValue.toFixed(2)}</div>`;
        html += `</div>`;
        
        // 獲利
        const profitColor = result.profit >= 0 ? '#4caf50' : '#f44336';
        html += `<div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid ${profitColor};">`;
        html += `<div style="font-size: 12px; color: #666; margin-bottom: 5px;">📈 獲利</div>`;
        html += `<div style="font-size: 20px; font-weight: bold; color: ${profitColor};">${result.profit >= 0 ? '+' : ''}$${result.profit.toFixed(2)}</div>`;
        html += `</div>`;
        
        // 報酬率
        const returnColor = result.returnRate >= 0 ? '#2196f3' : '#ff9800';
        html += `<div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid ${returnColor};">`;
        html += `<div style="font-size: 12px; color: #666; margin-bottom: 5px;">📊 報酬率</div>`;
        html += `<div style="font-size: 20px; font-weight: bold; color: ${returnColor};">${result.returnRate >= 0 ? '+' : ''}${result.returnRate.toFixed(2)}%</div>`;
        html += `</div>`;
        
        // 交易筆數
        html += `<div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #9c27b0;">`;
        html += `<div style="font-size: 12px; color: #666; margin-bottom: 5px;">🔄 交易筆數</div>`;
        html += `<div style="font-size: 20px; font-weight: bold; color: #9c27b0;">${result.tradeCount}</div>`;
        html += `</div>`;
        
        // 背離檢測
        const divergenceColor = divergencePercentage > 30 ? '#ff9800' : divergencePercentage > 0 ? '#2196f3' : '#999';
        html += `<div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid ${divergenceColor};">`;
        html += `<div style="font-size: 12px; color: #666; margin-bottom: 5px;">⚡ 背離檢測</div>`;
        html += `<div style="font-size: 20px; font-weight: bold; color: ${divergenceColor};">${divergenceTrades}/${result.tradeCount}</div>`;
        html += `<div style="font-size: 11px; color: #888; margin-top: 3px;">${divergencePercentage.toFixed(1)}% 交易</div>`;
        html += `</div>`;
        
        html += `</div>`; // 結束績效指標網格
        
        console.log('✅ 第 1 部分完成：績效指標');
        
        // 第 2 部分：交易記錄
        if (result.trades && result.trades.length > 0) {
            console.log(`📋 準備顯示 ${result.trades.length} 筆交易記錄`);
            
            html += `<div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 20px;">`;
            html += `<h4 style="margin: 0 0 10px 0; color: #333;">🔄 交易記錄 (前 15 筆)</h4>`;
            html += `<div style="overflow-x: auto; max-height: 400px; overflow-y: auto;">`;
            html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
            
            // 表頭
            html += `<thead><tr style="background: #e3f2fd; position: sticky; top: 0;">`;
            html += `<th style="padding: 8px; text-align: left; border-bottom: 2px solid #1e88e5;">日期</th>`;
            html += `<th style="padding: 8px; text-align: left; border-bottom: 2px solid #1e88e5;">類型</th>`;
            html += `<th style="padding: 8px; text-align: right; border-bottom: 2px solid #1e88e5;">價格</th>`;
            html += `<th style="padding: 8px; text-align: right; border-bottom: 2px solid #1e88e5;">數量</th>`;
            html += `<th style="padding: 8px; text-align: right; border-bottom: 2px solid #1e88e5;">OBV</th>`;
            html += `<th style="padding: 8px; text-align: right; border-bottom: 2px solid #1e88e5;">OBV-MA</th>`;
            html += `<th style="padding: 8px; text-align: center; border-bottom: 2px solid #1e88e5;">背離 ⚡</th>`;
            html += `</tr></thead><tbody>`;
            
            // 表格行
            const displayTrades = result.trades.slice(0, 15);
            displayTrades.forEach((trade) => {
                const rowColor = trade.type === 'BUY' ? '#e8f5e9' : trade.type === 'SELL' ? '#ffebee' : '#f5f5f5';
                const typeColor = trade.type === 'BUY' ? '#4caf50' : trade.type === 'SELL' ? '#f44336' : '#666';
                const divergenceMarker = trade.divergence ? '⚠️ 檢測' : '—';
                
                html += `<tr style="background: ${rowColor}; border-bottom: 1px solid #eee;">`;
                html += `<td style="padding: 8px;">${trade.date}</td>`;
                html += `<td style="padding: 8px; color: ${typeColor}; font-weight: bold;">${trade.type}</td>`;
                html += `<td style="padding: 8px; text-align: right;">$${trade.price.toFixed(2)}</td>`;
                html += `<td style="padding: 8px; text-align: right;">${trade.quantity}</td>`;
                html += `<td style="padding: 8px; text-align: right;">${trade.obv ? trade.obv.toFixed(0) : 'N/A'}</td>`;
                html += `<td style="padding: 8px; text-align: right;">${trade.obvMA ? trade.obvMA.toFixed(0) : 'N/A'}</td>`;
                html += `<td style="padding: 8px; text-align: center; color: ${trade.divergence ? '#ff9800' : '#ccc'}; font-weight: ${trade.divergence ? 'bold' : 'normal'};">${divergenceMarker}</td>`;
                html += `</tr>`;
            });
            
            html += `</tbody></table></div></div>`;
            console.log('✅ 第 2 部分完成：交易記錄');
        } else {
            console.log('⚠️ 沒有交易記錄');
            html += `<div style="background: #e8f5e9; padding: 15px; border-radius: 6px; margin-bottom: 20px; color: #2e7d32;">`;
            html += `<p style="margin: 0;">📊 無交易記錄 - 策略未生成任何交易信號</p>`;
            html += `</div>`;
        }
        
        // 第 3 部分：背離檢測說明和策略說明
        html += `<div style="background: #fff3e0; padding: 15px; border-radius: 6px; border-left: 4px solid #ff9800; margin-top: 15px; margin-bottom: 15px;">`;
        html += `<strong>⚡ 背離檢測說明：</strong><br>`;
        html += `<small style="color: #666;">`;
        html += `背離是指價格和技術指標運動方向不一致的現象，通常預示著價格走勢可能發生反轉。<br>`;
        html += `• <strong>看跌背離：</strong> 價格創新高但 OBV 未創新高 → 下跌信號<br>`;
        html += `• <strong>看漲背離：</strong> 價格創新低但 OBV 未創新低 → 上升信號<br>`;
        html += `• 檢測窗口：20 日 | 背離比例：${divergencePercentage.toFixed(1)}% (${divergenceTrades}/${result.tradeCount} 交易)<br>`;
        html += `</small>`;
        html += `</div>`;
        
        html += `<div style="background: #fff3cd; padding: 15px; border-radius: 6px; border-left: 4px solid #ffc107;">`;
        html += `<strong>💡 策略說明：</strong><br>`;
        if (strategy === 'simple') {
            html += `• OBV 上穿 OBV-MA = 買入信號 ✅<br>`;
            html += `• OBV 下穿 OBV-MA = 賣出信號 ❌<br>`;
            html += `• 適合發現主要趨勢轉折點<br>`;
            html += `• 交易較頻繁，回報波動較大`;
        } else {
            html += `• 需要價格 MA 和 OBV-MA 同時確認<br>`;
            html += `• 價格黃金交叉 + OBV 上穿 = 強買信號 💪<br>`;
            html += `• 價格死亡交叉 + OBV 下穿 = 強賣信號 ⚠️<br>`;
            html += `• 避免假信號，交易較穩健`;
        }
        html += `</div>`;
        
        html += `</div>`; // 結束外層容器
        
        console.log('✅ 第 3 部分完成：策略說明');
        console.log(`📝 HTML 字符串長度: ${html.length}`);
        
        // 設置 HTML
        console.log('🎨 開始渲染 HTML 到頁面...');
        resultsDiv.innerHTML = html;
        
        // 確保結果容器可見
        resultsDiv.style.display = 'block';
        resultsDiv.classList.add('show');
        
        // 驗證
        if (resultsDiv.innerHTML.length > 0) {
            console.log('✅ 結果已成功顯示在頁面上!');
            console.log(`📊 頁面上的 HTML 長度：${resultsDiv.innerHTML.length}`);
            
            // 滾動到結果位置
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('👀 已滾動到結果位置');
        } else {
            console.warn('⚠️ 結果容器為空，HTML 可能未成功設置');
        }
        
    } catch (error) {
        console.error('❌ 顯示結果時出錯:', error);
        console.error('📋 錯誤堆棧:', error.stack);
        
        resultsDiv.innerHTML = `<div style="background: #ffebee; padding: 15px; border-radius: 6px; color: #c62828; border-left: 4px solid #c62828;">
            <strong>❌ 顯示結果時發生錯誤：</strong><br>
            <code>${error.message}</code><br>
            <small>請在開發者工具中查看完整錯誤信息</small>
        </div>`;
        
        console.log('✅ 錯誤信息已顯示');
    }
}

/**
 * 導出 OBV 分析結果為 CSV
 */
function exportOBV_Results() {
    const resultsDiv = document.getElementById('resultsOBV');
    if (!resultsDiv.innerHTML) {
        alert('❌ 尚無結果可匯出');
        return;
    }
    
    // 簡單實現：複製結果到剪貼板
    const text = resultsDiv.innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ 結果已複製到剪貼板');
    }).catch(() => {
        alert('❌ 複製失敗');
    });
}

console.log('✅ obv_ma_integration.js 成功載入');

// 3D 熱力圖集成模塊 - 使用 Plotly.js 處理數據準備和UI交互

function loadHeatmapData() {
    console.log('🔥 開始載入熱力圖...');
    
    const source = document.getElementById('heatmapDataSource').value;
    const errorDiv = document.getElementById('errorHeatmap');
    const loadingDiv = document.getElementById('loadingHeatmap');
    
    errorDiv.classList.remove('show');
    loadingDiv.classList.add('show');

    // 檢查數據源
    let results = null;
    let minShort = 1, maxShort = 256, minLong = 1, maxLong = 256;
    let initialCash = 10000;

    // 檢查是否有優化結果
    if (!window.cachedOptimizationResults || window.cachedOptimizationResults.length === 0) {
        console.error('❌ 未找到優化結果');
        console.error('   window.cachedOptimizationResults:', window.cachedOptimizationResults);
        errorDiv.textContent = '⚠ 請先運行「移動平均線模式」的優化（SMA/EMA/WMA）';
        errorDiv.classList.add('show');
        loadingDiv.classList.remove('show');
        return;
    }

    // 調試：打印所有結果的type
    console.log('✅ 所有優化結果:', window.cachedOptimizationResults.length, '條');
    console.log('✅ 首條結果:', window.cachedOptimizationResults[0]);
    console.log('✅ 數據源選擇:', source);

    if (source === 'sma' || source === 'ema' || source === 'wma') {
        // 從 SMA/EMA/WMA 優化結果中獲取數據
        results = window.cachedOptimizationResults.filter(r => {
            const typeMatches = r.shortMAType === source.toUpperCase();
            return typeMatches;
        });

        initialCash = parseFloat(document.getElementById('initialCash2').value) || 10000;

        if (results.length === 0) {
            console.error(`❌ 沒有找到 ${source.toUpperCase()} 類型的結果`);
            errorDiv.textContent = `⚠ 沒有找到 ${source.toUpperCase()} 類型的結果。優化數據中找到了 ${window.cachedOptimizationResults.length} 條，類型為 ${window.cachedOptimizationResults[0].shortMAType}`;
            errorDiv.classList.add('show');
            loadingDiv.classList.remove('show');
            return;
        }

        // 獲取參數範圍
        minShort = Math.min(...results.map(r => r.shortMA));
        maxShort = Math.max(...results.map(r => r.shortMA));
        minLong = Math.min(...results.map(r => r.longMA));
        maxLong = Math.max(...results.map(r => r.longMA));

        console.log('✅ 篩選結果:', results.length, '條，參數範圍:', minShort, '-', maxShort, '/', minLong, '-', maxLong);
    }

    // 延遲執行以顯示加載動畫
    setTimeout(() => {
        try {
            const dimension = document.getElementById('heatmapDimension').value;
            
            if (dimension === '2d') {
                console.log('🎨 正在呼叫 display2DHeatmapPlotly...');
                display2DHeatmapPlotly(results, minShort, maxShort, minLong, maxLong, initialCash);
                console.log('✅ display2DHeatmapPlotly 成功');
            } else {
                console.log('🎨 正在呼叫 displayHeatmapPlotly...');
                displayHeatmapPlotly(results, minShort, maxShort, minLong, maxLong, initialCash);
                console.log('✅ displayHeatmapPlotly 成功');
            }
            
            updateHeatmapStats(results, initialCash);
            console.log('✅ 統計信息已更新');
            
            loadingDiv.classList.remove('show');
        } catch (error) {
            console.error('❌ 生成熱力圖錯誤:', error);
            console.error('❌ 堆棧追蹤:', error.stack);
            errorDiv.textContent = '⚠ 生成熱力圖失敗：' + error.message;
            errorDiv.classList.add('show');
            loadingDiv.classList.remove('show');
        }
    }, 100);
}

function updateHeatmapStats(results, initialCash) {
    let maxProfit = -Infinity;
    let minLoss = Infinity;
    let profitableCount = 0;
    let profitableTotalValue = 0;
    let lossCount = 0;
    let lossTotalValue = 0;

    results.forEach(r => {
        const profit = r.finalValue - initialCash;
        maxProfit = Math.max(maxProfit, profit);
        
        if (profit > 0) {
            // 獲利的組合
            profitableCount++;
            profitableTotalValue += r.finalValue;
        } else if (profit < 0) {
            // 賠錢的組合
            lossCount++;
            lossTotalValue += r.finalValue;
            minLoss = Math.min(minLoss, profit);
        }
    });

    // 計算平均值
    const profitableAverage = profitableCount > 0 ? profitableTotalValue / profitableCount : 0;
    const lossAverage = lossCount > 0 ? lossTotalValue / lossCount : 0;

    // 更新統計信息顯示
    document.getElementById('maxProfitHeatmap').textContent = `$${maxProfit.toFixed(2)}`;
    document.getElementById('minLossHeatmap').textContent = minLoss === Infinity ? '-' : `$${minLoss.toFixed(2)}`;
    document.getElementById('totalCombinations').textContent = results.length;
    document.getElementById('profitableCombinations').textContent = `${profitableCount} (${(profitableCount/results.length*100).toFixed(1)}%)`;
    
    // 新增統計信息
    document.getElementById('profitableAverageHeatmap').textContent = profitableCount > 0 ? `$${profitableAverage.toFixed(2)}` : '-';
    document.getElementById('lossCount').textContent = `${lossCount} (${lossCount > 0 ? (lossCount/results.length*100).toFixed(1) : '0'}%)`;
    document.getElementById('lossAverageHeatmap').textContent = lossCount > 0 ? `$${lossAverage.toFixed(2)}` : '-';
    
    console.log('✅ 熱力圖統計更新完成:');
    console.log(`   獲利組合: ${profitableCount} 個，平均資產: $${profitableAverage.toFixed(2)}`);
    console.log(`   賠錢組合: ${lossCount} 個，平均資產: $${lossAverage.toFixed(2)}`);
}

// ========== Plotly.js 版本 - 使用現代網頁標準 ==========

// 全局變量存儲當前熱力圖數據
let currentHeatmapData = {
    results: null,
    minShort: 1,
    maxShort: 256,
    minLong: 1,
    maxLong: 256,
    initialCash: 10000
};

/**
 * 使用 Plotly.js 生成 2D 熱力圖
 * 優點：清晰的參數對應，易於分析最佳參數區間
 */
function display2DHeatmapPlotly(results, minShort, maxShort, minLong, maxLong, initialCash) {
    console.log('📊 使用 Plotly.js 渲染 2D 熱力圖...');
    
    // 保存數據用於後續更新
    currentHeatmapData = { results, minShort, maxShort, minLong, maxLong, initialCash };
    
    // 確保 Plotly 已加載
    if (typeof Plotly === 'undefined') {
        console.error('❌ Plotly.js 未加載');
        const errorDiv = document.getElementById('errorHeatmap');
        if (errorDiv) errorDiv.textContent = '❌ Plotly.js 加載失敗';
        return;
    }
    
    try {
        // 準備數據矩陣
        const shortCount = maxShort - minShort + 1;
        const longCount = maxLong - minLong + 1;
        
        // 初始化數據矩陣
        const zData = [];
        const resultMap = new Map();
        
        // 計算獲利
        let minProfit = Infinity, maxProfit = -Infinity;
        results.forEach(r => {
            const profit = r.finalValue - initialCash;
            minProfit = Math.min(minProfit, profit);
            maxProfit = Math.max(maxProfit, profit);
            resultMap.set(`${r.shortMA}_${r.longMA}`, profit);
        });
        
        // 構建 Z 軸數據矩陣
        for (let i = 0; i < longCount; i++) {
            const row = [];
            for (let j = 0; j < shortCount; j++) {
                const shortMA = minShort + j;
                const longMA = minLong + i;
                const key = `${shortMA}_${longMA}`;
                const profit = resultMap.has(key) ? resultMap.get(key) : 0;
                row.push(profit);
            }
            zData.push(row);
        }
        
        // 構建軸標籤
        const xLabels = [];
        for (let i = minShort; i <= maxShort; i++) xLabels.push(i);
        
        const yLabels = [];
        for (let i = minLong; i <= maxLong; i++) yLabels.push(i);
        
        // 獲取顏色方案
        const colorScheme = document.getElementById('heatmapColorScheme')?.value || 'profit';
        let colorscale = 'RdYlGn'; // 預設紅黃綠
        
        if (colorScheme === 'heatmap') {
            colorscale = 'Hot'; // 熱力圖色
        } else if (colorScheme === 'rainbow') {
            colorscale = 'Rainbow'; // 彩虹色
        }
        
        // 創建 2D 熱力圖
        const trace = {
            z: zData,
            x: xLabels,
            y: yLabels,
            type: 'heatmap',
            colorscale: colorscale,
            showscale: true,
            colorbar: {
                title: '獲利 ($)',
                thickness: 15,
                len: 0.7
            },
            hovertemplate: '<b>短期MA: %{x} 天</b><br>長期MA: %{y} 天<br>獲利: $%{z:.2f}<extra></extra>'
        };
        
        const layout = {
            title: '2D 交易策略熱力圖 - 參數優化結果',
            xaxis: {
                title: '短期 MA (天)',
                side: 'bottom'
            },
            yaxis: {
                title: '長期 MA (天)'
            },
            autosize: true,
            margin: { l: 80, r: 80, b: 80, t: 90 },
            paper_bgcolor: 'rgba(245,245,245,1)',
            plot_bgcolor: 'rgba(255,255,255,1)',
            font: { family: 'Arial, sans-serif', color: '#333' }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };
        
        const container = document.getElementById('heatmapCanvas');
        if (!container) {
            console.error('❌ heatmapCanvas 容器不存在');
            return;
        }
        
        console.log('🎨 正在繪製 2D Plotly 圖表...');
        Plotly.newPlot(container, [trace], layout, config);
        console.log('✅ 2D Plotly 圖表已繪製');
        
    } catch (error) {
        console.error('❌ 繪製 2D Plotly 圖表失敗:', error);
        const errorDiv = document.getElementById('errorHeatmap');
        if (errorDiv) {
            errorDiv.textContent = '❌ 繪製圖表失敗：' + error.message;
            errorDiv.classList.add('show');
        }
    }
}

/**
 * 使用 Plotly.js 生成 3D 熱力圖
 * 優點：無需 Canvas，更簡潔的代碼，響應式設計
 */
function displayHeatmapPlotly(results, minShort, maxShort, minLong, maxLong, initialCash) {
    console.log('📊 使用 Plotly.js 渲染 3D 熱力圖...');
    
    // 保存數據用於後續更新
    currentHeatmapData = { results, minShort, maxShort, minLong, maxLong, initialCash };
    
    // 確保 Plotly 已加載
    if (typeof Plotly === 'undefined') {
        console.error('❌ Plotly.js 未加載');
        const errorDiv = document.getElementById('errorHeatmap');
        if (errorDiv) errorDiv.textContent = '❌ Plotly.js 加載失敗';
        return;
    }
    
    try {
        // 準備數據矩陣
        const shortCount = maxShort - minShort + 1;
        const longCount = maxLong - minLong + 1;
        
        // 初始化數據矩陣
        const zData = [];
        const resultMap = new Map();
        
        // 計算獲利
        let minProfit = Infinity, maxProfit = -Infinity;
        results.forEach(r => {
            const profit = r.finalValue - initialCash;
            minProfit = Math.min(minProfit, profit);
            maxProfit = Math.max(maxProfit, profit);
            resultMap.set(`${r.shortMA}_${r.longMA}`, profit);
        });
        
        // 構建 Z 軸數據矩陣
        // Plotly 中 zData[i][j] 對應 (x[j], y[i]) 的位置
        // 我們想要：x = 短期, y = 長期
        // 所以 zData[i][j] = profit(short=minShort+j, long=minLong+i)
        for (let i = 0; i < longCount; i++) {
            const row = [];
            for (let j = 0; j < shortCount; j++) {
                const shortMA = minShort + j;
                const longMA = minLong + i;
                const key = `${shortMA}_${longMA}`;
                const profit = resultMap.has(key) ? resultMap.get(key) : 0;
                row.push(profit);
            }
            zData.push(row);
        }
        
        // 構建軸標籤
        const xLabels = [];
        for (let i = minShort; i <= maxShort; i++) xLabels.push(i);
        
        const yLabels = [];
        for (let i = minLong; i <= maxLong; i++) yLabels.push(i);
        
        // 獲取顏色方案
        const colorScheme = document.getElementById('heatmapColorScheme')?.value || 'profit';
        let colorscale = 'RdYlGn'; // 預設紅黃綠
        
        if (colorScheme === 'heatmap') {
            colorscale = 'Hot'; // 熱力圖色
        } else if (colorScheme === 'rainbow') {
            colorscale = 'Rainbow'; // 彩虹色
        }
        
        // 創建 3D 表面圖
        const trace = {
            z: zData,
            x: xLabels,
            y: yLabels,
            type: 'surface',
            colorscale: colorscale,
            showscale: true,
            showsurface: true,
            contours: {
                z: {
                    show: false,
                    usecolorscale: true,
                    highlightcolor: 'limegreen',
                    project: { z: false }
                }
            },
            colorbar: {
                title: '獲利 ($)',
                thickness: 15,
                len: 0.7
            }
        };
        
        const layout = {
            title: '3D 交易策略熱力圖 - 參數優化結果',
            scene: {
                xaxis: { title: '短期 MA (天)', backgroundcolor: 'rgb(230, 230,230)', gridcolor: 'white' },
                yaxis: { title: '長期 MA (天)', backgroundcolor: 'rgb(230, 230,230)', gridcolor: 'white' },
                zaxis: { title: '獲利 ($)', backgroundcolor: 'rgb(230, 230,230)', gridcolor: 'white' },
                camera: {
                    eye: { x: 1.5, y: 1.5, z: 1.3 }
                }
            },
            autosize: true,
            margin: { l: 65, r: 50, b: 65, t: 90 },
            paper_bgcolor: 'rgba(245,245,245,1)',
            font: { family: 'Arial, sans-serif', color: '#333' }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };
        
        const container = document.getElementById('heatmapCanvas');
        if (!container) {
            console.error('❌ heatmapCanvas 容器不存在');
            return;
        }
        
        console.log('🎨 正在繪製 Plotly 圖表...');
        Plotly.newPlot(container, [trace], layout, config);
        console.log('✅ Plotly 圖表已繪製');
        
    } catch (error) {
        console.error('❌ 繪製 Plotly 圖表失敗:', error);
        const errorDiv = document.getElementById('errorHeatmap');
        if (errorDiv) {
            errorDiv.textContent = '❌ 繪製圖表失敗：' + error.message;
            errorDiv.classList.add('show');
        }
    }
}

/**
 * 更新熱力圖顏色
 */
function updateHeatmapColor() {
    if (!currentHeatmapData.results) {
        console.warn('⚠️ 沒有可用的熱力圖數據');
        return;
    }
    
    console.log('🎨 更新熱力圖顏色...');
    
    const colorScheme = document.getElementById('heatmapColorScheme')?.value || 'profit';
    let colorscale = 'RdYlGn';
    
    if (colorScheme === 'heatmap') {
        colorscale = 'Hot';
    } else if (colorScheme === 'rainbow') {
        colorscale = 'Rainbow';
    }
    
    const container = document.getElementById('heatmapCanvas');
    if (container && container.data && container.data.length > 0) {
        Plotly.restyle(container, { colorscale: colorscale });
        console.log('✅ 顏色已更新:', colorscale);
    }
}

/**
 * 更新熱力圖顯示模式
 */
function updateHeatmapMode() {
    if (!currentHeatmapData.results) {
        console.warn('⚠️ 沒有可用的熱力圖數據');
        return;
    }
    
    console.log('🎨 更新熱力圖顯示模式...');
    
    const dimension = document.getElementById('heatmapDimension')?.value || '3d';
    const mode = document.getElementById('heatmapViewMode')?.value || 'surface';
    const container = document.getElementById('heatmapCanvas');
    
    if (!container || !container.data || container.data.length === 0) return;
    
    // 如果維度改變，重新生成圖表
    if (dimension === '2d' && container.data[0].type !== 'heatmap') {
        console.log('📐 切換至 2D 熱力圖');
        display2DHeatmapPlotly(currentHeatmapData.results, currentHeatmapData.minShort, currentHeatmapData.maxShort, currentHeatmapData.minLong, currentHeatmapData.maxLong, currentHeatmapData.initialCash);
        return;
    } else if (dimension === '3d' && container.data[0].type !== 'surface') {
        console.log('📐 切換至 3D 熱力圖');
        displayHeatmapPlotly(currentHeatmapData.results, currentHeatmapData.minShort, currentHeatmapData.maxShort, currentHeatmapData.minLong, currentHeatmapData.maxLong, currentHeatmapData.initialCash);
        return;
    }
    
    // 3D 模式下的顯示模式更新
    if (dimension === '3d') {
        let updates = {};
        
        if (mode === 'surface') {
            // 曲面圖：只顯示平滑曲面，不顯示網格和等高線
            updates = {
                showsurface: true,
                contours: {
                    z: {
                        show: false,
                        usecolorscale: true,
                        highlightcolor: 'limegreen',
                        project: { z: false }
                    }
                }
            };
            console.log('✅ 3D 曲面圖模式已激活');
        } else if (mode === 'wireframe') {
            // 網格圖：只顯示網格線，隱藏曲面
            updates = {
                showsurface: false,
                contours: {
                    z: {
                        show: true,
                        usecolorscale: true,
                        highlightcolor: 'limegreen',
                        project: { z: true },
                        width: 1
                    }
                }
            };
            console.log('✅ 3D 網格圖模式已激活');
        } else if (mode === 'both') {
            // 混合圖：同時顯示曲面和網格線/等高線
            updates = {
                showsurface: true,
                contours: {
                    z: {
                        show: true,
                        usecolorscale: true,
                        highlightcolor: 'limegreen',
                        project: { z: false },
                        width: 1
                    }
                }
            };
            console.log('✅ 3D 混合圖模式已激活');
        }
        
        Plotly.restyle(container, updates);
    }
}

/**
 * 初始化熱力圖事件監聽
 */
function addHeatmapEventListeners() {
    console.log('📌 正在添加熱力圖事件監聽...');
    
    const dimensionSelect = document.getElementById('heatmapDimension');
    const colorSchemeSelect = document.getElementById('heatmapColorScheme');
    const viewModeSelect = document.getElementById('heatmapViewMode');
    
    if (dimensionSelect) {
        dimensionSelect.addEventListener('change', updateHeatmapMode);
        console.log('✅ 維度選擇器已綁定');
    }
    
    if (colorSchemeSelect) {
        colorSchemeSelect.addEventListener('change', updateHeatmapColor);
        console.log('✅ 顏色選擇器已綁定');
    }
    
    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', updateHeatmapMode);
        console.log('✅ 顯示模式選擇器已綁定');
    }
}

// 頁面載入時初始化事件監聽
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔍 DOMContentLoaded 已觸發 - 初始化熱力圖模塊');
    addHeatmapEventListeners();
    console.log('✅ 熱力圖模塊初始化完成');
});

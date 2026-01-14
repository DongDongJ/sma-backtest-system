// 此文件已整合到 heatmap_integration.js 中
// 備用 Three.js 加載器

(function() {
    // 檢查 Three.js 是否從主 CDN 加載
    if (typeof THREE === 'undefined') {
        console.log('💾 主 CDN 未加載 Three.js，嘗試備用...');
        
        // 嘗試備用 CDN (cdnjs)
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script.onload = function() {
            console.log('✅ 備用 CDN 已加載 Three.js');
        };
        script.onerror = function() {
            console.error('❌ 備用 CDN 也失敗');
        };
        document.head.appendChild(script);
    } else {
        console.log('✅ Three.js 已從主 CDN 加載');
    }
})();

console.log('✅ heatmap3d.js 已加載 (已整合功能到 heatmap_integration.js)');


'use strict';

/**
 * Calligraphy Ink Brush Engine (首頁水墨毛筆動態互動引擎)
 * 獨立出的物理與渲染模組，提供頂級數位繪圖軟體級別的運筆與分岔效果
 * 升級重點：起點強制由細到粗長距離漸變、絲線個別時間控制壽命與末端蒸發消滅
 */
(function(window, document) {
    let lastInkMousePos = { x: null, y: null };
    let lastMidMousePos = { x: null, y: null };
    let lastInkNormal = { x: 0, y: -1 };
    let lastBristlePositions = null;
    let smoothBrushWidth = 2.0; // 起點強制由細到粗：初值初始化為極細尖端 2.0px
    let lastSpeed = 0; // 平滑過渡的前次運筆速度
    let strokeDistance = 0; // 筆畫連續行進距離累計，用於拉長起點由細到粗的漸變範圍
    let lastMoveTime = performance.now(); // 穩健追蹤運筆時間差，避免 NaN
    let smoothTurnFactor = 0; // 平滑漸變的離心力轉彎因子，避免甩動換向時瞬間跳變

    // 活動筆跡路徑與墨滴緩衝區（實作個別時間控制壽命與淡出消滅）
    let activeStrokes = [];
    let renderLoopId = null;

    const isMobile = (window.innerWidth <= 1000) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    // 建立毛筆刷毛結構模板，導入「外緣收斂」與「主幹 0.8~0.9 透明度」
    // 手機版：48 根；電腦版效能優化：從 172 根大幅降至 86 根，換取極致滑順感
    const BRISTLE_COUNT = isMobile ? 48 : 86;
    const bristleTemplates = [];
    for (let i = 0; i < BRISTLE_COUNT; i++) {
        const baseRatio = (i / BRISTLE_COUNT) - 0.5; // -0.5 ~ +0.5
        const absRatio = Math.abs(baseRatio);
        const isCore = (absRatio <= 0.22); // 中間 44% 區域為溫潤飽滿的主幹核心

        // 邊緣絲線往主幹更收斂：利用非線性收斂公式將原本 ±0.5 的外擴限縮至 ±0.35 以內
        const convergedRatio = Math.sign(baseRatio) * Math.pow(absRatio * 2, 1.25) * 0.35;

        bristleTemplates.push({
            isCore: isCore,
            ratio: convergedRatio + (Math.random() - 0.5) * 0.008,
            // 不同條線要有絲線的粗細不同：主幹（0.35 ~ 1.1px），外緣絲線 0.15 ~ 0.55px
            // 手機版加粗 1.7 倍，電腦版數量減半也稍微加粗 1.3 倍以填補視覺空隙
            baseSize: (isCore ? (Math.random() * 0.75 + 0.35) : (Math.random() * 0.4 + 0.15)) * (isMobile ? 1.7 : 1.3),
            // 主幹的絲線要有 0.8~0.9 的透明度變化！外緣絲線 0.35 ~ 0.70
            baseAlpha: isCore ? (Math.random() * 0.10 + 0.80) : (Math.random() * 0.35 + 0.35),
            dryThreshold: isCore ? 999.0 : (Math.random() * 2.8 + 1.2),
            jitterX: (Math.random() - 0.5) * 1.5,
            jitterY: (Math.random() - 0.5) * 1.5
        });
    }

    function resizeInkCanvas(inkCanvas, inkCtx, entryScreen) {
        if (!inkCanvas || !entryScreen) return;
        const dpr = window.devicePixelRatio || 1;
        const width = entryScreen.clientWidth;
        const height = entryScreen.clientHeight;
        inkCanvas.width = width * dpr;
        inkCanvas.height = height * dpr;
        inkCanvas.style.width = `${width}px`;
        inkCanvas.style.height = `${height}px`;
        if (inkCtx) {
            inkCtx.scale(dpr, dpr);
            inkCtx.lineCap = 'round';
            inkCtx.lineJoin = 'round';
        }
    }

    function drawCalligraphyCurve(inkCtx, ax, ay, bx, by, cx, cy, startSpeed, endSpeed) {
        if (!inkCtx) return;
        // 估算二次貝茲曲線的弧長
        const dist = Math.hypot(bx - ax, by - ay) + Math.hypot(cx - bx, cy - by);
        if (dist < 0.5) return;

        // 大幅提高插值密度，大幅提升平滑度與連續性
        // 手機版：2.2 像素；電腦版效能優化：從 0.8 像素提升至 1.6 像素，大幅減少迴圈次數
        const stepSize = isMobile ? 2.2 : 1.6;
        const steps = Math.ceil(dist / stepSize);
        const nowTime = performance.now();

        // 貝茲曲線二階導數（轉彎法向加速度向量，用於計算離心力與辨識彎道內外側）
        const accX = 2 * (cx - 2 * bx + ax);
        const accY = 2 * (cy - 2 * by + ay);

        if (lastBristlePositions === null) {
            const initialDx = cx - ax;
            const initialDy = cy - ay;
            const len = Math.hypot(initialDx, initialDy) || 1;
            lastInkNormal = { x: -initialDy / len, y: initialDx / len };
            // 起點強制由細到粗：初值初始化為細尖 2.0px，隨著 strokeDistance 逐漸優雅放大
            smoothBrushWidth = 2.0;
            strokeDistance = 0;
            smoothTurnFactor = 0; // 重置漸變離心力因子
            lastBristlePositions = new Array(BRISTLE_COUNT);
            for (let i = 0; i < BRISTLE_COUNT; i++) {
                const tmpl = bristleTemplates[i];
                const offset = tmpl.ratio * smoothBrushWidth;
                const initLife = Math.floor(Math.random() * 880 + 320);
                lastBristlePositions[i] = {
                    x: ax + lastInkNormal.x * offset + tmpl.jitterX,
                    y: ay + lastInkNormal.y * offset + tmpl.jitterY,
                    drawing: true,
                    alive: tmpl.isCore ? true : (Math.random() < 0.75), // 核心主幹一開始皆活躍
                    life: initLife,
                    maxLife: initLife,
                    currentSize: tmpl.baseSize * (Math.random() * 0.3 + 0.85),
                    currentAlpha: tmpl.baseAlpha,
                    currentPath: null // 追蹤當前正在延伸的時間控制線段物件
                };
            }
        }

        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const invT = 1 - t;

            // 1. 累計筆畫行進距離，拉長起點由細到粗的漸變範圍至 280 像素，曲線更柔和平滑
            strokeDistance += 0.8;
            const warmupFactor = Math.min(1.0, Math.pow(strokeDistance / 280.0, 1.8));

            // 二次貝茲曲線插值：B(t) = (1-t)^2*A + 2*(1-t)*t*B + t^2*C
            const curX = invT * invT * ax + 2 * invT * t * bx + t * t * cx;
            const curY = invT * invT * ay + 2 * invT * t * by + t * t * cy;

            // 曲線切線向量與垂直法線：B'(t) = 2*(1-t)*(B-A) + 2*t*(C-B)
            const tanX = 2 * invT * (bx - ax) + 2 * t * (cx - bx);
            const tanY = 2 * invT * (by - ay) + 2 * t * (cy - by);
            const tanLen = Math.hypot(tanX, tanY);
            if (tanLen > 0.001) {
                // 嚴格維持與曲線軌跡切線正交！完全移除滯後濾波，徹底解決轉彎時刷毛橫向位移與階梯狀重疊斷點！
                lastInkNormal.x = -tanY / tanLen;
                lastInkNormal.y = tanX / tanLen;
            }

            // 沿曲線參數 t 線性平滑過渡速度與目標粗細，並乘上 warmupFactor 強制由細到粗
            const curSpeed = startSpeed * invT + endSpeed * t;
            // 大幅提高整體粗細上限至 230，並重新設計衰減曲線讓粗細對比極度明顯且飽滿
            let rawTargetW = Math.max(8, Math.min(230, 230 / (1 + Math.pow(curSpeed, 1.1) * 0.75)));
            
            // 待機模式的額外參數調整 (只有待機時有效)
            if (window.isScreensaverActive && window.currentIdleScale) {
                // 筆刷倍率讓筆刷線加粗 (1~2倍)
                // 適度調整基礎縮放比例，讓倍率放大時視覺粗細合理
                rawTargetW = (rawTargetW * 0.7) * window.currentIdleScale;
                
                // 為了避免筆畫在尾端突兀中斷（變成平口三角形）
                // 讀取傳遞進來的行程進度，在最後 25% 產生優雅的毛筆收束（Taper）效果
                if (window.currentIdleProgress !== undefined && window.currentIdleProgress > 0.75) {
                    const taper = (1.0 - window.currentIdleProgress) / 0.25; 
                    rawTargetW *= Math.max(0, Math.pow(taper, 1.5)); // 平滑且加速地收細到 0
                }
            }

            const targetW = rawTargetW * warmupFactor;

            // 粗細過渡權重降低至 0.04，讓起點漸變更絲滑不突兀
            smoothBrushWidth = smoothBrushWidth * 0.96 + targetW * 0.04;
            const W = smoothBrushWidth;
            const nx = lastInkNormal.x;
            const ny = lastInkNormal.y;

            // 1. 旁邊絲線變粗的比率大幅調高至最高 4 倍
            const widthProgress = Math.max(0, Math.min(1.0, (W - 20.0) / 160.0));
            const threadThickScale = 1.0 + Math.pow(widthProgress, 0.8) * 3.0; // 從 1.0 倍平滑增至 4.0 倍

            // 2. 轉彎離心力物理模擬 (Centrifugal Force Sim)：投影加速度到當前法線方向，精確辨識彎道內側與外側
            const accNormal = accX * nx + accY * ny;
            const rawTurnFactor = Math.max(-1.0, Math.min(1.0, accNormal * 0.15));
            // 漸變平滑過渡：以 0.92 慣性權重混合前值，避免甩動換向時內外側瞬間跳變衝突
            smoothTurnFactor = smoothTurnFactor * 0.92 + rawTurnFactor * 0.08;
            const turnFactor = smoothTurnFactor;
            const centrifugalStrength = Math.pow(widthProgress, 0.6) * Math.min(1.0, Math.abs(turnFactor) * 1.6);

            // 當主筆畫變細時，基礎展開乘數收縮，發散程度為原始的 0.8 倍
            const baseSplay = (0.25 + Math.pow(widthProgress, 0.75) * 0.75) * 0.8;

            // 渲染連續順向毛筆絲線（加入時間壽命控制物件與自動分段）
            for (let i = 0; i < BRISTLE_COUNT; i++) {
                const tmpl = bristleTemplates[i];
                const state = lastBristlePositions[i];
                
                let dynamicRatio = tmpl.isCore ? tmpl.ratio : (tmpl.ratio * baseSplay);
                let bristleThickScale = threadThickScale;

                if (!tmpl.isCore && centrifugalStrength > 0.01) {
                    // 計算此絲線位於當前轉彎曲線之內側或外側 (-1.0 極限內側 ~ +1.0 極限外側)
                    const outerProgress = -(tmpl.ratio / 0.35) * turnFactor;
                    if (outerProgress > 0) {
                        // 外側 (OUTER SIDE)：模擬離心力將墨汁與毛刷往外甩動！絲線朝外發散，且粗度大幅加倍堆積！
                        dynamicRatio = dynamicRatio * (1.0 + outerProgress * centrifugalStrength * 0.45);
                        bristleThickScale = threadThickScale * (1.0 + outerProgress * centrifugalStrength * 0.65);
                    } else {
                        // 內側 (INNER SIDE)：模擬向心張力拉扯！絲線緊密向中心主幹收束收斂，且粗度保持俐落尖細！
                        const innerConverge = Math.max(0.18, 1.0 - Math.abs(outerProgress) * centrifugalStrength * 0.82);
                        dynamicRatio = dynamicRatio * innerConverge;
                        bristleThickScale = threadThickScale * Math.max(0.35, 1.0 - Math.abs(outerProgress) * centrifugalStrength * 0.55);
                    }
                }

                const offset = dynamicRatio * W;
                const bristleX = curX + nx * offset + tmpl.jitterX;
                const bristleY = curY + ny * offset + tmpl.jitterY;

                const isDry = (!tmpl.isCore && curSpeed > tmpl.dryThreshold);

                if (state.alive && !isDry) {
                    state.life -= 1;
                    if (state.life <= 0) {
                        state.alive = false;
                        state.drawing = false;
                        state.currentPath = null;
                    } else {
                        const fadeIn = Math.min(1.0, (state.maxLife - state.life) / 12.0);
                        const fadeOut = Math.min(1.0, state.life / 15.0);
                        const alpha = state.currentAlpha * fadeIn * fadeOut;

                        if (state.drawing) {
                            if (!state.currentPath) {
                                // 建立新的獨立時間控制壽命絲線物件
                                const newPath = {
                                    type: 'thread',
                                    isCore: tmpl.isCore,
                                    points: [ { x: state.x, y: state.y }, { x: bristleX, y: bristleY } ],
                                    size: state.currentSize * bristleThickScale * (curSpeed > 2.2 ? 0.95 : 1.25),
                                    baseAlpha: alpha,
                                    createdAt: nowTime,
                                    // 消失速度快一倍：壽命縮短至一半（核心主幹 1.3~1.9 秒，外緣絲線 0.9~1.5 秒）
                                    lifespan: tmpl.isCore ? (Math.random() * 600 + 1300) : (Math.random() * 600 + 900),
                                    fadeDuration: 600 // 時間到了直接經由最後 0.6 秒淡出到消失
                                };
                                activeStrokes.push(newPath);
                                state.currentPath = newPath;
                            } else {
                                state.currentPath.points.push({ x: bristleX, y: bristleY });
                                state.currentPath.size = state.currentSize * bristleThickScale * (curSpeed > 2.2 ? 0.95 : 1.25);

                                // 為了讓長筆畫尾端能先開始揮發淡出，每 28 個點(~22px)自動無縫切分一個獨立時間片段
                                // 手機版 256；電腦版從 112 點放寬至 200 點
                                const splitLimit = isMobile ? 256 : 200;
                                if (state.currentPath.points.length >= splitLimit) {
                                    state.currentPath = null;
                                }
                            }
                        } else {
                            // 起點單點墨滴
                            activeStrokes.push({
                                type: 'splatter',
                                x: bristleX, y: bristleY,
                                radius: state.currentSize * bristleThickScale,
                                baseAlpha: alpha,
                                createdAt: nowTime,
                                lifespan: tmpl.isCore ? (Math.random() * 600 + 1300) : (Math.random() * 600 + 900),
                                fadeDuration: 600
                            });
                        }
                        state.x = bristleX;
                        state.y = bristleY;
                        state.drawing = true;
                    }
                } else {
                    state.alive = false;
                    state.drawing = false;
                    state.currentPath = null;
                    state.x = bristleX;
                    state.y = bristleY;

                    const spawnRate = tmpl.isCore ? 0.08 : 0.035;
                    if (!isDry && Math.random() < spawnRate) {
                        state.alive = true;
                        const newLife = Math.floor(Math.random() * 720 + 200);
                        state.life = newLife;
                        state.maxLife = newLife;
                        state.currentSize = tmpl.baseSize * (Math.random() * 0.4 + 0.8);
                        state.currentAlpha = tmpl.isCore ? (Math.random() * 0.10 + 0.80) : (Math.random() * 0.35 + 0.35);
                        state.drawing = false;
                        state.currentPath = null;
                    }
                }
            }

            // 3. 渲染細緻墨滴與噴灑：大幅縮減顆粒大小與發散距離，僅在極快甩筆時出現微纖噴灑
            // 手機版 0.025；電腦版效能優化：噴灑機率從 0.08 降至 0.045
            const splatterChance = isMobile ? 0.025 : 0.045;
            if (curSpeed > 2.0 && Math.random() < splatterChance) {
                const numSplatters = Math.floor(Math.random() * 2) + 1;
                for (let k = 0; k < numSplatters; k++) {
                    const spreadDist = (Math.random() - 0.5) * (W * 0.75);
                    const forwardX = (Math.random() - 0.2) * (curSpeed * 2.2 + 1);
                    const sx = curX + nx * spreadDist - ny * forwardX;
                    const sy = curY + ny * spreadDist + nx * forwardX;

                    const isBigBlob = Math.random() < 0.08;
                    const sRadius = isBigBlob ? (Math.random() * 1.8 + 1.2) : (Math.random() * 1.0 + 0.3);
                    const sAlpha = Math.random() * 0.45 + 0.25;

                    activeStrokes.push({
                        type: 'splatter',
                        x: sx, y: sy,
                        radius: sRadius,
                        baseAlpha: sAlpha,
                        createdAt: nowTime,
                        lifespan: Math.random() * 600 + 750, // 噴灑墨滴獨立壽命減半：0.75~1.35秒
                        fadeDuration: 500,
                        isEllipse: (curSpeed > 3.0 && !isBigBlob),
                        angle: Math.atan2(tanY, tanX)
                    });
                }
            }
        }
    }

    window.isCalligraphyPaused = false;

    // 實時時間控制渲染迴圈（取代原本兩秒全域消失刪除，改為每條絲線獨立壽命淡出）
    function startInkRenderLoop(inkCanvas, inkCtx, entryScreen, getCurrentPageElement) {
        if (renderLoopId) cancelAnimationFrame(renderLoopId);

        function renderFrame() {
            if (window.isCalligraphyPaused) {
                renderLoopId = requestAnimationFrame(renderFrame);
                return;
            }

            if (inkCanvas && inkCtx && (getCurrentPageElement() === entryScreen || activeStrokes.length > 0)) {
                const now = performance.now();

                // 永遠保持畫布元素本身完全不透明
                if (inkCanvas.style.opacity !== '1') {
                    inkCanvas.style.opacity = '1';
                }

                // 1. 清除畫布以更新當前存活筆跡的時間差淡出
                inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);

                // 預設為淺色模式（黑底黑筆畫黑字），若未來啟動深色模式則為白筆畫
                const inkRGB = (document.body && document.body.classList.contains('dark-mode')) ? '255, 255, 255' : '15, 15, 15';

                // 2. 遍歷並渲染當前活著的絲線片段與墨滴
                for (let i = 0; i < activeStrokes.length; i++) {
                    const item = activeStrokes[i];
                    const age = now - item.createdAt;

                    if (age >= item.lifespan) {
                        continue; // 超過壽命，略過繪製，稍後清除消滅
                    }

                    // 時間到了就要淡出：在專屬壽命末期（最後 fadeDuration 毫秒）直接平滑淡出到 0
                    const timeRemaining = item.lifespan - age;
                    const fadeProgress = Math.min(1.0, timeRemaining / item.fadeDuration);
                    const currentAlpha = item.baseAlpha * fadeProgress;

                    if (currentAlpha <= 0.001) continue;

                    if (item.type === 'thread' && item.points.length >= 2) {
                        inkCtx.beginPath();
                        const pts = item.points;
                        inkCtx.moveTo(pts[0].x, pts[0].y);
                        for (let p = 1; p < pts.length; p++) {
                            inkCtx.lineTo(pts[p].x, pts[p].y);
                        }
                        inkCtx.lineWidth = item.size;
                        inkCtx.strokeStyle = `rgba(${inkRGB}, ${currentAlpha.toFixed(3)})`;
                        inkCtx.stroke();
                    } else if (item.type === 'splatter') {
                        inkCtx.fillStyle = `rgba(${inkRGB}, ${currentAlpha.toFixed(3)})`;
                        inkCtx.beginPath();
                        if (item.isEllipse) {
                            inkCtx.save();
                            inkCtx.translate(item.x, item.y);
                            inkCtx.rotate(item.angle);
                            inkCtx.ellipse(0, 0, item.radius * 2.0, item.radius * 0.6, 0, 0, Math.PI * 2);
                            inkCtx.fill();
                            inkCtx.restore();
                        } else {
                            inkCtx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
                            inkCtx.fill();
                        }
                    }
                }

                // 3. 濾除並徹底銷毀耗盡時間壽命的絲線與墨滴（消滅）
                if (activeStrokes.length > 0) {
                    activeStrokes = activeStrokes.filter(item => (now - item.createdAt) < item.lifespan);
                }
            }
            renderLoopId = requestAnimationFrame(renderFrame);
        }
        renderFrame();
    }

    window.initCalligraphyCanvas = function(entryScreen, getCurrentPageElement) {
        const inkCanvas = document.getElementById('ink-canvas');
        const inkCtx = inkCanvas ? inkCanvas.getContext('2d') : null;
        if (!inkCanvas || !entryScreen || !inkCtx) return;

        resizeInkCanvas(inkCanvas, inkCtx, entryScreen);
        window.addEventListener('resize', () => resizeInkCanvas(inkCanvas, inkCtx, entryScreen));

        function processInkMove(rawX, rawY) {
            const now = performance.now();
            if (lastInkMousePos.x === null) {
                lastInkMousePos = { x: rawX, y: rawY };
                lastMidMousePos = { x: rawX, y: rawY };
                lastSpeed = 0;
                lastBristlePositions = null;
                smoothBrushWidth = 2.0;
                strokeDistance = 0;
                lastMoveTime = now;
                return;
            }

            // 1. 座標阻尼濾波 (大幅提升 StreamLine 彈性運筆權重 0.68/0.32)：極度絲滑消除滑鼠或觸控板抖動
            let currentX, currentY;
            if (window.isScreensaverActive) {
                // 自動揮毫模式使用精確計算的貝茲曲線，不需濾波，確保能 100% 抵達終點
                currentX = rawX;
                currentY = rawY;
            } else {
                // 真人滑鼠/觸控需要濾除抖動
                currentX = lastInkMousePos.x * 0.68 + rawX * 0.32;
                currentY = lastInkMousePos.y * 0.68 + rawY * 0.32;
            }

            // 2. 計算目前點與上一點的中點
            const midX = (lastInkMousePos.x + currentX) / 2;
            const midY = (lastInkMousePos.y + currentY) / 2;

            const timeDelta = Math.max(1, now - lastMoveTime);
            lastMoveTime = now;

            // 完全靜止後重新移動：若距離上次移動超過 300ms，視為靜止結束，重置為細尖起筆
            if (timeDelta > 300 && !window.isScreensaverActive) {
                lastBristlePositions = null;
                smoothBrushWidth = 2.0;
                strokeDistance = 0;
                smoothTurnFactor = 0;
                lastSpeed = 0;
                lastInkMousePos = { x: rawX, y: rawY };
                lastMidMousePos = { x: rawX, y: rawY };
                return;
            }

            const dist = Math.hypot(currentX - lastInkMousePos.x, currentY - lastInkMousePos.y);
            const rawSpeed = dist / timeDelta;
            const currentSpeed = lastSpeed * 0.70 + rawSpeed * 0.30;

            // 3. 透過二次貝茲曲線中點平滑插值，繪製從上一中點到目前中點的弧線，並沿軌跡漸變速度與粗細
            drawCalligraphyCurve(inkCtx, lastMidMousePos.x, lastMidMousePos.y, lastInkMousePos.x, lastInkMousePos.y, midX, midY, lastSpeed, currentSpeed);

            lastInkMousePos = { x: currentX, y: currentY };
            lastMidMousePos = { x: midX, y: midY };
            lastSpeed = currentSpeed;
        }

        // ---- Screensaver / Idle Animation ----
        let idleTimer = null;
        let screensaverTimeout = null;
        window.isScreensaverActive = false;

        function startIdleTimer() {
            window.isScreensaverActive = false;
            if (idleTimer) clearTimeout(idleTimer);
            if (screensaverTimeout) clearTimeout(screensaverTimeout);
            
            idleTimer = setTimeout(() => {
                if (getCurrentPageElement() === entryScreen) {
                    window.isScreensaverActive = true;
                    scheduleNextStroke();
                }
            }, 3000);
        }

        function scheduleNextStroke() {
            if (!window.isScreensaverActive || getCurrentPageElement() !== entryScreen) return;
            
            // 取得這筆畫預計需要的總時間
            const strokeDuration = simulateRandomStroke();
            
            // 下一筆的等待時間：必須等這筆完整畫完 (strokeDuration)，再加上隨機的 0~0.7 秒間隔
            const nextDelay = strokeDuration + (Math.random() * 700); 
            screensaverTimeout = setTimeout(scheduleNextStroke, nextDelay);
        }

        function simulateRandomStroke() {
            resetInkState();
            const W = inkCanvas.width;
            const H = inkCanvas.height;
            
            const isGiantStroke = Math.random() < 0.30;
            
            // 待機筆畫參數：一般筆畫為 2~4 倍，巨型粗線則為 4~5 倍
            window.currentIdleScale = isGiantStroke ? (4 + Math.random() * 1) : (2 + Math.random() * 2);
            
            let startX, startY, endX, endY;
            if (!isGiantStroke) {
                // 70% 的一般筆畫從一端穿越到一端 (從螢幕外側發射)
                const side = Math.floor(Math.random() * 4);
                const offset = 300; 
                if (side === 0) { // Top to Bottom
                    startX = Math.random() * W; startY = -offset;
                    endX = Math.random() * W; endY = H + offset;
                } else if (side === 1) { // Right to Left
                    startX = W + offset; startY = Math.random() * H;
                    endX = -offset; endY = Math.random() * H;
                } else if (side === 2) { // Bottom to Top
                    startX = Math.random() * W; startY = H + offset;
                    endX = Math.random() * W; endY = -offset;
                } else { // Left to Right
                    startX = -offset; startY = Math.random() * H;
                    endX = W + offset; endY = Math.random() * H;
                }
            } else {
                // 30% 的巨型筆畫從畫面中間區域起始發射
                startX = W * 0.3 + Math.random() * W * 0.4; // 限定在中間 40% 的範圍內
                startY = H * 0.3 + Math.random() * H * 0.4;
                const angle = Math.random() * Math.PI * 2;
                const strokeLength = (800 + Math.random() * 800) * window.currentIdleScale;
                endX = startX + Math.cos(angle) * strokeLength;
                endY = startY + Math.sin(angle) * strokeLength;
            }

            // 將貝茲曲線的控制點 (頂點) 強制放在畫面中間 80% 的位置
            // 如此一來，不管起點和終點在哪，筆畫都會在畫面正中央的區域產生漂亮且豐富的彎曲、S 型或轉折
            let cp1X = W * 0.1 + Math.random() * W * 0.8;
            let cp1Y = H * 0.1 + Math.random() * H * 0.8;
            
            let cp2X = W * 0.1 + Math.random() * W * 0.8;
            let cp2Y = H * 0.1 + Math.random() * H * 0.8;

            // 有 20% 的機率強制將其中一個控制點拉到左下角 (About 文字的確切區域)
            // 這能確保筆畫有很高機率會精準掃過左下角，把隱形的 About 字形給襯托出來
            if (Math.random() < 0.20) {
                // 設定在 About 文字的粗略涵蓋範圍
                const aboutX = 50 + Math.random() * 150; 
                const aboutY = H - 50 - Math.random() * 100;
                
                // 隨機選一個控制點去定位，讓筆畫可能是先彎去左下角，也可能是最後才彎過去
                if (Math.random() > 0.5) {
                    cp1X = aboutX;
                    cp1Y = aboutY;
                } else {
                    cp2X = aboutX;
                    cp2Y = aboutY;
                }
            }

            // 持續時間：隨著長度加長，時間也成比例增加，確保行進速度合理
            const duration = (200 + Math.random() * 150) * window.currentIdleScale; 
            const startTime = performance.now();
            
            function step(now) {
                if (!window.isScreensaverActive || getCurrentPageElement() !== entryScreen) {
                    resetInkState();
                    return;
                }

                const elapsed = now - startTime;
                let progress = elapsed / duration;
                if (progress > 1) progress = 1;

                // 使用線性或微幅緩速的 progress 進行三次貝茲曲線插值 (Cubic Bezier)
                const t = progress * (2 - progress); // easeOutQuad 以模擬真實手繪減速
                const invT = 1 - t;
                
                const currentX = invT * invT * invT * startX + 3 * invT * invT * t * cp1X + 3 * invT * t * t * cp2X + t * t * t * endX;
                const currentY = invT * invT * invT * startY + 3 * invT * invT * t * cp1Y + 3 * invT * t * t * cp2Y + t * t * t * endY;
                
                window.currentIdleProgress = progress; // 傳遞進度給渲染引擎，供收束尾端使用
                processInkMove(currentX, currentY);
                
                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    resetInkState();
                }
            }
            requestAnimationFrame(step);
            
            // 回傳這筆畫需要的總時間，讓排程器可以等待
            return duration;
        }

        function resetInkState() {
            // 離開頁面或觸控結束時重置起點座標與距離，確保下次再度由極細筆尖 2.0px 優雅起筆！
            lastInkMousePos = { x: null, y: null };
            lastMidMousePos = { x: null, y: null };
            lastBristlePositions = null;
            lastSpeed = 0;
            smoothBrushWidth = 2.0;
            strokeDistance = 0;
            smoothTurnFactor = 0;
            lastMoveTime = performance.now();
        }

        window.addEventListener('mousemove', (e) => {
            startIdleTimer();
            if (getCurrentPageElement() !== entryScreen) return;
            const rect = entryScreen.getBoundingClientRect();
            processInkMove(e.clientX - rect.left, e.clientY - rect.top);
        });

        let lastTouchTime = 0;
        window.addEventListener('touchmove', (e) => {
            startIdleTimer();
            if (getCurrentPageElement() !== entryScreen) return;
            if (e.touches.length > 0) {
                // 阻止預設滑動行為，避免畫布跟著頁面捲動
                e.preventDefault();
                
                // 手機版效能優化：節流高頻觸控事件 (120Hz 螢幕)，強制降頻至約 60fps 以節省運算
                const now = performance.now();
                if (isMobile && (now - lastTouchTime) < 16) return;
                lastTouchTime = now;

                const rect = entryScreen.getBoundingClientRect();
                processInkMove(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
            }
        }, { passive: false });

        window.addEventListener('mouseleave', () => {
            startIdleTimer();
            resetInkState();
        });
        
        window.addEventListener('touchend', () => {
            startIdleTimer();
            resetInkState();
        });
        
        window.addEventListener('touchcancel', () => {
            startIdleTimer();
            resetInkState();
        });

        startInkRenderLoop(inkCanvas, inkCtx, entryScreen, getCurrentPageElement);
        startIdleTimer(); // 初始啟動計時器
    };
})(window, document);

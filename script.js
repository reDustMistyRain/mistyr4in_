'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // ---- 自動為文字按鈕加入 data-text 供 CSS 遮罩層反白特效使用 ----
    document.querySelectorAll('.global-title, .entry-link, .collection-sidebar .tab-button').forEach(btn => {
        if (!btn.getAttribute('data-text')) {
            btn.setAttribute('data-text', btn.textContent.trim());
        }
    });

    // ---- Page Elements ----
    const entryScreen = document.getElementById('entry-screen');
    const collectionPage = document.getElementById('collection-page');
    const postPage = document.getElementById('post-page');
    
    // ---- 配置 marked.js 外掛 ----
    if (typeof marked !== 'undefined' && typeof markedFootnote !== 'undefined') {
        marked.use(markedFootnote());
    }
    const aboutPage = document.getElementById('about-page');
    const projectPage = document.getElementById('project-page');
    const allPageElements = [entryScreen, collectionPage, postPage, aboutPage, projectPage].filter(Boolean);

    // ---- Interactive Elements ----
    const entryBackground = document.querySelector('.entry-clickable-bg');
    const entryLinks = document.querySelectorAll('.entry-link');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const escapeButtons = document.querySelectorAll('.escape-button');
    const tabButtons = document.querySelectorAll('.collection-sidebar .tab-button');
    const tabContents = document.querySelectorAll('.collection-content .tab-content');
    const postListContainer = document.querySelector('#post-page .post-list');

    // ---- Modal Elements ----
    const modalOverlay = document.getElementById('post-modal');
    const modalContent = modalOverlay ? modalOverlay.querySelector('.modal-content') : null;
    const closeModalBtn = modalOverlay ? modalOverlay.querySelector('.close-modal-btn') : null;
    const modalPostContent = modalOverlay ? modalOverlay.querySelector('#modal-post-content') : null;

    // ---- Cursor Follower Element ----
    const cursorFollower = document.getElementById('cursor-follower');

    // ---- State Variables ----
    const collectionDataCache = {};
    let isModalAnimating = false;
    let isModalVisible = false;
    let isPageAnimating = false;
    let currentPageElement = null;

    // 儲存所有文章清單快取與 Promise，供路由與深層連結快速查詢
    let allPostsData = null;
    let postListPromise = null;

    // ---- Config & Helpers: 快取控制與即時更新機制 (Cache Busting) ----
    const ENABLE_CACHE_BUSTING = true; // 開啟快取控制，確保本地寫作與 JSON/MD 資料修改能即時反映最新狀態

    function fetchWithCacheBuster(url, options = {}) {
        let fetchUrl = url;
        if (ENABLE_CACHE_BUSTING) {
            const cacheBuster = `v=${new Date().getTime()}`;
            const separator = url.includes('?') ? '&' : '?';
            fetchUrl = `${url}${separator}${cacheBuster}`;
        }
        return fetch(fetchUrl, {
            ...options,
            cache: ENABLE_CACHE_BUSTING ? 'no-cache' : 'default',
        });
    }

    // ---- Animation Parameters ----
    const FADE_DURATION = 800;
    const SLIDE_DURATION = 1000;
    const SLIDE_EASING = 'cubicBezier(0.45, 0, 0.55, 1)'; // 與 entry-links 動畫速度曲線完全一致
    const EASE_IN_OUT_QUAD = 'easeInOutQuad';
    const EASE_OUT_CUBIC = 'easeOutCubic';
    const EASE_IN_CUBIC = 'easeInCubic';

    // ---- Helper: Set Page Style ----
    function setPageStyle(element, { opacity, visibility, pointerEvents, transform = 'translateX(0)' }) {
        if (!element) return;
        element.style.opacity = opacity;
        element.style.visibility = visibility;
        element.style.pointerEvents = pointerEvents;
        element.style.transform = transform;
    }

    // ---- Core Function: Page Transition ----
    function switchPage(targetPageElement) {
        targetPageElement = targetPageElement || entryScreen;
        if (!targetPageElement || isPageAnimating || targetPageElement === currentPageElement) {
            return;
        }

        isPageAnimating = true;
        const outgoingPage = currentPageElement;
        const incomingPage = targetPageElement;

        // 若切換離開首頁，立即隱藏特效游標圈
        if (cursorFollower && incomingPage !== entryScreen) {
            cursorFollower.style.opacity = '0';
            isCursorVisible = false;
        }

        // 若初次載入（沒有舊頁面），立即顯示目標頁面，不播放過場過渡動畫
        if (!outgoingPage) {
            animateGlobalTitles(incomingPage.id);
            setPageStyle(incomingPage, { opacity: 1, visibility: 'visible', pointerEvents: 'auto', transform: 'translateX(0)' });
            currentPageElement = incomingPage;
            isPageAnimating = false;
            return;
        }

        // 若 Modal 開啟中，直接隱藏
        if (isModalVisible && modalOverlay) {
            anime.remove([modalOverlay, modalContent]);
            modalOverlay.classList.add('is-hidden');
            setPageStyle(modalOverlay, { opacity: 0, visibility: 'hidden', pointerEvents: 'none' });
            if (modalContent) {
                setPageStyle(modalContent, { opacity: 0, visibility: 'hidden', pointerEvents: 'none', transform: 'scale(0.95) translateY(10px)' });
            }
            isModalVisible = false;
            isModalAnimating = false;
        }

        // 若切換離開 Post 頁面，自動關閉內頁文章展示回到列表狀態
        if (outgoingPage === postPage && incomingPage !== postPage) {
            if (typeof closePostInline === 'function') closePostInline();
        }

        const isAboutTransition = (outgoingPage === entryScreen && incomingPage === aboutPage) || (outgoingPage === aboutPage && incomingPage === entryScreen);
        const isEntryToSlide = (outgoingPage === entryScreen && (incomingPage === postPage || incomingPage === collectionPage || incomingPage === projectPage));
        const isSlideToEntry = ((outgoingPage === postPage || outgoingPage === collectionPage || outgoingPage === projectPage) && incomingPage === entryScreen);

        // 準備新頁面的視覺初始狀態
        const initialOpacity = (incomingPage === entryScreen) ? 1 : 0;
        setPageStyle(incomingPage, { opacity: initialOpacity, visibility: 'visible', pointerEvents: 'none' });
        
        // 暫停或恢復背景水墨繪製 (進入新頁面前)
        if (typeof window.isCalligraphyPaused !== 'undefined') {
            window.isCalligraphyPaused = (incomingPage !== entryScreen);
        }

        // 進入新頁面時，重置捲軸位置（除了主頁）
        if (incomingPage.id !== 'entry-screen') {
            incomingPage.scrollTop = 0; // 重置最外層
            
            // 找出所有可能的內部捲動容器並重置
            const scrollContainers = incomingPage.querySelectorAll('.post-list-wrapper, .project-list-wrapper, .collection-sidebar, .collection-content, .inline-post-view');
            scrollContainers.forEach(container => {
                container.scrollTop = 0;
            });
        }

        let incomingInitialTransform = 'translateX(0)';
        if (isEntryToSlide) {
            incomingInitialTransform = 'translateX(100%)';
        }
        incomingPage.style.transform = incomingInitialTransform;

        // 處理全域過場導覽標題動畫
        animateGlobalTitles(incomingPage.id);

        // 使用 requestAnimationFrame 確保樣式套用後再啟動動畫
        requestAnimationFrame(() => {
            const tl = anime.timeline({
                duration: (isEntryToSlide || isSlideToEntry) ? SLIDE_DURATION : FADE_DURATION,
                easing: EASE_IN_OUT_QUAD,
                complete: () => {
                    if (outgoingPage) {
                        setPageStyle(outgoingPage, { opacity: 0, visibility: 'hidden', pointerEvents: 'none', transform: 'translateX(0)' });
                    }
                    setPageStyle(incomingPage, { opacity: 1, visibility: 'visible', pointerEvents: 'auto', transform: 'translateX(0)' });
                    currentPageElement = incomingPage;
                    isPageAnimating = false;
                }
            });

            // 舊頁面動畫設定
            if (outgoingPage) {
                let outgoingAnimConfig = {
                    targets: outgoingPage,
                    opacity: 0,
                    duration: FADE_DURATION,
                    easing: EASE_IN_OUT_QUAD
                };
                if (isSlideToEntry) {
                    outgoingAnimConfig.translateX = '100%';
                    outgoingAnimConfig.easing = SLIDE_EASING;
                    outgoingAnimConfig.duration = SLIDE_DURATION;
                } else if (isEntryToSlide) {
                    outgoingAnimConfig.duration = SLIDE_DURATION;
                }
                tl.add(outgoingAnimConfig, 0);
            }

            // 新頁面動畫設定
            let incomingAnimConfig = {
                targets: incomingPage,
                opacity: 1,
                translateX: '0%',
                duration: FADE_DURATION,
                easing: EASE_IN_OUT_QUAD
            };
            if (isEntryToSlide) {
                incomingAnimConfig.easing = SLIDE_EASING;
                incomingAnimConfig.duration = SLIDE_DURATION;
            } else if (isSlideToEntry) {
                incomingAnimConfig.duration = SLIDE_DURATION;
            }
            tl.add(incomingAnimConfig, 0);
        }); // End of requestAnimationFrame
    }

    // ---- Global Title Animation Logic ----
    function animateGlobalTitles(incomingPageId) {
        if (incomingPageId === 'entry-screen') {
            document.body.classList.remove('is-inner-page', 'state-post', 'state-project', 'state-collection');
        } else {
            document.body.classList.add('is-inner-page');
            document.body.classList.remove('state-post', 'state-project', 'state-collection');
            
            const stateClass = `state-${incomingPageId.replace('-page', '')}`;
            document.body.classList.add(stateClass);
        }
    }

    // ---- Modal Functions ----
    function showModal() {
        if (!modalOverlay || !modalContent || typeof anime === 'undefined') {
            return;
        }
        if (isModalAnimating) {
            return;
        }

        isModalAnimating = true;

        // 若開啟文章彈窗，自動隱藏特效游標圈
        if (cursorFollower) {
            cursorFollower.style.opacity = '0';
            isCursorVisible = false;
        }

        modalOverlay.classList.remove('is-hidden');
        modalOverlay.style.display = 'flex';
        modalOverlay.style.pointerEvents = 'auto';
        modalOverlay.style.opacity = '0';
        modalOverlay.style.visibility = 'visible';
        if (modalContent) {
            modalContent.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95) translateY(10px)';
            modalContent.style.visibility = 'visible';
        }

        requestAnimationFrame(() => {
            anime({
                targets: modalOverlay,
                opacity: 1,
                duration: 250,
                easing: 'easeOutQuad'
            });

            anime({
                targets: modalContent,
                opacity: 1,
                scale: 1,
                translateY: '0px',
                duration: 350,
                delay: 50,
                easing: 'easeInOutSine',
                complete: () => {
                    isModalAnimating = false;
                    isModalVisible = true;
                }
            });
        });
    }

    function hideModal() {
        if (!modalOverlay || !modalContent || typeof anime === 'undefined') {
            return;
        }
        if (isModalAnimating || !isModalVisible) {
            return;
        }

        isModalAnimating = true;
        isModalVisible = false;

        modalOverlay.style.pointerEvents = 'none';

        // 若當前 URL 是在深層連結單篇文章下，關閉 Modal 時靜默將網址退回 #/post（不產生多餘歷史紀錄）
        if (window.location.hash.startsWith('#/post/')) {
            history.replaceState(null, '', '#/post');
        }

        requestAnimationFrame(() => {
            anime({
                targets: modalContent,
                opacity: 0,
                scale: 0.95,
                translateY: '10px',
                duration: 300,
                easing: 'easeInSine',
                complete: () => {
                    if (modalContent) {
                        modalContent.style.visibility = 'hidden';
                    }
                }
            });

            anime({
                targets: modalOverlay,
                opacity: 0,
                duration: 250,
                delay: 50,
                easing: 'easeOutQuad',
                complete: () => {
                    modalOverlay.classList.add('is-hidden');
                    modalOverlay.style.visibility = 'hidden';
                    modalOverlay.style.display = '';
                    isModalAnimating = false;
                }
            });
        });
    }

    // ---- Collection Tab Helper ----
    function activateCollectionTab(button) {
        if (!button) return;
        const targetTabId = button.dataset.tab;
        const targetContentElement = document.getElementById(`content-${targetTabId}`);

        tabButtons.forEach(btn => btn.classList.remove('active-tab'));
        button.classList.add('active-tab');

        tabContents.forEach(content => {
            content.classList.remove('active-content');
            content.style.display = 'none';
        });

        if (targetContentElement) {
            targetContentElement.classList.add('active-content');
            targetContentElement.style.display = 'block';
            loadCollectionData(button);
        }
    }

    // ---- Collection Data Loading ----
    async function loadCollectionData(tabButton) {
        const targetTabId = tabButton.dataset.tab;
        const jsonFileName = tabButton.dataset.jsonSource;
        const targetContentElement = document.getElementById(`content-${targetTabId}`);
        const targetGridElement = targetContentElement?.querySelector('.item-grid');
        const loadingMessageElement = targetContentElement?.querySelector('.loading-message');

        if (!targetContentElement || !targetGridElement || !jsonFileName) {
            console.error(`Collection Load Error: Missing elements or source for tab ${targetTabId}`);
            if (targetContentElement) {
                targetContentElement.innerHTML = '<p style="color: red;">載入錯誤。</p>';
            }
            return;
        }

        if (loadingMessageElement) {
            loadingMessageElement.style.display = 'block';
        }
        targetGridElement.innerHTML = '';
        targetGridElement.style.display = 'none';

        if (collectionDataCache[targetTabId]) {
            renderCollectionItems(collectionDataCache[targetTabId], targetGridElement);
            if (loadingMessageElement) {
                loadingMessageElement.style.display = 'none';
            }
            targetGridElement.style.display = 'grid';
            return;
        }

        try {
            const response = await fetchWithCacheBuster(`./Data/${jsonFileName}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${jsonFileName}`);
            }
            const data = await response.json();
            collectionDataCache[targetTabId] = data;
            renderCollectionItems(data, targetGridElement);
        } catch (error) {
            console.error(`Fetch Error: ${error}`);
            targetGridElement.innerHTML = `<p style="color: red;">無法載入內容: ${error.message}</p>`;
        } finally {
            if (loadingMessageElement) {
                loadingMessageElement.style.display = 'none';
            }
            targetGridElement.style.display = 'grid';
        }
    }

    function renderCollectionItems(items, gridElement) {
        gridElement.innerHTML = '';
        if (!items || !Array.isArray(items) || items.length === 0) {
            gridElement.innerHTML = '<p>沒有項目可顯示。</p>';
            return;
        }

        // 自訂排序邏輯
        const collator = new Intl.Collator('zh-TW', { collation: 'stroke', numeric: true, caseFirst: 'upper' });
        function compareStr(a, b) {
            const strA = (a || '').trim();
            const strB = (b || '').trim();
            // 判斷是否以英數字開頭
            const isAEng = /^[a-zA-Z0-9]/.test(strA);
            const isBEng = /^[a-zA-Z0-9]/.test(strB);
            
            // 英文優先
            if (isAEng && !isBEng) return -1;
            if (!isAEng && isBEng) return 1;
            
            // 否則使用中文筆畫 (或預設英數字) 排序
            return collator.compare(strA, strB);
        }

        const firstId = items[0].id || '';
        const sortedItems = [...items].sort((a, b) => {
            if (firstId.startsWith('book-') || firstId.startsWith('song-')) {
                // 書籍與音樂：作者優先，作品名次之
                const authorCmp = compareStr(a.author, b.author);
                return authorCmp !== 0 ? authorCmp : compareStr(a.title, b.title);
            } else if (firstId.startsWith('anime-')) {
                // 動畫影集：年份 (author) 優先 (以數字排序)，作品名次之
                // 為了讓年份最新的在前面，年份使用降冪排序 (b 比較 a)；如果您希望年份由舊到新，可改為 a, b
                const yearCmp = compareStr(b.author, a.author); 
                return yearCmp !== 0 ? yearCmp : compareStr(a.title, b.title);
            }
            return 0;
        });

        sortedItems.forEach(item => {
            const linkElement = document.createElement('a');
            linkElement.href = item.hyperlink || '#';
            // 採用 project-item 基礎樣式，並疊加 collection-item 專屬設定
            linkElement.className = 'project-item collection-item';
            linkElement.dataset.id = item.id || '';

            if (item.hyperlink && (item.hyperlink.startsWith('http://') || item.hyperlink.startsWith('https://'))) {
                linkElement.target = '_blank';
                linkElement.rel = 'noopener noreferrer';
            }

            let imgUrl = item.illustrationPath ? item.illustrationPath : 'https://via.placeholder.com/400/cccccc?text=No+Image';
            if (ENABLE_CACHE_BUSTING && item.illustrationPath && !item.illustrationPath.startsWith('http')) {
                const separator = imgUrl.includes('?') ? '&' : '?';
                imgUrl = `${imgUrl}${separator}v=${new Date().getTime()}`;
            }

            const safeTitle = escapeHTML(item.title || '無標題');
            const safeAuthor = item.author ? escapeHTML(item.author) : '';
            const authorHtml = safeAuthor ? `<span class="item-author">${safeAuthor}</span>` : '';

            // 建構類似 project 卡片的內部結構
            linkElement.innerHTML = `
                <div class="item-visual">
                    <img src="${imgUrl}" alt="${safeTitle}" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/400/cccccc?text=Load+Error';">
                </div>
                <div class="item-content">
                    <div class="item-title">
                        <div class="item-title-text">
                            <span>${safeTitle}</span>
                            ${authorHtml}
                        </div>
                        <span class="item-arrow">↗</span>
                    </div>
                </div>
            `;
            
            gridElement.appendChild(linkElement);
        });
    }

    // ---- Post Data Helper (供深層連結查閱文章資料) ----
    async function getPostById(postId) {
        if (!allPostsData) {
            if (!postListPromise) {
                initializePostList();
            }
            try {
                await postListPromise;
            } catch (e) {
                console.error("無法載入文章列表以便取得單篇文章:", e);
                return null;
            }
        }
        return allPostsData?.find(p => p.id === postId) || null;
    }

    // ---- Post List Initialization ----
    function initializePostList() {
        if (!postListContainer) {
            console.error("Post list container not found.");
            return;
        }
        const loadingMessage = postListContainer.querySelector('.loading-message');

        postListPromise = fetchWithCacheBuster('./Data/postlist.json')
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status} - Could not load postlist.json`);
                }
                const posts = await response.json();
                allPostsData = posts;

                if (loadingMessage) {
                    loadingMessage.remove();
                }
                postListContainer.innerHTML = '';

                if (!Array.isArray(posts) || posts.length === 0) {
                    postListContainer.innerHTML = '<p>目前沒有文章。</p>';
                    return posts;
                }

                posts.forEach((post, index) => {
                    const postItemDiv = document.createElement('div');
                    // 同步繼承 Project 卡片的模組設定，跨越滿寬 2 欄呈現為橫條
                    postItemDiv.className = 'project-item mod-2x1 post-item';
                    postItemDiv.dataset.postId = post.id || '';
                    postItemDiv.dataset.markdownFile = post.markdownFile || '';

                    // 視覺背景紋理 (循環套用漸層或格線)
                    const visuals = ['visual-gradient-1', 'visual-gradient-2', 'visual-gradient-3', 'visual-grid-pattern'];
                    const visualClass = visuals[index % visuals.length];
                    
                    postItemDiv.innerHTML = `
                        <div class="item-visual ${visualClass}"></div>
                        <div class="item-top-bar">
                            <span class="item-category">${escapeHTML(post.category || 'ARTICLE // POST')}</span>
                        </div>
                        <div class="item-content">
                            <div class="item-title">
                                <span>${escapeHTML(post.title || '無標題')}</span>
                                <span class="item-arrow">↗</span>
                            </div>
                            <p class="item-desc">${escapeHTML(post.subtitle || '')}</p>
                            <div class="post-date-row" style="margin-top: 15px; font-size: 0.85em; color: #888; font-family: 'IBM Plex Mono', monospace;">${escapeHTML(post.date || '')}</div>
                        </div>
                    `;

                    postItemDiv.addEventListener('click', handlePostItemClick);
                    postListContainer.appendChild(postItemDiv);
                });
                return posts;
            })
            .catch((error) => {
                console.error("Failed to initialize post list:", error);
                if (loadingMessage) {
                    loadingMessage.remove();
                }
                postListContainer.innerHTML = `<p style="color: red;">無法載入文章列表: ${error.message}</p>`;
                throw error;
            });
    }

    // ---- About Page Initialization (動態載入 data/about.md) ----
    async function initializeAboutPage() {
        const aboutContentArea = aboutPage?.querySelector('.content-area');
        if (!aboutContentArea) return;

        try {
            const response = await fetchWithCacheBuster('./Data/about.md');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status} - Could not load about.md`);
            }
            const markdownText = await response.text();
            if (typeof marked === 'undefined') {
                throw new Error("Marked.js library not loaded.");
            }
            aboutContentArea.innerHTML = marked.parse(markdownText);
        } catch (error) {
            console.error("Failed to load about.md:", error);
            aboutContentArea.innerHTML = `<div style="padding: 20px; color: red;"><h2>載入錯誤</h2><p>無法載入或解析關於我內容 (data/about.md)。</p><p><small>${escapeHTML(error.message)}</small></p></div>`;
        }
    }

    function closePostInline() {
        const postPage = document.getElementById('post-page');
        if (postPage) {
            postPage.classList.remove('has-active-post');
        }
    }

    function closeProjectInline() {
        const projectPage = document.getElementById('project-page');
        if (projectPage) {
            // 加入淡出過場 class
            projectPage.classList.add('is-switching');
            setTimeout(() => {
                projectPage.classList.remove('has-active-project');
                void projectPage.offsetWidth; // 強制重繪
                projectPage.classList.remove('is-switching');
            }, 250);
        }
    }

    // ---- Project Inline Helper (載入並於內頁開啟專案文章) ----
    async function openProjectModalById(projectId) {
        if (!projectId) return;
        
        if (isPageAnimating || isModalAnimating) {
            setTimeout(() => openProjectModalById(projectId), 100);
            return;
        }

        const inlineProjectContent = document.getElementById('inline-project-content');
        const projectPage = document.getElementById('project-page');
        const inlineProjectView = document.getElementById('inline-project-view');

        const isCurrentlyActive = projectPage.classList.contains('has-active-project');
        let switchPromise = Promise.resolve();

        // 若正準備從全螢幕列表切入內頁，則觸發列表的淡出動畫以掩蓋版面跳動
        if (!isCurrentlyActive) {
            projectPage.classList.add('is-switching');
            switchPromise = new Promise(r => setTimeout(r, 500));
        }

        const markdownFilePath = `projects/${projectId}.md`;
        
        // 抓取右側清單被點擊的卡片圖片
        let preloadedImageHtml = '';
        const clickedCard = document.querySelector(`.project-item[data-project-id="${projectId}"]`);
        if (clickedCard) {
            const imgEl = clickedCard.querySelector('img');
            if (imgEl && imgEl.src) {
                // 套用基本響應式樣式，讓圖片先佔據左邊版面
                preloadedImageHtml = `<img src="${imgEl.src}" style="width: 100%; border-radius: 8px; margin-bottom: 2em; object-fit: cover; box-shadow: 0 4px 20px rgba(0,0,0,0.1);" decoding="async">`;
            }
        }

        try {
            if (inlineProjectContent && !isCurrentlyActive) {
                // 將右側已載入的圖片直接塞給左側當作預載畫面，達到無縫切換的體感
                inlineProjectContent.innerHTML = preloadedImageHtml + '<p class="loading-message">正在載入專案...</p>';
            }

            // 同時開始載入與播放過場動畫，節省等待時間
            const fetchPromise = fetchWithCacheBuster(markdownFilePath);
            
            await switchPromise; // 等待網格淡出完成
            
            // 瞬間切換網格為單欄（此時處於透明狀態）
            projectPage.classList.add('has-active-project');
            
            if (!isCurrentlyActive) {
                void projectPage.offsetWidth; // 強制瀏覽器重繪單欄排版
                projectPage.classList.remove('is-switching'); // 移除淡出，讓重新排版好的單欄網格優雅淡入
            }

            const response = await fetchPromise;
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const markdownText = await response.text();
            if (typeof marked === 'undefined') {
                throw new Error("Marked.js library not loaded.");
            }
            let htmlContent = marked.parse(markdownText);
            
            // 優化：強制非同步解碼圖片與延遲載入
            htmlContent = htmlContent.replace(/<img /g, '<img decoding="async" loading="lazy" ');

            // （移除：不再把圖片加到最終文章最上方）

            if (inlineProjectContent && projectPage) {
                inlineProjectContent.innerHTML = htmlContent;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (inlineProjectView) inlineProjectView.scrollTop = 0;
                        setupImageZoom(inlineProjectContent);
                    });
                });
            }
        } catch (error) {
            console.error("Failed to load project markdown:", error);
            if (inlineProjectContent && projectPage) {
                inlineProjectContent.innerHTML = `<div style="padding: 20px; color: red;"><h2>載入錯誤</h2><p>無法載入專案內容。</p><p><small>${escapeHTML(error.message)}</small></p></div>`;
            }
        }
    }

    // ---- Post Inline Helper (由 ID 載入並於內頁開啟單篇文章) ----
    async function openPostModalById(postId) {
        if (!postId) return;

        if (isPageAnimating || isModalAnimating) {
            setTimeout(() => openPostModalById(postId), 100);
            return;
        }

        const inlinePostContent = document.getElementById('inline-post-content');
        const postPage = document.getElementById('post-page');
        const inlinePostView = document.getElementById('inline-post-view');

        const post = await getPostById(postId);
        if (!post || !post.markdownFile) {
            console.error(`Post not found or missing markdownFile for ID: ${postId}`);
            if (inlinePostContent) {
                inlinePostContent.innerHTML = `<p style="color: red;">錯誤：找不到 ID 為「${escapeHTML(postId)}」的文章或對應檔案路徑。</p>`;
            }
            if (postPage) postPage.classList.add('has-active-post');
            return;
        }

        const markdownFilePath = post.markdownFile;
        
        // 抓取右側清單被點擊的卡片圖片
        let preloadedImageHtml = '';
        const clickedCard = document.querySelector(`.post-item[data-post-id="${postId}"]`);
        if (clickedCard) {
            const imgEl = clickedCard.querySelector('img');
            if (imgEl && imgEl.src) {
                preloadedImageHtml = `<img src="${imgEl.src}" style="width: 100%; border-radius: 8px; margin-bottom: 2em; object-fit: cover; box-shadow: 0 4px 20px rgba(0,0,0,0.1);" decoding="async">`;
            }
        }
        
        try {
            if (inlinePostContent && postPage && !postPage.classList.contains('has-active-post')) {
                inlinePostContent.innerHTML = preloadedImageHtml + '<p class="loading-message">正在載入文章...</p>';
            }

            const response = await fetchWithCacheBuster(markdownFilePath);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status} - Could not load ${markdownFilePath}`);
            }
            const markdownText = await response.text();
            if (typeof marked === 'undefined') {
                throw new Error("Marked.js library not loaded.");
            }
            let htmlContent = marked.parse(markdownText);
            
            // 優化：強制非同步解碼圖片與延遲載入
            htmlContent = htmlContent.replace(/<img /g, '<img decoding="async" loading="lazy" ');
            
            // 自動插入從 JSON 抓取的標題與 metadata，取代原本要在 Markdown 內手動寫的標題
            const autoHeaderHTML = `
<h1>${escapeHTML(post.title || '無標題')}</h1>
<blockquote>
<p><strong>${escapeHTML(post.subtitle || '')}</strong><br>
<em>${escapeHTML(post.date || '')} // ${escapeHTML(post.category || '')}</em></p>
</blockquote>
<hr>
`;

            // （移除：不再把圖片加到最終文章最上方）
            htmlContent = autoHeaderHTML + htmlContent;

            if (inlinePostContent && postPage) {
                inlinePostContent.innerHTML = htmlContent;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        postPage.classList.add('has-active-post');
                        if (inlinePostView) inlinePostView.scrollTop = 0;
                        postPage.scrollTop = 0;
                        setupImageZoom(inlinePostContent);
                    });
                });
            }
        } catch (error) {
            console.error("Failed to load or parse markdown:", error);
            if (inlinePostContent && postPage) {
                inlinePostContent.innerHTML = `<div style="padding: 20px; color: red;"><h2>載入錯誤</h2><p>無法載入或解析文章內容。</p><p><small>${escapeHTML(error.message)}</small></p></div>`;
                if (postPage) postPage.classList.add('has-active-post');
            }
        }
    }

    // ---- Image Zoom Setup ----
    function setupImageZoom(container) {
        if (!container) return;
        const images = container.querySelectorAll('img');
        const zoomModal = document.getElementById('image-zoom-modal');
        const zoomedImg = document.getElementById('zoomed-image');
        const closeBtn = document.getElementById('close-zoom-btn');

        if (!zoomModal || !zoomedImg) return;

        images.forEach(img => {
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', () => {
                zoomedImg.src = img.src;
                zoomModal.classList.remove('is-hidden');
                document.body.style.overflow = 'hidden';
            });
        });

        // Ensure we only bind event listeners once
        if (closeBtn && !closeBtn.dataset.zoomBound) {
            closeBtn.dataset.zoomBound = 'true';
            closeBtn.addEventListener('click', closeZoom);
        }

        if (!zoomModal.dataset.zoomBound) {
            zoomModal.dataset.zoomBound = 'true';
            zoomModal.addEventListener('click', (e) => {
                if (e.target === zoomModal) {
                    closeZoom();
                }
            });
        }
        
        function closeZoom() {
            zoomModal.classList.add('is-hidden');
            document.body.style.overflow = '';
            setTimeout(() => {
                if (zoomModal.classList.contains('is-hidden')) {
                    zoomedImg.src = '';
                }
            }, 300);
        }
    }

    // ---- Core Function: URL Hash Routing ----
    function handleHashChange() {
        let hash = window.location.hash.replace(/^#\/?/, '').trim();
        const parts = hash.split('/');
        const route = parts[0] || 'entry';
        const subParam = parts[1] || '';

        // 如果頁面正在動畫中，延遲重試以防狀態鎖死
        if (isPageAnimating) {
            const retryInterval = setInterval(() => {
                if (!isPageAnimating) {
                    clearInterval(retryInterval);
                    handleHashChange();
                }
            }, 50);
            return;
        }

        switch (route) {
            case 'about':
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (currentPageElement !== aboutPage) switchPage(aboutPage);
                    });
                });
                if (isModalVisible) hideModal();
                break;

            case 'collection':
                if (currentPageElement !== collectionPage) switchPage(collectionPage);
                if (isModalVisible) hideModal();
                if (subParam) {
                    const targetBtn = document.querySelector(`.collection-sidebar .tab-button[data-tab="${subParam}"]`);
                    if (targetBtn) {
                        // 確保切換分頁並載入資料（即使已帶有 active-tab 也要確保資料被載入）
                        activateCollectionTab(targetBtn);
                    } else if (!targetBtn && tabButtons.length > 0) {
                        activateCollectionTab(tabButtons[0]);
                    }
                } else {
                    const activeBtn = document.querySelector('.collection-sidebar .tab-button.active-tab') || tabButtons[0];
                    if (activeBtn) {
                        const tabId = activeBtn.dataset.tab;
                        history.replaceState(null, '', `#/collection/${tabId}`);
                        activateCollectionTab(activeBtn);
                    }
                }
                break;

            case 'post':
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (currentPageElement !== postPage) switchPage(postPage);
                    });
                });
                if (subParam) {
                    openPostModalById(subParam);
                } else {
                    closePostInline();
                    if (isModalVisible) hideModal();
                }
                break;

            case 'project':
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (currentPageElement !== projectPage) switchPage(projectPage);
                    });
                });
                if (subParam) {
                    openProjectModalById(subParam);
                } else {
                    closeProjectInline();
                    if (isModalVisible) hideModal();
                }
                break;

            case 'entry':
            default:
                requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (currentPageElement !== entryScreen) switchPage(entryScreen);
                });
            });
                if (isModalVisible) hideModal();
                if (route !== 'entry' && hash !== '') {
                    history.replaceState(null, '', '#/entry');
                }
                break;
        }
    }

    // ---- Event Handlers ----
    function handleEntryLinkClick(event) {
        event.stopPropagation();
        const targetPageId = event.currentTarget.dataset.target;
        if (targetPageId === 'post-page') {
            window.location.hash = '#/post';
        } else if (targetPageId === 'collection-page') {
            window.location.hash = '#/collection';
        } else if (targetPageId === 'project-page') {
            window.location.hash = '#/project';
        }
    }

    function handleEntryBackgroundClick() {
        window.location.hash = '#/about';
    }

    function handleEscapeButtonClick() {
        const postPage = document.getElementById('post-page');
        const projectPage = document.getElementById('project-page');
        if (isModalVisible) {
            hideModal();
        } else if (currentPageElement === postPage && postPage && postPage.classList.contains('has-active-post')) {
            window.location.hash = '#/post';
        } else if (currentPageElement === projectPage && projectPage && projectPage.classList.contains('has-active-project')) {
            window.location.hash = '#/project';
        } else {
            window.location.hash = '#/entry';
        }
    }

    function handleGlobalKeyDown(event) {
        if (event.key === 'Escape') {
            const postPage = document.getElementById('post-page');
            const projectPage = document.getElementById('project-page');
            if (isModalVisible) {
                hideModal();
            } else if (currentPageElement === postPage && postPage && postPage.classList.contains('has-active-post')) {
                window.location.hash = '#/post';
            } else if (currentPageElement === projectPage && projectPage && projectPage.classList.contains('has-active-project')) {
                window.location.hash = '#/project';
            } else if (currentPageElement !== entryScreen) {
                window.location.hash = '#/entry';
            }
        }
    }

    function handleTabButtonClick(event) {
        const button = event.currentTarget;
        if (button.classList.contains('active-tab')) return;
        const targetTabId = button.dataset.tab;
        window.location.hash = `#/collection/${targetTabId}`;
    }

    function handleModalOverlayClick(event) {
        if (event.target === modalOverlay && isModalVisible) {
            hideModal();
        }
    }

    function handlePostItemClick(event) {
        const clickedItem = event.currentTarget;
        const postId = clickedItem.dataset.postId;
        if (!postId) return;
        window.location.hash = `#/post/${postId}`;
    }

    // ---- Cursor Follower Effect (首頁負片跟隨圈) ----
    let isCursorVisible = false;
    function setupCursorFollower() {
        if (!cursorFollower || !entryScreen) return;

        // 偵測滑鼠在首頁移動，透過 translate3d 實現 60fps 平滑定位
        entryScreen.addEventListener('mousemove', (e) => {
            if (currentPageElement !== entryScreen) return;

            cursorFollower.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
            if (!isCursorVisible) {
                cursorFollower.style.opacity = '1';
                isCursorVisible = true;
            }
        });

        // 離開首頁區域時自動隱藏
        entryScreen.addEventListener('mouseleave', () => {
            cursorFollower.style.opacity = '0';
            isCursorVisible = false;
        });

        // 懸停在導覽連結或切換按鈕上時，放大特效圈以增強互動感
        if (entryLinks.length > 0) {
            entryLinks.forEach(link => {
                link.addEventListener('mouseenter', () => {
                    cursorFollower.classList.add('is-hovering-link');
                });
                link.addEventListener('mouseleave', () => {
                    cursorFollower.classList.remove('is-hovering-link');
                });
            });
        }
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('mouseenter', () => {
                cursorFollower.classList.add('is-hovering-link');
            });
            themeToggleBtn.addEventListener('mouseleave', () => {
                cursorFollower.classList.remove('is-hovering-link');
            });
        }
    }

    // ---- Calligraphy Ink Brush Canvas (首頁水墨毛筆動態互動畫布 - 已獨立重構至 calligraphy.js) ----
    function setupCalligraphyCanvas() {
        if (window.initCalligraphyCanvas) {
            window.initCalligraphyCanvas(entryScreen, () => currentPageElement);
        }
    }

    // ---- Setup Event Listeners ----
    function setupEventListeners() {
        setupCursorFollower();
        setupCalligraphyCanvas();

        const globalTitle = document.getElementById('global-title');
        if (globalTitle) {
            globalTitle.addEventListener('click', () => {
                if (isModalVisible) {
                    hideModal();
                }
                window.location.hash = '#/entry';
            });
        }

        if (entryLinks.length > 0) {
            entryLinks.forEach(link => link.addEventListener('click', handleEntryLinkClick));
        }
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.body.classList.toggle('light-mode');
                const isLight = document.body.classList.contains('light-mode');
                themeToggleBtn.textContent = isLight ? 'DARK' : 'LIGHT';
            });
        }
        if (entryBackground) {
            entryBackground.addEventListener('click', handleEntryBackgroundClick);
        }
        if (escapeButtons.length > 0) {
            escapeButtons.forEach(button => button.addEventListener('click', handleEscapeButtonClick));
        }
        const globalBackBtn = document.getElementById('global-back-btn');
        if (globalBackBtn) {
            globalBackBtn.addEventListener('click', handleEscapeButtonClick);
        }
        document.addEventListener('keydown', handleGlobalKeyDown);

        if (tabButtons.length > 0) {
            tabButtons.forEach(button => button.addEventListener('click', handleTabButtonClick));
        }
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', hideModal);
        }
        if (modalOverlay) {
            modalOverlay.addEventListener('click', handleModalOverlayClick);
        }

        // 註冊 Hash 變更路由監聽器
        window.addEventListener('hashchange', handleHashChange);

        // Project 點擊處理與動態影片 hover 播放
        const projectPage = document.getElementById('project-page');
        if (projectPage) {
            const projectItems = projectPage.querySelectorAll('.project-item');
            projectItems.forEach(item => {
                // 點擊前往專案內文
                item.addEventListener('click', () => {
                    const projectId = item.getAttribute('data-project-id');
                    if (projectId) {
                        window.location.hash = `#/project/${projectId}`;
                    }
                });

                // Hover 動態影片循環播放控制
                const video = item.querySelector('video.preview-video');
                if (video) {
                    item.addEventListener('mouseenter', () => {
                        video.play().catch(e => console.log('Video play prevented by browser:', e));
                    });
                    item.addEventListener('mouseleave', () => {
                        video.pause();
                    });
                }
            });
        }
    }


    // ---- Auto-fetch Project Metadata ----
    function initializeProjectsData() {
        const projectItems = document.querySelectorAll(".project-item");
        projectItems.forEach(async (item) => {
            const projectId = item.getAttribute("data-project-id");
            if (!projectId) return;
            
            try {
                const response = await fetchWithCacheBuster(`projects/${projectId}.md`);
                if (!response.ok) return;
                const text = await response.text();
                
                const titleMatch = text.match(/^#\s+(.+)$/m);
                const descMatch = text.match(/^###\s+(.+)$/m);
                const tagsMatch = text.match(/<span class="project-tags">([^<]+)<\/span>/i);
                
                const titleSpan = item.querySelector(".item-title span:first-child");
                const descP = item.querySelector(".item-desc");
                const categorySpan = item.querySelector(".item-category");
                
                // Only populate if they exist. (For some cards we might have intentionally removed the title text)
                // Actually, if the title span is empty, let us populate it unless there is a specific class like no-title.
                // Since the user asked to remove it earlier for Zen, we can conditionally hide it or just populate it and see.
                // "外面的小標" definitely means category and desc.
                
                if (titleSpan && titleMatch) {
                    // Only populate if the span is NOT empty, OR if we want to auto-fill it always.
                    // To respect "只有標題要移除", let us check if it has a special class. Let us just populate it, if they want it hidden they can tell us.
                    // Wait, they said "外面的小標" (small title). They probably meant category.
                    // I will populate it.
                    // titleSpan.textContent = titleMatch[1].trim(); 
                }
                
                // if (descP && descMatch) {
                //     descP.textContent = descMatch[1].trim();
                // }
                
                if (categorySpan && tagsMatch) {
                    // Prepend PROJECT // if they want the same format, or just use the tags.
                    // Original was "PROJECT // ART". Let us just use the tags exactly as they are in markdown.
                    categorySpan.textContent = tagsMatch[1].trim().toUpperCase();
                }
            } catch (e) {
                console.error("Failed to load project metadata for " + projectId, e);
            }
        });
    }

    // ---- Initialization ----
    function initializeApp() {
        // 初始隱藏所有頁面
        allPageElements.forEach(page => {
            setPageStyle(page, { opacity: 0, visibility: 'hidden', pointerEvents: 'none' });
        });

        // 初始化 Modal 狀態
        if (modalOverlay) {
            modalOverlay.classList.add('is-hidden');
            setPageStyle(modalOverlay, { opacity: 0, visibility: 'hidden', pointerEvents: 'none' });
            if (modalContent) {
                setPageStyle(modalContent, { opacity: 0, visibility: 'hidden', pointerEvents: 'none', transform: 'scale(0.95) translateY(10px)' });
            }
        }

        // 動態計算左上方標題右緣 + 50px 作為全域標準留白距離，及底部往下 20px 作為垂直起始高度
        function updateLeftSpace() {
            const titleEl = document.getElementById('global-title');
            if (titleEl) {
                const rect = titleEl.getBoundingClientRect();
                const leftSpace = Math.round(rect.right + 50);
                document.documentElement.style.setProperty('--left-space', `${leftSpace}px`);
                const topSpace = Math.round(rect.bottom + 20);
                document.documentElement.style.setProperty('--title-bottom-space', `${topSpace}px`);
            }
            const postLink = document.querySelector('.entry-link[data-target="post-page"]');
            if (postLink) {
                // 當內頁模式啟用時，#entry-links 的左緣固定位於 X = 42px（齊左於 Collection）
                // 為了讓文章列表右側（分割位置）精準對齊「Post 連結的右緣往右 30px」
                // 列表總寬度為：postLink 距離選單左緣的偏移量 + postLink 自身寬度 + 30px
                const colWidth = Math.round(postLink.offsetLeft + postLink.offsetWidth + 30);
                document.documentElement.style.setProperty('--post-col-width', `${colWidth}px`);
                // 計算「Post 連結右側往右 30px」在畫面上的絕對 X 座標 (42 + colWidth)
                const postRightPos = Math.round(42 + colWidth);
                document.documentElement.style.setProperty('--post-right-pos', `${postRightPos}px`);
            }
        }
        window.addEventListener('resize', updateLeftSpace);
        window.addEventListener('load', updateLeftSpace);
        updateLeftSpace();

        // 註冊所有事件監聽器
        setupEventListeners();

        // 初始化動態文章列表 (Promise 會自動儲存，供 routing 查詢單篇文章時等待)
        initializePostList();

        // 初始化動態關於我內容 (從 data/about.md 讀取 Markdown 並渲染)
        initializeAboutPage();

        initializeProjectsData();
        
        // 根據當前 URL Hash 執行初始路由分發 (支援深層連結與直接分享載入)
        handleHashChange();

        // 移除初次載入禁用過渡動畫標籤，開啟後續使用者操作的所有過場與動畫
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.remove('preload');
            });
        });
    }

    // ---- Helper function for escaping HTML ----
    function escapeHTML(str) {
        if (!str) return '';
        const p = document.createElement("p");
        p.textContent = str;
        return p.innerHTML;
    }

    
    // ---- 全域捲動轉發 (允許在頁面空白處滑動時，自動捲動列表) ----
    window.addEventListener("wheel", (e) => {
        if (!currentPageElement || currentPageElement.id === "entry-screen") return;
        
        // 如果滑鼠已經在可捲動的容器內，讓原生捲動處理
        const target = e.target;
        if (target.closest(".project-list-wrapper, .post-list-wrapper, .collection-content, .inline-post-view")) {
            return;
        }

        // 否則轉發捲動事件到當前頁面的主要容器
        let scrollTarget = null;
        if (currentPageElement.id === "project-page" && !currentPageElement.classList.contains("has-active-project")) {
            scrollTarget = currentPageElement.querySelector(".project-list-wrapper");
        } else if (currentPageElement.id === "post-page" && !currentPageElement.classList.contains("has-active-post")) {
            scrollTarget = currentPageElement.querySelector(".post-list-wrapper");
        } else if (currentPageElement.id === "collection-page") {
            scrollTarget = currentPageElement.querySelector(".collection-content");
        }

        if (scrollTarget) {
            scrollTarget.scrollTop += e.deltaY;
        }
    }, { passive: true });

    // --- Footnotes (註腳) 互動邏輯 ---
    const footnoteTooltip = document.createElement('div');
    footnoteTooltip.className = 'footnote-tooltip';
    document.body.appendChild(footnoteTooltip);

    // 處理註腳的 Hover 事件顯示 Tooltip
    document.addEventListener('mouseover', (e) => {
        const ref = e.target.closest('sup a[data-footnote-ref]');
        if (ref) {
            const targetId = ref.getAttribute('href').substring(1); // 去除 '#'
            const targetLi = document.getElementById(targetId);
            if (targetLi) {
                // 複製內容，並移除可能存在的返回按鈕以維持排版簡潔
                const clone = targetLi.cloneNode(true);
                const backrefs = clone.querySelectorAll('a[data-footnote-backref]');
                backrefs.forEach(br => br.remove());
                
                footnoteTooltip.innerHTML = clone.innerHTML;
                
                const rect = ref.getBoundingClientRect();
                footnoteTooltip.style.visibility = 'visible';
                
                let left = rect.left;
                let top = rect.bottom + 5;
                
                // 確保 tooltip 不會超出畫面右側
                footnoteTooltip.style.display = 'block'; // 確保能取得寬度
                const tw = footnoteTooltip.offsetWidth;
                if (left + tw > window.innerWidth - 20) {
                    left = window.innerWidth - tw - 20;
                }
                
                footnoteTooltip.style.left = `${left}px`;
                footnoteTooltip.style.top = `${top}px`;
                footnoteTooltip.style.opacity = '1';
            }
        }
    });

    document.addEventListener('mouseout', (e) => {
        const ref = e.target.closest('sup a[data-footnote-ref]');
        if (ref) {
            footnoteTooltip.style.opacity = '0';
            footnoteTooltip.style.visibility = 'hidden';
        }
    });

    // 攔截註腳的點擊事件，阻止路由變更，改用平滑滾動
    document.addEventListener('click', (e) => {
        const ref = e.target.closest('sup a[data-footnote-ref]');
        if (ref) {
            e.preventDefault();
            const targetId = ref.getAttribute('href').substring(1);
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });

    // --- Run Initialization ---
    initializeApp();

}); // DOMContentLoaded 結束
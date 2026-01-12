// comix.js for Mangayomi - Uses DartotsuExtensionBridge
(function() {
    'use strict';

    const BASE_URL = 'https://comix.to';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Referer': 'https://comix.to/',
    };

    // 1. SEARCH MANGA - Core function
    async function search(query, page, filters) {
        console.log(`[Comix] Searching: "${query}", Page: ${page}`);
        try {
            const url = `${BASE_URL}/api/v2/manga?order[relevance]=desc&keyword=${encodeURIComponent(query)}&limit=20&page=${page || 1}`;
            const response = await fetch(url, { headers: HEADERS });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const items = data.result?.items || [];
            return items.map(manga => ({
                id: `${manga.hash_id}-${manga.slug}`,
                title: manga.title || '',
                thumbnail: manga.poster?.large || manga.poster?.medium || '',
                subtitle: manga.alt_title || '',
                rating: manga.rating || '0',
                author: manga.author || '',
                status: parseStatus(manga.status || ''),
            }));
        } catch (error) {
            console.error('[Comix] Search failed:', error);
            return [];
        }
    }

    // 2. GET MANGA DETAILS
    async function getMangaDetails(mangaId) {
        console.log(`[Comix] Getting details for: ${mangaId}`);
        // ... (your existing getMangaDetails logic) ...
        return { description: '', genres: [], status: 0, author: '', artist: '' };
    }

    // 3. GET CHAPTERS
    async function getChapters(mangaId) {
        console.log(`[Comix] Getting chapters for: ${mangaId}`);
        // ... (your existing getChapters logic) ...
        return [];
    }

    // 4. GET CHAPTER PAGES
    async function getChapterPages(chapterId) {
        console.log(`[Comix] Getting pages for: ${chapterId}`);
        // ... (your existing getChapterPages logic) ...
        return [];
    }

    // Helper functions (parseStatus, cleanDescription, parseDate)
    function parseStatus(text) {
        const t = text.toLowerCase();
        if (t.includes('ongoing')) return 1;
        if (t.includes('complete')) return 2;
        return 0;
    }

    // REGISTER WITH THE BRIDGE
    // This is the critical step that makes the functions visible to the app.
    if (typeof DartotsuExtensionBridge !== 'undefined') {
        DartotsuExtensionBridge.register({
            search: search,
            getMangaDetails: getMangaDetails,
            getChapters: getChapters,
            getChapterPages: getChapterPages
        });
        console.log('[Comix] Extension registered with DartotsuExtensionBridge.');
    } else {
        console.error('[Comix] ERROR: DartotsuExtensionBridge not found. The extension will not work.');
    }

})();

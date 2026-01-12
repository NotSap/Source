// Comix source for Mangayomi - INSTANTIATED VERSION
const Comix = {
    baseUrl: "https://comix.to",
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/html, */*",
        "Referer": "https://comix.to/",
    },

    // Search manga - REQUIRED METHOD
    async search(query, page, filters) {
        try {
            console.log(`Searching for: "${query}", page: ${page}`);
            
            // Use the browser API endpoint for search
            const url = `${this.baseUrl}/api/v2/manga?order[relevance]=desc&keyword=${encodeURIComponent(query)}&limit=20&page=${page || 1}`;
            console.log(`Fetching: ${url}`);
            
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
                console.error(`Search failed with status: ${response.status}`);
                return [];
            }
            
            const data = await response.json();
            console.log("Search data received:", data);
            
            const items = data.result?.items || [];
            console.log(`Found ${items.length} items`);
            
            // Format results for Mangayomi
            const results = items.map(manga => {
                const mangaId = `${manga.hash_id}-${manga.slug}`;
                console.log(`Manga: ${manga.title}, ID: ${mangaId}`);
                
                return {
                    id: mangaId,
                    title: manga.title || "",
                    thumbnail: manga.poster?.large || manga.poster?.medium || "",
                    subtitle: manga.alt_title || "",
                    rating: manga.rating || "0",
                    author: manga.author || "",
                    status: this.parseStatus(manga.status || ""),
                };
            });
            
            console.log(`Returning ${results.length} results`);
            return results;
            
        } catch (error) {
            console.error("Search error:", error);
            return [];
        }
    },

    // Get manga details - REQUIRED METHOD
    async getMangaDetails(mangaId) {
        try {
            console.log(`Getting details for: ${mangaId}`);
            
            // Extract slug from ID
            const parts = mangaId.split('-');
            const slug = parts.slice(1).join('-');
            const url = `${this.baseUrl}/title/${slug}`;
            console.log(`Details URL: ${url}`);
            
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
                console.error(`Details fetch failed: ${response.status}`);
                return {
                    description: "",
                    genres: [],
                    status: 0,
                    author: "",
                    artist: "",
                };
            }
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            
            // Extract description from meta tag
            let description = "";
            const metaDesc = doc.querySelector('meta[name="description"]');
            if (metaDesc) {
                description = metaDesc.getAttribute("content") || "";
                description = this.cleanDescription(description);
            }
            
            // Extract genres
            const genres = [];
            const genreLinks = doc.querySelectorAll('a[href*="/genre/"]');
            genreLinks.forEach(link => {
                const genre = link.textContent.trim();
                if (genre && !genres.includes(genre)) {
                    genres.push(genre);
                }
            });
            
            // Extract author
            let author = "";
            const authorSpan = doc.querySelector('span:contains("Author")');
            if (authorSpan) {
                const authorDiv = authorSpan.closest('div');
                if (authorDiv) {
                    author = authorDiv.textContent.replace("Author", "").trim();
                }
            }
            
            // Extract status
            let status = 0;
            const statusSpan = doc.querySelector('span:contains("Status")');
            if (statusSpan) {
                const statusDiv = statusSpan.closest('div');
                if (statusDiv) {
                    const statusText = statusDiv.textContent.replace("Status", "").trim();
                    status = this.parseStatus(statusText);
                }
            }
            
            console.log(`Details found: genres=${genres.length}, status=${status}, author=${author}`);
            
            return {
                description,
                genres,
                status,
                author,
                artist: author,
            };
            
        } catch (error) {
            console.error("Manga details error:", error);
            return {
                description: "",
                genres: [],
                status: 0,
                author: "",
                artist: "",
            };
        }
    },

    // Get chapters - REQUIRED METHOD
    async getChapters(mangaId) {
        try {
            console.log(`Getting chapters for: ${mangaId}`);
            
            const hash = mangaId.split("-")[0];
            const url = `${this.baseUrl}/api/v2/manga/${hash}/chapters?limit=100&page=1&order[number]=desc`;
            console.log(`Chapters URL: ${url}`);
            
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
                console.error(`Chapters fetch failed: ${response.status}`);
                return [];
            }
            
            const data = await response.json();
            const items = data.result?.items || [];
            console.log(`Found ${items.length} chapters`);
            
            // Process chapters
            const chaptersMap = new Map();
            items.forEach(item => {
                const chapterNum = item.number?.toString();
                if (chapterNum && !chaptersMap.has(chapterNum)) {
                    chaptersMap.set(chapterNum, {
                        id: `${mangaId}/${item.chapter_id}-chapter-${item.number}`,
                        title: item.name || `Chapter ${item.number}`,
                        chapterNumber: parseFloat(item.number) || 0,
                        uploadDate: this.parseDate(item.created_at || ""),
                        scanlator: item.scanlation_group?.name || "Comix",
                    });
                }
            });
            
            // Convert to array and sort (newest first)
            const chapters = Array.from(chaptersMap.values());
            chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
            
            console.log(`Returning ${chapters.length} unique chapters`);
            return chapters;
            
        } catch (error) {
            console.error("Chapters error:", error);
            return [];
        }
    },

    // Get chapter pages - REQUIRED METHOD
    async getChapterPages(chapterId) {
        try {
            console.log(`Getting pages for chapter: ${chapterId}`);
            
            // Extract manga slug from chapter ID
            const parts = chapterId.split('/');
            const mangaSlug = parts[0];
            const url = `${this.baseUrl}/title/${mangaSlug}`;
            console.log(`Chapter pages URL: ${url}`);
            
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
                console.error(`Chapter pages fetch failed: ${response.status}`);
                return [];
            }
            
            const html = await response.text();
            
            // Try to extract images from JSON
            const jsonMatch = html.match(/"images":\[(.*?)\]/);
            if (jsonMatch) {
                try {
                    const jsonStr = `[${jsonMatch[1]}]`;
                    const images = JSON.parse(jsonStr);
                    console.log(`Found ${images.length} images in JSON`);
                    
                    return images.map((img, index) => ({
                        url: img.url || img,
                        index: index
                    }));
                } catch (jsonError) {
                    console.error("JSON parse error:", jsonError);
                }
            }
            
            // Fallback: extract from HTML img tags
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const pages = [];
            
            const imgElements = doc.querySelectorAll('img');
            imgElements.forEach(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-src');
                if (src && /\.(jpg|png|webp|jpeg)$/i.test(src)) {
                    const fullUrl = src.startsWith('http') ? src : 
                                   src.startsWith('//') ? `https:${src}` : 
                                   `${this.baseUrl}${src}`;
                    
                    pages.push({
                        url: fullUrl,
                        index: pages.length
                    });
                }
            });
            
            console.log(`Found ${pages.length} images in HTML`);
            return pages;
            
        } catch (error) {
            console.error("Chapter pages error:", error);
            return [];
        }
    },

    // Helper methods
    cleanDescription(text) {
        if (!text) return "";
        
        const htmlEntities = {
            "&#x27;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">", 
            "&quot;": '"', "&#039;": "'", "&nbsp;": " "
        };
        
        let cleaned = text;
        Object.entries(htmlEntities).forEach(([entity, replacement]) => {
            cleaned = cleaned.replace(new RegExp(entity, "g"), replacement);
        });
        
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
        cleaned = cleaned.replace(/<[^>]*>/g, "");
        cleaned = cleaned.replace(/[*_~`]/g, "");
        cleaned = cleaned.replace(/___.*$/, "");
        cleaned = cleaned.replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ");
        
        return cleaned.trim();
    },

    parseStatus(statusText) {
        if (!statusText) return 0;
        
        const text = statusText.toLowerCase();
        if (text.includes("ongoing")) return 1;
        if (text.includes("complete")) return 2;
        if (text.includes("hiatus")) return 6;
        if (text.includes("cancel")) return 3;
        return 0;
    },

    parseDate(dateStr) {
        if (!dateStr) return 0;
        
        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return Math.floor(date.getTime() / 1000);
            }
        } catch (error) {
            console.error("Date parse error:", error);
        }
        
        return 0;
    }
};

// MANGAYOMI EXPORT - MUST BE AN OBJECT, NOT A CLASS
if (typeof module !== "undefined") {
    module.exports = Comix;
}

// For debugging
console.log("Comix extension loaded successfully!");

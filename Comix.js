// Comix source for Mangayomi
class Comix {
    constructor() {
        this.baseUrl = "https://comix.to";
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, text/html, */*",
            "Referer": "https://comix.to/",
        };
    }

    // Search manga - REQUIRED METHOD
    async search(query, page, filters) {
        try {
            const url = `${this.baseUrl}/api/v2/manga?order[relevance]=desc&keyword=${encodeURIComponent(query)}&limit=100&page=${page || 1}`;
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) return [];
            
            const data = await response.json();
            const items = data.result?.items || [];
            
            return items.map(manga => ({
                id: `${manga.hash_id}-${manga.slug}`,
                title: manga.title || "",
                thumbnail: manga.poster?.large || manga.poster?.medium || "",
                subtitle: manga.alt_title || "",
                rating: manga.rating || "0",
                author: manga.author || "",
                status: this.parseStatus(manga.status || ""),
            }));
        } catch (error) {
            console.error("Search error:", error);
            return [];
        }
    }

    // Get manga details - REQUIRED METHOD
    async getMangaDetails(mangaId) {
        try {
            const slug = mangaId.includes('-') ? mangaId.split('-').slice(1).join('-') : mangaId;
            const url = `${this.baseUrl}/title/${slug}`;
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
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
            
            // Extract description
            let description = "";
            const metaDesc = doc.querySelector('meta[name="description"]');
            if (metaDesc) {
                description = metaDesc.getAttribute("content") || "";
                description = this.cleanDescription(description);
            }
            
            // Extract genres
            const genres = [];
            const genreLinks = doc.querySelectorAll('a[href*="/genre/"]');
            for (const link of genreLinks) {
                const genre = link.textContent.trim();
                if (genre && !genres.includes(genre)) genres.push(genre);
            }
            
            // Extract author
            let author = "";
            const authorElements = doc.querySelectorAll('*');
            for (const element of authorElements) {
                if (element.textContent.toLowerCase().includes("author")) {
                    const nextElement = element.nextElementSibling;
                    if (nextElement) author = nextElement.textContent.trim();
                    break;
                }
            }
            
            // Extract status
            let status = 0;
            for (const element of authorElements) {
                if (element.textContent.toLowerCase().includes("status")) {
                    status = this.parseStatus(element.textContent);
                    break;
                }
            }
            
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
    }

    // Get chapters - REQUIRED METHOD
    async getChapters(mangaId) {
        try {
            const hash = mangaId.split("-")[0];
            const allItems = [];
            
            // Get first page
            const firstResponse = await fetch(
                `${this.baseUrl}/api/v2/manga/${hash}/chapters?limit=100&page=1&order[number]=desc`,
                { headers: this.headers }
            );
            
            if (!firstResponse.ok) return [];
            
            const firstData = await firstResponse.json();
            const lastPage = firstData.result?.pagination?.last_page || 1;
            
            // Fetch all pages
            for (let page = 1; page <= lastPage; page++) {
                const response = await fetch(
                    `${this.baseUrl}/api/v2/manga/${hash}/chapters?limit=100&page=${page}&order[number]=desc`,
                    { headers: this.headers }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.result?.items) {
                        allItems.push(...data.result.items);
                    }
                }
            }
            
            // Process chapters
            const chaptersMap = new Map();
            for (const item of allItems) {
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
            }
            
            // Sort by chapter number (descending)
            const chapters = Array.from(chaptersMap.values());
            chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
            
            return chapters;
        } catch (error) {
            console.error("Chapters error:", error);
            return [];
        }
    }

    // Get chapter pages - REQUIRED METHOD
    async getChapterPages(chapterId) {
        try {
            const parts = chapterId.split('/');
            const mangaSlug = parts[0];
            const url = `${this.baseUrl}/title/${mangaSlug}`;
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) return [];
            
            const html = await response.text();
            
            // Try JSON extraction
            const jsonRegex = /"images":\[(.*?)\]/;
            const match = html.match(jsonRegex);
            
            if (match) {
                try {
                    const imagesJson = `[${match[1]}]`;
                    const images = JSON.parse(imagesJson);
                    return images.map((img, index) => ({
                        url: img.url || img,
                        index: index
                    }));
                } catch (e) {
                    // JSON parsing failed, continue to HTML
                }
            }
            
            // HTML extraction fallback
            const pages = [];
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            
            const imgElements = doc.querySelectorAll('img');
            for (const img of imgElements) {
                const src = img.getAttribute('src') || img.getAttribute('data-src');
                if (src && (src.includes('.jpg') || src.includes('.png') || src.includes('.webp'))) {
                    const fullUrl = src.startsWith('http') ? src : 
                                   src.startsWith('//') ? `https:${src}` : `${this.baseUrl}${src}`;
                    pages.push({
                        url: fullUrl,
                        index: pages.length
                    });
                }
            }
            
            return pages;
        } catch (error) {
            console.error("Chapter pages error:", error);
            return [];
        }
    }

    // Helper methods
    cleanDescription(text) {
        if (!text) return "";
        
        const htmlEntities = {
            "&#x27;": "'",
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&#039;": "'",
        };
        
        let cleaned = text;
        for (const [entity, replacement] of Object.entries(htmlEntities)) {
            cleaned = cleaned.replace(new RegExp(entity, "g"), replacement);
        }
        
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
        cleaned = cleaned.replace(/[*_~`]/g, "");
        cleaned = cleaned.replace(/___.*$/, "");
        cleaned = cleaned.replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ");
        
        return cleaned.trim();
    }

    parseStatus(statusText) {
        if (!statusText) return 0;
        
        const text = statusText.toLowerCase();
        if (text.includes("ongoing")) return 1;
        if (text.includes("complete")) return 2;
        if (text.includes("hiatus")) return 6;
        if (text.includes("cancel")) return 3;
        return 0;
    }

    parseDate(dateStr) {
        if (!dateStr) return 0;
        
        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return Math.floor(date.getTime() / 1000);
            }
        } catch (error) {
            // Ignore date parsing errors
        }
        
        return 0;
    }
}

// MANGAYOMI REQUIRED EXPORT
// This is the key part - Mangayomi expects the class to be exported as module.exports
if (typeof module !== "undefined" && module.exports) {
    module.exports = Comix;
}

// Alternative export for different environments
if (typeof exports !== "undefined") {
    exports.Comix = Comix;
}

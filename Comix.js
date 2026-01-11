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

    async search(query, page, filters) {
        try {
            const url = `${this.baseUrl}/api/v2/manga?order[relevance]=desc&keyword=${encodeURIComponent(query)}&limit=100&page=${page}`;
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
            for (const link of genreLinks) {
                const genre = link.textContent.trim();
                if (genre && !genres.includes(genre)) {
                    genres.push(genre);
                }
            }
            
            // Extract author/artist
            let author = "";
            let artist = "";
            const infoElements = doc.querySelectorAll('div.info-item, span.info-item');
            for (const element of infoElements) {
                const text = element.textContent.toLowerCase();
                if (text.includes("author") || text.includes("mangaka")) {
                    const nextSibling = element.nextElementSibling;
                    if (nextSibling) author = nextSibling.textContent.trim();
                }
                if (text.includes("artist")) {
                    const nextSibling = element.nextElementSibling;
                    if (nextSibling) artist = nextSibling.textContent.trim();
                }
            }
            
            // Extract status
            let status = 0;
            for (const element of doc.querySelectorAll('*')) {
                if (element.textContent.toLowerCase().includes("status")) {
                    const parent = element.parentElement;
                    if (parent) {
                        const statusText = parent.textContent.toLowerCase();
                        status = this.parseStatus(statusText);
                        break;
                    }
                }
            }
            
            return {
                description,
                genres,
                status,
                author,
                artist,
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

    async getChapters(mangaId) {
        try {
            const hash = mangaId.split("-")[0];
            const allItems = [];
            
            // Get first page to know total pages
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
            
            // Process chapters (remove duplicates by chapter number)
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
            
            // Convert to array and sort by chapter number (descending)
            const chapters = Array.from(chaptersMap.values());
            chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
            
            return chapters;
        } catch (error) {
            console.error("Chapters error:", error);
            return [];
        }
    }

    async getChapterPages(chapterId) {
        try {
            const parts = chapterId.split('/');
            const mangaSlug = parts[0];
            const url = `${this.baseUrl}/title/${mangaSlug}`;
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) return [];
            
            const html = await response.text();
            
            // Method 1: Try to extract from JSON pattern
            const jsonRegex = /"images":\[(.*?)\]/g;
            const match = jsonRegex.exec(html);
            
            if (match) {
                try {
                    const jsonStr = `[${match[1]}]`;
                    const images = JSON.parse(jsonStr.replace(/\\"/g, '"'));
                    return images.map(img => ({
                        url: img.url || img.src || "",
                        index: images.indexOf(img)
                    }));
                } catch (e) {
                    // JSON parsing failed, try HTML method
                }
            }
            
            // Method 2: Extract from HTML
            const pages = [];
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            
            // Look for image elements
            const imgElements = doc.querySelectorAll('img[data-src], img[src], img[data-url]');
            for (const img of imgElements) {
                const src = img.getAttribute('data-src') || 
                           img.getAttribute('src') || 
                           img.getAttribute('data-url');
                
                if (src && (src.includes('comix') || src.includes('manga') || src.endsWith('.jpg') || src.endsWith('.png') || src.endsWith('.webp'))) {
                    const fullUrl = src.startsWith('http') ? src : `https:${src}`;
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
        
        // Remove markdown links
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
        
        // Remove special characters
        cleaned = cleaned.replace(/[*_~`]/g, "");
        
        // Remove trailing patterns
        cleaned = cleaned.replace(/___.*$/, "");
        
        // Normalize whitespace
        cleaned = cleaned.replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ");
        
        return cleaned.trim();
    }

    parseStatus(statusText) {
        const text = statusText.toLowerCase();
        if (text.includes("ongoing") || text.includes("publishing")) return 1;
        if (text.includes("complete") || text.includes("finished")) return 2;
        if (text.includes("hiatus")) return 6;
        if (text.includes("cancel")) return 3;
        return 0; // Unknown
    }

    parseDate(dateStr) {
        if (!dateStr) return 0;
        
        try {
            // Try to parse ISO date
            if (dateStr.includes('T')) {
                const date = new Date(dateStr);
                return Math.floor(date.getTime() / 1000);
            }
            
            // Try to extract YYYY-MM-DD
            const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (dateMatch) {
                const date = new Date(dateMatch[0]);
                return Math.floor(date.getTime() / 1000);
            }
        } catch (error) {
            console.error("Date parsing error:", error);
        }
        
        return 0;
    }

    // Optional: Get popular manga
    async getPopularManga(page) {
        return this.search("", page, null);
    }

    // Optional: Get latest manga
    async getLatestUpdates(page) {
        try {
            const url = `${this.baseUrl}/api/v2/manga?order[updated_at]=desc&limit=50&page=${page}`;
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
            console.error("Latest updates error:", error);
            return [];
        }
    }
}

// Export for Mangayomi
if (typeof module !== "undefined") {
    module.exports = Comix;
}

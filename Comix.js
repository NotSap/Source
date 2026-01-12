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
            console.log(`Searching for: ${query}, page: ${page}`);
            const url = `${this.baseUrl}/api/v2/manga?order[relevance]=desc&keyword=${encodeURIComponent(query)}&limit=100&page=${page || 1}`;
            console.log(`Fetching: ${url}`);
            
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
                console.error(`Search failed: ${response.status}`);
                return [];
            }
            
            const data = await response.json();
            const items = data.result?.items || [];
            console.log(`Found ${items.length} items`);
            
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
            console.log(`Getting details for: ${mangaId}`);
            const slug = mangaId.includes('-') ? mangaId.split('-').slice(1).join('-') : mangaId;
            const url = `${this.baseUrl}/title/${slug}`;
            console.log(`Fetching details from: ${url}`);
            
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
            
            // Extract genres from the page
            const genres = [];
            const genreLinks = doc.querySelectorAll('a[href*="/genre/"]');
            for (const link of genreLinks) {
                const genre = link.textContent.trim();
                if (genre && !genres.includes(genre)) {
                    genres.push(genre);
                }
            }
            
            // If no genres found, try alternative selectors
            if (genres.length === 0) {
                const altGenreElements = doc.querySelectorAll('.genre, .tag, [class*="genre"], [class*="tag"]');
                for (const element of altGenreElements) {
                    const genre = element.textContent.trim();
                    if (genre && genre.length < 30 && !genres.includes(genre)) {
                        genres.push(genre);
                    }
                }
            }
            
            // Extract author/artist
            let author = "";
            let artist = "";
            
            // Try to find author in the page
            const authorElements = doc.querySelectorAll('*');
            for (const element of authorElements) {
                const text = element.textContent.toLowerCase();
                if (text.includes("author") || text.includes("mangaka") || text.includes("writer")) {
                    const nextElement = element.nextElementSibling;
                    if (nextElement) {
                        author = nextElement.textContent.trim();
                        break;
                    }
                }
            }
            
            // Extract status
            let status = 0;
            for (const element of authorElements) {
                const text = element.textContent.toLowerCase();
                if (text.includes("status")) {
                    const statusText = text.replace("status", "").trim();
                    status = this.parseStatus(statusText);
                    break;
                }
            }
            
            console.log(`Found details: ${genres.length} genres, status: ${status}`);
            
            return {
                description,
                genres,
                status,
                author,
                artist: artist || author,
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
            console.log(`Getting chapters for: ${mangaId}`);
            const hash = mangaId.split("-")[0];
            const allItems = [];
            
            // Get first page to know total pages
            const firstUrl = `${this.baseUrl}/api/v2/manga/${hash}/chapters?limit=100&page=1&order[number]=desc`;
            console.log(`Fetching first page: ${firstUrl}`);
            
            const firstResponse = await fetch(firstUrl, { headers: this.headers });
            
            if (!firstResponse.ok) {
                console.error(`First chapters fetch failed: ${firstResponse.status}`);
                return [];
            }
            
            const firstData = await firstResponse.json();
            const lastPage = firstData.result?.pagination?.last_page || 1;
            console.log(`Total pages: ${lastPage}`);
            
            // Fetch all pages
            for (let page = 1; page <= lastPage; page++) {
                const url = `${this.baseUrl}/api/v2/manga/${hash}/chapters?limit=100&page=${page}&order[number]=desc`;
                console.log(`Fetching page ${page}: ${url}`);
                
                const response = await fetch(url, { headers: this.headers });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.result?.items) {
                        allItems.push(...data.result.items);
                        console.log(`Added ${data.result.items.length} items from page ${page}`);
                    }
                } else {
                    console.error(`Failed to fetch page ${page}`);
                }
            }
            
            console.log(`Total chapters found: ${allItems.length}`);
            
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
            
            console.log(`Returning ${chapters.length} unique chapters`);
            return chapters;
        } catch (error) {
            console.error("Chapters error:", error);
            return [];
        }
    }

    async getChapterPages(chapterId) {
        try {
            console.log(`Getting pages for chapter: ${chapterId}`);
            const parts = chapterId.split('/');
            const mangaSlug = parts[0];
            const url = `${this.baseUrl}/title/${mangaSlug}`;
            console.log(`Fetching chapter from: ${url}`);
            
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
                console.error(`Chapter fetch failed: ${response.status}`);
                return [];
            }
            
            const html = await response.text();
            
            // Method 1: Try to extract from JSON pattern (original JS method)
            const jsonRegex = /\\"images\\":\[([^\]]+)\\]/;
            const match = html.match(jsonRegex);
            
            if (match) {
                try {
                    console.log("Found JSON pattern, parsing...");
                    const imagesJson = '[{"url":"' + match[1].replace(/\\"/g, '').replace(/,/g, '},{"url":"') + '"}]';
                    const images = JSON.parse(imagesJson);
                    const pages = images.map((img, index) => ({
                        url: img.url,
                        index: index
                    }));
                    console.log(`Found ${pages.length} pages from JSON`);
                    return pages;
                } catch (e) {
                    console.error("JSON parsing failed:", e);
                }
            }
            
            // Method 2: Alternative JSON extraction
            const altRegex = /"images":\[(.*?)\]/;
            const altMatch = html.match(altRegex);
            
            if (altMatch) {
                try {
                    console.log("Found alternative JSON pattern");
                    const cleanJson = altMatch[1].replace(/\\"/g, '"');
                    const images = JSON.parse(`[${cleanJson}]`);
                    const pages = images.map((img, index) => ({
                        url: img.url || img,
                        index: index
                    }));
                    console.log(`Found ${pages.length} pages from alt JSON`);
                    return pages;
                } catch (e) {
                    console.error("Alt JSON parsing failed:", e);
                }
            }
            
            // Method 3: Extract from HTML
            console.log("Trying HTML extraction...");
            const pages = [];
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            
            // Look for image elements
            const imgElements = doc.querySelectorAll('img');
            for (const img of imgElements) {
                const src = img.getAttribute('data-src') || 
                           img.getAttribute('src') || 
                           img.getAttribute('data-url');
                
                if (src && (src.includes('.jpg') || src.includes('.png') || src.includes('.webp') || src.includes('.jpeg'))) {
                    const fullUrl = src.startsWith('http') ? src : 
                                   src.startsWith('//') ? `https:${src}` : 
                                   `${this.baseUrl}${src}`;
                    
                    if (!pages.some(p => p.url === fullUrl)) {
                        pages.push({
                            url: fullUrl,
                            index: pages.length
                        });
                    }
                }
            }
            
            console.log(`Found ${pages.length} pages from HTML`);
            
            // If still no pages, try script tags
            if (pages.length === 0) {
                const scriptTags = doc.querySelectorAll('script');
                for (const script of scriptTags) {
                    const content = script.textContent;
                    if (content.includes('images') && content.includes('http')) {
                        const urlMatches = content.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|png|webp|jpeg))/g);
                        if (urlMatches) {
                            urlMatches.forEach((url, index) => {
                                pages.push({
                                    url: url,
                                    index: index
                                });
                            });
                        }
                    }
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
            "&nbsp;": " ",
        };
        
        let cleaned = text;
        for (const [entity, replacement] of Object.entries(htmlEntities)) {
            cleaned = cleaned.replace(new RegExp(entity, "g"), replacement);
        }
        
        // Remove markdown links
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
        
        // Remove HTML tags
        cleaned = cleaned.replace(/<[^>]*>/g, "");
        
        // Remove special characters
        cleaned = cleaned.replace(/[*_~`]/g, "");
        
        // Remove trailing patterns
        cleaned = cleaned.replace(/___.*$/, "");
        
        // Normalize whitespace
        cleaned = cleaned.replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ");
        
        return cleaned.trim();
    }

    parseStatus(statusText) {
        if (!statusText) return 0;
        
        const text = statusText.toLowerCase();
        if (text.includes("ongoing") || text.includes("publishing") || text.includes("updating")) return 1;
        if (text.includes("complete") || text.includes("finished") || text.includes("ended")) return 2;
        if (text.includes("hiatus") || text.includes("on hiatus")) return 6;
        if (text.includes("cancel") || text.includes("cancelled")) return 3;
        if (text.includes("discontinue")) return 3;
        return 0; // Unknown
    }

    parseDate(dateStr) {
        if (!dateStr) return 0;
        
        try {
            // Try to parse ISO date
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return Math.floor(date.getTime() / 1000);
            }
            
            // Try common date formats
            const formats = [
                /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
                /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
                /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
            ];
            
            for (const format of formats) {
                const match = dateStr.match(format);
                if (match) {
                    let year, month, day;
                    
                    if (match[1].length === 4) {
                        // YYYY-MM-DD or YYYY/MM/DD
                        year = parseInt(match[1]);
                        month = parseInt(match[2]) - 1;
                        day = parseInt(match[3]);
                    } else {
                        // MM/DD/YYYY
                        month = parseInt(match[1]) - 1;
                        day = parseInt(match[2]);
                        year = parseInt(match[3]);
                    }
                    
                    const date = new Date(year, month, day);
                    if (!isNaN(date.getTime())) {
                        return Math.floor(date.getTime() / 1000);
                    }
                }
            }
        } catch (error) {
            console.error("Date parsing error:", error);
        }
        
        return 0;
    }

    // Optional: Get popular manga
    async getPopularManga(page) {
        try {
            console.log(`Getting popular manga, page: ${page}`);
            const url = `${this.baseUrl}/api/v2/manga?order[rating]=desc&limit=50&page=${page || 1}`;
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
            console.error("Popular manga error:", error);
            return [];
        }
    }

    // Optional: Get latest manga
    async getLatestUpdates(page) {
        try {
            console.log(`Getting latest updates, page: ${page}`);
            const url = `${this.baseUrl}/api/v2/manga?order[updated_at]=desc&limit=50&page=${page || 1}`;
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

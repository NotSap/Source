// Comix source for Mangayomi iOS
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
      const url = `${this.baseUrl}/api/v2/manga?order[relevance]=desc&keyword=${encodeURIComponent(query)}&limit=100`;
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) return [];
      
      const data = await response.json();
      const items = data.result.items;
      
      return items.map(manga => ({
        id: `${manga.hash_id}-${manga.slug}`,
        title: manga.title || "",
        image: manga.poster?.large || manga.poster?.medium || "",
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

  async getDetails(id) {
    try {
      const slug = id.includes('-') ? id.split('-').slice(1).join('-') : id;
      const url = `${this.baseUrl}/title/${slug}`;
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) {
        return {
          description: "",
          genres: [],
          status: 0,
          chapters: [],
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
      genreLinks.forEach(link => {
        const genre = link.textContent.trim();
        if (genre && !genres.includes(genre)) {
          genres.push(genre);
        }
      });
      
      // Extract status
      let status = 0;
      const statusElements = doc.querySelectorAll('span');
      for (const element of statusElements) {
        if (element.textContent.includes("Status")) {
          const parent = element.parentElement;
          if (parent) {
            const statusText = parent.textContent.replace("Status", "").trim().toLowerCase();
            status = this.parseStatus(statusText);
            break;
          }
        }
      }
      
      return {
        description,
        genres,
        status,
        chapters: [], // Will be populated by getChapters
      };
    } catch (error) {
      console.error("Details error:", error);
      return {
        description: "",
        genres: [],
        status: 0,
        chapters: [],
      };
    }
  }

  async getChapters(id) {
    try {
      const hash = id.split("-")[0];
      const allItems = [];
      
      // Get first page to know total pages
      const firstResponse = await fetch(
        `${this.baseUrl}/api/v2/manga/${hash}/chapters?limit=100&page=1&order[number]=desc`,
        { headers: this.headers }
      );
      
      if (!firstResponse.ok) return [];
      
      const firstData = await firstResponse.json();
      const lastPage = firstData.result.pagination.last_page;
      
      // Fetch all pages
      for (let page = 1; page <= lastPage; page++) {
        const response = await fetch(
          `${this.baseUrl}/api/v2/manga/${hash}/chapters?limit=100&page=${page}&order[number]=desc`,
          { headers: this.headers }
        );
        
        if (response.ok) {
          const data = await response.json();
          allItems.push(...data.result.items);
        }
      }
      
      // Process chapters
      const chaptersMap = new Map();
      for (const item of allItems) {
        const chapterNum = item.number.toString();
        if (!chaptersMap.has(chapterNum)) {
          chaptersMap.set(chapterNum, {
            id: `${id}/${item.chapter_id}-chapter-${item.number}`,
            title: item.name || `Chapter ${item.number}`,
            chapterNumber: parseFloat(item.number),
            uploadDate: this.parseDate(item.created_at || ""),
            scanlator: item.scanlation_group?.name || "Comix",
          });
        }
      }
      
      // Convert to array and sort
      return Array.from(chaptersMap.values())
        .sort((a, b) => b.chapterNumber - a.chapterNumber);
    } catch (error) {
      console.error("Chapters error:", error);
      return [];
    }
  }

  async getPages(chapterId) {
    try {
      const urlPart = chapterId.split('/')[0];
      const url = `${this.baseUrl}/title/${urlPart}`;
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) return [];
      
      const html = await response.text();
      
      // Try to extract images from JSON
      const regex = /\\"images\\":\[([^\]]+)\]/;
      const match = html.match(regex);
      
      if (match) {
        try {
          const imagesJson = `[${match[1].replace(/\\"/g, '"')}]`;
          const images = JSON.parse(imagesJson);
          return images.map(img => img.url);
        } catch (error) {
          return this.extractImagesFromHTML(html);
        }
      }
      
      return this.extractImagesFromHTML(html);
    } catch (error) {
      console.error("Pages error:", error);
      return [];
    }
  }

  // Helper methods
  extractImagesFromHTML(html) {
    const urls = [];
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    
    const imgElements = tempDiv.querySelectorAll('img[data-src], img[src*="comix"]');
    imgElements.forEach(img => {
      const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
      if (src && src.includes("comix")) {
        urls.push(src.startsWith("http") ? src : `https:${src}`);
      }
    });
    
    return urls;
  }

  cleanDescription(text) {
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

  parseStatus(status) {
    const statusLower = status.toLowerCase();
    if (statusLower.includes("ongoing")) return 1;
    if (statusLower.includes("complete")) return 2;
    if (statusLower.includes("hiatus")) return 6;
    if (statusLower.includes("cancel")) return 3;
    return 0;
  }

  parseDate(dateStr) {
    if (!dateStr) return 0;
    
    try {
      const dateMatch = dateStr.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        const date = new Date(dateMatch[0]);
        return Math.floor(date.getTime() / 1000);
      }
    } catch (error) {
      // Ignore date parsing errors
    }
    
    return 0;
  }

  // Optional: Get popular manga
  async getPopular(page) {
    return this.search("", page, null);
  }

  // Optional: Get latest updates
  async getLatestUpdates(page) {
    try {
      const url = `${this.baseUrl}/api/v2/manga?order[updated_at]=desc&limit=50&page=${page}`;
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) return [];
      
      const data = await response.json();
      const items = data.result.items;
      
      return items.map(manga => ({
        id: `${manga.hash_id}-${manga.slug}`,
        title: manga.title || "",
        image: manga.poster?.large || manga.poster?.medium || "",
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

// Export for Mangayomi iOS
if (typeof module !== "undefined" && module.exports) {
  module.exports = Comix;
}

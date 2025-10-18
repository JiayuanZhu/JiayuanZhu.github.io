// IndexedDB Database Manager
class DatabaseManager {
    constructor() {
        this.dbName = 'VocabularyDB';
        this.version = 1;
        this.db = null;
    }

    // Initialize the database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('Database error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create words object store if it doesn't exist
                if (!db.objectStoreNames.contains('words')) {
                    const wordsStore = db.createObjectStore('words', {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Create indexes for efficient querying
                    wordsStore.createIndex('english', 'english', { unique: false });
                    wordsStore.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
                    wordsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    wordsStore.createIndex('difficulty', 'difficulty', { unique: false });
                }

                // Create settings object store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Create statistics object store
                if (!db.objectStoreNames.contains('statistics')) {
                    const statsStore = db.createObjectStore('statistics', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    statsStore.createIndex('date', 'date', { unique: false });
                }

                console.log('Database structure created/updated');
            };
        });
    }

    // Generic method to perform transactions
    async transaction(storeName, mode = 'readonly') {
        if (!this.db) {
            await this.init();
        }
        return this.db.transaction([storeName], mode).objectStore(storeName);
    }

    // Words Operations
    async addWord(wordData) {
        const store = await this.transaction('words', 'readwrite');
        const word = {
            ...wordData,
            createdAt: Date.now(),
            lastReviewedAt: null,
            nextReviewDate: Date.now(), // Available for review immediately
            reviewCount: 0,
            correctCount: 0,
            incorrectCount: 0,
            difficulty: 0,
            streak: 0
        };
        
        return new Promise((resolve, reject) => {
            const request = store.add(word);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getWord(id) {
        const store = await this.transaction('words');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllWords() {
        const store = await this.transaction('words');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getWordsForReview(limit = 20) {
        const store = await this.transaction('words');
        const index = store.index('nextReviewDate');
        const now = Date.now();
        
        return new Promise((resolve, reject) => {
            const words = [];
            const request = index.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && words.length < limit) {
                    // Only include words that are due for review
                    if (cursor.value.nextReviewDate <= now) {
                        words.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    // If we don't have enough review words, add new words
                    if (words.length < limit) {
                        this.getNewWords(limit - words.length).then(newWords => {
                            resolve([...words, ...newWords]);
                        });
                    } else {
                        resolve(words);
                    }
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async getNewWords(limit = 10) {
        const store = await this.transaction('words');
        return new Promise((resolve, reject) => {
            const words = [];
            const request = store.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && words.length < limit) {
                    // New words are those never reviewed
                    if (cursor.value.reviewCount === 0) {
                        words.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(words);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async updateWord(id, updates) {
        const store = await this.transaction('words', 'readwrite');
        
        return new Promise(async (resolve, reject) => {
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const word = getRequest.result;
                if (!word) {
                    reject(new Error('Word not found'));
                    return;
                }
                
                const updatedWord = { ...word, ...updates };
                const updateRequest = store.put(updatedWord);
                
                updateRequest.onsuccess = () => resolve(updatedWord);
                updateRequest.onerror = () => reject(updateRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteWord(id) {
        const store = await this.transaction('words', 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async searchWords(query) {
        const allWords = await this.getAllWords();
        const lowercaseQuery = query.toLowerCase();
        
        return allWords.filter(word => 
            word.english.toLowerCase().includes(lowercaseQuery) ||
            word.chinese.includes(query)
        );
    }

    // Settings Operations
    async getSetting(key, defaultValue = null) {
        const store = await this.transaction('settings');
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => {
                resolve(request.result ? request.result.value : defaultValue);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async setSetting(key, value) {
        const store = await this.transaction('settings', 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put({ key, value });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Statistics Operations
    async addStatistic(data) {
        const store = await this.transaction('statistics', 'readwrite');
        const stat = {
            ...data,
            date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
            timestamp: Date.now()
        };
        
        return new Promise((resolve, reject) => {
            const request = store.add(stat);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getTodayStatistics() {
        const store = await this.transaction('statistics');
        const index = store.index('date');
        const today = new Date().toISOString().split('T')[0];
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(today);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getStatisticsByDateRange(startDate, endDate) {
        const store = await this.transaction('statistics');
        const index = store.index('date');
        const range = IDBKeyRange.bound(startDate, endDate);
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(range);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Utility Methods
    async clearAllData() {
        const stores = ['words', 'settings', 'statistics'];
        
        for (const storeName of stores) {
            const store = await this.transaction(storeName, 'readwrite');
            await new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    async exportData() {
        const words = await this.getAllWords();
        const settings = {};
        const settingsStore = await this.transaction('settings');
        
        // Get all settings
        await new Promise((resolve, reject) => {
            const request = settingsStore.getAll();
            request.onsuccess = () => {
                request.result.forEach(setting => {
                    settings[setting.key] = setting.value;
                });
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
        
        return {
            version: this.version,
            exportDate: new Date().toISOString(),
            words,
            settings
        };
    }

    async importData(data) {
        // Validate data structure
        if (!data.words || !Array.isArray(data.words)) {
            throw new Error('Invalid import data format');
        }

        // Clear existing data (optional, could also merge)
        await this.clearAllData();

        // Import words
        for (const word of data.words) {
            await this.addWord({
                english: word.english,
                chinese: word.chinese,
                example: word.example || ''
            });
        }

        // Import settings if available
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                await this.setSetting(key, value);
            }
        }

        return data.words.length;
    }

    // Get statistics summary
    async getStatisticsSummary() {
        const words = await this.getAllWords();
        const todayStats = await this.getTodayStatistics();
        
        const summary = {
            totalWords: words.length,
            masteredWords: words.filter(w => w.difficulty >= 4).length,
            learningWords: words.filter(w => w.reviewCount > 0 && w.difficulty < 4).length,
            newWords: words.filter(w => w.reviewCount === 0).length,
            todayReviewed: todayStats.filter(s => s.type === 'review').length,
            todayCorrect: todayStats.filter(s => s.type === 'review' && s.correct).length,
            streak: await this.getStreak()
        };
        
        return summary;
    }

    // Calculate learning streak
    async getStreak() {
        const store = await this.transaction('statistics');
        const index = store.index('date');
        
        return new Promise((resolve, reject) => {
            const dates = new Set();
            const request = index.openCursor(null, 'prev'); // Newest first
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    dates.add(cursor.value.date);
                    cursor.continue();
                } else {
                    // Calculate streak from dates
                    const sortedDates = Array.from(dates).sort().reverse();
                    let streak = 0;
                    let currentDate = new Date();
                    
                    for (const date of sortedDates) {
                        const dateStr = currentDate.toISOString().split('T')[0];
                        if (date === dateStr) {
                            streak++;
                            currentDate.setDate(currentDate.getDate() - 1);
                        } else {
                            break;
                        }
                    }
                    
                    resolve(streak);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
}

// Create and export a singleton instance
const dbManager = new DatabaseManager();
window.dbManager = dbManager; // Make it globally available

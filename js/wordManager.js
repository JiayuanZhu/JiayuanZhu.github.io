// Word Manager - Handles all word-related operations
class WordManager {
    constructor() {
        this.currentWords = [];
        this.currentIndex = 0;
        this.sessionStats = {
            reviewed: 0,
            correct: 0,
            incorrect: 0,
            startTime: Date.now()
        };
    }

    // Initialize word manager
    async init() {
        await dbManager.init();
        await this.loadTodayWords();
    }

    // Load words for today's session
    async loadTodayWords() {
        const dailyGoal = await dbManager.getSetting('dailyGoal', 20);
        this.currentWords = await memoryAlgorithm.getTodayWords(dailyGoal);
        this.currentIndex = 0;
        this.sessionStats = {
            reviewed: 0,
            correct: 0,
            incorrect: 0,
            startTime: Date.now()
        };
        
        // Shuffle words for variety
        this.shuffleWords();
        
        return this.currentWords;
    }

    // Shuffle current words
    shuffleWords() {
        for (let i = this.currentWords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.currentWords[i], this.currentWords[j]] = [this.currentWords[j], this.currentWords[i]];
        }
    }

    // Get current word
    getCurrentWord() {
        if (this.currentIndex >= this.currentWords.length) {
            return null;
        }
        return this.currentWords[this.currentIndex];
    }

    // Mark word as known/unknown
    async markWord(isKnown) {
        const word = this.getCurrentWord();
        if (!word) return null;

        // Update statistics
        this.sessionStats.reviewed++;
        if (isKnown) {
            this.sessionStats.correct++;
        } else {
            this.sessionStats.incorrect++;
        }

        // Review word using memory algorithm
        const result = await memoryAlgorithm.reviewWord(word.id, isKnown);

        // Move to next word
        this.currentIndex++;

        // Check if session is complete
        if (this.currentIndex >= this.currentWords.length) {
            await this.completeSession();
        }

        return {
            wordResult: result,
            hasNext: this.currentIndex < this.currentWords.length,
            sessionStats: this.sessionStats
        };
    }

    // Complete learning session
    async completeSession() {
        // Save session statistics
        const sessionDuration = Math.round((Date.now() - this.sessionStats.startTime) / 1000);
        
        await dbManager.addStatistic({
            type: 'session',
            wordsReviewed: this.sessionStats.reviewed,
            correctAnswers: this.sessionStats.correct,
            incorrectAnswers: this.sessionStats.incorrect,
            duration: sessionDuration,
            accuracy: this.sessionStats.reviewed > 0 
                ? Math.round((this.sessionStats.correct / this.sessionStats.reviewed) * 100)
                : 0
        });

        // Update streak
        const lastSession = await dbManager.getSetting('lastSessionDate');
        const today = new Date().toISOString().split('T')[0];
        
        if (lastSession !== today) {
            await dbManager.setSetting('lastSessionDate', today);
            const streak = await dbManager.getStreak();
            await dbManager.setSetting('currentStreak', streak);
        }
    }

    // Add a new word
    async addWord(english, chinese, example = '', unit = null) {
        // Check if word already exists
        const existingWords = await dbManager.searchWords(english);
        if (existingWords.some(w => w.english.toLowerCase() === english.toLowerCase())) {
            throw new Error('Word already exists');
        }

        const wordData = {
            english: english.trim(),
            chinese: chinese.trim(),
            example: example.trim()
        };

        // Parse unit: default to 0 if not specified or invalid
        const parsedUnit = unit ? parseInt(unit) : 0;
        wordData.unit = parsedUnit >= 0 ? parsedUnit : 0;

        const wordId = await dbManager.addWord(wordData);

        return wordId;
    }

    // Update an existing word
    async updateWord(id, english, chinese, example = '', unit = null) {
        const updates = {
            english: english.trim(),
            chinese: chinese.trim(),
            example: example.trim()
        };

        // Parse unit: default to 0 if not specified or invalid
        const parsedUnit = unit ? parseInt(unit) : 0;
        updates.unit = parsedUnit >= 0 ? parsedUnit : 0;

        return await dbManager.updateWord(id, updates);
    }

    // Delete a word
    async deleteWord(id) {
        return await dbManager.deleteWord(id);
    }

    // Get all words with optional search
    async getAllWords(searchQuery = '') {
        if (searchQuery) {
            return await dbManager.searchWords(searchQuery);
        }
        return await dbManager.getAllWords();
    }

    // Get word by ID
    async getWordById(id) {
        return await dbManager.getWord(id);
    }

    // Import words from JSON
    async importWords(jsonData) {
        let data;
        
        try {
            if (typeof jsonData === 'string') {
                data = JSON.parse(jsonData);
            } else {
                data = jsonData;
            }
        } catch (e) {
            throw new Error('Invalid JSON format');
        }

        // Validate data structure
        if (!Array.isArray(data) && !data.words) {
            throw new Error('Data must be an array of words or an object with a words array');
        }

        const words = Array.isArray(data) ? data : data.words;
        let imported = 0;
        let skipped = 0;
        const errors = [];

        for (const word of words) {
            try {
                // Validate required fields
                if (!word.english || !word.chinese) {
                    errors.push(`Missing required fields: ${JSON.stringify(word)}`);
                    skipped++;
                    continue;
                }

                // Check for duplicates
                const existing = await dbManager.searchWords(word.english);
                if (existing.some(w => w.english.toLowerCase() === word.english.toLowerCase())) {
                    skipped++;
                    continue;
                }

                // Add word with unit (default to 0 if not specified)
                const unit = word.unit !== undefined && word.unit !== null ? word.unit : 0;
                await this.addWord(word.english, word.chinese, word.example || '', unit);
                imported++;
            } catch (e) {
                errors.push(`Error importing "${word.english}": ${e.message}`);
                skipped++;
            }
        }

        return {
            imported,
            skipped,
            total: words.length,
            errors
        };
    }

    // Export words to JSON
    async exportWords() {
        const data = await dbManager.exportData();
        
        // Simplify for export
        const exportData = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            words: data.words.map(word => ({
                english: word.english,
                chinese: word.chinese,
                example: word.example,
                unit: word.unit !== undefined && word.unit !== null ? word.unit : 0,
                reviewCount: word.reviewCount,
                difficulty: word.difficulty,
                createdAt: word.createdAt
            }))
        };

        return JSON.stringify(exportData, null, 2);
    }

    // Get words by unit (for filtering)
    async getWordsByUnit(unit) {
        return await dbManager.getWordsByUnit(parseInt(unit));
    }

    // Get all available units
    async getAllUnits() {
        return await dbManager.getAllUnits();
    }

    // Get learning progress
    async getProgress() {
        const stats = await memoryAlgorithm.getLearningStats();
        const todayStats = await dbManager.getTodayStatistics();
        const streak = await dbManager.getStreak();

        return {
            totalWords: stats.totalWords,
            masteredWords: stats.mastered,
            learningWords: stats.learning,
            newWords: stats.newWords,
            todayReviewed: todayStats.filter(s => s.type === 'review').length,
            todayCorrect: todayStats.filter(s => s.type === 'review' && s.correct).length,
            accuracy: stats.averageRetention,
            streak: streak,
            overdueWords: stats.overdueWords
        };
    }

    // Get detailed statistics
    async getDetailedStats() {
        const summary = await dbManager.getStatisticsSummary();
        const schedule = await memoryAlgorithm.getUpcomingSchedule(7);
        const learningStats = await memoryAlgorithm.getLearningStats();

        return {
            summary,
            schedule,
            learningStats,
            todayProgress: {
                completed: this.sessionStats.reviewed,
                correct: this.sessionStats.correct,
                incorrect: this.sessionStats.incorrect,
                remaining: Math.max(0, this.currentWords.length - this.currentIndex)
            }
        };
    }

    // Reset current session
    resetSession() {
        this.currentIndex = 0;
        this.sessionStats = {
            reviewed: 0,
            correct: 0,
            incorrect: 0,
            startTime: Date.now()
        };
        this.shuffleWords();
    }

    // Get suggested daily goal based on performance
    async getSuggestedDailyGoal() {
        const stats = await this.getProgress();
        const currentGoal = await dbManager.getSetting('dailyGoal', 20);

        // Adjust based on accuracy and completion rate
        if (stats.accuracy > 80 && stats.todayReviewed >= currentGoal) {
            // Performing well, can increase
            return Math.min(currentGoal + 5, 50);
        } else if (stats.accuracy < 60 || stats.todayReviewed < currentGoal * 0.5) {
            // Struggling, reduce goal
            return Math.max(currentGoal - 5, 10);
        }

        return currentGoal;
    }

    // Check achievements
    async checkAchievements() {
        const stats = await this.getProgress();
        const achievements = [];

        // Check various achievement conditions
        if (stats.totalWords >= 10) {
            achievements.push({
                id: 'beginner',
                name: '初学者',
                description: '添加了10个单词',
                icon: '🌟'
            });
        }

        if (stats.streak >= 7) {
            achievements.push({
                id: 'week_streak',
                name: '坚持一周',
                description: '连续学习7天',
                icon: '🔥'
            });
        }

        if (stats.masteredWords >= 20) {
            achievements.push({
                id: 'master_20',
                name: '单词达人',
                description: '掌握20个单词',
                icon: '🏆'
            });
        }

        if (stats.accuracy >= 90) {
            achievements.push({
                id: 'accuracy_90',
                name: '记忆大师',
                description: '正确率达到90%',
                icon: '💎'
            });
        }

        return achievements;
    }
}

// Create and export singleton instance
const wordManager = new WordManager();
window.wordManager = wordManager;

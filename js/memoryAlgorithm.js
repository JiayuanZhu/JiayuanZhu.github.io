// Memory Algorithm - Spaced Repetition System
class MemoryAlgorithm {
    constructor() {
        // Default review intervals in days
        this.intervals = {
            standard: [1, 2, 4, 7, 15, 30],
            fast: [1, 2, 3, 5, 7, 14],
            slow: [1, 3, 7, 14, 30, 60]
        };
        
        // Difficulty adjustment factors
        this.difficultyFactors = {
            0: 2.5,   // New word
            1: 2.2,   // Very Hard
            2: 1.8,   // Hard  
            3: 1.3,   // Medium
            4: 1.0,   // Easy
            5: 0.8    // Very Easy (mastered)
        };
    }

    // Get the current interval type from settings
    async getIntervalType() {
        const type = await dbManager.getSetting('reviewInterval', 'standard');
        return this.intervals[type] || this.intervals.standard;
    }

    // Calculate next review date based on performance
    async calculateNextReview(word, isCorrect) {
        const intervals = await this.getIntervalType();
        let { reviewCount, difficulty, streak, incorrectCount } = word;
        
        // Update difficulty based on performance
        if (isCorrect) {
            // Increase difficulty (easier word)
            difficulty = Math.min(5, difficulty + 1);
            streak = (streak || 0) + 1;
        } else {
            // Decrease difficulty (harder word)
            difficulty = Math.max(1, difficulty - 1);
            streak = 0;
            incorrectCount = (incorrectCount || 0) + 1;
        }
        
        // Determine the interval index
        let intervalIndex = 0;
        if (isCorrect) {
            // Progress to next interval
            intervalIndex = Math.min(reviewCount, intervals.length - 1);
        } else {
            // Reset or reduce interval for incorrect answers
            if (incorrectCount > 2) {
                intervalIndex = 0; // Start over if failed multiple times
            } else {
                intervalIndex = Math.max(0, reviewCount - 2); // Go back 2 steps
            }
        }
        
        // Calculate days until next review
        let daysUntilReview = intervals[intervalIndex];
        
        // Apply difficulty factor
        const factor = this.difficultyFactors[difficulty] || 1.0;
        daysUntilReview = Math.round(daysUntilReview * factor);
        
        // Ensure minimum 1 day for incorrect answers
        if (!isCorrect) {
            daysUntilReview = Math.max(1, Math.min(daysUntilReview, 3));
        }
        
        // Calculate next review timestamp
        const nextReviewDate = Date.now() + (daysUntilReview * 24 * 60 * 60 * 1000);
        
        return {
            nextReviewDate,
            difficulty,
            streak,
            intervalIndex,
            daysUntilReview
        };
    }

    // Update word after review
    async reviewWord(wordId, isCorrect) {
        const word = await dbManager.getWord(wordId);
        if (!word) {
            throw new Error('Word not found');
        }
        
        const reviewResult = await this.calculateNextReview(word, isCorrect);
        
        // Update word statistics
        const updates = {
            lastReviewedAt: Date.now(),
            reviewCount: word.reviewCount + 1,
            correctCount: word.correctCount + (isCorrect ? 1 : 0),
            incorrectCount: word.incorrectCount + (isCorrect ? 0 : 1),
            difficulty: reviewResult.difficulty,
            streak: reviewResult.streak,
            nextReviewDate: reviewResult.nextReviewDate
        };
        
        // Update word in database
        await dbManager.updateWord(wordId, updates);
        
        // Record statistics
        await dbManager.addStatistic({
            type: 'review',
            wordId,
            correct: isCorrect,
            difficulty: reviewResult.difficulty,
            streak: reviewResult.streak,
            intervalDays: reviewResult.daysUntilReview
        });
        
        return {
            ...word,
            ...updates,
            daysUntilReview: reviewResult.daysUntilReview
        };
    }

    // Get words for today's session
    async getTodayWords(limit = 20) {
        // Get words due for review
        const reviewWords = await dbManager.getWordsForReview(limit);
        
        // Sort by priority (overdue words first)
        const now = Date.now();
        reviewWords.sort((a, b) => {
            // Prioritize overdue words
            const overdueA = now - a.nextReviewDate;
            const overdueB = now - b.nextReviewDate;
            
            if (overdueA > 0 && overdueB > 0) {
                return overdueB - overdueA; // Most overdue first
            }
            
            // Then prioritize by difficulty (harder words first)
            return a.difficulty - b.difficulty;
        });
        
        return reviewWords.slice(0, limit);
    }

    // Calculate retention rate for a word
    calculateRetention(word) {
        if (word.reviewCount === 0) {
            return 0;
        }
        return Math.round((word.correctCount / word.reviewCount) * 100);
    }

    // Get learning statistics
    async getLearningStats() {
        const words = await dbManager.getAllWords();
        
        const stats = {
            totalWords: words.length,
            newWords: 0,
            learning: 0,
            reviewing: 0,
            mastered: 0,
            averageRetention: 0,
            overdueWords: 0
        };
        
        const now = Date.now();
        let totalRetention = 0;
        let reviewedWords = 0;
        
        words.forEach(word => {
            // Categorize by learning stage
            if (word.reviewCount === 0) {
                stats.newWords++;
            } else if (word.difficulty >= 4) {
                stats.mastered++;
            } else if (word.reviewCount < 3) {
                stats.learning++;
            } else {
                stats.reviewing++;
            }
            
            // Check if overdue
            if (word.nextReviewDate < now) {
                stats.overdueWords++;
            }
            
            // Calculate average retention
            if (word.reviewCount > 0) {
                totalRetention += this.calculateRetention(word);
                reviewedWords++;
            }
        });
        
        if (reviewedWords > 0) {
            stats.averageRetention = Math.round(totalRetention / reviewedWords);
        }
        
        return stats;
    }

    // Predict when a word will be mastered
    predictMastery(word) {
        if (word.difficulty >= 4) {
            return { mastered: true, daysRemaining: 0 };
        }
        
        // Estimate based on current progress
        const remainingReviews = 5 - word.reviewCount;
        const averageInterval = 7; // Average days between reviews
        const estimatedDays = remainingReviews * averageInterval;
        
        // Adjust based on current performance
        const retentionRate = this.calculateRetention(word);
        const performanceFactor = retentionRate > 80 ? 0.8 : 1.2;
        
        return {
            mastered: false,
            daysRemaining: Math.round(estimatedDays * performanceFactor),
            estimatedDate: new Date(Date.now() + estimatedDays * performanceFactor * 24 * 60 * 60 * 1000)
        };
    }

    // Get review schedule for upcoming days
    async getUpcomingSchedule(days = 7) {
        const words = await dbManager.getAllWords();
        const schedule = {};
        const now = Date.now();
        const msPerDay = 24 * 60 * 60 * 1000;
        
        // Initialize schedule for each day
        for (let i = 0; i < days; i++) {
            const date = new Date(now + i * msPerDay);
            const dateStr = date.toISOString().split('T')[0];
            schedule[dateStr] = {
                date: dateStr,
                words: [],
                count: 0
            };
        }
        
        // Assign words to their review dates
        words.forEach(word => {
            const daysUntil = Math.floor((word.nextReviewDate - now) / msPerDay);
            if (daysUntil >= 0 && daysUntil < days) {
                const date = new Date(word.nextReviewDate);
                const dateStr = date.toISOString().split('T')[0];
                if (schedule[dateStr]) {
                    schedule[dateStr].words.push(word);
                    schedule[dateStr].count++;
                }
            }
        });
        
        return Object.values(schedule);
    }

    // Optimize review schedule to distribute workload
    async optimizeSchedule() {
        const dailyGoal = await dbManager.getSetting('dailyGoal', 20);
        const schedule = await this.getUpcomingSchedule(7);
        
        // Find days with too many or too few reviews
        const overloadedDays = [];
        const lightDays = [];
        
        schedule.forEach(day => {
            if (day.count > dailyGoal * 1.5) {
                overloadedDays.push(day);
            } else if (day.count < dailyGoal * 0.5) {
                lightDays.push(day);
            }
        });
        
        // Suggest redistribution if needed
        if (overloadedDays.length > 0) {
            return {
                needsOptimization: true,
                overloadedDays: overloadedDays.map(d => d.date),
                suggestion: `Consider spreading reviews across multiple days. You have ${overloadedDays.length} days with heavy load.`
            };
        }
        
        return {
            needsOptimization: false,
            message: 'Review schedule is well balanced.'
        };
    }
}

// Create and export singleton instance
const memoryAlgorithm = new MemoryAlgorithm();
window.memoryAlgorithm = memoryAlgorithm;

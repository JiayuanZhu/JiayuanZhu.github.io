// Sample data for testing
const sampleWords = [
    {
        english: "apple",
        chinese: "苹果",
        example: "I eat an apple every day."
    },
    {
        english: "book",
        chinese: "书",
        example: "She is reading a book."
    },
    {
        english: "cat",
        chinese: "猫",
        example: "The cat is sleeping on the sofa."
    },
    {
        english: "dog",
        chinese: "狗",
        example: "My dog likes to play fetch."
    },
    {
        english: "elephant",
        chinese: "大象",
        example: "The elephant is the largest land animal."
    },
    {
        english: "fish",
        chinese: "鱼",
        example: "Fish live in water."
    },
    {
        english: "green",
        chinese: "绿色",
        example: "The grass is green."
    },
    {
        english: "happy",
        chinese: "快乐的",
        example: "She looks very happy today."
    },
    {
        english: "ice cream",
        chinese: "冰淇淋",
        example: "I love chocolate ice cream."
    },
    {
        english: "jump",
        chinese: "跳",
        example: "The rabbit can jump very high."
    },
    {
        english: "kite",
        chinese: "风筝",
        example: "Let's fly a kite in the park."
    },
    {
        english: "lion",
        chinese: "狮子",
        example: "The lion is the king of the jungle."
    },
    {
        english: "moon",
        chinese: "月亮",
        example: "The moon is bright tonight."
    },
    {
        english: "nose",
        chinese: "鼻子",
        example: "He has a big nose."
    },
    {
        english: "orange",
        chinese: "橙子",
        example: "This orange is very sweet."
    },
    {
        english: "pencil",
        chinese: "铅笔",
        example: "Please write with a pencil."
    },
    {
        english: "queen",
        chinese: "女王",
        example: "The queen lives in a palace."
    },
    {
        english: "rain",
        chinese: "雨",
        example: "It's going to rain tomorrow."
    },
    {
        english: "sun",
        chinese: "太阳",
        example: "The sun rises in the east."
    },
    {
        english: "tree",
        chinese: "树",
        example: "This tree is very tall."
    }
];

// Function to load sample data
async function loadSampleData() {
    try {
        // Check if we already have words
        const existingWords = await dbManager.getAllWords();
        if (existingWords.length > 0) {
            console.log('Database already has words, skipping sample data');
            return;
        }

        // Add sample words
        for (const word of sampleWords) {
            await dbManager.addWord(word);
        }
        
        console.log(`Loaded ${sampleWords.length} sample words`);
        
        // Show notification
        if (window.app && window.app.showToast) {
            window.app.showToast(`已加载 ${sampleWords.length} 个示例单词`, 'success');
        }
        
        // Reload the current page
        if (window.app && window.app.initialized) {
            await window.app.loadCurrentWord();
            await window.app.updateProgress();
        }
    } catch (error) {
        console.error('Failed to load sample data:', error);
    }
}

// Auto-load sample data when the database is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(loadSampleData, 2000);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(loadSampleData, 2000);
    });
}

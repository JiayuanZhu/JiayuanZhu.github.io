// Main Application Controller
class App {
    constructor() {
        this.currentPage = 'learn';
        this.isCardFlipped = false;
        this.soundEnabled = true;
        this.initialized = false;
    }

    // Initialize the application
    async init() {
        try {
            // Initialize database and word manager
            await dbManager.init();
            await wordManager.init();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load settings
            await this.loadSettings();
            
            // Initialize UI
            await this.initializeUI();
            
            // Load first word
            await this.loadCurrentWord();
            
            this.initialized = true;
            console.log('App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showToast('初始化失败，请刷新页面重试', 'error');
        }
    }

    // Setup all event listeners
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.switchPage(e.target.closest('.nav-item').dataset.page));
        });

        // Menu button
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => this.toggleMenu());
        }

        // Learning page
        const wordCard = document.getElementById('wordCard');
        if (wordCard) {
            wordCard.addEventListener('click', () => this.flipCard());
        }

        document.getElementById('btnKnown')?.addEventListener('click', () => this.markWord(true));
        document.getElementById('btnUnknown')?.addEventListener('click', () => this.markWord(false));

        // Management page
        document.getElementById('addWordBtn')?.addEventListener('click', () => this.showAddWordModal());
        document.getElementById('importBtn')?.addEventListener('click', () => this.showImportModal());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.showExportModal());
        document.getElementById('searchInput')?.addEventListener('input', (e) => this.searchWords(e.target.value));

        // Forms
        document.getElementById('addWordForm')?.addEventListener('submit', (e) => this.handleAddWord(e));
        document.getElementById('editWordForm')?.addEventListener('submit', (e) => this.handleEditWord(e));
        document.getElementById('deleteWordBtn')?.addEventListener('click', () => this.handleDeleteWord());

        // Import/Export
        document.getElementById('confirmImportBtn')?.addEventListener('click', () => this.handleImport());
        document.getElementById('copyExportBtn')?.addEventListener('click', () => this.copyToClipboard());

        // Settings
        document.getElementById('dailyGoal')?.addEventListener('change', (e) => this.updateSetting('dailyGoal', parseInt(e.target.value)));
        document.getElementById('reviewInterval')?.addEventListener('change', (e) => this.updateSetting('reviewInterval', e.target.value));
        document.getElementById('fontSize')?.addEventListener('change', (e) => this.updateFontSize(e.target.value));
        document.getElementById('soundEnabled')?.addEventListener('change', (e) => this.updateSetting('soundEnabled', e.target.checked));
        document.getElementById('darkMode')?.addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
        document.getElementById('clearDataBtn')?.addEventListener('click', () => this.clearAllData());

        // GitHub Sync
        document.getElementById('saveGithubBtn')?.addEventListener('click', () => this.saveGithubConfig());
        document.getElementById('testGithubBtn')?.addEventListener('click', () => this.testGithubConnection());
        document.getElementById('syncBtn')?.addEventListener('click', () => this.smartSync());
        document.getElementById('uploadBtn')?.addEventListener('click', () => this.uploadToGithub());
        document.getElementById('downloadBtn')?.addEventListener('click', () => this.downloadFromGithub());

        // Modal close buttons
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });

        // Close modal on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal')) {
                    this.closeModal();
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    // Initialize UI with data
    async initializeUI() {
        // Update progress
        await this.updateProgress();
        
        // Load word list if on manage page
        if (this.currentPage === 'manage') {
            await this.loadWordList();
        }
        
        // Load statistics if on stats page
        if (this.currentPage === 'stats') {
            await this.loadStatistics();
        }
    }

    // Load application settings
    async loadSettings() {
        // Load saved settings
        this.soundEnabled = await dbManager.getSetting('soundEnabled', true);
        const fontSize = await dbManager.getSetting('fontSize', 'medium');
        const darkMode = await dbManager.getSetting('darkMode', false);
        const dailyGoal = await dbManager.getSetting('dailyGoal', 20);
        const reviewInterval = await dbManager.getSetting('reviewInterval', 'standard');

        // Apply settings to UI
        document.getElementById('soundEnabled').checked = this.soundEnabled;
        document.getElementById('fontSize').value = fontSize;
        document.getElementById('darkMode').checked = darkMode;
        document.getElementById('dailyGoal').value = dailyGoal;
        document.getElementById('reviewInterval').value = reviewInterval;

        // Apply visual settings
        this.updateFontSize(fontSize);
        this.toggleDarkMode(darkMode);

        // Load GitHub settings
        await this.loadGithubConfig();
    }

    // Switch between pages
    switchPage(pageName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        // Update page visibility
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        
        const pageElement = document.getElementById(`${pageName}Page`);
        if (pageElement) {
            pageElement.classList.remove('hidden');
            pageElement.classList.add('active');
        }

        this.currentPage = pageName;

        // Load page-specific data
        switch (pageName) {
            case 'learn':
                this.loadCurrentWord();
                break;
            case 'manage':
                this.loadWordList();
                break;
            case 'stats':
                this.loadStatistics();
                break;
        }
    }

    // Toggle mobile menu
    toggleMenu() {
        const menuBtn = document.getElementById('menuBtn');
        const navMenu = document.getElementById('navMenu');
        
        menuBtn?.classList.toggle('active');
        navMenu?.classList.toggle('active');
    }

    // Load and display current word
    async loadCurrentWord() {
        const word = wordManager.getCurrentWord();
        
        if (!word) {
            // No more words, show completion message
            document.getElementById('wordCard').classList.add('hidden');
            document.querySelector('.action-buttons').classList.add('hidden');
            document.getElementById('emptyState').classList.remove('hidden');
            return;
        }

        // Reset card flip state
        this.isCardFlipped = false;
        document.getElementById('wordCard').classList.remove('flipped');
        
        // Show card front, hide card back
        document.getElementById('cardFront').classList.remove('hidden');
        document.getElementById('cardBack').classList.remove('hidden');
        
        // Update card content
        document.getElementById('wordEnglish').textContent = word.english;
        document.getElementById('wordChinese').textContent = word.chinese;
        document.getElementById('wordExample').textContent = word.example || '暂无例句';
        
        // Update review info
        const retention = memoryAlgorithm.calculateRetention(word);
        document.getElementById('reviewCount').textContent = `复习: ${word.reviewCount}次`;
        document.getElementById('accuracy').textContent = `正确率: ${retention}%`;
        
        // Update card number
        document.getElementById('currentIndex').textContent = wordManager.currentIndex + 1;
        document.getElementById('totalWords').textContent = wordManager.currentWords.length;
        
        // Show card
        document.getElementById('wordCard').classList.remove('hidden');
        document.querySelector('.action-buttons').classList.remove('hidden');
        document.getElementById('emptyState').classList.add('hidden');
    }

    // Flip the word card
    flipCard() {
        if (!this.isCardFlipped) {
            this.isCardFlipped = true;
            document.getElementById('wordCard').classList.add('flipped');
            
            // Play sound if enabled
            if (this.soundEnabled) {
                this.playSound('flip');
            }
        }
    }

    // Mark word as known/unknown
    async markWord(isKnown) {
        if (!this.isCardFlipped) {
            this.showToast('请先查看答案', 'warning');
            return;
        }

        try {
            const result = await wordManager.markWord(isKnown);
            
            // Play feedback sound
            if (this.soundEnabled) {
                this.playSound(isKnown ? 'correct' : 'incorrect');
            }
            
            // Update progress
            await this.updateProgress();
            
            // Load next word or show completion
            if (result.hasNext) {
                await this.loadCurrentWord();
            } else {
                // Session complete
                this.showSessionComplete();
            }
        } catch (error) {
            console.error('Error marking word:', error);
            this.showToast('操作失败，请重试', 'error');
        }
    }

    // Show session completion screen
    showSessionComplete() {
        const stats = wordManager.sessionStats;
        const accuracy = stats.reviewed > 0 
            ? Math.round((stats.correct / stats.reviewed) * 100) 
            : 0;
        
        document.getElementById('wordCard').classList.add('hidden');
        document.querySelector('.action-buttons').classList.add('hidden');
        
        const emptyState = document.getElementById('emptyState');
        emptyState.classList.remove('hidden');
        emptyState.innerHTML = `
            <div class="empty-icon">🎉</div>
            <h3>今日学习完成！</h3>
            <p>复习了 ${stats.reviewed} 个单词</p>
            <p>正确: ${stats.correct} | 错误: ${stats.incorrect}</p>
            <p>正确率: ${accuracy}%</p>
            <button class="btn btn-primary" onclick="app.startNewSession()">开始新一轮</button>
        `;
    }

    // Start a new learning session
    async startNewSession() {
        wordManager.resetSession();
        await wordManager.loadTodayWords();
        await this.loadCurrentWord();
        await this.updateProgress();
    }

    // Update progress display
    async updateProgress() {
        const progress = await wordManager.getProgress();
        
        // Update header progress
        const progressText = document.getElementById('progressText');
        const streakText = document.getElementById('streakText');
        const progressFill = document.getElementById('progressFill');
        
        if (progressText) {
            const dailyGoal = await dbManager.getSetting('dailyGoal', 20);
            progressText.textContent = `今日进度: ${progress.todayReviewed}/${dailyGoal}`;
        }
        
        if (streakText) {
            streakText.textContent = `🔥 ${progress.streak}天`;
        }
        
        if (progressFill) {
            const dailyGoal = await dbManager.getSetting('dailyGoal', 20);
            const percentage = Math.min(100, (progress.todayReviewed / dailyGoal) * 100);
            progressFill.style.width = `${percentage}%`;
        }
    }

    // Load and display word list
    async loadWordList(searchQuery = '') {
        const words = await wordManager.getAllWords(searchQuery);
        const wordList = document.getElementById('wordList');
        const emptyState = document.getElementById('emptyWordList');
        
        if (words.length === 0) {
            wordList.innerHTML = '';
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            wordList.innerHTML = words.map(word => `
                <div class="word-item" data-id="${word.id}">
                    <div class="word-item-content">
                        <div class="word-item-english">${word.english}</div>
                        <div class="word-item-chinese">${word.chinese}</div>
                    </div>
                    <div class="word-item-meta">
                        <span>复习: ${word.reviewCount}次</span>
                        <span>难度: ${'⭐'.repeat(Math.max(1, word.difficulty))}</span>
                    </div>
                </div>
            `).join('');
            
            // Add click listeners
            wordList.querySelectorAll('.word-item').forEach(item => {
                item.addEventListener('click', () => this.showEditWordModal(item.dataset.id));
            });
        }
    }

    // Search words
    async searchWords(query) {
        await this.loadWordList(query);
    }

    // Show add word modal
    showAddWordModal() {
        document.getElementById('addWordModal').classList.remove('hidden');
        document.getElementById('inputEnglish').focus();
    }

    // Show edit word modal
    async showEditWordModal(wordId) {
        const word = await wordManager.getWordById(parseInt(wordId));
        if (!word) return;
        
        document.getElementById('editWordId').value = word.id;
        document.getElementById('editEnglish').value = word.english;
        document.getElementById('editChinese').value = word.chinese;
        document.getElementById('editExample').value = word.example || '';
        
        document.getElementById('editWordModal').classList.remove('hidden');
    }

    // Handle add word form submission
    async handleAddWord(e) {
        e.preventDefault();
        
        const english = document.getElementById('inputEnglish').value;
        const chinese = document.getElementById('inputChinese').value;
        const example = document.getElementById('inputExample').value;
        
        try {
            await wordManager.addWord(english, chinese, example);
            this.showToast('单词添加成功', 'success');
            this.closeModal();
            
            // Reset form
            e.target.reset();
            
            // Reload word list
            await this.loadWordList();
            
            // Update progress
            await this.updateProgress();
        } catch (error) {
            this.showToast(error.message || '添加失败', 'error');
        }
    }

    // Handle edit word form submission
    async handleEditWord(e) {
        e.preventDefault();
        
        const id = parseInt(document.getElementById('editWordId').value);
        const english = document.getElementById('editEnglish').value;
        const chinese = document.getElementById('editChinese').value;
        const example = document.getElementById('editExample').value;
        
        try {
            await wordManager.updateWord(id, english, chinese, example);
            this.showToast('单词更新成功', 'success');
            this.closeModal();
            
            // Reload word list
            await this.loadWordList();
        } catch (error) {
            this.showToast(error.message || '更新失败', 'error');
        }
    }

    // Handle delete word
    async handleDeleteWord() {
        const id = parseInt(document.getElementById('editWordId').value);
        
        if (confirm('确定要删除这个单词吗？')) {
            try {
                await wordManager.deleteWord(id);
                this.showToast('单词删除成功', 'success');
                this.closeModal();
                
                // Reload word list
                await this.loadWordList();
                
                // Update progress
                await this.updateProgress();
            } catch (error) {
                this.showToast(error.message || '删除失败', 'error');
            }
        }
    }

    // Show import modal
    showImportModal() {
        document.getElementById('importExportModal').classList.remove('hidden');
        document.getElementById('importExportTitle').textContent = '导入数据';
        document.getElementById('importSection').classList.remove('hidden');
        document.getElementById('exportSection').classList.add('hidden');
    }

    // Show export modal
    async showExportModal() {
        const exportData = await wordManager.exportWords();
        
        document.getElementById('importExportModal').classList.remove('hidden');
        document.getElementById('importExportTitle').textContent = '导出数据';
        document.getElementById('importSection').classList.add('hidden');
        document.getElementById('exportSection').classList.remove('hidden');
        document.getElementById('exportData').value = exportData;
    }

    // Handle import
    async handleImport() {
        const data = document.getElementById('importData').value;
        
        try {
            const result = await wordManager.importWords(data);
            
            let message = `成功导入 ${result.imported} 个单词`;
            if (result.skipped > 0) {
                message += `，跳过 ${result.skipped} 个重复单词`;
            }
            
            this.showToast(message, 'success');
            this.closeModal();
            
            // Clear import field
            document.getElementById('importData').value = '';
            
            // Reload word list
            await this.loadWordList();
            
            // Update progress
            await this.updateProgress();
        } catch (error) {
            this.showToast(error.message || '导入失败', 'error');
        }
    }

    // Copy to clipboard
    async copyToClipboard() {
        const text = document.getElementById('exportData').value;
        
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('已复制到剪贴板', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast('已复制到剪贴板', 'success');
        }
    }

    // Load and display statistics
    async loadStatistics() {
        const stats = await wordManager.getDetailedStats();
        
        // Update stat cards
        document.getElementById('totalWordsCount').textContent = stats.summary.totalWords;
        document.getElementById('masteredCount').textContent = stats.summary.masteredWords;
        document.getElementById('learningCount').textContent = stats.summary.learningWords;
        document.getElementById('todayCount').textContent = stats.summary.todayReviewed;
        
        // Update achievements
        const achievements = await wordManager.checkAchievements();
        const achievementContainer = document.querySelector('.achievements');
        
        if (achievementContainer) {
            // Update achievement display based on unlocked achievements
            const achievementElements = achievementContainer.querySelectorAll('.achievement');
            achievementElements.forEach(elem => {
                const achievementName = elem.querySelector('.achievement-name').textContent;
                const isUnlocked = achievements.some(a => a.name === achievementName);
                elem.classList.toggle('unlocked', isUnlocked);
                elem.classList.toggle('locked', !isUnlocked);
            });
        }
        
        // Draw learning chart (simple implementation)
        this.drawLearningChart(stats.schedule);
    }

    // Draw learning chart
    drawLearningChart(schedule) {
        const canvas = document.getElementById('learningChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 200;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw simple bar chart
        const barWidth = width / schedule.length;
        const maxCount = Math.max(...schedule.map(d => d.count), 1);
        
        schedule.forEach((day, index) => {
            const barHeight = (day.count / maxCount) * (height - 40);
            const x = index * barWidth + barWidth * 0.1;
            const y = height - barHeight - 20;
            
            // Draw bar
            ctx.fillStyle = '#4285F4';
            ctx.fillRect(x, y, barWidth * 0.8, barHeight);
            
            // Draw label
            ctx.fillStyle = '#5F6368';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            const date = new Date(day.date);
            const label = `${date.getMonth() + 1}/${date.getDate()}`;
            ctx.fillText(label, x + barWidth * 0.4, height - 5);
            
            // Draw count
            ctx.fillText(day.count.toString(), x + barWidth * 0.4, y - 5);
        });
    }

    // Update application setting
    async updateSetting(key, value) {
        await dbManager.setSetting(key, value);
        
        if (key === 'soundEnabled') {
            this.soundEnabled = value;
        }
        
        this.showToast('设置已保存', 'success');
    }

    // Update font size
    updateFontSize(size) {
        const root = document.documentElement;
        switch (size) {
            case 'small':
                root.style.fontSize = '14px';
                break;
            case 'large':
                root.style.fontSize = '18px';
                break;
            default:
                root.style.fontSize = '16px';
        }
        dbManager.setSetting('fontSize', size);
    }

    // Toggle dark mode
    toggleDarkMode(enabled) {
        document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
        dbManager.setSetting('darkMode', enabled);
    }

    // Clear all data
    async clearAllData() {
        if (confirm('确定要清除所有数据吗？此操作不可恢复！')) {
            if (confirm('请再次确认：是否清除所有单词和学习记录？')) {
                try {
                    await dbManager.clearAllData();
                    this.showToast('所有数据已清除', 'success');
                    
                    // Reload app
                    setTimeout(() => {
                        location.reload();
                    }, 1500);
                } catch (error) {
                    this.showToast('清除失败', 'error');
                }
            }
        }
    }

    // Close modal
    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    // Show toast notification
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        
        if (toast && toastMessage) {
            toastMessage.textContent = message;
            toast.className = `toast ${type}`;
            toast.classList.remove('hidden');
            
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 3000);
        }
    }

    // Play sound effect
    playSound(type) {
        // Simple audio feedback using Web Audio API
        if (!this.soundEnabled) return;
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        switch (type) {
            case 'correct':
                oscillator.frequency.value = 523; // C5
                gainNode.gain.value = 0.3;
                break;
            case 'incorrect':
                oscillator.frequency.value = 261; // C4
                gainNode.gain.value = 0.2;
                break;
            case 'flip':
                oscillator.frequency.value = 440; // A4
                gainNode.gain.value = 0.1;
                break;
        }
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    // Handle keyboard shortcuts
    handleKeyboard(e) {
        if (this.currentPage === 'learn' && this.isCardFlipped) {
            switch (e.key) {
                case 'ArrowLeft':
                case '1':
                    this.markWord(false);
                    break;
                case 'ArrowRight':
                case '2':
                    this.markWord(true);
                    break;
                case ' ':
                case 'Enter':
                    if (!this.isCardFlipped) {
                        this.flipCard();
                    }
                    break;
            }
        }
        
        // ESC to close modal
        if (e.key === 'Escape') {
            this.closeModal();
        }
    }

    // GitHub Sync Functions
    async loadGithubConfig() {
        const token = await dbManager.getSetting('github_token', '');
        const owner = await dbManager.getSetting('github_owner', '');
        const repo = await dbManager.getSetting('github_repo', '');
        const branch = await dbManager.getSetting('github_branch', 'main');

        document.getElementById('githubToken').value = token;
        document.getElementById('githubOwner').value = owner;
        document.getElementById('githubRepo').value = repo;
        document.getElementById('githubBranch').value = branch;

        // Update sync status
        await this.updateSyncStatus();
    }

    async saveGithubConfig() {
        const token = document.getElementById('githubToken').value.trim();
        const owner = document.getElementById('githubOwner').value.trim();
        const repo = document.getElementById('githubRepo').value.trim();
        const branch = document.getElementById('githubBranch').value.trim() || 'main';

        if (!token || !owner || !repo) {
            this.showToast('请填写所有必需字段', 'warning');
            return;
        }

        try {
            await syncManager.saveConfig(token, owner, repo, branch);
            this.showToast('GitHub配置已保存', 'success');
            await this.updateSyncStatus();
        } catch (error) {
            this.showToast('保存失败: ' + error.message, 'error');
        }
    }

    async testGithubConnection() {
        try {
            this.showToast('正在测试连接...', 'info');
            const result = await syncManager.testConnection();
            
            if (result.success) {
                this.showToast(`连接成功！仓库: ${result.repoName}`, 'success');
            }
        } catch (error) {
            this.showToast('连接失败: ' + error.message, 'error');
        }
    }

    async smartSync() {
        const configured = await syncManager.isConfigured();
        if (!configured) {
            this.showToast('请先在设置中配置GitHub', 'warning');
            this.switchPage('settings');
            return;
        }

        if (syncManager.syncing) {
            this.showToast('同步进行中，请稍候', 'warning');
            return;
        }

        try {
            this.showToast('正在智能同步...', 'info');
            const result = await syncManager.smartSync();
            
            this.showToast(result.message, 'success');
            
            // Reload word list and progress
            await this.loadWordList();
            await this.updateProgress();
            await this.updateSyncStatus();
        } catch (error) {
            console.error('Sync error:', error);
            this.showToast('同步失败: ' + error.message, 'error');
        }
    }

    async uploadToGithub() {
        const configured = await syncManager.isConfigured();
        if (!configured) {
            this.showToast('请先在设置中配置GitHub', 'warning');
            this.switchPage('settings');
            return;
        }

        if (!confirm('确定要上传本地数据到GitHub吗？这会覆盖远程数据。')) {
            return;
        }

        try {
            this.showToast('正在上传...', 'info');
            const result = await syncManager.uploadToGitHub();
            
            this.showToast(result.message, 'success');
            await this.updateSyncStatus();
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('上传失败: ' + error.message, 'error');
        }
    }

    async downloadFromGithub() {
        const configured = await syncManager.isConfigured();
        if (!configured) {
            this.showToast('请先在设置中配置GitHub', 'warning');
            this.switchPage('settings');
            return;
        }

        if (!confirm('确定要从GitHub下载数据吗？这会覆盖本地数据。')) {
            return;
        }

        try {
            this.showToast('正在下载...', 'info');
            const result = await syncManager.downloadFromGitHub();
            
            this.showToast(result.message + ` (导入 ${result.wordsImported} 个单词)`, 'success');
            
            // Reload word list and progress
            await this.loadWordList();
            await this.updateProgress();
            await this.updateSyncStatus();
        } catch (error) {
            console.error('Download error:', error);
            this.showToast('下载失败: ' + error.message, 'error');
        }
    }

    async updateSyncStatus() {
        const statusElement = document.getElementById('syncStatus');
        if (!statusElement) return;

        try {
            const status = await syncManager.getSyncStatus();
            
            if (!status.configured) {
                statusElement.innerHTML = '<p class="status-warning">⚠️ 未配置GitHub同步</p>';
                return;
            }

            let statusHtml = '<p class="status-success">✅ GitHub已配置</p>';
            
            if (status.lastSyncTime) {
                const timeStr = new Date(status.lastSyncTime).toLocaleString('zh-CN');
                statusHtml += `<p class="status-info">最后同步: ${timeStr}</p>`;
            } else {
                statusHtml += '<p class="status-info">尚未同步</p>';
            }

            statusElement.innerHTML = statusHtml;
        } catch (error) {
            console.error('Error updating sync status:', error);
        }
    }
}

// Create and initialize app when DOM is ready
const app = new App();

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// Make app globally available for debugging
window.app = app;

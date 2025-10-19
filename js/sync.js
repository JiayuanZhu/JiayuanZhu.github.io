// GitHub Sync Manager - Synchronize vocabulary data with GitHub
class SyncManager {
    constructor() {
        this.syncing = false;
        this.dataFilePath = 'data/vocabulary-data.json';
    }

    // Initialize sync manager
    async init() {
        // Load GitHub configuration
        const config = await this.getConfig();
        return !!config.token;
    }

    // Get GitHub configuration
    async getConfig() {
        const token = await dbManager.getSetting('github_token');
        const owner = await dbManager.getSetting('github_owner');
        const repo = await dbManager.getSetting('github_repo');
        const branch = await dbManager.getSetting('github_branch', 'main');

        return { token, owner, repo, branch };
    }

    // Save GitHub configuration
    async saveConfig(token, owner, repo, branch = 'main') {
        await dbManager.setSetting('github_token', token);
        await dbManager.setSetting('github_owner', owner);
        await dbManager.setSetting('github_repo', repo);
        await dbManager.setSetting('github_branch', branch);
    }

    // Check if GitHub is configured
    async isConfigured() {
        const config = await this.getConfig();
        return !!(config.token && config.owner && config.repo);
    }

    // Upload data to GitHub
    async uploadToGitHub() {
        if (this.syncing) {
            throw new Error('同步进行中，请稍候');
        }

        this.syncing = true;

        try {
            const config = await this.getConfig();
            
            if (!config.token || !config.owner || !config.repo) {
                throw new Error('请先配置GitHub信息');
            }

            // Export local data
            const localData = await dbManager.exportData();
            const content = JSON.stringify(localData, null, 2);
            const contentBase64 = btoa(unescape(encodeURIComponent(content)));

            // Get current file SHA (if exists)
            let sha = null;
            try {
                const currentFile = await this.getFileFromGitHub();
                sha = currentFile.sha;
            } catch (e) {
                // File doesn't exist yet, that's okay
                console.log('File does not exist, will create new');
            }

            // Prepare API request
            const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${this.dataFilePath}`;
            
            const body = {
                message: `Update vocabulary data - ${new Date().toISOString()}`,
                content: contentBase64,
                branch: config.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `上传失败: ${response.status}`);
            }

            const result = await response.json();
            
            // Save last sync time
            await dbManager.setSetting('last_sync_time', Date.now());
            await dbManager.setSetting('last_sync_sha', result.content.sha);

            return {
                success: true,
                sha: result.content.sha,
                message: '数据已上传到GitHub'
            };

        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        } finally {
            this.syncing = false;
        }
    }

    // Download data from GitHub
    async downloadFromGitHub() {
        if (this.syncing) {
            throw new Error('同步进行中，请稍候');
        }

        this.syncing = true;

        try {
            const config = await this.getConfig();
            
            if (!config.token || !config.owner || !config.repo) {
                throw new Error('请先配置GitHub信息');
            }

            // Get file from GitHub
            const fileData = await this.getFileFromGitHub();
            
            // Decode content
            const content = decodeURIComponent(escape(atob(fileData.content)));
            const remoteData = JSON.parse(content);

            // Import data (this will clear and replace local data)
            const result = await dbManager.importData(remoteData);

            // Save last sync info
            await dbManager.setSetting('last_sync_time', Date.now());
            await dbManager.setSetting('last_sync_sha', fileData.sha);

            return {
                success: true,
                wordsImported: result,
                message: '数据已从GitHub下载'
            };

        } catch (error) {
            console.error('Download error:', error);
            throw error;
        } finally {
            this.syncing = false;
        }
    }

    // Smart sync: merge local and remote data
    async smartSync() {
        if (this.syncing) {
            throw new Error('同步进行中，请稍候');
        }

        this.syncing = true;

        try {
            const config = await this.getConfig();
            
            if (!config.token || !config.owner || !config.repo) {
                throw new Error('请先配置GitHub信息');
            }

            // Get remote data
            let remoteData;
            let remoteSha;
            try {
                const fileData = await this.getFileFromGitHub();
                const content = decodeURIComponent(escape(atob(fileData.content)));
                remoteData = JSON.parse(content);
                remoteSha = fileData.sha;
            } catch (e) {
                // No remote file exists, upload local data
                console.log('No remote data found, uploading local data');
                return await this.uploadToGitHub();
            }

            // Get local data
            const localData = await dbManager.exportData();

            // Merge data
            const mergedData = await this.mergeData(localData, remoteData);

            // Import merged data locally
            await dbManager.importData(mergedData);

            // Upload merged data to GitHub
            const content = JSON.stringify(mergedData, null, 2);
            const contentBase64 = btoa(unescape(encodeURIComponent(content)));

            const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${this.dataFilePath}`;
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Merge vocabulary data - ${new Date().toISOString()}`,
                    content: contentBase64,
                    branch: config.branch,
                    sha: remoteSha
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `同步失败: ${response.status}`);
            }

            const result = await response.json();

            // Save last sync info
            await dbManager.setSetting('last_sync_time', Date.now());
            await dbManager.setSetting('last_sync_sha', result.content.sha);

            return {
                success: true,
                message: '数据已智能合并并同步',
                merged: true
            };

        } catch (error) {
            console.error('Smart sync error:', error);
            throw error;
        } finally {
            this.syncing = false;
        }
    }

    // Merge local and remote data
    async mergeData(localData, remoteData) {
        // Create a map of words by english word (case insensitive)
        const wordMap = new Map();

        // Add remote words first
        if (remoteData.words) {
            remoteData.words.forEach(word => {
                const key = word.english.toLowerCase();
                wordMap.set(key, { ...word, source: 'remote' });
            });
        }

        // Merge local words (prefer local if more recent or has more reviews)
        if (localData.words) {
            localData.words.forEach(localWord => {
                const key = localWord.english.toLowerCase();
                
                if (wordMap.has(key)) {
                    const remoteWord = wordMap.get(key);
                    
                    // Merge strategy: keep the word with more review data
                    if (localWord.reviewCount > remoteWord.reviewCount) {
                        wordMap.set(key, { ...localWord, source: 'local-preferred' });
                    } else if (localWord.reviewCount === remoteWord.reviewCount) {
                        // If same review count, prefer more recent
                        if (localWord.lastReviewedAt > remoteWord.lastReviewedAt) {
                            wordMap.set(key, { ...localWord, source: 'local-preferred' });
                        }
                    }
                    // Otherwise keep remote
                } else {
                    // New word only in local
                    wordMap.set(key, { ...localWord, source: 'local-only' });
                }
            });
        }

        // Convert map back to array
        const mergedWords = Array.from(wordMap.values()).map(word => {
            // Remove source tag
            const { source, ...cleanWord } = word;
            return cleanWord;
        });

        // Merge settings (prefer local settings)
        const mergedSettings = {
            ...(remoteData.settings || {}),
            ...(localData.settings || {})
        };

        return {
            version: localData.version || remoteData.version || 1,
            exportDate: new Date().toISOString(),
            words: mergedWords,
            settings: mergedSettings
        };
    }

    // Get file from GitHub
    async getFileFromGitHub() {
        const config = await this.getConfig();
        
        const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${this.dataFilePath}?ref=${config.branch}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `token ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('文件不存在');
            }
            throw new Error(`获取文件失败: ${response.status}`);
        }

        return await response.json();
    }

    // Get last sync time
    async getLastSyncTime() {
        const timestamp = await dbManager.getSetting('last_sync_time');
        if (!timestamp) return null;
        
        return new Date(timestamp);
    }

    // Test GitHub connection
    async testConnection() {
        try {
            const config = await this.getConfig();
            
            if (!config.token || !config.owner || !config.repo) {
                throw new Error('配置信息不完整');
            }

            // Test by getting repo info
            const url = `https://api.github.com/repos/${config.owner}/${config.repo}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Token无效或已过期');
                } else if (response.status === 404) {
                    throw new Error('仓库不存在');
                }
                throw new Error(`连接失败: ${response.status}`);
            }

            const repo = await response.json();
            
            return {
                success: true,
                repoName: repo.full_name,
                private: repo.private
            };

        } catch (error) {
            console.error('Connection test error:', error);
            throw error;
        }
    }

    // Get sync status
    async getSyncStatus() {
        const configured = await this.isConfigured();
        
        if (!configured) {
            return {
                configured: false,
                message: '未配置GitHub同步'
            };
        }

        const lastSyncTime = await this.getLastSyncTime();
        const lastSyncSha = await dbManager.getSetting('last_sync_sha');

        return {
            configured: true,
            lastSyncTime,
            lastSyncSha,
            syncing: this.syncing
        };
    }
}

// Create and export singleton instance
const syncManager = new SyncManager();
window.syncManager = syncManager;


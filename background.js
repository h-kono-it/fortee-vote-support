// Background Service Worker for Fortee Talk Vote Support

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Fortee Talk Vote Support installed');
        // Initialize storage
        chrome.storage.local.get(['votes', 'memos'], (result) => {
            if (!result.votes) {
                chrome.storage.local.set({ votes: {} });
            }
            if (!result.memos) {
                chrome.storage.local.set({ memos: {} });
            }
        });
    }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    if (request.action === 'vote_recorded') {
        console.log('Vote recorded:', request.uuid, request.score);
        sendResponse({ success: true });
    } else if (request.action === 'memo_saved') {
        console.log('Memo saved:', request.uuid);
        sendResponse({ success: true });
    }
});

// Handle storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        console.log('Storage changed:', changes);
        // Notify popup or content scripts if needed
    }
});

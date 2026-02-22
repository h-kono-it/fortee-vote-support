// Popup Script for Fortee Talk Vote Support

let allVotes = {};
let allMemos = {};
let currentFilter = 'all';
let currentScoreFilter = null;

document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
});

function initializePopup() {
    console.log('Popup initialized');
    
    // Load data from storage
    chrome.storage.local.get(['votes', 'memos'], (result) => {
        allVotes = result.votes || {};
        allMemos = result.memos || {};
        updateStats();
    });
    
    // Setup filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            applyFilterToPage();
        });
    });
    
    // Setup score filter buttons
    document.querySelectorAll('.score-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.classList.toggle('active');
            const scores = [];
            document.querySelectorAll('.score-btn.active').forEach(b => {
                scores.push(b.dataset.score);
            });
            currentScoreFilter = scores.length > 0 ? scores : null;
            applyFilterToPage();
        });
    });
    
    // Export buttons
    document.getElementById('export-btn').addEventListener('click', exportAsJSON);
    document.getElementById('export-csv-btn').addEventListener('click', exportAsCSV);
    

}

function updateStats() {
    const memoCount = Object.keys(allMemos).length;
    document.getElementById('memo-count').textContent = memoCount;
}

function getFilteredVotes() {
    let filtered = Object.entries(allVotes);
    
    if (currentFilter === 'voted') {
        filtered = filtered.filter(([_, vote]) => vote && vote.score !== null);
    } else if (currentFilter === 'unvoted') {
        filtered = filtered.filter(([_, vote]) => !vote || vote.score === null);
    }
    
    if (currentScoreFilter) {
        filtered = filtered.filter(([_, vote]) => 
            vote && currentScoreFilter.includes(String(vote.score))
        );
    }
    
    return filtered;
}

function applyFilterToPage() {
    // fortee.jp のタブを URL で直接探してメッセージを送る
    chrome.tabs.query({ url: 'https://fortee.jp/*' }, (tabs) => {
        if (tabs.length === 0) {
            console.log('No Fortee tab found');
            return;
        }

        chrome.tabs.sendMessage(tabs[0].id, {
            action: 'apply_filter',
            filter: currentFilter,
            scoreFilter: currentScoreFilter,
            votes: allVotes
        }).catch(err => {
            console.log('Could not send message to content script:', err);
        });
    });
}

function exportAsJSON() {
    const data = {
        exportDate: new Date().toISOString(),
        statistics: {
            totalMemos: Object.keys(allMemos).length
        },
        memos: allMemos
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
    downloadFile(blob, `fortee-votes-${Date.now()}.json`);
    
    displayStatus('JSON exported successfully!', false);
    setTimeout(() => clearStatus(), 3000);
}

function exportAsCSV() {
    let csv = 'Title,Memo\n';

    Object.entries(allMemos).forEach(([title, memo]) => {
        const escapedTitle = `"${title.replace(/"/g, '""')}"`;
        const escapedMemo = `"${memo.replace(/"/g, '""')}"`;
        csv += `${escapedTitle},${escapedMemo}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadFile(blob, `fortee-memos-${Date.now()}.csv`);

    displayStatus('CSV exported successfully!', false);
    setTimeout(() => clearStatus(), 3000);
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}


function displayStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.classList.add('show');
    if (isError) {
        statusEl.classList.add('error');
    } else {
        statusEl.classList.remove('error');
    }
}

function clearStatus() {
    const statusEl = document.getElementById('status');
    statusEl.classList.remove('show');
}

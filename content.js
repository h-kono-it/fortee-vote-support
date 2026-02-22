// Content Script for Fortee Talk Vote Support
// This script runs in the context of the Fortee page

console.log('Fortee Talk Vote Support: Content script loaded');

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeVotingSupport);

// Also try to initialize immediately in case DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeVotingSupport);
} else {
    initializeVotingSupport();
}

function initializeVotingSupport() {
    console.log('Initializing voting support...');

    // Vue.js の動的レンダリング後に proposal4staffvote が追加されるのを監視
    const observer = new MutationObserver(() => {
        injectMemoFields();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 初回（すでにレンダリング済みの場合）
    injectMemoFields();
}

function injectMemoFields() {
    const proposals = document.querySelectorAll('div.proposal4staffvote');
    if (proposals.length === 0) return;

    chrome.storage.local.get(['memos'], (result) => {
        const memos = result.memos || {};

        proposals.forEach((proposal) => {
            if (proposal.querySelector('.fortee-memo')) return; // 注入済みはスキップ

            const titleEl = proposal.querySelector('.title h2');
            if (!titleEl) return;

            const title = titleEl.textContent.trim();
            const savedMemo = memos[title] || '';

            const memoDiv = document.createElement('div');
            memoDiv.className = 'fortee-memo';
            memoDiv.innerHTML = `<textarea class="fortee-memo-input" placeholder="メモ...">${savedMemo}</textarea>`;
            proposal.appendChild(memoDiv);

            const textarea = memoDiv.querySelector('textarea');
            let timer;
            textarea.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    chrome.storage.local.get(['memos'], (r) => {
                        const m = r.memos || {};
                        if (textarea.value.trim()) {
                            m[title] = textarea.value;
                        } else {
                            delete m[title];
                        }
                        chrome.storage.local.set({ memos: m });
                    });
                }, 1000);
            });
        });
    });
}

function injectVotingUI(votes, memos) {
    // Find proposal items - adjust selector based on actual Fortee HTML structure
    const proposals = document.querySelectorAll('[data-v-96a3a3d2] .proposal') ||
                     document.querySelectorAll('.proposal');
    
    console.log(`Found ${proposals.length} proposals`);
    
    proposals.forEach((proposal, index) => {
        // Try to extract proposal data
        const uuid = extractProposalUUID(proposal, index);
        const title = extractProposalTitle(proposal);
        
        // Add voting widget if not already present
        if (!proposal.querySelector('.fortee-vote-widget')) {
            const widget = createVotingWidget(uuid, votes[uuid], memos[uuid] || '');
            proposal.appendChild(widget);
        }
    });
}

function extractProposalUUID(proposal, index) {
    // Try multiple methods to get UUID
    let uuid = proposal.dataset.uuid || 
               proposal.dataset.proposalId ||
               proposal.dataset.id;
    
    if (!uuid) {
        // Generate a pseudo-UUID based on content if not found
        const title = extractProposalTitle(proposal);
        uuid = `proposal-${index}-${title.substring(0, 10).replace(/[^a-z0-9]/gi, '')}`;
    }
    
    return uuid;
}

function extractProposalTitle(proposal) {
    const titleEl = proposal.querySelector('h2, .title, [data-title]');
    return titleEl ? titleEl.textContent.trim() : 'Unknown';
}

function createVotingWidget(uuid, vote, memo) {
    const widget = document.createElement('div');
    widget.className = 'fortee-vote-widget';
    widget.dataset.uuid = uuid;
    
    const currentScore = vote ? vote.score : null;
    const isVoted = currentScore !== null && currentScore !== undefined;
    
    widget.innerHTML = `
        <div class="vote-widget-header">
            <span class="vote-widget-label">投票: </span>
            <span class="vote-status ${isVoted ? 'voted' : 'unvoted'}">
                ${isVoted ? `${currentScore > 0 ? '+' : ''}${currentScore}` : '未投票'}
            </span>
        </div>
        <div class="vote-buttons">
            <button class="vote-btn" data-score="2" title="+2: 絶対採択したい">+2</button>
            <button class="vote-btn" data-score="1" title="+1: 採択したい">+1</button>
            <button class="vote-btn" data-score="0" title="0: どちらでもない">0</button>
            <button class="vote-btn" data-score="-1" title="-1: 採択したくない">-1</button>
            <button class="vote-btn" data-score="-2" title="-2: 絶対採択したくない">-2</button>
        </div>
        <div class="memo-widget${memo ? ' has-memo' : ''}">
            <textarea class="memo-input" placeholder="メモ..." title="Shift+Mで編集">${memo}</textarea>
        </div>
    `;
    
    // Setup vote buttons
    widget.querySelectorAll('.vote-btn').forEach(btn => {
        const score = parseInt(btn.dataset.score);
        if (currentScore === score) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            recordVote(uuid, score, extractProposalTitle(widget.closest('.proposal') || document.body));
            updateVoteDisplay(widget, score);
        });
    });
    
    // Setup memo saving (with debounce)
    const memoInput = widget.querySelector('.memo-input');
    let memoTimeout;
    memoInput.addEventListener('input', () => {
        clearTimeout(memoTimeout);
        memoTimeout = setTimeout(() => {
            saveMemo(uuid, memoInput.value);
        }, 1000);
    });
    
    return widget;
}

function updateVoteDisplay(widget, score) {
    const status = widget.querySelector('.vote-status');
    const buttons = widget.querySelectorAll('.vote-btn');
    
    buttons.forEach(btn => btn.classList.remove('active'));
    buttons.forEach(btn => {
        if (parseInt(btn.dataset.score) === score) {
            btn.classList.add('active');
        }
    });
    
    status.textContent = `${score > 0 ? '+' : ''}${score}`;
    status.classList.remove('unvoted');
    status.classList.add('voted');
}

function recordVote(uuid, score, title) {
    chrome.storage.local.get(['votes'], (result) => {
        const votes = result.votes || {};
        votes[uuid] = {
            score: score,
            title: title,
            timestamp: new Date().toISOString()
        };
        
        chrome.storage.local.set({ votes }, () => {
            console.log('Vote recorded:', uuid, score);
            
            // Notify popup if open
            chrome.runtime.sendMessage({
                action: 'vote_recorded',
                uuid: uuid,
                score: score
            }).catch(() => {
                // Popup not open, that's ok
            });
        });
    });
}

function saveMemo(uuid, memo) {
    chrome.storage.local.get(['memos'], (result) => {
        const memos = result.memos || {};
        
        if (memo.trim()) {
            memos[uuid] = memo;
        } else {
            delete memos[uuid];
        }
        
        chrome.storage.local.set({ memos }, () => {
            console.log('Memo saved:', uuid);
        });
    });
}

function setupKeyboardShortcuts(votes) {
    let selectedIndex = 0;
    const proposals = document.querySelectorAll('[data-v-96a3a3d2] .proposal') ||
                     document.querySelectorAll('.proposal');
    
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            // Allow Shift+M to edit memo
            if (e.shift && e.key === 'M') {
                e.preventDefault();
                // Focus on current proposal's memo
                const current = proposals[selectedIndex];
                if (current) {
                    const memo = current.querySelector('.memo-input');
                    if (memo) memo.focus();
                }
            }
            return; // Don't process other shortcuts in form fields
        }
        
        // j/k for up/down navigation
        if (e.key === 'j') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, proposals.length - 1);
            scrollToProposal(proposals[selectedIndex]);
        } else if (e.key === 'k') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            scrollToProposal(proposals[selectedIndex]);
        }
        
        // Number keys 1-5 for scoring
        if (['1', '2', '3', '4', '5'].includes(e.key)) {
            e.preventDefault();
            const scores = [2, 1, 0, -1, -2];
            const scoreIndex = parseInt(e.key) - 1;
            const score = scores[scoreIndex];
            
            const proposal = proposals[selectedIndex];
            if (proposal) {
                const widget = proposal.querySelector('.fortee-vote-widget');
                if (widget) {
                    const uuid = widget.dataset.uuid;
                    const btn = widget.querySelector(`[data-score="${score}"]`);
                    if (btn) btn.click();
                }
            }
        }
    });
}

function scrollToProposal(proposal) {
    proposal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'apply_filter') {
        applyDOMFilter(request.filter, request.scoreFilter, request.votes);
        sendResponse({ success: true });
    }
});

function applyDOMFilter(filter, scoreFilter, votes) {
    // div.proposal4staffvote を各プロポーザルカードの単位として扱う
    const proposals = document.querySelectorAll('div.proposal4staffvote');
    console.log('[ForteeFilter] applyDOMFilter called', { filter, scoreFilter, count: proposals.length });

    proposals.forEach((proposal) => {
        // div.proposal4staffvote 内の .btn.btn-primary で投票済みかどうかを判定
        const activeBtn = proposal.querySelector('.btn.btn-primary');

        let shouldShow = true;
        let currentScore = null;

        if (activeBtn) {
            // 投票済み：.btn.btn-primary の inner-text から点数を取得
            const btnText = activeBtn.textContent.trim();
            currentScore = parseInt(btnText);
        }

        // 投票状態フィルタの適用
        if (filter === 'voted') {
            shouldShow = activeBtn !== null; // .btn.btn-primary が存在 = 投票済み
        } else if (filter === 'unvoted') {
            shouldShow = activeBtn === null; // .btn.btn-primary が存在しない = 未投票
        }

        // スコアフィルタの適用
        if (shouldShow && scoreFilter && scoreFilter.length > 0) {
            if (currentScore !== null && !isNaN(currentScore)) {
                shouldShow = scoreFilter.includes(String(currentScore));
            } else {
                shouldShow = false;
            }
        }

        // 表示/非表示の切り替え
        console.log('[ForteeFilter]', { activeBtn: !!activeBtn, currentScore, shouldShow });
        proposal.style.display = shouldShow ? 'block' : 'none';
    });
}

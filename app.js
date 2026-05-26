/* ==========================================
   Midias AI: Frontend Core JavaScript Engine
   ========================================== */

// State Object
const state = {
    apiKey: '',
    activeHustle: null,
    nicheIdeas: [],
    tasks: [],
    expenses: [],
    messages: [
        {
            role: 'assistant',
            text: `**Midias is online.** ⚡ Running on the **free tier** (Qwen 3 235B via Cerebras).

Ready to help you build a side hustle from real-time trends with a $100 budget.

Click one of the quick actions below, or type anything to get started! Upgrade to **Gemini 3 Pro** anytime by adding your API key.`
        }
    ],
    vault: {
        copy: '',
        persona: '',
        swot: '',
        assets: ''
    },
    initialBudget: 100,
    targetRevenue: 20000,
    trends: [],
    trendsGeo: 'US',
    trendsLastFetched: 0, // epoch ms — used to throttle AI filter calls
    personaMode: 'bootstrapper', // 'bootstrapper', 'aggressive', or 'audience'
    isPro: false
};

// Supabase Client and Session State
let supabaseClient = null;
let currentUser = null;
let authMode = 'signin'; // 'signin' or 'signup'

// Default Tasks if none exist
const DEFAULT_EXPENSES = [];

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    loadStateFromLocalStorage();
    initEventListeners();
    renderAll();
    checkPaymentStatus();
    logTerminal('Midias AI System v1.0 initialized.', 'info');
    
    const onboardingModal = document.getElementById('onboarding-modal');
    
    // Free tier works without any API key — Cerebras runs server-side
    // Show modal only if user explicitly visits for first time with no key
    // (tracked via localStorage flag)
    const hasSeenOnboarding = localStorage.getItem('hg_seen_onboarding');
    const isPro = !!state.apiKey || !!state.isPro;
    if (isPro) {
        logTerminal('Pro tier active — unlimited messages via Cerebras Qwen 3 235B. Paste your Gemini key above to switch to Gemini.', 'success');
        updateAgentStatus('idle', 'CO-FOUNDER PRO: STANDBY');
    } else {
        logTerminal('Free tier active — Midias powered by Cerebras Qwen 3 235B.', 'success');
        updateAgentStatus('idle', 'CO-FOUNDER: ONLINE (FREE)');
        if (!hasSeenOnboarding && onboardingModal) {
            onboardingModal.style.display = 'flex';
            localStorage.setItem('hg_seen_onboarding', 'true');
        }
    }
    fetchGoogleTrends(); // Load real-time trends on startup
});

// Load state from LocalStorage
function loadStateFromLocalStorage() {
    state.isPro = false;
    const savedApiKey = localStorage.getItem('hg_api_key');
    if (savedApiKey) {
        state.apiKey = savedApiKey;
        document.getElementById('api-key-input').value = savedApiKey;
    }

    const savedActiveHustle = localStorage.getItem('hg_active_hustle');
    if (savedActiveHustle) {
        state.activeHustle = JSON.parse(savedActiveHustle);
    }

    const savedNicheIdeas = localStorage.getItem('hg_niche_ideas');
    if (savedNicheIdeas) {
        state.nicheIdeas = JSON.parse(savedNicheIdeas);
    }

    const savedTasks = localStorage.getItem('hg_tasks');
    if (savedTasks) {
        state.tasks = JSON.parse(savedTasks);
    }

    const savedExpenses = localStorage.getItem('hg_expenses');
    if (savedExpenses) {
        state.expenses = JSON.parse(savedExpenses);
    } else {
        state.expenses = [...DEFAULT_EXPENSES];
    }

    const savedMessages = localStorage.getItem('hg_messages');
    if (savedMessages) {
        state.messages = JSON.parse(savedMessages);
    }

    const savedVault = localStorage.getItem('hg_vault');
    if (savedVault) {
        state.vault = JSON.parse(savedVault);
    }

    const savedInitialBudget = localStorage.getItem('hg_initial_budget');
    if (savedInitialBudget) {
        state.initialBudget = parseFloat(savedInitialBudget);
    }

    const savedTargetRevenue = localStorage.getItem('hg_target_revenue');
    if (savedTargetRevenue) {
        state.targetRevenue = parseFloat(savedTargetRevenue);
    }

    const savedTarget = localStorage.getItem('hg_target');
    if (savedTarget) state.targetRevenue = parseFloat(savedTarget);
    
    const savedPersona = localStorage.getItem('hg_persona');
    if (savedPersona) {
        state.personaMode = savedPersona;
        const selector = document.getElementById('midias-persona-select');
        if (selector) selector.value = savedPersona;
    }

    const savedTrendsGeo = localStorage.getItem('hg_trends_geo');
    if (savedTrendsGeo) {
        state.trendsGeo = savedTrendsGeo;
    }
}

// Save state to LocalStorage
function saveStateToLocalStorage() {
    localStorage.setItem('hg_api_key', state.apiKey);
    localStorage.setItem('hg_active_hustle', JSON.stringify(state.activeHustle));
    localStorage.setItem('hg_niche_ideas', JSON.stringify(state.nicheIdeas));
    localStorage.setItem('hg_tasks', JSON.stringify(state.tasks));
    localStorage.setItem('hg_expenses', JSON.stringify(state.expenses));
    localStorage.setItem('hg_messages', JSON.stringify(state.messages));
    localStorage.setItem('hg_vault', JSON.stringify(state.vault));
    localStorage.setItem('hg_initial_budget', state.initialBudget);
    localStorage.setItem('hg_target', state.targetRevenue);
    localStorage.setItem('hg_persona', state.personaMode);
    localStorage.setItem('hg_trends_geo', state.trendsGeo);
    
    triggerCloudSync();
}

// Initialise Event Listeners
function initEventListeners() {
    // API key events
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleApiBtn = document.getElementById('toggle-api-visibility');
    const resetDataBtn = document.getElementById('reset-data-btn');
    const exportPlanBtn = document.getElementById('export-plan-btn');
    const personaSelect = document.getElementById('midias-persona-select');
    
    // Modal elements
    const onboardingModal = document.getElementById('onboarding-modal');
    const modalApiKeyInput = document.getElementById('modal-api-key-input');
    const modalSaveKeyBtn = document.getElementById('modal-save-key-btn');
    const closeOnboardingBtn = document.getElementById('close-onboarding-btn');

    const showOnboardingBtn = document.getElementById('show-onboarding-btn');

    // Event Listeners
    apiKeyInput.addEventListener('change', (e) => {
        state.apiKey = e.target.value;
        saveStateToLocalStorage();
        if (state.apiKey) {
            logTerminal('API Key saved to secure local storage.', 'success');
            updateAgentStatus('idle', 'CO-FOUNDER: STANDBY');
        } else {
            logTerminal('API Key cleared. Gemini features disabled.', 'warning');
            updateAgentStatus('idle', 'API KEY REQUIRED');
        }
    });

    if (personaSelect) {
        personaSelect.addEventListener('change', (e) => {
            state.personaMode = e.target.value;
            saveStateToLocalStorage();
            logTerminal(`Midias Strategy Mode updated to: ${state.personaMode.toUpperCase()}`, 'info');
        });
    }

    // Modal Event Listeners
    if (modalSaveKeyBtn) {
        const initializeSystem = () => {
            const key = modalApiKeyInput.value.trim();
            if (key) {
                state.apiKey = key;
                apiKeyInput.value = key; // update header input too
                saveStateToLocalStorage();
                onboardingModal.style.display = 'none';
                showToast('API Key verified. Midias is online.', 'success');
                logTerminal('API Key entered via Onboarding Modal. System ready.', 'success');
                updateAgentStatus('idle', 'CO-FOUNDER: STANDBY');
                
                // Refresh trends now that we have a key
                fetchGoogleTrends();
            } else {
                showToast('Please enter an API key.', 'warning');
            }
        };

        modalSaveKeyBtn.addEventListener('click', initializeSystem);
        
        modalApiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                initializeSystem();
            }
        });
    }

    if (closeOnboardingBtn) {
        closeOnboardingBtn.addEventListener('click', () => {
            onboardingModal.style.display = 'none';
        });
    }

    if (showOnboardingBtn) {
        showOnboardingBtn.addEventListener('click', () => {
            if (onboardingModal) onboardingModal.style.display = 'flex';
        });
    }

    toggleApiBtn.addEventListener('click', () => {
        const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        apiKeyInput.setAttribute('type', type);
        toggleApiBtn.innerHTML = type === 'password' ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });

    exportPlanBtn.addEventListener('click', exportBusinessPlan);

    resetDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all data? This will reset your active hustle, tasks, budget log, and chat history.')) {
            localStorage.clear();
            state.apiKey = '';
            state.activeHustle = null;
            state.nicheIdeas = [];
            state.tasks = [];
            state.expenses = [];
            state.messages = [
                {
                    role: 'assistant',
                    text: `**Midias (AI Co-founder)** is active. Ready to build a side hustle from scratch with a $100 budget.\n\nTo begin, enter your Gemini API Key in the header, then click one of the quick actions below or type a message!`
                }
            ];
            state.vault = { copy: '', persona: '', swot: '', assets: '' };
            apiKeyInput.value = '';
            saveStateToLocalStorage();
            renderAll();
            logTerminal('Database purge complete. Ready for new hustle setup.', 'info');
            showToast('All local data cleared.', 'info');
        }
    });

    // Chat form events
    const chatForm = document.getElementById('chat-form');
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const chatInput = document.getElementById('chat-input');
        const userMsg = chatInput.value.trim();
        if (!userMsg) return;

        chatInput.value = '';
        chatInput.style.height = 'auto'; // reset height on send
        handleUserMessage(userMsg);
    });

    // Quick Action prompts - populates chat input for review/editing instead of auto-submitting
    document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-prompt');
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = prompt;
                chatInput.style.height = 'auto';
                chatInput.style.height = (chatInput.scrollHeight) + 'px'; // adjust height for the multi-line prompt
                chatInput.focus();
            }
        });
    });

    // Dynamic height and enter key listeners for textarea
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        // Auto-grow textarea on text input
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Submit form on Enter, add newline on Shift+Enter
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // prevent default newline insertion
                chatForm.dispatchEvent(new Event('submit')); // trigger submit
            }
        });
    }

    // Workspace tab switching
    document.querySelectorAll('.tab-btn').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tabBtn.classList.add('active');
            const tabId = `tab-${tabBtn.getAttribute('data-tab')}`;
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Add Task Button Toggle
    const addTaskBtn = document.getElementById('add-task-btn');
    const addTaskWrapper = document.getElementById('add-task-form-wrapper');
    const cancelNewTaskBtn = document.getElementById('cancel-new-task');

    addTaskBtn.addEventListener('click', () => {
        addTaskWrapper.style.display = addTaskWrapper.style.display === 'none' ? 'block' : 'none';
    });

    cancelNewTaskBtn.addEventListener('click', () => {
        addTaskWrapper.style.display = 'none';
    });

    // Submit Task
    document.getElementById('submit-new-task').addEventListener('click', () => {
        const titleInput = document.getElementById('new-task-title');
        const stageInput = document.getElementById('new-task-stage');
        const title = titleInput.value.trim();
        const stage = stageInput.value;

        if (title) {
            const newTask = {
                id: 'task_' + Date.now(),
                title,
                stage,
                completed: false
            };
            state.tasks.push(newTask);
            saveStateToLocalStorage();
            renderTasks();
            titleInput.value = '';
            addTaskWrapper.style.display = 'none';
            showToast('New task added!', 'success');
            logTerminal(`Manual Task Logged: "${title}" added to Phase: ${stage.toUpperCase()}`, 'info');
        } else {
            showToast('Please enter a task description.', 'error');
        }
    });

    // Add Expense Button Toggle
    const logExpenseBtn = document.getElementById('log-expense-btn');
    const logExpenseWrapper = document.getElementById('add-expense-form-wrapper');
    const cancelNewExpenseBtn = document.getElementById('cancel-new-expense');

    logExpenseBtn.addEventListener('click', () => {
        logExpenseWrapper.style.display = logExpenseWrapper.style.display === 'none' ? 'block' : 'none';
    });

    cancelNewExpenseBtn.addEventListener('click', () => {
        logExpenseWrapper.style.display = 'none';
    });

    // Submit Expense
    document.getElementById('submit-new-expense').addEventListener('click', () => {
        const itemInput = document.getElementById('expense-item');
        const amountInput = document.getElementById('expense-amount');
        const categoryInput = document.getElementById('expense-category');

        const description = itemInput.value.trim();
        const amount = parseFloat(amountInput.value);
        const category = categoryInput.value.trim() || 'Setup';

        if (description && !isNaN(amount) && amount > 0) {
            const newExpense = {
                id: 'exp_' + Date.now(),
                date: new Date().toLocaleDateString(),
                description,
                category,
                amount
            };
            state.expenses.push(newExpense);
            saveStateToLocalStorage();
            renderFinances();
            itemInput.value = '';
            amountInput.value = '';
            categoryInput.value = '';
            logExpenseWrapper.style.display = 'none';
            showToast('Expense logged successfully!', 'success');
            logTerminal(`Budget Logged: -$${amount.toFixed(2)} for "${description}" (${category})`, 'warning');
        } else {
            showToast('Please fill out all fields with valid values.', 'error');
        }
    });

    // Clear buttons
    document.getElementById('clear-ideas-btn').addEventListener('click', () => {
        state.nicheIdeas = [];
        saveStateToLocalStorage();
        renderNicheIdeas();
        showToast('Niche ideas cleared.', 'info');
    });

    document.getElementById('clear-tasks-btn').addEventListener('click', () => {
        state.tasks = [];
        saveStateToLocalStorage();
        renderTasks();
        showToast('Tasks cleared.', 'info');
    });

    document.getElementById('clear-vault-btn').addEventListener('click', () => {
        state.vault = { copy: '', persona: '', swot: '', assets: '' };
        saveStateToLocalStorage();
        renderVault();
        showToast('Resource vault cleared.', 'info');
    });

    // Copy Content button click listeners
    document.querySelectorAll('.copy-vault-content-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            let content = '';

            if (target === 'copy-content') content = state.vault.copy;
            else if (target === 'persona-content') content = state.vault.persona;
            else if (target === 'swot-content') content = state.vault.swot;
            else if (target === 'assets-content') content = state.vault.assets;

            if (content && !content.includes('will appear here')) {
                // Strip markdown styling for plain copy or keep it
                navigator.clipboard.writeText(content)
                    .then(() => showToast('Copied content to clipboard!', 'success'))
                    .catch(() => showToast('Failed to copy text.', 'error'));
            } else {
                showToast('No generated content to copy yet.', 'error');
            }
        });
    });

    // Handle dynamically created dynamic buttons (like Init Niche Ideas)
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('init-ideas-btn')) {
            const prompt = "Let's brainstorm 3 unique, zero-cost side hustles that we can launch in 48 hours using Gemini API.";
            handleUserMessage(prompt);
        }
    });

    // Setup budget parameter inline edits
    setupBudgetEditHandler('overview-initial-budget', 'initialBudget');
    setupBudgetEditHandler('overview-target-revenue', 'targetRevenue');
    setupBudgetEditHandler('finance-initial-budget', 'initialBudget');

    // Google Trends events
    const geoSelect = document.getElementById('trends-geo-select');
    if (geoSelect) {
        geoSelect.value = state.trendsGeo || 'US';
        geoSelect.addEventListener('change', (e) => {
            state.trendsGeo = e.target.value;
            saveStateToLocalStorage();
            fetchGoogleTrends(true); // force refresh on region change
        });
    }

    const refreshTrendsBtn = document.getElementById('refresh-trends-btn');
    if (refreshTrendsBtn) {
        refreshTrendsBtn.addEventListener('click', () => {
            fetchGoogleTrends(true); // force refresh bypasses cache
        });
    }

    // Auth UI Event Listeners
    const authModal = document.getElementById('auth-modal');
    const authTriggerBtn = document.getElementById('auth-trigger-btn');
    const closeAuthBtn = document.getElementById('close-auth-btn');
    const authSwitchLink = document.getElementById('auth-switch-link');
    const authForm = document.getElementById('auth-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (authTriggerBtn && authModal) {
        authTriggerBtn.addEventListener('click', () => {
            if (!window.supabaseClient) {
                showToast("Please configure Supabase credentials in config.js first.", "warning");
                return;
            }
            authModal.style.display = 'flex';
        });
    }

    if (closeAuthBtn && authModal) {
        closeAuthBtn.addEventListener('click', () => {
            authModal.style.display = 'none';
        });
    }

    if (authSwitchLink) {
        authSwitchLink.addEventListener('click', (e) => {
            e.preventDefault();
            const modalTitle = document.getElementById('auth-modal-title');
            const modalSubtitle = document.getElementById('auth-modal-subtitle');
            const submitBtn = document.getElementById('auth-submit-btn');
            const switchText = document.getElementById('auth-switch-text');

            if (authMode === 'signin') {
                authMode = 'signup';
                modalTitle.innerHTML = 'Create your <span class="gold-text">Midias AI</span> Account';
                modalSubtitle.innerText = 'Get started by creating a free account.';
                submitBtn.innerText = 'Create Account →';
                switchText.innerText = 'Already have an account?';
                authSwitchLink.innerText = 'Sign In';
            } else {
                authMode = 'signin';
                modalTitle.innerHTML = 'Sign In to <span class="gold-text">Midias AI</span>';
                modalSubtitle.innerText = 'Log in to sync your side hustles and settings.';
                submitBtn.innerText = 'Sign In →';
                switchText.innerText = "Don't have an account?";
                authSwitchLink.innerText = 'Sign Up';
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value.trim();
            const submitBtn = document.getElementById('auth-submit-btn');

            const prevBtnText = submitBtn.innerText;
            submitBtn.innerText = 'Processing...';
            submitBtn.disabled = true;

            try {
                if (authMode === 'signin') {
                    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                    authModal.style.display = 'none';
                } else {
                    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
                    if (error) throw error;
                    showToast('Registration successful! Check email for verification link.', 'success');
                    authModal.style.display = 'none';
                }
            } catch (err) {
                console.error("Auth action failed:", err);
                showToast(err.message, 'error');
            } finally {
                submitBtn.innerText = prevBtnText;
                submitBtn.disabled = false;
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (window.supabaseClient) {
                await window.supabaseClient.auth.signOut();
            }
        });
    }

    // Stripe Billing & Paywall listeners
    const upgradeProBtn = document.getElementById('upgrade-pro-btn');
    if (upgradeProBtn) {
        upgradeProBtn.addEventListener('click', handleUpgradeToPro);
    }

    const paywallUpgradeBtn = document.getElementById('paywall-upgrade-btn');
    if (paywallUpgradeBtn) {
        paywallUpgradeBtn.addEventListener('click', handleUpgradeToPro);
    }

    const closePaywallBtn = document.getElementById('close-paywall-btn');
    if (closePaywallBtn) {
        closePaywallBtn.addEventListener('click', () => {
            const paywallModal = document.getElementById('paywall-modal');
            if (paywallModal) paywallModal.style.display = 'none';
        });
    }

    // Custom Idea Form listener
    const customIdeaForm = document.getElementById('custom-idea-form');
    if (customIdeaForm) {
        customIdeaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const titleInput = document.getElementById('custom-idea-title');
            const diffInput = document.getElementById('custom-idea-difficulty');
            const mrrInput = document.getElementById('custom-idea-mrr');
            const descInput = document.getElementById('custom-idea-description');
            
            const titleVal = titleInput.value.trim();
            const diffVal = diffInput.value;
            const mrrVal = mrrInput.value.trim();
            const descVal = descInput.value.trim();
            
            if (!titleVal || !mrrVal || !descVal) {
                showToast("Please fill out all fields for your custom idea.", "warning");
                return;
            }
            
            const newIdea = {
                id: 'idea_' + Date.now(),
                title: titleVal,
                description: descVal,
                difficulty: diffVal,
                mrr: mrrVal
            };
            
            if (!state.nicheIdeas) state.nicheIdeas = [];
            state.nicheIdeas.push(newIdea);
            
            // Set the new idea as active hustle
            state.activeHustle = newIdea;
            
            saveStateToLocalStorage();
            triggerCloudSync();
            
            renderNicheIdeas();
            renderOverview();
            
            // Reset form
            customIdeaForm.reset();
            
            showToast(`Custom idea "${titleVal}" added and set active!`, "success");
            logTerminal(`Added Custom Business Concept: "${titleVal}" (Set as Active)`, "success");
            logTerminal('You can now generate action plans or SWOT analysis for this idea!', 'info');
        });
    }
}

// Setup budget parameter inline edits helper
function setupBudgetEditHandler(elementId, stateField) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.addEventListener('blur', () => {
        let val = el.innerText.replace(/[^0-9.]/g, ''); // strip $, commas, etc.
        let num = parseFloat(val);
        const isInvalid = stateField === 'initialBudget' ? (isNaN(num) || num < 0) : (isNaN(num) || num <= 0);
        if (isInvalid) {
            // Revert to current value formatted
            if (stateField === 'initialBudget') {
                el.innerText = `$${state.initialBudget.toFixed(2)}`;
            } else {
                el.innerText = `$${state.targetRevenue.toLocaleString()}`;
            }
            showToast(stateField === 'initialBudget' ? 'Please enter a valid non-negative number.' : 'Please enter a valid positive number.', 'error');
            return;
        }
        
        state[stateField] = num;
        saveStateToLocalStorage();
        renderAll();
        showToast(`${stateField === 'initialBudget' ? 'Budget' : 'Target Revenue'} updated to $${num.toLocaleString()}!`, 'success');
        logTerminal(`Financial Parameters Updated: ${stateField === 'initialBudget' ? 'Initial Budget' : 'Target Revenue'} set to $${num.toLocaleString()}`, 'success');
    });

    // Enter key triggers blur
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            el.blur();
        }
    });
}

// Global Renders
function renderAll() {
    renderChat();
    renderOverview();
    renderNicheIdeas();
    renderTasks();
    renderFinances();
    renderVault();
    renderGoogleTrends();
    updateTierUI();
}

function updateTierUI() {
    const isPro = !!state.apiKey || !!state.isPro;
    const tierBadge = document.getElementById('user-tier-badge');
    const upgradeProBtn = document.getElementById('upgrade-pro-btn');
    
    if (tierBadge) {
        if (isPro) {
            tierBadge.className = 'badge-tier-pro';
            tierBadge.innerText = 'PRO';
        } else {
            tierBadge.className = 'badge-tier-free';
            tierBadge.innerText = 'FREE';
        }
    }
    
    if (upgradeProBtn) {
        if (isPro) {
            upgradeProBtn.style.display = 'none';
        } else {
            upgradeProBtn.style.display = 'inline-block';
        }
    }
}

// Render Chat Log
function renderChat() {
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML = '';

    state.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.role}`;
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.innerHTML = msg.role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        if (msg.text.includes('typing-indicator')) {
            contentDiv.innerHTML = msg.text;
        } else {
            contentDiv.innerHTML = formatMarkdown(msg.text);
        }

        if (msg.actionTaskId) {
            const actionContainer = document.createElement('div');
            actionContainer.className = 'chat-action-container';
            
            // Mark completed button
            const completeBtn = document.createElement('button');
            completeBtn.className = 'btn btn-gold btn-sm';
            
            // Check if task is already completed
            const task = state.tasks.find(t => t.id === msg.actionTaskId);
            const isCompleted = task ? task.completed : false;
            
            if (isCompleted) {
                completeBtn.className = 'btn btn-success btn-sm';
                completeBtn.disabled = true;
                completeBtn.innerHTML = '<i class="fa-solid fa-check"></i> Completed';
            } else {
                completeBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mark Task Completed';
                completeBtn.addEventListener('click', () => {
                    const activeTask = state.tasks.find(t => t.id === msg.actionTaskId);
                    if (activeTask) {
                        activeTask.completed = true;
                        saveStateToLocalStorage();
                        renderTasks();
                        completeBtn.className = 'btn btn-success btn-sm';
                        completeBtn.disabled = true;
                        completeBtn.innerHTML = '<i class="fa-solid fa-check"></i> Completed';
                        logTerminal(`Task "${activeTask.title}" marked as completed via co-founder assistant.`, 'success');
                        showToast('Task marked as completed!', 'success');
                    }
                });
            }
            
            // View Vault button
            const vaultBtn = document.createElement('button');
            vaultBtn.className = 'btn btn-gold-outline btn-sm';
            vaultBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> View Deliverables';
            vaultBtn.addEventListener('click', () => {
                switchTab('vault');
            });
            
            actionContainer.appendChild(completeBtn);
            actionContainer.appendChild(vaultBtn);
            contentDiv.appendChild(actionContainer);
        }

        msgDiv.appendChild(avatarDiv);
        msgDiv.appendChild(contentDiv);
        chatContainer.appendChild(msgDiv);
    });

    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Render Overview Panel
function renderOverview() {
    const detailsContainer = document.getElementById('active-project-details');
    
    if (state.activeHustle) {
        detailsContainer.innerHTML = `
            <div class="active-project-info">
                <h4>${state.activeHustle.title}</h4>
                <p>${state.activeHustle.description}</p>
                <div class="idea-badges" style="margin-top: 0.5rem;">
                    <span class="badge badge-difficulty-${state.activeHustle.difficulty.toLowerCase()}">${state.activeHustle.difficulty}</span>
                    <span class="badge badge-mrr">${state.activeHustle.mrr}</span>
                </div>
            </div>
        `;
    } else {
        detailsContainer.innerHTML = `
            <div class="no-active-project">
                <i class="fa-solid fa-folder-open large-icon"></i>
                <p>No active side hustle selected yet.</p>
                <p class="subtext">Select an idea from the "Niche Ideas" tab or tell Midias to choose one.</p>
            </div>
        `;
    }

    // Recalculate and update finances summary
    let totalSpent = 0;
    state.expenses.forEach(exp => totalSpent += exp.amount);
    const totalRemaining = Math.max(0, state.initialBudget - totalSpent);

    document.getElementById('overview-spent').innerText = `$${totalSpent.toFixed(2)}`;
    document.getElementById('overview-remaining').innerText = `$${totalRemaining.toFixed(2)}`;

    let fillPercent = 100;
    if (state.initialBudget > 0) {
        fillPercent = Math.max(0, (totalRemaining / state.initialBudget) * 100);
    } else if (totalSpent > 0) {
        fillPercent = 0;
    }
    const progressFill = document.getElementById('overview-progress-fill');
    progressFill.style.width = `${fillPercent}%`;

    if (fillPercent < 20) {
        progressFill.style.background = 'var(--danger)';
        progressFill.style.boxShadow = '0 0 8px var(--danger)';
    } else if (fillPercent < 50) {
        progressFill.style.background = 'var(--gold)';
        progressFill.style.boxShadow = '0 0 8px var(--gold-glow)';
    } else {
        progressFill.style.background = 'linear-gradient(90deg, #FFD700 0%, #FFB900 100%)';
        progressFill.style.boxShadow = '0 0 8px var(--gold-glow)';
    }

    // Update editable fields if they don't have focus
    const initialBudgetEl = document.getElementById('overview-initial-budget');
    const targetRevenueEl = document.getElementById('overview-target-revenue');
    
    if (initialBudgetEl && document.activeElement !== initialBudgetEl) {
        initialBudgetEl.innerText = `$${state.initialBudget.toFixed(2)}`;
    }
    if (targetRevenueEl && document.activeElement !== targetRevenueEl) {
        targetRevenueEl.innerText = `$${state.targetRevenue.toLocaleString()}`;
    }

    // Update Tab Header Title
    const tabFinancesHeader = document.getElementById('tab-btn-finances');
    if (tabFinancesHeader) {
        tabFinancesHeader.innerHTML = `<i class="fa-solid fa-wallet"></i> Budget ($${Math.round(state.initialBudget)})`;
    }
}

// Render Niche Ideas
function renderNicheIdeas() {
    const ideasGrid = document.getElementById('ideas-grid');
    ideasGrid.innerHTML = '';

    if (state.nicheIdeas && state.nicheIdeas.length > 0) {
        state.nicheIdeas.forEach(idea => {
            const card = document.createElement('div');
            const isActive = state.activeHustle && state.activeHustle.title === idea.title;
            card.className = `idea-card ${isActive ? 'active-card' : ''}`;
            
            card.innerHTML = `
                <h4>${idea.title}</h4>
                <p>${idea.description}</p>
                <div class="idea-badges">
                    <span class="badge badge-difficulty-${idea.difficulty.toLowerCase()}">${idea.difficulty}</span>
                    <span class="badge badge-mrr">${idea.mrr}</span>
                </div>
                <div class="idea-card-footer">
                    <button class="btn btn-gold btn-sm set-active-btn" data-id="${idea.id}">
                        ${isActive ? '<i class="fa-solid fa-circle-check"></i> Selected' : 'Set Active'}
                    </button>
                </div>
            `;

            // Active button click
            card.querySelector('.set-active-btn').addEventListener('click', () => {
                state.activeHustle = idea;
                saveStateToLocalStorage();
                renderNicheIdeas();
                renderOverview();
                showToast(`"${idea.title}" set as active side hustle!`, 'success');
                logTerminal(`Active Business Concept Locked: "${idea.title}"`, 'success');
            });

            ideasGrid.appendChild(card);
        });
    } else {
        ideasGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-lightbulb large-icon"></i>
                <p>No ideas brainstormed yet.</p>
                <p class="subtext">Configure your API key and click "Brainstorm Hustles" to generate concepts with Midias.</p>
                <button class="btn btn-gold btn-sm init-ideas-btn">Brainstorm Ideas Now</button>
            </div>
        `;
    }
}

// Render Tasks
function renderTasks() {
    const setupList = document.getElementById('task-list-setup');
    const launchList = document.getElementById('task-list-launch');
    const scaleList = document.getElementById('task-list-scale');

    setupList.innerHTML = '';
    launchList.innerHTML = '';
    scaleList.innerHTML = '';

    const setupTasks = state.tasks.filter(t => t.stage === 'setup');
    const launchTasks = state.tasks.filter(t => t.stage === 'launch');
    const scaleTasks = state.tasks.filter(t => t.stage === 'scale');

    // Populate helper
    const populate = (listEl, taskArray, emptyMsg) => {
        if (taskArray.length > 0) {
            taskArray.forEach(task => {
                const li = document.createElement('li');
                li.className = `task-item ${task.completed ? 'completed' : ''}`;
                
                li.innerHTML = `
                    <input type="checkbox" ${task.completed ? 'checked' : ''}>
                    <span>${task.title}</span>
                    ${!task.completed ? `<button class="help-task-btn" title="Ask Midias to complete this task"><i class="fa-solid fa-wand-magic-sparkles"></i> Help Me</button>` : ''}
                    <button class="delete-task-btn" title="Delete Task"><i class="fa-solid fa-xmark"></i></button>
                `;

                // Checkbox toggle
                li.querySelector('input').addEventListener('change', (e) => {
                    task.completed = e.target.checked;
                    saveStateToLocalStorage();
                    li.className = `task-item ${task.completed ? 'completed' : ''}`;
                    logTerminal(`Task Checked: "${task.title}" updated to ${task.completed ? 'COMPLETED' : 'INCOMPLETE'}`, 'info');
                    renderTasks(); // Re-render to update Help Me buttons visibility
                });

                // Help click
                const helpBtn = li.querySelector('.help-task-btn');
                if (helpBtn) {
                    helpBtn.addEventListener('click', () => {
                        helpWithTask(task.id);
                    });
                }

                // Delete click
                li.querySelector('.delete-task-btn').addEventListener('click', () => {
                    state.tasks = state.tasks.filter(t => t.id !== task.id);
                    saveStateToLocalStorage();
                    renderTasks();
                    showToast('Task removed.', 'info');
                    logTerminal(`Task Deleted: "${task.title}" removed from workspace.`, 'info');
                });

                listEl.appendChild(li);
            });
        } else {
            listEl.innerHTML = `<li class="empty-task-message">${emptyMsg}</li>`;
        }
    };

    populate(setupList, setupTasks, 'No setup tasks. Let Midias build an action plan for you.');
    populate(launchList, launchTasks, 'No launch tasks.');
    populate(scaleList, scaleTasks, 'No scaling tasks.');
}

// Render Finances
function renderFinances() {
    const tableBody = document.getElementById('expense-table-body');
    tableBody.innerHTML = '';

    let totalSpent = 0;
    
    if (state.expenses && state.expenses.length > 0) {
        state.expenses.forEach(exp => {
            totalSpent += exp.amount;
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>${exp.date}</td>
                <td><strong>${exp.description}</strong></td>
                <td><span class="badge badge-difficulty-medium">${exp.category}</span></td>
                <td class="spent-text">-$${exp.amount.toFixed(2)}</td>
                <td><button class="delete-expense-btn" title="Delete log"><i class="fa-solid fa-trash-can"></i></button></td>
            `;

            // Delete expense event
            tr.querySelector('.delete-expense-btn').addEventListener('click', () => {
                state.expenses = state.expenses.filter(e => e.id !== exp.id);
                saveStateToLocalStorage();
                renderFinances();
                renderOverview();
                showToast('Expense log removed.', 'info');
                logTerminal(`Expense Log Removed: "${exp.description}" refunded.`, 'info');
            });

            tableBody.appendChild(tr);
        });
    } else {
        tableBody.innerHTML = `
            <tr class="empty-table-row">
                <td colspan="5" class="text-center" style="color: var(--text-muted); font-size: 0.78rem;">No expenses logged. Start building!</td>
            </tr>
        `;
    }

    const totalRemaining = Math.max(0, state.initialBudget - totalSpent);

    document.getElementById('finance-total-spent').innerText = `$${totalSpent.toFixed(2)}`;
    
    const remainingEl = document.getElementById('finance-total-remaining');
    remainingEl.innerText = `$${totalRemaining.toFixed(2)}`;

    const isOverBudget = state.initialBudget > 0 
        ? (totalRemaining < (state.initialBudget * 0.2)) 
        : (totalSpent > 0);
    if (isOverBudget) {
        remainingEl.className = 'widget-value spent-text';
    } else {
        remainingEl.className = 'widget-value gold-text gold-glow-text';
    }

    // Update editable fields for Finances tab
    const financeHeading = document.getElementById('finance-heading');
    if (financeHeading) {
        financeHeading.innerText = `EXPENSE LOGGING ($${Math.round(state.initialBudget)} STARTING BUDGET)`;
    }

    const financeInitialBudgetEl = document.getElementById('finance-initial-budget');
    if (financeInitialBudgetEl && document.activeElement !== financeInitialBudgetEl) {
        financeInitialBudgetEl.innerText = `$${state.initialBudget.toFixed(2)}`;
    }
}

// Render Resource Vault
function renderVault() {
    const landingEl = document.getElementById('vault-landing-copy');
    const personaEl = document.getElementById('vault-buyer-persona');
    const swotEl = document.getElementById('vault-business-swot');
    const assetsEl = document.getElementById('vault-generated-assets');

    if (landingEl) landingEl.innerHTML = state.vault.copy ? formatMarkdown(state.vault.copy) : '<p class="empty-vault-text">Landing copy will appear here once generated.</p>';
    if (personaEl) personaEl.innerHTML = state.vault.persona ? formatMarkdown(state.vault.persona) : '<p class="empty-vault-text">Target persona analysis will appear here once generated.</p>';
    if (swotEl) swotEl.innerHTML = state.vault.swot ? formatMarkdown(state.vault.swot) : '<p class="empty-vault-text">Business SWOT analysis will appear here once generated.</p>';
    if (assetsEl) assetsEl.innerHTML = state.vault.assets ? formatMarkdown(state.vault.assets) : '<p class="empty-vault-text">Code, templates, or files created during task execution will appear here.</p>';
}

// Send user message to UI and handle processing
function handleUserMessage(msgText, targetTaskId = null) {
    const isPro = !!state.apiKey || !!state.isPro;
    const userMessageCount = state.messages.filter(m => m.role === 'user').length;
    
    if (!isPro && userMessageCount >= 5) {
        const paywallModal = document.getElementById('paywall-modal');
        if (paywallModal) {
            paywallModal.style.display = 'flex';
        }
        showToast('Free tier message limit reached. Please upgrade to Pro!', 'warning');
        logTerminal('Message blocked: Free tier limit of 5 messages reached.', 'error');
        return;
    }

    // Add user message to state
    state.messages.push({ role: 'user', text: msgText });
    renderChat();

    // Process using API — free tier (Cerebras) or pro tier (Gemini)
    processAgentRequest(msgText, targetTaskId);
}

// Process Agent request — routes to free (Cerebras) or pro (Gemini) tier
async function processAgentRequest(userMessage, targetTaskId = null) {
    const isPro = !!state.apiKey || !!state.isPro;
    updateAgentStatus('active', isPro ? 'MIDIAS PRO: THINKING...' : 'MIDIAS: THINKING...');
    logTerminal(`Midias is processing (${isPro ? 'Cerebras / Unlimited' : 'Free / Cerebras'})...`, 'info');

    // Create assistant typing placeholder message
    const placeholderMsgIndex = state.messages.length;
    state.messages.push({ role: 'assistant', text: '<div class="typing-indicator"><span></span><span></span><span></span></div>' });
    renderChat();

    // Check if it's a structural command or general chat
    const isBrainstorm = userMessage.toLowerCase().includes('brainstorm') || userMessage.toLowerCase().includes('niche');
    const isActionPlan = userMessage.toLowerCase().includes('action plan') || userMessage.toLowerCase().includes('action-plan') || userMessage.toLowerCase().includes('checklist');
    const isLandingCopy = userMessage.toLowerCase().includes('landing page copy') || userMessage.toLowerCase().includes('marketing strategy') || userMessage.toLowerCase().includes('draft landing');
    const isNameSlogan = userMessage.toLowerCase().includes('name & slogan') || userMessage.toLowerCase().includes('brand name');
    const isTaskExecution = targetTaskId !== null;

    try {
        let systemPrompt = '';
        let apiPrompt = userMessage;

        if (isTaskExecution) {
            const task = state.tasks.find(t => t.id === targetTaskId);
            const taskTitle = task ? task.title : 'Task';
            systemPrompt = getTaskExecutionSystemPrompt(taskTitle);
            logTerminal(`Midias is working directly on executing: "${taskTitle}"...`, 'info');
        } else if (isBrainstorm) {
            systemPrompt = getBrainstormSystemPrompt();
            logTerminal('Researching trending niches under $100 starting budget...', 'info');
            simulateTerminalStep('Scanning Google Maps & Fiverr listings...', 800);
            simulateTerminalStep('Filtering by customer acquisition ease...', 1600);
            simulateTerminalStep('Calculating potential Monthly Recurring Revenue (MRR)...', 2400);
        } else if (isActionPlan) {
            if (!state.activeHustle) {
                state.messages[placeholderMsgIndex].text = `❌ **No Active Hustle Selected:** Before generating an action plan, please set a side hustle active in the "Niche Ideas" panel, or ask me: *"Choose a hustle for us and generate an action plan."*`;
                saveStateToLocalStorage();
                renderChat();
                updateAgentStatus('idle', 'CO-FOUNDER: STANDBY');
                logTerminal('Process aborted. No active side hustle loaded.', 'error');
                return;
            }
            systemPrompt = getActionPlanSystemPrompt();
            logTerminal(`Developing operational checklist for: "${state.activeHustle.title}"...`, 'info');
            simulateTerminalStep('Compiling Setup Phase checklists (domain, landing page, hosting)...', 700);
            simulateTerminalStep('Structuring Launch Phase outreach (cold email, social listings)...', 1500);
            simulateTerminalStep('Formulating Scaling Phase loops (upsells, organic SEO)...', 2200);
        } else {
            systemPrompt = getGeneralSystemPrompt();
        }

        // Construct full conversation context for Gemini API
        // Send last 8 messages for context to conserve token limits on free tier
        const historyContext = state.messages.slice(-8, placeholderMsgIndex).map(m => {
            return `${m.role === 'user' ? 'User' : 'Midias'}: ${m.text}`;
        }).join('\n');

        const fullPrompt = `${systemPrompt}\n\nCONVERSATION HISTORY:\n${historyContext}\n\nUSER'S LATEST INSTRUCTION:\n${userMessage}`;

        const responseText = await callGeminiAPI(fullPrompt);

        // Remove placeholder and write response
        state.messages.pop(); // Remove typing indicator
        
        let displayMessage = responseText;

        // Perform specific structural updates
        if (isBrainstorm) {
            const parsedIdeas = parseJSONFromText(responseText);
            if (parsedIdeas && Array.isArray(parsedIdeas)) {
                // Generate standard IDs
                const formatted = parsedIdeas.map((idea, index) => ({
                    id: 'idea_' + (Date.now() + index),
                    title: idea.title || 'Side Hustle Niche',
                    description: idea.description || 'Description generated by AI.',
                    difficulty: ['Easy', 'Medium', 'Hard'].includes(idea.difficulty) ? idea.difficulty : 'Medium',
                    mrr: idea.mrr || '$1,000/mo',
                    active: false
                }));
                state.nicheIdeas = formatted;
                saveStateToLocalStorage();
                renderNicheIdeas();
                displayMessage = `💡 **I've brainstormed 3 new side hustles for us!** You can view the details in the **Niche Ideas** tab and set your favorite one to active.\n\nHere is a summary of the concepts:\n` + 
                    formatted.map(f => `* **${f.title}** (${f.difficulty} / Potential: ${f.mrr}): ${f.description}`).join('\n');
                
                logTerminal('Successfully compiled 3 side-hustle concepts.', 'success');
            } else {
                logTerminal('Warning: Unable to parse niche ideas JSON automatically. Displaying raw output.', 'warning');
            }
        } else if (isActionPlan) {
            const parsedPlan = parseJSONFromText(responseText);
            if (parsedPlan && (parsedPlan.setup || parsedPlan.launch || parsedPlan.scale)) {
                // Convert list
                const setupTasks = (parsedPlan.setup || []).map(t => ({ id: 'task_' + Math.random(), title: t, stage: 'setup', completed: false }));
                const launchTasks = (parsedPlan.launch || []).map(t => ({ id: 'task_' + Math.random(), title: t, stage: 'launch', completed: false }));
                const scaleTasks = (parsedPlan.scale || []).map(t => ({ id: 'task_' + Math.random(), title: t, stage: 'scale', completed: false }));

                state.tasks = [...setupTasks, ...launchTasks, ...scaleTasks];
                saveStateToLocalStorage();
                renderTasks();
                displayMessage = `📋 **The Action Plan for "${state.activeHustle.title}" is ready!** I have populated the checklist in the **Action Plan** tab. Go there to inspect, add, or complete tasks as we proceed.\n\n**Quick Overview of Tasks Loaded:**\n` +
                    `* **Setup Phase:** ${setupTasks.length} tasks\n* **Launch Phase:** ${launchTasks.length} tasks\n* **Scale Phase:** ${scaleTasks.length} tasks`;
                
                // Write SWOT analysis generated alongside to Resource Vault
                if (parsedPlan.swotAnalysis) {
                    state.vault.swot = parsedPlan.swotAnalysis;
                    saveStateToLocalStorage();
                    renderVault();
                    logTerminal('Saved Business Model & SWOT Analysis to Resource Vault.', 'success');
                }
                logTerminal('Active Action Plan updated.', 'success');
            } else {
                logTerminal('Warning: Task plan format incorrect. Outputting text.', 'warning');
            }
        }

        if (isTaskExecution) {
            // Extract code block contents or save raw text
            let codeContent = '';
            const codeMatches = [...responseText.matchAll(/```(\w*)\n([\s\S]*?)\n```/g)];
            if (codeMatches.length > 0) {
                codeContent = codeMatches.map(m => m[2]).join('\n\n');
            } else {
                codeContent = responseText;
            }
            state.vault.assets = codeContent;
            saveStateToLocalStorage();
            renderVault();
            
            // Clean up the TASK_SUCCESS tag if present
            displayMessage = responseText.replace(/\[TASK_SUCCESS:.*?\]/g, '').trim();
            logTerminal(`Deliverables saved to Vault under 'Task Code & Deliverables'.`, 'success');
        }

        // Check if there's copywriting in text to save to Vault
        if (isLandingCopy) {
            state.vault.copy = responseText;
            saveStateToLocalStorage();
            renderVault();
            logTerminal('Landing Page Copy generated and saved to Resource Vault!', 'success');
        }

        const newMsg = { role: 'assistant', text: displayMessage };
        if (isTaskExecution) {
            newMsg.actionTaskId = targetTaskId;
        }
        state.messages.push(newMsg);
        saveStateToLocalStorage();
        renderChat();
        
        updateAgentStatus('success', isPro ? 'CO-FOUNDER PRO: STANDBY' : 'CO-FOUNDER: ONLINE (FREE)');
        logTerminal('Co-founder response received.', 'success');

    } catch (error) {
        console.error(error);
        state.messages.pop();
        state.messages.push({
            role: 'assistant',
            text: `❌ **Connection Error:** ${error.message}`
        });
        saveStateToLocalStorage();
        renderChat();
        updateAgentStatus('idle', 'CO-FOUNDER: ERROR');
        logTerminal(`Critical connection error: ${error.message}`, 'error');
    }
}

// Dual-tier AI call: FREE = Cerebras proxy, PRO = Gemini 3 Flash direct
async function callGeminiAPI(promptText, attempt = 1) {
    const MAX_ATTEMPTS = 3;

    // ---- PRO TIER: User has a Gemini API key ----
    if (state.apiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${state.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        if ((response.status === 503 || response.status === 429) && attempt < MAX_ATTEMPTS) {
            const delayMs = attempt * 2000;
            logTerminal(`Gemini overloaded — retrying in ${delayMs / 1000}s...`, 'warning');
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return callGeminiAPI(promptText, attempt + 1);
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Gemini HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]) {
            return data.candidates[0].content.parts[0].text;
        }
        throw new Error('Invalid response structure from Gemini API.');
    }

    // ---- FREE TIER / PRO SUBSCRIBER: Route through serverless proxy ----
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: promptText,
            personaMode: state.personaMode,
            userId: currentUser ? currentUser.id : null,
            email: currentUser ? currentUser.email : null
        })
    });

    if ((response.status === 503 || response.status === 429) && attempt < MAX_ATTEMPTS) {
        const delayMs = attempt * 2000;
        logTerminal(`Free tier overloaded — retrying in ${delayMs / 1000}s...`, 'warning');
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return callGeminiAPI(promptText, attempt + 1);
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Free tier error ${response.status}`);
    }

    const data = await response.json();
    if (!data.text) throw new Error('Empty response from free tier.');
    return data.text;
}


// Helper: Show alert toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Helper: Append line to terminal
function logTerminal(message, type = 'info') {
    const term = document.getElementById('terminal-body');
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    let typeClass = 'log-info';
    if (type === 'success') typeClass = 'log-success';
    if (type === 'warning') typeClass = 'log-warning';
    if (type === 'error') typeClass = 'log-error';

    line.innerHTML = `<span class="timestamp">[${time}]</span> <span class="${typeClass}">${message}</span>`;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
}

// Helper: Simulate terminal logging step
function simulateTerminalStep(message, delay) {
    setTimeout(() => {
        logTerminal(message, 'info');
    }, delay);
}

// Helper: Update Header status indicator
function updateAgentStatus(styleClass, text) {
    const badge = document.getElementById('agent-status');
    const dot = badge.querySelector('.status-indicator');
    const txt = badge.querySelector('.status-text');

    dot.className = `status-indicator ${styleClass}`;
    txt.innerText = text;
}

// System Prompt: General Conversation
function getGeneralSystemPrompt() {
    let context = '';
    if (state.activeHustle) {
        context = `Our active business concept is: "${state.activeHustle.title}" - Description: ${state.activeHustle.description}. Difficulty is ${state.activeHustle.difficulty}. Target MRR: ${state.activeHustle.mrr}.`;
    } else {
        context = `We do not have an active side hustle selected yet. Recommend that we brainstorm side hustles.`;
    }

    return `You are Midias, an active, brilliant, growth-focused AI startup co-founder. You write in a direct, proactive, and highly professional tone. You are assisting your human co-founder in creating a profitable side hustle starting with a strict $${state.initialBudget} starting budget, with the goal of hitting $${state.targetRevenue} in revenue.
    
    ${getPersonaContext()}
    
    ${context}
    
    Currently spent: $${state.expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}. Remaining budget: $${(state.initialBudget - state.expenses.reduce((sum, e) => sum + e.amount, 0)).toFixed(2)}.
    
    RULES:
    1. Be concise, actionable, and structured. Avoid fluff.
    2. Write in Markdown. Bold key metrics and task requirements.
    3. Suggest practical, zero-cost platforms (GitHub Pages, Netlify, Carrd, Gumroad, free tiers) to bypass coding hurdles.
    4. Provide actual deliverables (copy, titles, structure) instead of placeholders.`;
}

// ==========================================
// SYSTEM PROMPTS
// ==========================================

function getPersonaContext() {
    switch (state.personaMode) {
        case 'aggressive':
            return `STRATEGY MODE: AGGRESSIVE SCALE. Focus on paid ads, fast validation, high-ticket sales, and maximum ROI. Tolerate higher risk for faster scale.`;
        case 'audience':
            return `STRATEGY MODE: AUDIENCE-FIRST. Focus on organic content creation, community building, personal branding, and SEO. Prioritize trust and long-term asset building over immediate cash.`;
        case 'bootstrapper':
        default:
            return `STRATEGY MODE: BOOTSTRAPPER. Focus on $0 cost tools, slow and steady growth, high-margin sweat equity, and extreme frugality.`;
    }
}

// System Prompt: Brainstorm Niche Ideas
function getBrainstormSystemPrompt() {
    return `You are Midias, an AI startup co-founder. The user has asked you to brainstorm 3 unique, zero-cost side hustles that can be launched under 48 hours using Gemini API or low-code web templates with a budget of $${state.initialBudget}.
    
    ${getPersonaContext()}
    
    IMPORTANT: You must return ONLY a JSON array containing exactly 3 business ideas in the structure below. Do not wrap the JSON in conversational text. Just return the JSON encapsulated in a \`\`\`json block.
    
    JSON SCHEMA:
    \`\`\`json
    [
      {
        "title": "Business Name idea",
        "description": "Specific niche target, service description, how it generates revenue using free AI/web tiers.",
        "difficulty": "Easy" | "Medium" | "Hard",
        "mrr": "Estimated Monthly Recurring Revenue (e.g. $1,500/mo)"
      }
    ]
    \`\`\`
    
    Ensure the descriptions are detailed and focus on actual, real-world services (e.g., SEO directories, automated newsletters, niche databases, setting up custom agents for local shops, auditing services).`;
}

// System Prompt: Generate Action Plan
function getActionPlanSystemPrompt() {
    return `You are Midias, an AI startup co-founder. The user wants you to generate an action plan and business audit for our active side hustle: "${state.activeHustle ? state.activeHustle.title : ''}".
    
    ${getPersonaContext()}
    
    IMPORTANT: You must return ONLY a JSON object containing the action plan checklist and a SWOT report in the structure below. Do not wrap the JSON in conversational text. Just return the JSON encapsulated in a \`\`\`json block.
    
    JSON SCHEMA:
    \`\`\`json
    {
      "setup": [
        "Setup Task 1 (e.g. create a GitHub repository for our landing page template)",
        "Setup Task 2 (e.g. setup Netlify static hosting for free)",
        "Setup Task 3"
      ],
      "launch": [
        "Launch Task 1 (e.g. write cold outreach emails for local dentists)",
        "Launch Task 2 (e.g. list our service on Fiverr with SWOT sample portfolio)",
        "Launch Task 3"
      ],
      "scale": [
        "Scale Task 1 (e.g. upsell automated newsletter management for $29/mo)",
        "Scale Task 2",
        "Scale Task 3"
      ],
      "swotAnalysis": "### SWOT Analysis for our active business\\n\\n**Strengths:**\\n- ...\\n\\n**Weaknesses:**\\n- ...\\n\\n**Opportunities:**\\n- ...\\n\\n**Threats:**\\n- ...\\n\\n### Target Buyer Persona\\n- **Demographics:** ...\\n- **Pain Points:** ...\\n- **Value Pitch:** ..."
    }
    \`\`\`
    
    Ensure you provide at least 3-4 highly specific tasks per phase. Write the swotAnalysis content as standard Markdown formatted string (use double backslashes for newline tags \\n).`;
}

// Helper: Parse JSON from markdown code block
function parseJSONFromText(text) {
    try {
        let jsonStr = text.trim();
        // Check for markdown codeblocks
        if (jsonStr.includes('```json')) {
            jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
        } else if (jsonStr.includes('```')) {
            jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
        }
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Failed parsing JSON from assistant response:', e);
        return null;
    }
}

// Helper: Render simple markdown paragraphs, bold, bullet points
function formatMarkdown(text) {
    if (!text) return '';
    
    // Extract code blocks first to preserve their formatting
    const codeBlocks = [];
    let html = text.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
        const placeholder = `___CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}___`;
        codeBlocks.push({ lang: lang || 'code', code });
        return placeholder;
    });
    
    // Safety escape
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Markdown links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Bullet points
    if (html.includes('\n* ') || html.includes('\n- ')) {
        const lines = html.split('\n');
        let inList = false;
        html = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                const content = trimmed.substring(2);
                let listHtml = '';
                if (!inList) {
                    listHtml += '<ul>';
                    inList = true;
                }
                listHtml += `<li>${content}</li>`;
                return listHtml;
            } else {
                let listHtml = '';
                if (inList) {
                    listHtml += '</ul>';
                    inList = false;
                }
                listHtml += trimmed ? `<p>${trimmed}</p>` : '';
                return listHtml;
            }
        }).join('');
        if (inList) html += '</ul>';
    } else {
        // Linebreaks
        html = html.split('\n\n').map(p => p.trim() ? `<p>${p.replace(/\n/g, '<br>')}</p>` : '').join('');
    }
    
    // Headings
    html = html.replace(/&lt;h4&gt;(.*?)&lt;\/h4&gt;/g, '<h4>$1</h4>');
    html = html.replace(/### (.*?)(?=<br>|<p>|$)/g, '<h3>$1</h3>');
    html = html.replace(/## (.*?)(?=<br>|<p>|$)/g, '<h2>$1</h2>');
    html = html.replace(/# (.*?)(?=<br>|<p>|$)/g, '<h1>$1</h1>');

    // Inject code blocks back with styled elements
    codeBlocks.forEach((block, index) => {
        const placeholder = `___CODE_BLOCK_PLACEHOLDER_${index}___`;
        const escapedCode = block.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const codeBlockHtml = `
            <div class="chat-code-block">
                <div class="code-block-header">
                    <span class="code-block-lang">${block.lang}</span>
                    <button class="code-block-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.chat-code-block').querySelector('code').innerText); showToast('Copied to clipboard!', 'success');"><i class="fa-solid fa-copy"></i> Copy</button>
                </div>
                <pre><code class="language-${block.lang}">${escapedCode}</code></pre>
            </div>
        `;
        // Use split/join to avoid regex replace issues on code contents
        html = html.split(placeholder).join(codeBlockHtml);
    });

    return html;
}

// Fetch Google Trends from our Pages API function
const TRENDS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchGoogleTrends(forceRefresh = false) {
    const grid = document.getElementById('trends-grid');
    if (!grid) return;

    // Use cached results if fresh enough and not forced
    const cacheAge = Date.now() - state.trendsLastFetched;
    if (!forceRefresh && state.trends.length > 0 && cacheAge < TRENDS_CACHE_TTL_MS) {
        renderGoogleTrends();
        logTerminal(`Using cached trends (refreshes in ${Math.round((TRENDS_CACHE_TTL_MS - cacheAge) / 1000)}s).`, 'info');
        return;
    }

    // Show loading indicator
    grid.innerHTML = `
        <div class="trend-loader">
            <i class="fa-solid fa-spinner fa-spin gold-text"></i>
            <span>Fetching real-time feeds from Product Hunt & Reddit...</span>
        </div>
    `;

    try {
        const response = await fetch(`/api/trends?geo=${state.trendsGeo}`);
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        const data = await response.json();
        const rawFeeds = data.feeds || [];

        // Check if we can run AI synthesis (either we have user key OR the free Cerebras proxy is available)
        // Note: Cerebras is always available unless the server environment variable is missing.
        const canSynthesize = true; 

        if (canSynthesize && rawFeeds.length > 0) {
            grid.innerHTML = `
                <div class="trend-loader">
                    <i class="fa-solid fa-brain fa-beat gold-text" style="font-size: 1.25rem; margin-bottom: 0.5rem;"></i>
                    <span>Midias is synthesizing actionable side hustles from feeds...</span>
                </div>
            `;
            try {
                state.trends = await synthesizeHustlesWithAI(rawFeeds);
                state.isSynthesized = true;
            } catch (err) {
                console.warn('AI trends synthesis failed, showing raw feeds:', err);
                logTerminal('AI synthesis unavailable — showing raw market feeds.', 'warning');
                state.trends = rawFeeds;
                state.isSynthesized = false;
            }
        } else {
            state.trends = rawFeeds;
            state.isSynthesized = false;
        }

        state.trendsLastFetched = Date.now();
        renderGoogleTrends();
    } catch (err) {
        console.error('Failed to fetch trends:', err);
        grid.innerHTML = `
            <div class="trend-loader">
                <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i>
                <span style="color: var(--danger);">Failed to fetch market feeds.</span>
                <button class="btn btn-gold-outline btn-sm" id="retry-trends-btn" style="margin-top: 0.5rem; font-size: 0.7rem; padding: 2px 8px;">Retry</button>
            </div>
        `;
        
        const retryBtn = document.getElementById('retry-trends-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                fetchGoogleTrends(true);
            });
        }
        
        logTerminal(`Error: Failed to fetch market feeds: ${err.message}`, 'error');
    }
}

// Call AI (via callGeminiAPI) to synthesize raw feeds into side hustles
async function synthesizeHustlesWithAI(feeds) {
    const feedText = feeds.map((f, i) => `${i + 1}. [${f.source}] "${f.title}" - ${f.description || ''}`).join('\n');

    const prompt = `You are Midias, a startup incubator analyst and expert side hustle co-founder.
Below is a list of trending launches (Product Hunt) and startup discussions (Reddit) today.

Analyze this list and extract/synthesize exactly 6 highly actionable, zero-cost side hustle concepts that can be launched in 48 hours with a $100 starting budget.

For EACH concept, provide:
- title: A specific, descriptive business name or service name (e.g. "Google Maps SEO Optimizer", "AI Shorts Voiceover Service")
- description: A detailed 2-3 sentence explanation of the specific micro-niche service, how it solves a customer pain point, and how to launch it using free tiers.
- source: A short citation of which raw items it was inspired by (e.g., "Inspired by Reddit r/saas & Product Hunt MailAI")
- difficulty: "Easy" | "Medium" | "Hard"
- mrr: Estimated MRR potential (e.g. "$1,500/mo")

Raw Market Context:
${feedText}

Return ONLY a JSON array containing exactly 6 objects in the format above. Do not wrap in conversational text. Return the JSON inside a \`\`\`json block.`;

    const responseText = await callGeminiAPI(prompt);
    const parsed = parseJSONFromText(responseText);
    if (parsed && Array.isArray(parsed)) {
        logTerminal(`Midias successfully synthesized 6 active side hustle opportunities.`, 'success');
        return parsed;
    }
    throw new Error('Could not parse synthesized hustle opportunities JSON.');
}

// Render the Trends Grid (can be synthesized AI hustles or raw feeds)
function renderGoogleTrends() {
    const grid = document.getElementById('trends-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!state.trends || state.trends.length === 0) {
        grid.innerHTML = `
            <div class="trend-loader">
                <p>No active trends or feeds found.</p>
            </div>
        `;
        return;
    }

    state.trends.forEach(item => {
        const card = document.createElement('div');
        card.className = 'trend-card';

        if (state.isSynthesized) {
            // Render Synthesized Side Hustles
            const difficultyClass = item.difficulty ? item.difficulty.toLowerCase() : 'medium';
            card.innerHTML = `
                <div class="trend-header" style="flex-direction: column; align-items: flex-start; gap: 0.25rem;">
                    <span class="trend-title" style="white-space: normal; overflow: visible; text-overflow: clip; font-size: 0.85rem;" title="${item.title}">${item.title}</span>
                    <div style="display: flex; gap: 0.35rem; align-items: center; margin-top: 0.15rem;">
                        <span class="badge badge-difficulty-${difficultyClass}" style="font-size: 0.55rem; padding: 1px 4px;">${item.difficulty}</span>
                        <span class="badge badge-mrr" style="font-size: 0.55rem; padding: 1px 4px;">${item.mrr}</span>
                    </div>
                </div>
                <div class="trend-desc" style="height: auto; -webkit-line-clamp: unset; font-size: 0.72rem; margin-top: 0.25rem;" title="${item.description}">${item.description}</div>
                <div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 0.25rem; font-style: italic;">
                    ${item.source}
                </div>
                <div class="trend-actions" style="margin-top: 0.5rem;">
                    <button class="btn btn-gold btn-xs generate-trend-hustle-btn" style="padding: 2px 6px; font-size: 0.65rem;" data-trend="${item.title}" data-desc="${item.description}">
                        <i class="fa-solid fa-bolt"></i> Brainstorm Hustle
                    </button>
                </div>
            `;
            
            card.querySelector('.generate-trend-hustle-btn').addEventListener('click', (e) => {
                const title = e.currentTarget.getAttribute('data-trend');
                const desc = e.currentTarget.getAttribute('data-desc');
                const prompt = `Let's brainstorm a side hustle specifically targeting the synthesized opportunity: "${title}". Description: "${desc}". Generate 3 unique, actionable ideas and outline how we can tap into this interest with a budget of $${state.initialBudget}.`;
                handleUserMessage(prompt);
                logTerminal(`Operator requested detailed brainstorm for synthesized concept: "${title}"`, 'info');
            });
        } else {
            // Render Raw Feed Items
            const sourceClass = item.source.toLowerCase().includes('reddit') ? 'badge-difficulty-hard' : 'badge-mrr';
            card.innerHTML = `
                <div class="trend-header">
                    <span class="trend-title" title="${item.title}">${item.title}</span>
                    <span class="badge ${sourceClass}" style="font-size: 0.55rem; padding: 1px 4px;">${item.source}</span>
                </div>
                <div class="trend-desc" title="${item.description}">${item.description}</div>
                <div class="trend-actions">
                    <a href="${item.link}" target="_blank" class="btn btn-gold-outline btn-xs" style="padding: 2px 6px; font-size: 0.65rem; text-decoration: none;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> View Source
                    </a>
                    <button class="btn btn-gold btn-xs generate-trend-hustle-btn" style="padding: 2px 6px; font-size: 0.65rem; margin-left: 0.25rem;" data-trend="${item.title}">
                        <i class="fa-solid fa-bolt"></i> Brainstorm Hustle
                    </button>
                </div>
            `;

            card.querySelector('.generate-trend-hustle-btn').addEventListener('click', (e) => {
                const trendName = e.currentTarget.getAttribute('data-trend');
                const prompt = `Let's brainstorm a side hustle specifically targeting the trending market query: "${trendName}". Generate 3 unique, actionable ideas and outline how we can tap into this interest with a budget of $${state.initialBudget}.`;
                handleUserMessage(prompt);
                logTerminal(`Operator requested niche generation for raw feed item: "${trendName}"`, 'info');
            });
        }

        grid.appendChild(card);
    });
}


// ==========================================
// Export Business Plan Feature
// ==========================================
function exportBusinessPlan() {
    if (!state.activeHustle) {
        showToast('You need an active side hustle to export a business plan.', 'warning');
        return;
    }

    const totalSpent = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const remaining = state.initialBudget - totalSpent;

    let markdown = `# MIDIAS AI BUSINESS PLAN\n\n`;
    markdown += `## EXECUTIVE SUMMARY\n`;
    markdown += `**Active Hustle:** ${state.activeHustle.title}\n`;
    markdown += `**Description:** ${state.activeHustle.description}\n\n`;
    markdown += `### Financial Snapshot\n`;
    markdown += `- **Initial Budget:** $${state.initialBudget.toFixed(2)}\n`;
    markdown += `- **Target Revenue:** $${state.targetRevenue.toLocaleString()}\n`;
    markdown += `- **Total Spent:** $${totalSpent.toFixed(2)}\n`;
    markdown += `- **Remaining Runway:** $${remaining.toFixed(2)}\n\n`;

    markdown += `## ACTION PLAN\n\n`;
    ['setup', 'launch', 'scale'].forEach(stage => {
        markdown += `### ${stage.toUpperCase()} PHASE\n`;
        const stageTasks = state.tasks.filter(t => t.stage === stage);
        if (stageTasks.length === 0) {
            markdown += `No tasks defined for this phase.\n\n`;
        } else {
            stageTasks.forEach(t => {
                markdown += `- [${t.completed ? 'x' : ' '}] ${t.text}\n`;
            });
            markdown += `\n`;
        }
    });

    markdown += `## EXPENSES\n\n`;
    if (state.expenses.length === 0) {
        markdown += `No expenses logged.\n\n`;
    } else {
        markdown += `| Date | Description | Category | Amount |\n`;
        markdown += `|---|---|---|---|\n`;
        state.expenses.forEach(e => {
            markdown += `| ${new Date(e.date).toLocaleDateString()} | ${e.description} | ${e.category} | $${e.amount.toFixed(2)} |\n`;
        });
        markdown += `\n`;
    }

    markdown += `## RESOURCE VAULT\n\n`;
    
    if (state.vault.swot) {
        markdown += `### Business Model & SWOT Analysis\n`;
        markdown += `${state.vault.swot}\n\n`;
    }
    
    if (state.vault.persona) {
        markdown += `### Target Buyer Persona\n`;
        markdown += `${state.vault.persona}\n\n`;
    }
    
    if (state.vault.copy) {
        markdown += `### Landing Page Copy\n`;
        markdown += `${state.vault.copy}\n\n`;
    }

    // Trigger Download
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = state.activeHustle.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `HustlePlan_${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logTerminal('Business plan exported successfully!', 'success');
    showToast('Business Plan Exported!', 'success');
}

// ==========================================
// SUPABASE SYNC AND AUTH OPERATIONS
// ==========================================

function initSupabase() {
    if (typeof supabase !== 'undefined' && CONFIG && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && CONFIG.SUPABASE_URL.indexOf("your-project-id") === -1) {
        try {
            window.supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            
            // Listen for auth state changes
            window.supabaseClient.auth.onAuthStateChange((event, session) => {
                if (session) {
                    currentUser = session.user;
                    handleUserLoggedIn(session.user);
                } else {
                    currentUser = null;
                    handleUserLoggedOut();
                }
            });
        } catch (e) {
            console.error("Supabase initialization error:", e);
        }
    } else {
        console.log("Supabase not configured or running in Local Mode.");
    }
}

async function handleUserLoggedIn(user) {
    document.getElementById('auth-trigger-btn').style.display = 'none';
    const profileMenu = document.getElementById('user-profile-menu');
    profileMenu.style.display = 'flex';
    document.getElementById('user-email-badge').innerText = user.email;
    
    logTerminal(`User logged in: ${user.email}`, 'info');
    showToast(`Welcome back!`, 'success');
    
    await loadStateFromCloud(user.id);
}

function handleUserLoggedOut() {
    document.getElementById('auth-trigger-btn').style.display = 'block';
    document.getElementById('user-profile-menu').style.display = 'none';
    
    logTerminal('User logged out. Loaded local workspace.', 'info');
    showToast('Logged out successfully.', 'info');
    
    loadStateFromLocalStorage();
    renderAll();
}

async function loadStateFromCloud(userId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('user_states')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        
        if (error) throw error;
        
        if (data) {
            state.apiKey = data.api_key || '';
            state.isPro = data.is_pro || (currentUser && currentUser.email === 'bricam55@gmail.com') || false;
            state.activeHustle = data.active_hustle || null;
            state.nicheIdeas = data.niche_ideas || [];
            state.tasks = data.tasks || [];
            state.expenses = data.expenses || [];
            state.messages = data.messages || state.messages;
            state.vault = data.vault || { copy: '', persona: '', swot: '', assets: '' };
            state.initialBudget = data.initial_budget !== null ? parseFloat(data.initial_budget) : 100;
            state.targetRevenue = data.target_revenue !== null ? parseFloat(data.target_revenue) : 20000;
            state.personaMode = data.persona_mode || 'bootstrapper';
            
            // Populate inputs
            const apiKeyInput = document.getElementById('api-key-input');
            if (apiKeyInput) apiKeyInput.value = state.apiKey;
            
            const selector = document.getElementById('midias-persona-select');
            if (selector) selector.value = state.personaMode;
            
            logTerminal('Successfully synchronized workspace from cloud.', 'success');
            renderAll();
        } else {
            logTerminal('No cloud state found. Uploading local workspace...', 'info');
            await saveStateToCloud();
        }
    } catch (err) {
        console.error("Failed to load cloud state:", err);
        logTerminal(`Failed to load cloud state: ${err.message}. Running in offline fallback.`, 'error');
    }
}

let cloudSyncTimeout = null;

function triggerCloudSync() {
    if (!window.supabaseClient || !currentUser) return;
    
    if (cloudSyncTimeout) clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(saveStateToCloud, 1500);
}

async function saveStateToCloud() {
    if (!window.supabaseClient || !currentUser) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('user_states')
            .upsert({
                user_id: currentUser.id,
                api_key: state.apiKey,
                active_hustle: state.activeHustle,
                niche_ideas: state.nicheIdeas,
                tasks: state.tasks,
                expenses: state.expenses,
                messages: state.messages,
                vault: state.vault,
                initial_budget: state.initialBudget,
                target_revenue: state.targetRevenue,
                persona_mode: state.personaMode,
                updated_at: new Date().toISOString()
            });
            
        if (error) throw error;
        logTerminal('Workspace cloud backup updated.', 'success');
    } catch (err) {
        console.error("Cloud sync failed:", err);
    }
}

async function handleUpgradeToPro() {
    if (!currentUser) {
        const paywallModal = document.getElementById('paywall-modal');
        if (paywallModal) paywallModal.style.display = 'none';
        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.style.display = 'flex';
        showToast("Please sign in or create an account to upgrade to Pro.", "info");
        logTerminal("Upgrade requested by guest. Redirecting to Authentication.", "info");
        return;
    }
    
    try {
        logTerminal("Initiating Stripe Checkout session...", "info");
        const response = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: currentUser.email,
                userId: currentUser.id,
                origin: window.location.origin
            })
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (data.url) {
            logTerminal("Checkout session created. Redirecting to Stripe...", "success");
            window.location.href = data.url;
        } else {
            throw new Error("Missing checkout URL in response.");
        }
    } catch (err) {
        console.error("Upgrade checkout failed:", err);
        showToast(`Checkout failed: ${err.message}`, "error");
        logTerminal(`Checkout session creation failed: ${err.message}`, "error");
    }
}

function checkPaymentStatus() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
        state.isPro = true;
        updateTierUI();
        showToast('Midias AI Pro subscription activated! Thank you! ✦', 'success');
        logTerminal('Stripe payment successful. Pro subscription activated!', 'success');
        // Clean URL params without page reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    } else if (params.get('payment') === 'cancelled') {
        showToast('Subscription checkout cancelled. No charges were made.', 'warning');
        logTerminal('Stripe payment session cancelled by user.', 'warning');
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

// Proactive Task Help Functions
function helpWithTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Switch tab to co-founder chat
    switchTab('chat');

    logTerminal(`Activating Midias task assistant for: "${task.title}"`, 'info');
    
    // Automatically trigger message processing
    handleUserMessage(`🤖 Help me execute this task: "${task.title}"`, taskId);
}

function switchTab(tabName) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) {
        btn.click();
    }
}

function getTaskExecutionSystemPrompt(taskTitle) {
    return `You are Midias, the active AI Co-founder for our side hustle. The user is a non-tech person and needs hands-on help executing the task: "${taskTitle}".
Rather than giving general advice or just telling them *how* to do it, provide the *actual deliverables* directly.
- If it's a coding or landing page task: write the complete high-quality, modern, and beautiful HTML, CSS, or JS code inside standard markdown code blocks.
- If it's marketing copy or an outreach email: write the complete ready-to-send copy/email templates with clear placeholder fields.
- If it's setting up a platform or account: explain the step-by-step process in simple, non-tech jargon terms, including official links where possible.
- If it's search or market research: provide a highly detailed summary of the findings, pricing models, or API options.

Keep your response extremely proactive, clean, and directly copy-pasteable. Explain how to use the outputs in simple, jargon-free steps.
At the very end of your response, output this marker on a new line: [TASK_SUCCESS: ${taskTitle}] so our system can show completion options.`;
}


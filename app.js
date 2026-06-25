import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, query, orderByChild, equalTo, get, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let gatewaysData = [];

// DOM Elements
const el = (id) => document.getElementById(id);
const views = document.querySelectorAll('.view');
const screens = document.querySelectorAll('.screen');

// Initialize App
window.onload = () => {
    setTimeout(() => {
        el('loader').classList.remove('active');
        el('loader').classList.add('hidden');
        checkAuth();
    }, 1000);
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js');
    }
};

// Auth State Observer
function checkAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            hideAllScreens();
            el('app-container').classList.remove('hidden');
            navigate('dashboard');
            loadDashboardData();
        } else {
            currentUser = null;
            hideAllScreens();
            el('auth-container').classList.remove('hidden');
        }
    });
}

// Navigation
window.navigate = (viewId) => {
    views.forEach(v => v.classList.remove('active'));
    el(`${viewId}-view`).classList.add('active');
    
    if (viewId === 'manage-gateways') loadGateways();
    if (viewId === 'send-amount') populateGatewaysDropdown();
    if (viewId === 'history') loadHistory();
    if (viewId === 'go-to-gateway') loadGoToGateways();
};

function hideAllScreens() {
    screens.forEach(s => s.classList.add('hidden'));
}

window.switchAuth = (type) => {
    el('login-view').classList.toggle('hidden', type === 'signup');
    el('signup-view').classList.toggle('hidden', type === 'login');
};

window.togglePassword = (id) => {
    const input = el(id);
    input.type = input.type === 'password' ? 'text' : 'password';
};

// Auth Actions
el('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, el('login-email').value, el('login-password').value)
        .catch(error => alert(error.message));
});

el('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el('signup-name').value;
    createUserWithEmailAndPassword(auth, el('signup-email').value, el('signup-password').value)
        .then((creds) => {
            set(ref(db, 'users/' + creds.user.uid), {
                uid: creds.user.uid, name: name, email: creds.user.email, createdAt: Date.now()
            });
            showPopup('Account Created Successfully', 'Welcome to Account Manager!');
        }).catch(error => alert(error.message));
});

el('profile-btn').addEventListener('click', () => signOut(auth));

// UI Helpers
function animateValue(id, start, end, duration) {
    const obj = el(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = (progress * (end - start) + start).toFixed(2);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

window.showPopup = (title, msg) => {
    el('popup-title').innerText = title;
    el('popup-msg').innerText = msg;
    el('popup').classList.remove('hidden');
};
window.closePopup = () => el('popup').classList.add('hidden');

// Dashboard & Data
function loadDashboardData() {
    const gatewaysRef = query(ref(db, 'gateways'), orderByChild('uid'), equalTo(currentUser.uid));
    onValue(gatewaysRef, (snapshot) => {
        gatewaysData = [];
        snapshot.forEach(child => gatewaysData.push({ id: child.key, ...child.val() }));
        el('total-gateways').innerText = gatewaysData.length;
    });

    const txRef = query(ref(db, 'transactions'), orderByChild('uid'), equalTo(currentUser.uid));
    onValue(txRef, (snapshot) => {
        let totalSent = 0;
        snapshot.forEach(child => {
            if(child.val().status === 'Success') totalSent += parseFloat(child.val().amount);
        });
        animateValue('total-sent', 0, totalSent, 1000);
    });
}

// Gateways
el('gw-api-url').addEventListener('input', (e) => {
    try {
        const url = new URL(e.target.value);
        let name = url.hostname.replace('www.', '').split('.')[0];
        name = name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        el('gw-detected-name').value = name;
    } catch(e) { el('gw-detected-name').value = ''; }
});

el('add-gateway-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newRef = push(ref(db, 'gateways'));
    set(newRef, {
        uid: currentUser.uid,
        gatewayId: newRef.key,
        accountName: el('gw-account-name').value,
        gatewayName: el('gw-detected-name').value || 'Unknown',
        apiUrl: el('gw-api-url').value,
        createdAt: Date.now()
    }).then(() => {
        e.target.reset();
        navigate('manage-gateways');
    });
});

function loadGateways() {
    const list = el('gateway-list');
    list.innerHTML = gatewaysData.map(gw => `
        <div class="glass-card list-card">
            <div class="list-card-left">
                <span class="material-icons-round">api</span>
                <div class="list-details">
                    <h4>${gw.accountName}</h4>
                    <p>${gw.gatewayName}</p>
                </div>
            </div>
            <button class="icon-btn ripple" onclick="deleteGateway('${gw.id}')"><span class="material-icons-round text-danger">delete</span></button>
        </div>
    `).join('') || '<p class="text-center">No Gateways Found</p>';
}

window.deleteGateway = (id) => {
    if(confirm('Delete this gateway?')) remove(ref(db, 'gateways/' + id));
};

function loadGoToGateways() {
    const list = el('go-gateway-list');
    list.innerHTML = gatewaysData.map(gw => `
        <div class="glass-card list-card ripple" style="cursor:pointer" onclick="window.open('https://${new URL(gw.apiUrl).hostname}', '_blank')">
            <div class="list-card-left">
                <span class="material-icons-round">language</span>
                <div class="list-details">
                    <h4>${gw.gatewayName}</h4>
                    <p>${new URL(gw.apiUrl).hostname}</p>
                </div>
            </div>
            <span class="material-icons-round">open_in_new</span>
        </div>
    `).join('') || '<p class="text-center">No Gateways Found</p>';
}

// Send Amount
function populateGatewaysDropdown() {
    const sel = el('send-gateway');
    sel.innerHTML = gatewaysData.map(gw => `<option value="${gw.id}">${gw.accountName} - ${gw.gatewayName}</option>`).join('');
}

let pendingTx = {};

el('send-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const gw = gatewaysData.find(g => g.id === el('send-gateway').value);
    pendingTx = {
        gateway: gw,
        receiver: el('send-receiver').value,
        amount: el('send-amount').value,
        comment: el('send-comment').value || 'Payment'
    };
    
    el('conf-gateway').innerText = gw.gatewayName;
    el('conf-account').innerText = gw.accountName;
    el('conf-receiver').innerText = pendingTx.receiver;
    el('conf-amount').innerText = '$' + pendingTx.amount;
    el('conf-comment').innerText = pendingTx.comment;
    
    resetSlider();
    navigate('confirm');
});

// Slider Logic
const sliderThumb = document.querySelector('.slider-thumb');
const sliderTrack = document.querySelector('.slider-track');
let isDragging = false;

sliderThumb.addEventListener('pointerdown', () => { isDragging = true; sliderThumb.style.transition = 'none'; });
window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const rect = sliderTrack.getBoundingClientRect();
    let x = e.clientX - rect.left - 26;
    if (x < 0) x = 0;
    if (x > rect.width - 52) x = rect.width - 52;
    sliderThumb.style.left = `${x + 4}px`;
    
    if (x >= rect.width - 60) {
        isDragging = false;
        processTransaction();
    }
});
window.addEventListener('pointerup', () => {
    if (isDragging) { isDragging = false; resetSlider(); }
});

function resetSlider() {
    sliderThumb.style.transition = 'left 0.3s';
    sliderThumb.style.left = '4px';
}

// Process Transaction
function processTransaction() {
    navigate('status');
    el('processing-state').classList.remove('hidden');
    el('result-state').classList.add('hidden');
    
    // Simulate API Call
    setTimeout(() => {
        const isSuccess = Math.random() > 0.2; // 80% success rate mock
        const txId = 'TXN' + Date.now();
        const dateObj = new Date();
        const status = isSuccess ? 'Success' : 'Failed';
        
        const txRecord = {
            uid: currentUser.uid, transactionId: txId,
            gatewayName: pendingTx.gateway.gatewayName, accountName: pendingTx.gateway.accountName,
            receiverNumber: pendingTx.receiver, amount: pendingTx.amount, comment: pendingTx.comment,
            status: status, response: isSuccess ? 'OK' : 'API Error',
            date: dateObj.toLocaleDateString(), time: dateObj.toLocaleTimeString()
        };
        
        push(ref(db, 'transactions'), txRecord);
        showResult(txRecord, isSuccess);
    }, 2000);
}

function showResult(tx, isSuccess) {
    el('processing-state').classList.add('hidden');
    el('result-state').classList.remove('hidden');
    
    const icon = el('result-icon');
    const title = el('result-title');
    
    icon.innerText = isSuccess ? 'check_circle' : 'error';
    icon.className = `material-icons-round status-icon ${isSuccess ? 'status-success-anim' : 'status-fail-anim'}`;
    title.innerText = isSuccess ? 'Payment Successful' : 'Payment Failed';
    title.style.color = isSuccess ? 'var(--success)' : 'var(--danger)';
    
    // Play sound snippet mock
    // const audio = new Audio(isSuccess ? 'success.mp3' : 'fail.mp3'); audio.play().catch(e=>{});

    el('result-receipt').innerHTML = `
        <div class="receipt-row"><span>TXN ID:</span> <strong>${tx.transactionId}</strong></div>
        <div class="receipt-row"><span>Date:</span> <strong>${tx.date} ${tx.time}</strong></div>
        <div class="receipt-row"><span>Gateway:</span> <strong>${tx.gatewayName}</strong></div>
        <div class="receipt-row"><span>Receiver:</span> <strong>${tx.receiverNumber}</strong></div>
        <div class="receipt-row"><span>Amount:</span> <strong class="highlight">$${tx.amount}</strong></div>
        <div class="receipt-row"><span>Status:</span> <strong class="${isSuccess ? 'status-success' : 'status-failed'}">${tx.status}</strong></div>
    `;
}

// History
function loadHistory() {
    get(query(ref(db, 'transactions'), orderByChild('uid'), equalTo(currentUser.uid))).then(snapshot => {
        const list = el('history-list');
        const txs = [];
        snapshot.forEach(child => txs.push(child.val()));
        txs.reverse(); // Newest first
        
        list.innerHTML = txs.map(tx => `
            <div class="glass-card list-card">
                <div class="list-card-left">
                    <span class="material-icons-round ${tx.status==='Success' ? 'status-success' : 'status-failed'}">
                        ${tx.status==='Success' ? 'arrow_upward' : 'close'}
                    </span>
                    <div class="list-details">
                        <h4>${tx.receiverNumber}</h4>
                        <p>${tx.gatewayName} • ${tx.date}</p>
                    </div>
                </div>
                <div class="text-right">
                    <h4 class="highlight">$${tx.amount}</h4>
                    <small class="${tx.status==='Success' ? 'status-success' : 'status-failed'}">${tx.status}</small>
                </div>
            </div>
        `).join('') || '<p class="text-center">No Transactions Found</p>';
    });
}

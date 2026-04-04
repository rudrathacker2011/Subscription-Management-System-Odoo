/* ============================================================
   Revora — Shared Application Engine
   JWT Auth, API Client, Router, Toast, Modal, Notifications
   ============================================================ */

// ===== CONFIG =====
const API_BASE = '/api';

// ===== AUTH =====
const Auth = {
    getToken: () => localStorage.getItem('access_token'),
    getUser: () => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
    setSession: (token, user) => { localStorage.setItem('access_token', token); localStorage.setItem('user', JSON.stringify(user)); },
    clear: () => { localStorage.removeItem('access_token'); localStorage.removeItem('user'); },
    isLoggedIn: () => !!localStorage.getItem('access_token'),
    hasRole: (...roles) => { const u = Auth.getUser(); return u && roles.includes(u.role); },
    isAdmin: () => Auth.hasRole('ADMIN'),
    isInternal: () => Auth.hasRole('ADMIN', 'INTERNAL'),
    isPortal: () => Auth.hasRole('PORTAL'),
    redirect: (path) => { window.location.href = path; }
};

// ===== API CLIENT =====
const API = {
    async request(method, path, body = null, retried = false) {
        const token = Auth.getToken();
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            credentials: 'include'
        };
        if (body) opts.body = JSON.stringify(body);

        let res;
        try { res = await fetch(`${API_BASE}${path}`, opts); }
        catch (e) { throw new Error('Network error. Check your connection.'); }

        if (res.status === 401 && !retried) {
            const refreshed = await API.refreshToken();
            if (refreshed) return API.request(method, path, body, true);
            else { Auth.clear(); window.location.href = '/login.html'; return null; }
        }

        const data = await res.json().catch(() => ({ success: false, error: 'Invalid response from server.' }));
        if (!res.ok && !data.success) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    },
    get: (path) => API.request('GET', path),
    post: (path, body) => API.request('POST', path, body),
    put: (path, body) => API.request('PUT', path, body),
    delete: (path) => API.request('DELETE', path),
    async refreshToken() {
        try {
            const r = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
            if (!r.ok) return false;
            const d = await r.json();
            if (d.accessToken) { localStorage.setItem('access_token', d.accessToken); return true; }
            return false;
        } catch { return false; }
    }
};

// ===== TOAST =====
const Toast = {
    container: null,
    init() {
        if (!this.container) {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'toast-container';
                document.body.appendChild(this.container);
            }
        }
    },
    show(message, type = 'info', duration = 4000) {
        this.init();
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: '💜' };
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-message">${message}</span>`;
        this.container.appendChild(el);
        setTimeout(() => { el.style.animation = 'slideOut 0.3s forwards'; setTimeout(() => el.remove(), 300); }, duration);
    },
    success: (msg) => Toast.show(msg, 'success'),
    error: (msg) => Toast.show(msg, 'error'),
    warning: (msg) => Toast.show(msg, 'warning'),
    info: (msg) => Toast.show(msg, 'info')
};

// ===== MODAL =====
const Modal = {
    activeModals: [],
    show(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        overlay.style.display = 'flex';
        void overlay.offsetWidth;
        overlay.classList.add('active');
        this.activeModals.push(id);
        document.body.style.overflow = 'hidden';
        overlay.querySelector('.modal-close')?.addEventListener('click', () => Modal.hide(id), { once: true });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) Modal.hide(id); }, { once: true });
    },
    hide(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        overlay.classList.remove('active');
        this.activeModals = this.activeModals.filter(m => m !== id);
        if (this.activeModals.length === 0) document.body.style.overflow = '';
        setTimeout(() => {
            if (!overlay.classList.contains('active')) overlay.style.display = 'none';
        }, 300);
    },
    hideAll() { this.activeModals.forEach(id => Modal.hide(id)); }
};

// ===== CONFIRM DIALOG =====
async function confirmDialog(title, message, dangerBtn = 'Delete') {
    return new Promise(resolve => {
        let overlay = document.getElementById('confirm-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'confirm-modal';
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `<div class="modal" style="max-width:420px"><div class="modal-body" style="text-align:center;padding:36px 28px"><div class="confirm-icon">⚠️</div><div class="confirm-title" id="confirm-title"></div><div class="confirm-message" id="confirm-msg"></div></div><div class="modal-footer" style="justify-content:center"><button class="btn btn-outline" id="confirm-cancel">Cancel</button><button class="btn btn-danger" id="confirm-ok"></button></div></div>`;
            document.body.appendChild(overlay);
        }
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-msg').textContent = message;
        document.getElementById('confirm-ok').textContent = dangerBtn;
        Modal.show('confirm-modal');
        document.getElementById('confirm-ok').onclick = () => { Modal.hide('confirm-modal'); resolve(true); };
        document.getElementById('confirm-cancel').onclick = () => { Modal.hide('confirm-modal'); resolve(false); };
    });
}

// ===== NOTIFICATION BELL =====
const NotifManager = {
    dropdown: null,
    count: 0,
    async init() {
        if (!Auth.isLoggedIn()) return;
        this.setupBell();
        this.loadCount();
        // Poll every 30s
        setInterval(() => this.loadCount(), 30000);
    },
    setupBell() {
        const bellBtn = document.getElementById('notif-bell-btn');
        if (!bellBtn) return;
        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('notif-dropdown');
            if (!dropdown) return;
            dropdown.classList.toggle('active');
            if (dropdown.classList.contains('active')) this.loadNotifications();
        });
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('notif-dropdown');
            if (dropdown && !dropdown.contains(e.target) && e.target !== document.getElementById('notif-bell-btn')) {
                dropdown.classList.remove('active');
            }
        });
    },
    async loadCount() {
        try {
            const res = await API.get('/notifications/unread-count');
            this.count = res.count || 0;
            const badge = document.getElementById('notif-count');
            if (badge) {
                badge.textContent = this.count;
                badge.style.display = this.count > 0 ? 'flex' : 'none';
            }
        } catch { }
    },
    async loadNotifications() {
        try {
            const res = await API.get('/notifications?limit=10');
            const body = document.getElementById('notif-dropdown-body');
            if (!body) return;
            if (!res.data || res.data.length === 0) {
                body.innerHTML = '<div class="notif-empty">🔔 No notifications</div>';
                return;
            }
            body.innerHTML = res.data.map(n => `
                <div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="NotifManager.handleClick('${n.id}', '${n.link || ''}')">
                    <div class="notif-item-title">${n.title}</div>
                    <div class="notif-item-msg">${n.message}</div>
                    <div class="notif-item-time">${fmt.dateTime(n.createdAt)}</div>
                </div>
            `).join('');
        } catch { }
    },
    async handleClick(id, link) {
        try { await API.put(`/notifications/${id}/read`); } catch { }
        this.loadCount();
        if (link) window.location.href = link;
    },
    async markAllRead() {
        try { await API.put('/notifications/read-all'); this.loadCount(); this.loadNotifications(); Toast.success('All notifications marked as read'); } catch { }
    }
};

// ===== ICONS (Modern SVGs) =====
const ICONS = {
    dashboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
    catalog: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
    subscriptions: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>`,
    invoices: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    payments: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`,
    approval_admin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    approval_staff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
    products: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
    plans: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    templates: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    discounts: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
    taxes: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
    users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    reports: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 9l-6 6-3-3-4 4"></path></svg>`,
    logout: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`
};

// ===== SIDEBAR BUILDER =====
function buildSidebar() {
    const user = Auth.getUser();
    if (!user) { window.location.href = '/login.html'; return; }

    const menuItems = [
        { section: 'Overview' },
        { icon: ICONS.dashboard, label: 'Dashboard', href: '/dashboard.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { section: 'Operations' },
        { icon: ICONS.catalog, label: 'Product Catalog', href: '/catalog.html', roles: ['PORTAL'] },
        { icon: ICONS.subscriptions, label: 'Subscriptions', href: '/subscriptions.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { icon: ICONS.invoices, label: 'Invoices', href: '/invoices.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { icon: ICONS.payments, label: 'Payments', href: '/payments.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { section: 'Approvals', roles: ['ADMIN', 'INTERNAL'] },
        { icon: ICONS.approval_admin, label: 'Admin Approval', href: '/pending-approval.html', roles: ['ADMIN'] },
        { icon: ICONS.approval_staff, label: 'Staff Approval', href: '/staff-approval.html', roles: ['ADMIN', 'INTERNAL'] },
        { section: 'Catalog', roles: ['ADMIN', 'INTERNAL'] },
        { icon: ICONS.products, label: 'Products', href: '/products.html', roles: ['ADMIN', 'INTERNAL'] },
        { icon: ICONS.plans, label: 'Plans', href: '/plans.html', roles: ['ADMIN', 'INTERNAL'] },
        { icon: ICONS.templates, label: 'Templates', href: '/quotation-templates.html', roles: ['ADMIN', 'INTERNAL'] },
        { section: 'Administration', roles: ['ADMIN', 'INTERNAL'] },
        { icon: ICONS.discounts, label: 'Discounts', href: '/discounts.html', roles: ['ADMIN'] },
        { icon: ICONS.taxes, label: 'Taxes', href: '/taxes.html', roles: ['ADMIN', 'INTERNAL'] },
        { icon: ICONS.users, label: 'Users', href: '/users.html', roles: ['ADMIN', 'INTERNAL'] },
        { section: 'Analytics', roles: ['ADMIN', 'INTERNAL'] },
        { icon: ICONS.reports, label: 'Reports', href: '/reports.html', roles: ['ADMIN', 'INTERNAL'] },
    ];

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    let navHtml = '';
    menuItems.forEach(item => {
        if (item.section) {
            if (!item.roles || item.roles.some(r => user.role === r)) {
                navHtml += `<div class="sidebar-section-title">${item.section}</div>`;
            }
            return;
        }
        if (item.roles && !item.roles.includes(user.role)) return;
        const active = currentPage === item.href?.split('/').pop() ? 'active' : '';
        navHtml += `<a href="${item.href}" class="sidebar-link ${active}"><span class="icon">${item.icon}</span>${item.label}</a>`;
    });

    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.innerHTML = `
        <div class="sidebar-logo">
            <div class="sidebar-logo-icon">R</div>
            <div><div class="sidebar-logo-text">Revora</div><div class="sidebar-logo-sub">Subscription Platform</div></div>
        </div>
        <nav class="sidebar-nav">${navHtml}</nav>
        <div class="sidebar-footer">
            <div class="sidebar-user">
                <div class="sidebar-avatar">${initials}</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name">${user.name}</div>
                    <div class="sidebar-user-role">${user.role}</div>
                </div>
                <button class="sidebar-logout-btn" onclick="logout()" title="Logout">${ICONS.logout}</button>
            </div>
        </div>`;

        const savedScroll = sessionStorage.getItem('sidebarScrollPos');
        if (savedScroll) requestAnimationFrame(() => sidebar.scrollTop = parseInt(savedScroll, 10));
        sidebar.addEventListener('scroll', () => sessionStorage.setItem('sidebarScrollPos', sidebar.scrollTop));
    }
}

async function logout() {
    try { await API.post('/auth/logout'); } catch { }
    Auth.clear();
    window.location.href = '/login.html';
}

// ===== ROUTE GUARD =====
function requireAuth(allowedRoles = null) {
    if (!Auth.isLoggedIn()) { window.location.href = '/login.html'; return false; }
    if (allowedRoles && !Auth.hasRole(...allowedRoles)) {
        Toast.error('Access denied. Insufficient permissions.');
        setTimeout(() => window.location.href = '/dashboard.html', 1500);
        return false;
    }
    return true;
}

// ===== HELPERS =====
const fmt = {
    currency: (n, symbol = '₹') => `${symbol}${(parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    date: (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    dateTime: (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
    number: (n) => (parseFloat(n) || 0).toLocaleString('en-IN'),
    badge: (status) => {
        const s = (status || '').toLowerCase();
        return `<span class="badge badge-${s}">${status || '—'}</span>`;
    },
    initials: (name) => (name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
};

// ===== PAGINATION =====
function renderPagination(container, pagination, onPageName) {
    if (!pagination || pagination.pages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }
    const { page, pages, total } = pagination;
    let html = `<div class="pagination">
        <button class="pagination-btn" onclick="${onPageName}(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;

    const start = Math.max(1, page - 2);
    const end = Math.min(pages, page + 2);

    if (start > 1) {
        html += `<button class="pagination-btn" onclick="${onPageName}(1)">1</button>`;
        if (start > 2) html += `<span class="pagination-info">…</span>`;
    }

    for (let i = start; i <= end; i++) {
        html += `<button class="pagination-btn ${i === page ? 'active' : ''}" onclick="${onPageName}(${i})">${i}</button>`;
    }

    if (end < pages) {
        if (end < pages - 1) html += `<span class="pagination-info">…</span>`;
        html += `<button class="pagination-btn" onclick="${onPageName}(${pages})">${pages}</button>`;
    }

    html += `<button class="pagination-btn" onclick="${onPageName}(${page + 1})" ${page >= pages ? 'disabled' : ''}>›</button>
        <span class="pagination-info">${total} records</span></div>`;

    container.innerHTML = html;
}

// ===== UI UTILITIES =====
const UI = {
    // Upgrades a standard <select> to a premium Revora custom dropdown
    upgradeSelect: function (selectId, onChange) {
        const select = document.getElementById(selectId);
        if (!select) return;

        // Hide original
        select.style.display = 'none';

        // Create custom wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select';
        select.after(wrapper);

        // Create Tag/Trigger
        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        wrapper.appendChild(trigger);

        const updateTrigger = () => {
            const selectedOption = select.options[select.selectedIndex];
            trigger.textContent = selectedOption ? selectedOption.text : 'Select...';
        };
        updateTrigger();

        // Create Options List
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-select-options';

        const refreshOptions = () => {
            optionsContainer.innerHTML = '';
            Array.from(select.options).forEach((opt, idx) => {
                const div = document.createElement('div');
                div.className = 'custom-select-option' + (select.selectedIndex === idx ? ' selected' : '');
                div.textContent = opt.text;
                div.onclick = (e) => {
                    e.stopPropagation();
                    select.selectedIndex = idx;
                    updateTrigger();

                    // Update selected class
                    optionsContainer.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
                    div.classList.add('selected');

                    wrapper.classList.remove('show');
                    if (onChange) onChange(opt.value);
                    else {
                        const event = new Event('change');
                        select.dispatchEvent(event);
                    }
                };
                optionsContainer.appendChild(div);
            });
        };
        refreshOptions();

        wrapper.appendChild(optionsContainer);

        trigger.onclick = (e) => {
            e.stopPropagation();
            // Close others
            document.querySelectorAll('.custom-select').forEach(s => { if (s !== wrapper) s.classList.remove('show') });
            wrapper.classList.toggle('show');
            // Refresh in case options changed dynamically
            refreshOptions();
        };

        // Close on click outside
        if (!window._selectClickAdded) {
            document.addEventListener('click', () => {
                document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('show'));
            });
            window._selectClickAdded = true;
        }

        return { refresh: refreshOptions };
    }
};

// ===== STATUS COLORS FOR CHART =====
const STATUS_COLORS = {
    DRAFT: '#9F93B8', QUOTATION: '#F59E0B', CONFIRMED: '#7C3AED',
    ACTIVE: '#10B981', CLOSED: '#6B7280', PAID: '#10B981',
    CANCELLED: '#EF4444', PENDING: '#F59E0B',
    PENDING_ADMIN_APPROVAL: '#F59E0B', PENDING_STAFF_APPROVAL: '#7C3AED',
    APPROVED: '#10B981', REJECTED: '#EF4444'
};

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Modal.hideAll();
});

// ===== Init sidebar + notifications on all app pages =====
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('sidebar')) buildSidebar();
    if (document.getElementById('toast-container') === null) Toast.init();
    NotifManager.init();
});

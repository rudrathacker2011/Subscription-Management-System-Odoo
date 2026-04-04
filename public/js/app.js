/* ============================================================
   SubsManager — Shared Application Engine
   JWT Auth, API Client, Router, Toast, Modal Manager
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

        // Auto-refresh on 401
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
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
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
            overlay.innerHTML = `<div class="modal" style="max-width:420px"><div class="modal-body" style="text-align:center;padding:32px 24px"><div class="confirm-icon">⚠️</div><div class="confirm-title" id="confirm-title"></div><div class="confirm-message" id="confirm-msg"></div></div><div class="modal-footer" style="justify-content:center"><button class="btn btn-outline" id="confirm-cancel">Cancel</button><button class="btn btn-danger" id="confirm-ok"></button></div></div>`;
            document.body.appendChild(overlay);
        }
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-msg').textContent = message;
        document.getElementById('confirm-ok').textContent = dangerBtn;
        document.getElementById('confirm-ok').className = `btn btn-danger`;
        Modal.show('confirm-modal');
        document.getElementById('confirm-ok').onclick = () => { Modal.hide('confirm-modal'); resolve(true); };
        document.getElementById('confirm-cancel').onclick = () => { Modal.hide('confirm-modal'); resolve(false); };
    });
}

// ===== SIDEBAR BUILDER =====
function buildSidebar() {
    const user = Auth.getUser();
    if (!user) { window.location.href = '/login.html'; return; }

    const menuItems = [
        { section: 'Overview' },
        { icon: '📊', label: 'Dashboard', href: '/dashboard.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { section: 'Operations' },
        { icon: '🔄', label: 'Subscriptions', href: '/subscriptions.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { icon: '📄', label: 'Invoices', href: '/invoices.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { icon: '💳', label: 'Payments', href: '/payments.html', roles: ['ADMIN', 'INTERNAL', 'PORTAL'] },
        { section: 'Catalog', roles: ['ADMIN', 'INTERNAL'] },
        { icon: '📦', label: 'Products', href: '/products.html', roles: ['ADMIN', 'INTERNAL'] },
        { icon: '📋', label: 'Plans', href: '/plans.html', roles: ['ADMIN', 'INTERNAL'] },
        { icon: '📝', label: 'Templates', href: '/quotation-templates.html', roles: ['ADMIN', 'INTERNAL'] },
        { section: 'Administration', roles: ['ADMIN', 'INTERNAL'] },
        { icon: '🏷️', label: 'Discounts', href: '/discounts.html', roles: ['ADMIN'] },
        { icon: '💰', label: 'Taxes', href: '/taxes.html', roles: ['ADMIN', 'INTERNAL'] },
        { icon: '👥', label: 'Users', href: '/users.html', roles: ['ADMIN', 'INTERNAL'] },
        { section: 'Analytics', roles: ['ADMIN', 'INTERNAL'] },
        { icon: '📈', label: 'Reports', href: '/reports.html', roles: ['ADMIN', 'INTERNAL'] },
    ];

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    let navHtml = '';
    let inSection = false;
    menuItems.forEach(item => {
        if (item.section) {
            if (!item.roles || item.roles.some(r => user.role === r || (r === 'ADMIN' && user.role === 'ADMIN'))) {
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
            <div class="sidebar-logo-icon">💼</div>
            <div><div class="sidebar-logo-text">SubsManager</div><div class="sidebar-logo-sub">Subscription Platform</div></div>
        </div>
        <nav class="sidebar-nav">${navHtml}</nav>
        <div class="sidebar-footer">
            <div class="sidebar-user">
                <div class="sidebar-avatar">${initials}</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name">${user.name}</div>
                    <div class="sidebar-user-role">${user.role}</div>
                </div>
                <button class="sidebar-logout-btn" onclick="logout()" title="Logout">🚪</button>
            </div>
        </div>`;
    }
}

async function logout() {
    try { await API.post('/auth/logout'); } catch {}
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
function renderPagination(container, pagination, onPage) {
    if (!pagination || pagination.pages <= 1) { container.innerHTML = ''; return; }
    const { page, pages, total } = pagination;
    let html = `<div class="pagination">
        <button class="pagination-btn" onclick="(${onPage.toString()})(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
    const start = Math.max(1, page - 2), end = Math.min(pages, page + 2);
    if (start > 1) html += `<button class="pagination-btn" onclick="(${onPage.toString()})(1)">1</button>${start > 2 ? '<span class="pagination-info">…</span>' : ''}`;
    for (let i = start; i <= end; i++) {
        html += `<button class="pagination-btn ${i === page ? 'active' : ''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
    }
    if (end < pages) html += `${end < pages - 1 ? '<span class="pagination-info">…</span>' : ''}<button class="pagination-btn" onclick="(${onPage.toString()})(${pages})">${pages}</button>`;
    html += `<button class="pagination-btn" onclick="(${onPage.toString()})(${page + 1})" ${page >= pages ? 'disabled' : ''}>›</button>
        <span class="pagination-info">${total} records</span></div>`;
    container.innerHTML = html;
}

// ===== STATUS COLORS FOR CHART =====
const STATUS_COLORS = {
    DRAFT: '#94A3B8', QUOTATION: '#F59E0B', CONFIRMED: '#3B82F6',
    ACTIVE: '#10B981', CLOSED: '#6B7280', PAID: '#10B981',
    CANCELLED: '#EF4444', PENDING: '#F59E0B'
};

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Modal.hideAll();
});

// ===== Init sidebar on all app pages =====
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('sidebar')) buildSidebar();
    if (document.getElementById('toast-container') === null) Toast.init();
});

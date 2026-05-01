"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Carrega .env apenas em desenvolvimento (em produção usa variáveis do Docker)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv/config');
}
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = require("http");
const logger_1 = __importDefault(require("./utils/logger"));
const chatwootDashboardScript_1 = require("./services/chatwootDashboardScript");
const systemSettings_1 = require("./services/systemSettings");
const auth_1 = require("./middleware/auth");
const apiToken_1 = require("./middleware/apiToken");
const checkResourcePermission_1 = require("./middleware/checkResourcePermission");
const kanban_1 = __importDefault(require("./routes/kanban"));
const funnels_1 = __importDefault(require("./routes/funnels"));
const admin_1 = __importDefault(require("./routes/admin"));
const admin_setup_1 = __importDefault(require("./routes/admin-setup"));
const conversation_details_1 = __importDefault(require("./routes/conversation-details"));
const connections_1 = __importDefault(require("./routes/connections"));
const internal_chat_1 = __importDefault(require("./routes/internal-chat"));
const account_permissions_1 = __importDefault(require("./routes/account-permissions"));
const features_1 = __importDefault(require("./routes/features"));
const api_tokens_1 = __importDefault(require("./routes/api-tokens"));
const public_api_1 = __importDefault(require("./routes/public-api"));
const chatbot_flows_1 = __importDefault(require("./routes/chatbot-flows"));
const sequences_1 = __importDefault(require("./routes/sequences"));
const upload_1 = __importDefault(require("./routes/upload"));
const ai_credentials_1 = __importDefault(require("./routes/ai-credentials"));
const knowledge_base_1 = __importDefault(require("./routes/knowledge-base"));
const items_1 = __importDefault(require("./routes/items"));
const calendar_1 = __importDefault(require("./routes/calendar"));
const projects_1 = __importDefault(require("./routes/projects"));
const projectTasks_1 = __importDefault(require("./routes/projectTasks"));
const projectMilestones_1 = __importDefault(require("./routes/projectMilestones"));
const projectMembers_1 = __importDefault(require("./routes/projectMembers"));
const projectFiles_1 = __importDefault(require("./routes/projectFiles"));
const projectDiscussions_1 = __importDefault(require("./routes/projectDiscussions"));
const customFields_1 = __importDefault(require("./routes/customFields"));
const permissions_1 = __importDefault(require("./routes/permissions"));
const cwapp_auth_1 = __importDefault(require("./routes/cwapp-auth"));
const cwapp_conversations_1 = __importDefault(require("./routes/cwapp-conversations"));
const cwapp_contacts_1 = __importDefault(require("./routes/cwapp-contacts"));
const cwapp_push_1 = __importStar(require("./routes/cwapp-push"));
// Status config foi substituído pelo funil de sistema
// import statusConfigRouter from './routes/status-config';
const webhook_configs_1 = __importDefault(require("./routes/webhook-configs"));
const wavoip_1 = __importDefault(require("./routes/wavoip"));
const webhooks_1 = __importStar(require("./routes/webhooks"));
const swagger_1 = require("./config/swagger");
const internal_chat_2 = require("./routes/internal-chat");
const socket_1 = require("./socket");
const flowEngine_1 = require("./services/flowEngine");
const sequenceExecutor_1 = require("./services/sequenceExecutor");
const scheduler_1 = require("./services/scheduler");
require("./queues/flowQueue"); // Inicializa o worker da queue de flows
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Inicializa Socket.IO
const io = (0, socket_1.initializeSocketIO)(httpServer);
(0, webhooks_1.setSocketIO)(io);
(0, internal_chat_2.setInternalChatSocketIO)(io);
(0, flowEngine_1.setFlowEngineSocketIO)(io);
(0, sequenceExecutor_1.setSequenceExecutorSocketIO)(io);
// Inicializa Web Push (VAPID)
(0, cwapp_push_1.initWebPush)();
// Middlewares
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false // Permite embedding em iframes (necessário para Dashboard Apps do Chatwoot)
}));
// Deriva CORS_ORIGIN das variáveis de ambiente se não estiver definida
if (!process.env.CORS_ORIGIN && (process.env.KANBANCW_DOMAIN || process.env.CHATWOOT_DOMAIN)) {
    const origins = [];
    if (process.env.KANBANCW_DOMAIN) {
        const kanbanDomain = process.env.KANBANCW_DOMAIN;
        origins.push(kanbanDomain.startsWith('http') ? kanbanDomain : `https://${kanbanDomain}`);
    }
    if (process.env.CHATWOOT_DOMAIN) {
        const chatwootDomain = process.env.CHATWOOT_DOMAIN;
        origins.push(chatwootDomain.startsWith('http') ? chatwootDomain : `https://${chatwootDomain}`);
    }
    process.env.CORS_ORIGIN = origins.join(',');
    logger_1.default.info('Derived CORS_ORIGIN from domains', {
        KANBANCW_DOMAIN: process.env.KANBANCW_DOMAIN || 'not set',
        CHATWOOT_DOMAIN: process.env.CHATWOOT_DOMAIN || 'not set',
        derivedCORS: process.env.CORS_ORIGIN
    });
}
// Deriva CHATWOOT_API_URL de CHATWOOT_DOMAIN se não estiver definida
if (!process.env.CHATWOOT_API_URL && process.env.CHATWOOT_DOMAIN) {
    const chatwootDomain = process.env.CHATWOOT_DOMAIN;
    process.env.CHATWOOT_API_URL = chatwootDomain.startsWith('http')
        ? chatwootDomain
        : `https://${chatwootDomain}`;
    logger_1.default.info('Derived CHATWOOT_API_URL from CHATWOOT_DOMAIN', {
        CHATWOOT_DOMAIN: process.env.CHATWOOT_DOMAIN,
        derivedURL: process.env.CHATWOOT_API_URL
    });
}
// Deriva KANBANCW_URL de KANBANCW_DOMAIN se não estiver definida
if (!process.env.KANBANCW_URL && process.env.KANBANCW_DOMAIN) {
    const kanbanDomain = process.env.KANBANCW_DOMAIN;
    process.env.KANBANCW_URL = kanbanDomain.startsWith('http')
        ? kanbanDomain
        : `https://${kanbanDomain}`;
    logger_1.default.info('Derived KANBANCW_URL from KANBANCW_DOMAIN', {
        KANBANCW_DOMAIN: process.env.KANBANCW_DOMAIN,
        derivedURL: process.env.KANBANCW_URL
    });
}
// Configura CORS para permitir múltiplas origens
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['*'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Permite requisições sem origin (como ferramentas de teste ou requests do servidor)
        if (!origin)
            return callback(null, true);
        // Se corsOrigins contém '*', permite tudo
        if (corsOrigins.includes('*'))
            return callback(null, true);
        // Verifica se a origem está na lista permitida
        if (corsOrigins.some(allowed => origin.includes(allowed) || allowed.includes(origin))) {
            return callback(null, true);
        }
        // Permite qualquer subdomínio dos domínios configurados
        const allowedDomains = corsOrigins.map(o => {
            try {
                return new URL(o).hostname;
            }
            catch {
                return o;
            }
        });
        try {
            const requestDomain = new URL(origin).hostname;
            if (allowedDomains.some(d => requestDomain.endsWith(d) || d.endsWith(requestDomain))) {
                return callback(null, true);
            }
        }
        catch {
            // Se não conseguir parsear, rejeita
        }
        callback(new Error('CORS not allowed'), false);
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Health check (sem autenticação)
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'kanbancw-backend',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// Swagger/OpenAPI spec (sem autenticação)
app.get('/api/swagger.json', (_req, res) => {
    res.json(swagger_1.swaggerSpec);
});
// Dashboard Script dinâmico (sem autenticação - usado pelo Chatwoot Dashboard Apps)
app.get('/dashboard-script', (_req, res) => {
    const domain = process.env.KANBANCW_DOMAIN || 'localhost:3000';
    const kanbanUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    const scriptContent = `<script>
// ============================================================
// SCRIPT 1: MENU KANBAN + CONEXÕES NO SIDEBAR
// ============================================================
(function() {
  'use strict';

  // URL detectada automaticamente da variável de ambiente KANBANCW_DOMAIN
  const KANBAN_URL = '${kanbanUrl}';

  var panelOpen = false;
  var menuItemsAdded = false;
  var lastUrl = location.href;
  var observer = null;

  function injectCSS() {
    if (document.getElementById('cw-custom-css')) return;
    var css = document.createElement('style');
    css.id = 'cw-custom-css';
    css.textContent = '#cw-custom-menu-kanban,#cw-custom-menu-conexoes{margin-top:0 !important;margin-bottom:0 !important}#cw-custom-menu-kanban .menu-icon,#cw-custom-menu-conexoes .menu-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}#cw-custom-menu-kanban .menu-icon svg,#cw-custom-menu-conexoes .menu-icon svg{width:16px;height:16px}#cw-custom-panel{position:fixed;top:0;right:0;bottom:0;background:#fff;z-index:100;display:none;flex-direction:column}#cw-custom-panel.visible{display:flex}#cw-custom-panel .panel-body{flex:1;position:relative;background:#fff;overflow:hidden}#cw-custom-panel iframe{width:100%;height:100%;border:none;display:block}#cw-custom-panel .loading-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;z-index:10}#cw-custom-panel .loading-overlay.hidden{display:none}#cw-custom-panel .spinner{width:48px;height:48px;border:4px solid #e0e0e0;border-top-color:#1f93ff;border-radius:50%;animation:cwSpin .8s linear infinite}@keyframes cwSpin{to{transform:rotate(360deg)}}#cw-custom-panel .loading-text{margin-top:16px;color:#6e84a3;font-size:14px}#cw-custom-panel .error-overlay{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:#fff;text-align:center;padding:40px;z-index:10}#cw-custom-panel .error-overlay.visible{display:flex}#cw-custom-panel .error-icon{font-size:64px;margin-bottom:20px}#cw-custom-panel .error-title{font-size:20px;font-weight:600;color:#1f2d3d;margin:0 0 10px}#cw-custom-panel .error-text{color:#6e84a3;margin:0 0 24px;max-width:400px;line-height:1.5}#cw-custom-panel .error-btn{padding:12px 24px;background:#1f93ff;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s}#cw-custom-panel .error-btn:hover{background:#1976d2}';
    document.head.appendChild(css);
  }

  function getSidebarWidth() {
    var aside = document.querySelector('aside.bg-n-solid-2, aside[class*="bg-n-solid"], aside.border-r, aside');
    if (aside) {
      return aside.getBoundingClientRect().right;
    }
    return 200;
  }

  function createPanel() {
    if (document.getElementById('cw-custom-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'cw-custom-panel';
    panel.innerHTML = '<div class="panel-body"><div class="loading-overlay" id="cw-loading"><div class="spinner"></div><p class="loading-text">Carregando...</p></div><div class="error-overlay" id="cw-error"><div class="error-icon">🔒</div><h3 class="error-title">Site Protegido</h3><p class="error-text">Este site possui proteções que impedem a exibição incorporada.</p><button class="error-btn" onclick="window.cwCustomExternal()">↗️ Abrir em Nova Aba</button></div><iframe id="cw-iframe" src="about:blank" allow="microphone; camera"></iframe></div>';
    document.body.appendChild(panel);
  }

  function getAuthFromCookie() {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.indexOf('cw_d_session_info=') === 0) {
        try {
          var value = cookie.substring('cw_d_session_info='.length);
          var parsed = JSON.parse(decodeURIComponent(value));
          if (parsed['access-token'] && parsed['client'] && parsed['uid']) {
            return parsed;
          }
        } catch (e) {
          console.log('[CW Menu] Erro ao parsear cookie:', e);
        }
      }
    }
    return null;
  }

  window.cwCustomOpen = function(path) {
    path = path || '';
    panelOpen = true;
    var panel = document.getElementById('cw-custom-panel');
    var iframe = document.getElementById('cw-iframe');
    var loading = document.getElementById('cw-loading');
    var error = document.getElementById('cw-error');
    var kanbanItem = document.getElementById('cw-custom-menu-kanban');
    var conexoesItem = document.getElementById('cw-custom-menu-conexoes');

    panel.style.left = getSidebarWidth() + 'px';
    loading.classList.remove('hidden');
    error.classList.remove('visible');
    iframe.src = KANBAN_URL + path;
    panel.classList.add('visible');

    if (path === '/conexoes' && conexoesItem) {
      conexoesItem.classList.add('active');
      if (kanbanItem) kanbanItem.classList.remove('active');
    } else if (kanbanItem) {
      kanbanItem.classList.add('active');
      if (conexoesItem) conexoesItem.classList.remove('active');
    }

    iframe.onload = function() {
      loading.classList.add('hidden');
      var auth = getAuthFromCookie();
      if (auth && iframe.contentWindow) {
        console.log('[CW Menu] Enviando token para iframe...');
        iframe.contentWindow.postMessage({
          type: 'AUTH_TOKEN',
          payload: auth
        }, '*');
      }
    };

    setTimeout(function() { if (!loading.classList.contains('hidden')) { loading.classList.add('hidden'); error.classList.add('visible'); } }, 8000);
  };

  window.cwCustomClose = function() {
    panelOpen = false;
    var panel = document.getElementById('cw-custom-panel');
    var iframe = document.getElementById('cw-iframe');
    var kanbanItem = document.getElementById('cw-custom-menu-kanban');
    var conexoesItem = document.getElementById('cw-custom-menu-conexoes');

    panel.classList.remove('visible');
    iframe.src = 'about:blank';
    if (kanbanItem) kanbanItem.classList.remove('active');
    if (conexoesItem) conexoesItem.classList.remove('active');
  };

  window.cwCustomExternal = function() { window.open(KANBAN_URL, '_blank'); };
  window.cwCustomToggleKanban = function() { panelOpen ? window.cwCustomClose() : window.cwCustomOpen(''); };
  window.cwCustomToggleConexoes = function() { panelOpen ? window.cwCustomClose() : window.cwCustomOpen('/conexoes'); };

  function closeOnNavigation() {
    if (panelOpen && location.href !== lastUrl) {
      window.cwCustomClose();
    }
    lastUrl = location.href;
  }

  function setupNavigationDetection() {
    window.addEventListener('popstate', closeOnNavigation);
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function() { origPush.apply(this, arguments); closeOnNavigation(); };
    history.replaceState = function() { origReplace.apply(this, arguments); closeOnNavigation(); };
    document.addEventListener('click', function(e) {
      if (!panelOpen) return;
      var link = e.target.closest('a');
      if (link && !link.closest('#cw-custom-panel')) {
        setTimeout(closeOnNavigation, 100);
      }
    }, true);
  }

  function addMenuItems() {
    if (document.getElementById('cw-custom-menu-kanban')) { menuItemsAdded = true; return true; }

    var mainNav = document.querySelector('aside nav ul.list-none, aside nav > ul, nav.grid ul');
    if (!mainNav) {
      console.log('[CW Menu] Não encontrou ul do menu principal');
      return false;
    }

    var allLi = mainNav.querySelectorAll(':scope > li');
    if (allLi.length === 0) {
      console.log('[CW Menu] Não encontrou itens li no menu');
      return false;
    }

    var refLi = null;
    var refLink = null;
    for (var i = 0; i < allLi.length; i++) {
      var text = allLi[i].textContent.toLowerCase();
      if (text.includes('relatório') || text.includes('report') || text.includes('campanha') || text.includes('campaign')) {
        refLi = allLi[i];
        refLink = refLi.querySelector('a, div[role="button"]');
        break;
      }
    }

    if (!refLi) {
      refLi = allLi[allLi.length - 1];
      refLink = refLi.querySelector('a, div[role="button"]');
    }

    if (!refLi || !refLink) {
      console.log('[CW Menu] Não encontrou item de referência');
      return false;
    }

    // Menu Kanban
    var kanbanLi = document.createElement('li');
    kanbanLi.className = refLi.className;
    var kanbanItem = document.createElement('div');
    kanbanItem.id = 'cw-custom-menu-kanban';
    kanbanItem.className = refLink.className;
    kanbanItem.setAttribute('role', 'button');
    kanbanItem.style.cursor = 'pointer';
    kanbanItem.innerHTML = '<div class="relative flex items-center gap-2"><div class="flex items-center gap-1.5 flex-grow min-w-0"><span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg></span><span class="text-sm font-medium leading-5 truncate">Kanban</span></div></div>';
    kanbanItem.onclick = function(e) { e.preventDefault(); window.cwCustomToggleKanban(); };
    kanbanLi.appendChild(kanbanItem);

    // Menu Conexões
    var conexoesLi = document.createElement('li');
    conexoesLi.className = refLi.className;
    var conexoesItem = document.createElement('div');
    conexoesItem.id = 'cw-custom-menu-conexoes';
    conexoesItem.className = refLink.className;
    conexoesItem.setAttribute('role', 'button');
    conexoesItem.style.cursor = 'pointer';
    conexoesItem.innerHTML = '<div class="relative flex items-center gap-2"><div class="flex items-center gap-1.5 flex-grow min-w-0"><span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></span><span class="text-sm font-medium leading-5 truncate">Conexões</span></div></div>';
    conexoesItem.onclick = function(e) { e.preventDefault(); window.cwCustomToggleConexoes(); };
    conexoesLi.appendChild(conexoesItem);

    mainNav.insertBefore(kanbanLi, refLi);
    mainNav.insertBefore(conexoesLi, refLi);

    menuItemsAdded = true;
    if (observer) { observer.disconnect(); observer = null; }
    console.log('[CW Menu] Itens Kanban e Conexões adicionados!');
    return true;
  }

  function initMenu() {
    injectCSS();
    createPanel();
    setupNavigationDetection();
    var attempts = 0;
    var maxAttempts = 30;
    function tryAdd() {
      if (menuItemsAdded) return;
      if (addMenuItems()) return;
      attempts++;
      if (attempts < maxAttempts) setTimeout(tryAdd, 500);
    }
    setTimeout(tryAdd, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenu);
  } else {
    initMenu();
  }
})();

// ============================================================
// SCRIPT 2: WIDGET FLUTUANTE NA CONVERSA (associar ao funil)
// ============================================================
(function() {
  'use strict';

  // URL detectada automaticamente da variável de ambiente KANBANCW_DOMAIN
  const KANBAN_URL = '${kanbanUrl}';

  var WIDGET_CONFIG = {
    apiUrl: KANBAN_URL + '/api'
  };

  var currentConversationId = null;
  var widgetModalState = {
    funnels: [],
    selectedFunnel: null,
    currentStage: null
  };

  function getAuthHeaders() {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.indexOf('cw_d_session_info=') === 0) {
        try {
          var value = cookie.substring('cw_d_session_info='.length);
          var parsed = JSON.parse(decodeURIComponent(value));
          if (parsed['access-token'] && parsed['client'] && parsed['uid']) {
            return {
              'access-token': parsed['access-token'],
              'token-type': parsed['token-type'] || 'Bearer',
              'client': parsed['client'],
              'expiry': parsed['expiry'] || '',
              'uid': parsed['uid']
            };
          }
        } catch (e) {
          console.log('[Kanban Widget] Erro ao parsear cookie:', e);
        }
      }
    }
    return null;
  }

  function getConversationIdFromUrl() {
    var match = location.pathname.match(/\\/conversations\\/(\\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  function injectWidgetCSS() {
    if (document.getElementById('cw-kanban-widget-css')) return;
    var css = document.createElement('style');
    css.id = 'cw-kanban-widget-css';
    css.textContent = '#cw-kanban-header-btn{display:inline-flex;align-items:center;min-w:0;gap:2px;transition:all 100ms ease-out;border:0;border-radius:8px;outline:1px solid transparent;opacity:50;cursor:pointer;background:transparent;height:32px;width:32px;padding:0;justify-content:center;color:var(--s-600)}#cw-kanban-header-btn:hover{opacity:100;background:rgba(0,0,0,0.05)}#cw-kanban-header-btn.has-stage{opacity:100;color:#059669}#cw-kanban-header-btn svg{width:16px;height:16px}#cw-kanban-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:1000}#cw-kanban-modal-overlay.visible{display:flex}#cw-kanban-modal{background:#fff;border-radius:12px;width:90%;max-width:420px;max-height:80vh;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.2)}#cw-kanban-modal .modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb}#cw-kanban-modal .modal-header h3{margin:0;font-size:16px;font-weight:600;color:#111827}#cw-kanban-modal .close-btn{background:none;border:none;font-size:24px;color:#6b7280;cursor:pointer;padding:0;line-height:1}#cw-kanban-modal .close-btn:hover{color:#111827}#cw-kanban-modal .modal-body{padding:16px 20px;max-height:60vh;overflow-y:auto}#cw-kanban-modal .loading{display:flex;align-items:center;justify-content:center;gap:12px;padding:32px;color:#6b7280}#cw-kanban-modal .loading .spinner{width:20px;height:20px;border:2px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:cwWidgetSpin .8s linear infinite}@keyframes cwWidgetSpin{to{transform:rotate(360deg)}}#cw-kanban-modal .error-msg{padding:12px;background:#fef2f2;color:#dc2626;border-radius:8px;font-size:14px}#cw-kanban-modal .current-stage{display:flex;align-items:center;gap:8px;padding:12px;background:#f0fdf4;border-radius:8px;margin-bottom:16px;flex-wrap:wrap}#cw-kanban-modal .current-stage .label{font-size:12px;color:#6b7280}#cw-kanban-modal .current-stage .value{font-size:14px;font-weight:500;color:#059669;flex:1}#cw-kanban-modal .remove-btn{padding:4px 12px;background:#fee2e2;color:#dc2626;border:none;border-radius:4px;font-size:12px;cursor:pointer}#cw-kanban-modal .remove-btn:hover{background:#fecaca}#cw-kanban-modal .section-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:#374151;margin-bottom:12px}#cw-kanban-modal .back-btn{background:none;border:none;color:#3b82f6;font-size:14px;cursor:pointer;padding:0;margin-bottom:12px}#cw-kanban-modal .back-btn:hover{text-decoration:underline}#cw-kanban-modal .list{display:flex;flex-direction:column;gap:8px}#cw-kanban-modal .list-item{display:flex;align-items:center;gap:12px;padding:12px;background:#f9fafb;border-radius:8px;cursor:pointer;transition:background .15s ease;border:none;width:100%;text-align:left;font-family:inherit}#cw-kanban-modal .list-item:hover{background:#f3f4f6}#cw-kanban-modal .list-item.selected{background:#dbeafe;border:1px solid #3b82f6}#cw-kanban-modal .color-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}#cw-kanban-modal .item-name{flex:1;font-size:14px;color:#111827}#cw-kanban-modal .item-count{font-size:12px;color:#9ca3af}#cw-kanban-modal .empty-state{padding:24px;text-align:center;color:#9ca3af;font-size:14px}';
    document.head.appendChild(css);
  }

  function createHeaderButton() {
    console.log('[Kanban Widget] === createHeaderButton iniciado ===');

    var existing = document.getElementById('cw-kanban-header-btn');
    if (existing) {
      console.log('[Kanban Widget] Botão já existe, retornando true');
      return true;
    }

    var allButtons = document.querySelectorAll('button');
    console.log('[Kanban Widget] Total de botões na página: ' + allButtons.length);

    var actionsContainer = null;
    var siblingBtn = null;

    for (var i = 0; i < allButtons.length; i++) {
      var btn = allButtons[i];
      var rect = btn.getBoundingClientRect();

      if (rect.width >= 28 && rect.width <= 40 && rect.height >= 28 && rect.height <= 40 && rect.width > 0) {
        if (rect.left > window.innerWidth * 0.6) {
          var parent = btn.parentElement;
          if (parent) {
            var siblings = parent.querySelectorAll(':scope > button');
            if (siblings.length >= 2 && siblings.length <= 6) {
              console.log('[Kanban Widget] Candidato encontrado! Botões no container: ' + siblings.length + ', posição X: ' + rect.left);
              actionsContainer = parent;
              siblingBtn = btn;
              break;
            }
          }
        }
      }
    }

    if (!actionsContainer) {
      console.log('[Kanban Widget] Container não encontrado pelo método de botões');

      var allSpans = document.querySelectorAll('span');
      for (var j = 0; j < allSpans.length; j++) {
        if (allSpans[j].textContent.trim() === 'Ações da conversa') {
          console.log('[Kanban Widget] Encontrou "Ações da conversa", buscando botões acima...');
          var section = allSpans[j].closest('div');
          if (section && section.parentElement) {
            var parentDiv = section.parentElement;
            var divsAbove = parentDiv.querySelectorAll('div');
            for (var k = 0; k < divsAbove.length; k++) {
              var btns = divsAbove[k].querySelectorAll(':scope > button');
              if (btns.length >= 2 && btns.length <= 6) {
                var divRect = divsAbove[k].getBoundingClientRect();
                var sectionRect = section.getBoundingClientRect();
                if (divRect.bottom < sectionRect.top + 50) {
                  actionsContainer = divsAbove[k];
                  siblingBtn = btns[0];
                  console.log('[Kanban Widget] Container encontrado via fallback com ' + btns.length + ' botões');
                  break;
                }
              }
            }
          }
          break;
        }
      }
    }

    if (!actionsContainer) {
      console.log('[Kanban Widget] FALHA: Nenhum container encontrado');
      return false;
    }

    if (actionsContainer.querySelector('#cw-kanban-header-btn')) {
      console.log('[Kanban Widget] Botão já existe no container');
      return true;
    }

    var newBtn = document.createElement('button');
    newBtn.id = 'cw-kanban-header-btn';
    newBtn.title = 'Associar ao Kanban';

    if (siblingBtn) {
      newBtn.className = siblingBtn.className;
      console.log('[Kanban Widget] Classes copiadas: ' + siblingBtn.className.substring(0, 50) + '...');
    } else {
      newBtn.className = 'inline-flex items-center justify-center min-w-0 gap-0.5 transition-all duration-100 ease-out border-0 rounded-lg outline outline-1 outline-transparent disabled:opacity-50 bg-n-slate-9/10 text-n-slate-9/10 hover:enabled:bg-n-slate-9/20 focus-visible:bg-n-slate-9/20 outline-transparent h-8 w-8 p-0 text-sm';
    }

    newBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>';

    newBtn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      window.openKanbanWidgetModal();
    };

    actionsContainer.appendChild(newBtn);
    console.log('[Kanban Widget] SUCESSO! Botão adicionado ao container');

    return true;
  }

  function createWidgetModal() {
    if (document.getElementById('cw-kanban-modal-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'cw-kanban-modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) window.closeKanbanWidgetModal(); };
    overlay.innerHTML = '<div id="cw-kanban-modal"><div class="modal-header"><h3>Associar ao Kanban</h3><button class="close-btn" onclick="window.closeKanbanWidgetModal()">&times;</button></div><div class="modal-body" id="cw-kanban-modal-body"><div class="loading"><div class="spinner"></div><span>Carregando...</span></div></div></div>';
    document.body.appendChild(overlay);
  }

  window.openKanbanWidgetModal = function() {
    var overlay = document.getElementById('cw-kanban-modal-overlay');
    overlay.classList.add('visible');
    widgetModalState.selectedFunnel = null;
    loadWidgetModalData();
  };

  window.closeKanbanWidgetModal = function() {
    var overlay = document.getElementById('cw-kanban-modal-overlay');
    overlay.classList.remove('visible');
  };

  async function loadWidgetModalData() {
    var body = document.getElementById('cw-kanban-modal-body');
    body.innerHTML = '<div class="loading"><div class="spinner"></div><span>Carregando...</span></div>';

    var authHeaders = getAuthHeaders();
    if (!authHeaders) {
      body.innerHTML = '<div class="error-msg">Token de autenticacao nao encontrado. Faca login novamente.</div>';
      return;
    }

    try {
      var funnelsRes = await fetch(WIDGET_CONFIG.apiUrl + '/funnels', {
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders)
      });
      if (!funnelsRes.ok) throw new Error('Erro ao carregar funis');
      var funnelsData = await funnelsRes.json();
      widgetModalState.funnels = funnelsData.data || [];

      if (currentConversationId) {
        var stageRes = await fetch(WIDGET_CONFIG.apiUrl + '/kanban/conversation/' + currentConversationId + '/stage', {
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders)
        });
        if (stageRes.ok) {
          var stageData = await stageRes.json();
          widgetModalState.currentStage = stageData.data;
        }
      }

      renderWidgetModalContent();
    } catch (err) {
      body.innerHTML = '<div class="error-msg">' + err.message + '</div>';
    }
  }

  function renderWidgetModalContent() {
    var body = document.getElementById('cw-kanban-modal-body');
    var html = '';

    if (widgetModalState.currentStage) {
      html += '<div class="current-stage"><span class="label">Etapa atual:</span><span class="value">' + widgetModalState.currentStage.funnelName + ' &rarr; ' + widgetModalState.currentStage.stageName + '</span><button class="remove-btn" onclick="window.removeFromKanbanWidget()">Remover</button></div>';
    }

    if (!widgetModalState.selectedFunnel) {
      html += '<p class="section-title">Selecione um funil:</p><div class="list">';
      if (widgetModalState.funnels.length === 0) {
        html += '<div class="empty-state">Nenhum funil encontrado. Crie um funil no Kanban primeiro.</div>';
      } else {
        widgetModalState.funnels.forEach(function(funnel) {
          html += '<button class="list-item" onclick="window.selectKanbanWidgetFunnel(' + funnel.id + ')"><div class="color-dot" style="background-color:' + funnel.color + '"></div><span class="item-name">' + funnel.name + '</span><span class="item-count">' + funnel.stages.length + ' etapas</span></button>';
        });
      }
      html += '</div>';
    } else {
      html += '<button class="back-btn" onclick="window.goBackToKanbanWidgetFunnels()">&larr; Voltar</button>';
      html += '<p class="section-title"><div class="color-dot" style="background-color:' + widgetModalState.selectedFunnel.color + '"></div>' + widgetModalState.selectedFunnel.name + '</p><div class="list">';
      widgetModalState.selectedFunnel.stages.forEach(function(stage) {
        var isSelected = widgetModalState.currentStage && widgetModalState.currentStage.stageId === stage.id;
        html += '<button class="list-item' + (isSelected ? ' selected' : '') + '" onclick="window.selectKanbanWidgetStage(' + stage.id + ')"><div class="color-dot" style="background-color:' + stage.color + '"></div><span class="item-name">' + stage.name + '</span></button>';
      });
      html += '</div>';
    }

    body.innerHTML = html;
  }

  window.selectKanbanWidgetFunnel = function(funnelId) {
    widgetModalState.selectedFunnel = widgetModalState.funnels.find(function(f) { return f.id === funnelId; });
    renderWidgetModalContent();
  };

  window.goBackToKanbanWidgetFunnels = function() {
    widgetModalState.selectedFunnel = null;
    renderWidgetModalContent();
  };

  window.selectKanbanWidgetStage = async function(stageId) {
    var authHeaders = getAuthHeaders();
    if (!authHeaders || !currentConversationId) return;

    var body = document.getElementById('cw-kanban-modal-body');
    body.innerHTML = '<div class="loading"><div class="spinner"></div><span>Salvando...</span></div>';

    try {
      var res = await fetch(WIDGET_CONFIG.apiUrl + '/kanban/' + currentConversationId + '/move-to-stage', {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
        body: JSON.stringify({ stageId: stageId })
      });

      if (!res.ok) throw new Error('Erro ao salvar');

      var stage = widgetModalState.selectedFunnel.stages.find(function(s) { return s.id === stageId; });
      widgetModalState.currentStage = {
        stageId: stageId,
        stageName: stage.name,
        stageColor: stage.color,
        funnelId: widgetModalState.selectedFunnel.id,
        funnelName: widgetModalState.selectedFunnel.name
      };

      updateHeaderButton();
      window.closeKanbanWidgetModal();
    } catch (err) {
      body.innerHTML = '<div class="error-msg">' + err.message + '</div>';
    }
  };

  window.removeFromKanbanWidget = async function() {
    var authHeaders = getAuthHeaders();
    if (!authHeaders || !currentConversationId) return;

    var body = document.getElementById('cw-kanban-modal-body');
    body.innerHTML = '<div class="loading"><div class="spinner"></div><span>Removendo...</span></div>';

    try {
      var res = await fetch(WIDGET_CONFIG.apiUrl + '/kanban/' + currentConversationId + '/remove', {
        method: 'DELETE',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders)
      });

      if (!res.ok) throw new Error('Erro ao remover');

      widgetModalState.currentStage = null;
      updateHeaderButton();
      window.closeKanbanWidgetModal();
    } catch (err) {
      body.innerHTML = '<div class="error-msg">' + err.message + '</div>';
    }
  };

  function updateHeaderButton() {
    var btn = document.getElementById('cw-kanban-header-btn');
    if (!btn) return;

    if (widgetModalState.currentStage) {
      btn.classList.add('has-stage');
      btn.title = 'Kanban: ' + widgetModalState.currentStage.stageName;
    } else {
      btn.classList.remove('has-stage');
      btn.title = 'Associar ao Kanban';
    }
  }

  async function checkCurrentStageWidget() {
    var authHeaders = getAuthHeaders();
    if (!authHeaders || !currentConversationId) return;

    try {
      var res = await fetch(WIDGET_CONFIG.apiUrl + '/kanban/conversation/' + currentConversationId + '/stage', {
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders)
      });

      if (res.ok) {
        var data = await res.json();
        widgetModalState.currentStage = data.data;
        updateHeaderButton();
      }
    } catch (err) {
      // Ignore
    }
  }

  function checkConversationPageWidget() {
    var convId = getConversationIdFromUrl();

    if (convId) {
      currentConversationId = convId;
      var attempts = 0;
      var maxAttempts = 30;

      function tryAddButton() {
        console.log('[Kanban Widget] Tentativa ' + (attempts + 1) + ' de ' + maxAttempts);
        if (createHeaderButton()) {
          console.log('[Kanban Widget] Botão criado com sucesso!');
          checkCurrentStageWidget();
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(tryAddButton, 500);
          } else {
            console.log('[Kanban Widget] Falhou após ' + maxAttempts + ' tentativas');
          }
        }
      }

      setTimeout(tryAddButton, 500);
    } else {
      currentConversationId = null;
      widgetModalState.currentStage = null;
      var btn = document.getElementById('cw-kanban-header-btn');
      if (btn) btn.remove();
    }
  }

  function setupWidgetNavigationDetection() {
    var widgetLastUrl = location.href;

    function onWidgetUrlChange() {
      if (location.href !== widgetLastUrl) {
        widgetLastUrl = location.href;
        checkConversationPageWidget();
      }
    }

    window.addEventListener('popstate', onWidgetUrlChange);

    setInterval(function() {
      if (location.href !== widgetLastUrl) {
        onWidgetUrlChange();
      }
    }, 500);
  }

  function initWidget() {
    injectWidgetCSS();
    createWidgetModal();
    setupWidgetNavigationDetection();
    checkConversationPageWidget();
    console.log('[Kanban Widget] Inicializado');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    setTimeout(initWidget, 100);
  }
})();
</script>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(scriptContent);
});
// Webhooks (sem autenticação - validado por IP/token do Chatwoot)
app.use('/webhooks', webhooks_1.default);
// API pública REST (deve vir ANTES das rotas /api genéricas para evitar conflito com validateAuth)
app.use('/api/v1', apiToken_1.authenticateApiToken, public_api_1.default);
// Rotas CWApp (app mobile/externo) — /auth e /push/vapid-public-key SEM validateAuth
app.use('/api/cwapp/auth', cwapp_auth_1.default);
app.use('/api/cwapp/conversations', auth_1.validateAuth, cwapp_conversations_1.default);
app.use('/api/cwapp/contacts', auth_1.validateAuth, cwapp_contacts_1.default);
app.use('/api/cwapp/push', auth_1.validateAuth, cwapp_push_1.default);
// Chave pública VAPID é pública — sem auth
app.get('/api/cwapp/push/vapid-public-key', (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key)
        return res.status(503).json({ error: 'Push não configurado' });
    res.json({ publicKey: key });
});
// Rotas protegidas
app.use('/api/kanban', auth_1.validateAuth, (0, checkResourcePermission_1.checkResourcePermission)('kanbanAccess'), kanban_1.default);
app.use('/api/funnels', auth_1.validateAuth, (0, checkResourcePermission_1.checkResourcePermission)('kanbanAccess'), funnels_1.default);
app.use('/api/conversations', auth_1.validateAuth, conversation_details_1.default);
app.use('/api/connections', auth_1.validateAuth, (0, checkResourcePermission_1.checkResourcePermission)('conexoesAccess'), connections_1.default);
app.use('/api', auth_1.validateAuth, items_1.default);
app.use('/api/calendar', auth_1.validateAuth, calendar_1.default);
app.use('/api/projects', auth_1.validateAuth, (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), projects_1.default);
app.use('/api', auth_1.validateAuth, projectTasks_1.default);
app.use('/api', auth_1.validateAuth, projectMilestones_1.default);
app.use('/api', auth_1.validateAuth, projectMembers_1.default);
app.use('/api', auth_1.validateAuth, projectFiles_1.default);
app.use('/api', auth_1.validateAuth, projectDiscussions_1.default);
app.use('/api', auth_1.validateAuth, customFields_1.default);
app.use('/api/permissions', auth_1.validateAuth, permissions_1.default);
// Status config foi substituído pelo funil de sistema
// app.use('/api/status-config', validateAuth, statusConfigRouter);
// Rotas de administração (só autenticação, verificação de admin é interna)
app.use('/api/admin', auth_1.validateAuth, admin_1.default);
app.use('/api/admin/setup', auth_1.validateAuth, admin_setup_1.default);
// Rotas de chat interno
app.use('/api/internal-chats', auth_1.validateAuth, (0, checkResourcePermission_1.checkResourcePermission)('chatsInternosAccess'), internal_chat_1.default);
// Rotas de permissões de accounts (Super Admin)
app.use('/api/account-permissions', auth_1.validateAuth, account_permissions_1.default);
// Rotas de features habilitadas para a account
app.use('/api/features', auth_1.validateAuth, features_1.default);
// Rotas de gerenciamento de API tokens (requer autenticação normal)
app.use('/api/api-tokens', auth_1.validateAuth, api_tokens_1.default);
// Rotas de configuração de webhooks do kanban
app.use('/api/webhook-configs', auth_1.validateAuth, webhook_configs_1.default);
// Rotas Wavoip (tokens por conexão + histórico de chamadas)
app.use('/api/wavoip', auth_1.validateAuth, wavoip_1.default);
// Rotas de chatbot flows
app.use('/api', auth_1.validateAuth, chatbot_flows_1.default);
// Rotas de sequências assíncronas
app.use('/api/sequences', auth_1.validateAuth, (0, checkResourcePermission_1.checkResourcePermission)('chatbotFlowsAccess'), sequences_1.default);
// Rotas de credenciais de IA (OpenAI, Groq, etc)
app.use('/api', auth_1.validateAuth, ai_credentials_1.default);
// Rotas de Base de Conhecimento
app.use('/api', auth_1.validateAuth, knowledge_base_1.default);
// Rota de upload de arquivos
app.use('/api', upload_1.default);
// Servir arquivos de upload com CORS habilitado
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handler
app.use((err, _req, res, _next) => {
    logger_1.default.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
    });
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    logger_1.default.info(`Kanban Backend started on port ${PORT}`);
    logger_1.default.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger_1.default.info(`Chatwoot API: ${process.env.CHATWOOT_API_URL}`);
    logger_1.default.info(`CORS Origin: ${process.env.CORS_ORIGIN}`);
    // Aplica Dashboard Script automaticamente no startup
    (0, chatwootDashboardScript_1.applyDashboardScriptOnStartup)().catch((error) => {
        logger_1.default.error('Erro ao aplicar Dashboard Script no startup', { error });
    });
    // Migra configurações de provider para o registro global (accountId=0)
    // Garante que instalações existentes funcionem sem re-configuração manual
    (0, systemSettings_1.migrateGlobalProviderSettings)().catch((error) => {
        logger_1.default.error('Erro ao migrar configurações globais de provider', { error });
    });
    // Inicia o scheduler de mensagens agendadas
    (0, scheduler_1.startScheduler)();
});
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.default.info('SIGTERM received, shutting down...');
    httpServer.close(() => {
        logger_1.default.info('Server closed');
        process.exit(0);
    });
});
//# sourceMappingURL=index.js.map
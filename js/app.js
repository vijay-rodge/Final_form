// AgriSure Climate-Aware Credit Risk Assessment — Application Controller
// Handles Clean URL Routing (History API), Navigation, Active States, and Mobile Menu Toggle

document.addEventListener('DOMContentLoaded', () => {
  initTabNavigation();
  initGlobalLinkInterceptor();
  initMobileMenu();
  
  // Check if redirected from static server 404 fallback
  const redirectPath = sessionStorage.getItem('agrisure_spa_redirect');
  if (redirectPath) {
    sessionStorage.removeItem('agrisure_spa_redirect');
    navigateTo(redirectPath);
    return;
  }

  // Listen for browser Back / Forward history navigation
  window.addEventListener('popstate', handleRouting);
  
  // Initial route evaluation on page load
  handleRouting();
});

// Route Map (Clean Path -> DOM Container ID)
const ROUTES = {
  '': 'tab-dashboard',
  'dashboard': 'tab-dashboard',
  'farmer': 'tab-dashboard',
  'loans': 'tab-loans',
  'crops': 'tab-crops',
  'climate': 'tab-climate',
  'risk': 'tab-risk',
  'officer': 'tab-officer',
  'login': 'tab-login',
  'register': 'tab-register'
};

/**
 * Programmatically navigates to a clean URL path using HTML5 History API
 */
function navigateTo(path) {
  let cleanRoute = (path || '/dashboard').replace(/^#\/?/, '').trim();
  if (!cleanRoute.startsWith('/')) {
    cleanRoute = '/' + cleanRoute;
  }

  // Update browser address bar without page refresh
  if (window.location.pathname !== cleanRoute) {
    window.history.pushState({}, '', cleanRoute);
  }

  // If there was a hash in URL, clear it cleanly
  if (window.location.hash) {
    window.history.replaceState({}, '', cleanRoute);
  }

  handleRouting();
}
window.navigateTo = navigateTo;

/**
 * Initializes click handlers for navigation tabs
 */
function initTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const route = tab.getAttribute('data-route') || 'dashboard';
      navigateTo('/' + route);
      
      // Close mobile drawer on tab click if open
      const navTabsContainer = document.getElementById('mainNav');
      if (navTabsContainer && navTabsContainer.classList.contains('mobile-open')) {
        navTabsContainer.classList.remove('mobile-open');
        const toggleBtn = document.getElementById('mobileNavToggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

/**
 * Intercepts all internal link clicks for smooth SPA navigation without full reloads
 */
function initGlobalLinkInterceptor() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Handle hash fragments on same page vs clean route navigation
    if (href.startsWith('#/')) {
      e.preventDefault();
      const cleanPath = href.replace(/^#/, '');
      navigateTo(cleanPath);
      return;
    }

    if (href.startsWith('/') && !href.startsWith('//')) {
      // Don't intercept API downloads or external assets
      if (href.startsWith('/api') || href.startsWith('/css') || href.startsWith('/js') || href.startsWith('/data') || href.includes('.')) {
        return;
      }
      e.preventDefault();
      navigateTo(href);
    }
  });
}

/**
 * Handles client-side clean URL routing and DOM visibility updates
 */
function handleRouting() {
  // If legacy hash fragment exists, clean it up to pushState clean URL
  if (window.location.hash && window.location.hash.startsWith('#/')) {
    const legacyRoute = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
    if (ROUTES[legacyRoute] !== undefined) {
      window.history.replaceState({}, '', '/' + (legacyRoute === 'dashboard' ? 'dashboard' : legacyRoute));
    }
  }

  // Extract clean route name from location.pathname (e.g. "/login" -> "login")
  let path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase().trim();
  
  // Default to 'dashboard' if route is empty or index.html
  let routeName = path;
  if (!routeName || routeName === 'index.html') {
    routeName = 'dashboard';
  }

  // Alias /farmer to /dashboard
  if (routeName === 'farmer') {
    routeName = 'dashboard';
  }

  // Default to 'dashboard' if route is unknown
  if (ROUTES[routeName] === undefined) {
    routeName = 'dashboard';
  }

  const targetId = ROUTES[routeName];
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');
  const mainNav = document.getElementById('mainNav');

  // Hide header navigation tabs on full-screen authentication routes
  const isAuthRoute = (routeName === 'login' || routeName === 'register');
  if (mainNav) {
    mainNav.style.display = isAuthRoute ? 'none' : 'flex';
  }

  // Update active state and ARIA attributes on navigation tabs
  tabs.forEach(tab => {
    const tabRoute = tab.getAttribute('data-route');
    const isTarget = (tabRoute === routeName);
    
    tab.classList.toggle('active', isTarget);
    tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  // Toggle visible page section
  contents.forEach(content => {
    const isTarget = (content.id === targetId);
    content.classList.toggle('active', isTarget);
  });

  // Execute route-specific data load & auth route initializers
  if (routeName === 'dashboard') {
    if (window.loadFarmerDashboardData) window.loadFarmerDashboardData();
  } else if (routeName === 'loans') {
    if (window.initLoansPageView) {
      window.initLoansPageView();
    } else if (window.prefillLoanApplicationForm) {
      window.prefillLoanApplicationForm();
    }
  } else if (routeName === 'risk') {
    if (window.updateRiskRoleVisibility) window.updateRiskRoleVisibility();
  } else if (routeName === 'officer' && window.loadOfficerPortalData) {
    window.loadOfficerPortalData();
  } else if (isAuthRoute && window.initAuthPageRoute) {
    window.initAuthPageRoute(routeName);
  }

  // Re-render Lucide icons if loaded
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // Scroll to top of main content on page switch
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.handleRouting = handleRouting;

/**
 * Initializes mobile responsive hamburger menu toggle
 */
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const navTabsContainer = document.getElementById('mainNav');

  if (toggleBtn && navTabsContainer) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = navTabsContainer.classList.toggle('mobile-open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }
}

/* ============================================================
   PROMPTVAULT — Public Gallery
   No ES modules — works via file:// and GitHub Pages alike
   ============================================================ */

(function () {
  'use strict';

  // ─── State ─────────────────────────────────────────────────
  var state = {
    allPrompts:      [],   // full local dataset (offline mode)
    rendered:        [],   // what's currently on screen
    page:            1,
    loading:         false,
    hasMore:         true,
    activeCategory:  'all',
    searchQuery:     '',
  };

  // ─── DOM refs ───────────────────────────────────────────────
  var gallery        = document.getElementById('gallery');
  var searchInput    = document.getElementById('search-input');
  var filterBtns     = document.querySelectorAll('[data-category]');
  var loadingEl      = document.getElementById('loading-spinner');
  var emptyEl        = document.getElementById('empty-state');
  var promptCountEl  = document.getElementById('prompt-count');

  // ─── Cursor Glow ───────────────────────────────────────────
  function initCursorGlow() {
    var glow = document.getElementById('cursor-glow');
    if (!glow || window.matchMedia('(pointer: coarse)').matches) return;
    var raf, mx = -300, my = -300;
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        glow.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
      });
    });
  }

  // ─── Animated Canvas Background ────────────────────────────
  function initBgCanvas() {
    var canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w, h, orbs;

    function resize() {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function makeOrbs() {
      orbs = [
        { x: w*.1,  y: h*.3,  r: 340, col: '99,59,210',   vx:  .15, vy:  .08 },
        { x: w*.8,  y: h*.2,  r: 270, col: '59,130,246',  vx: -.12, vy:  .10 },
        { x: w*.5,  y: h*.8,  r: 310, col: '6,182,212',   vx:  .10, vy: -.09 },
        { x: w*.2,  y: h*.7,  r: 190, col: '139,92,246',  vx:  .08, vy:  .13 },
      ];
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < orbs.length; i++) {
        var o = orbs[i];
        o.x += o.vx; o.y += o.vy;
        if (o.x < -o.r || o.x > w + o.r) o.vx *= -1;
        if (o.y < -o.r || o.y > h + o.r) o.vy *= -1;
        var g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, 'rgba(' + o.col + ',0.12)');
        g.addColorStop(1, 'rgba(' + o.col + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }

    resize(); makeOrbs(); draw();
    window.addEventListener('resize', function () { resize(); makeOrbs(); });
  }

  // ─── Data Layer ─────────────────────────────────────────────
  function fetchData() {
    if (state.loading) return;
    state.loading = true;
    showLoading(true);

    if (PV_CONFIG.USE_LOCAL_DATA) {
      fetchLocal();
    } else {
      fetchSupabase();
    }
  }

  // ── Offline: load JSON file ──────────────────────────────────
  function fetchLocal() {
    // If we already loaded everything, just re-filter
    if (state.allPrompts.length > 0) {
      renderFiltered();
      showLoading(false);
      state.loading = false;
      return;
    }

    // Try XHR first (works in most browsers with file://)
    var xhr = new XMLHttpRequest();
    xhr.open('GET', PV_CONFIG.LOCAL_DATA_PATH, true);
    xhr.onload = function () {
      if (xhr.status === 200 || xhr.status === 0) {
        try {
          state.allPrompts = JSON.parse(xhr.responseText);
        } catch (e) {
          state.allPrompts = getSampleFallback();
        }
      } else {
        state.allPrompts = getSampleFallback();
      }
      renderFiltered();
      showLoading(false);
      state.loading = false;
    };
    xhr.onerror = function () {
      // file:// XHR fails in some browsers — use built-in fallback
      state.allPrompts = getSampleFallback();
      renderFiltered();
      showLoading(false);
      state.loading = false;
    };
    xhr.send();
  }

  // ── Online: load from Supabase ───────────────────────────────
  function fetchSupabase() {
    var db = pvInitSupabase();
    if (!db) {
      showError('Supabase not initialised. Check js/config.js');
      showLoading(false);
      state.loading = false;
      return;
    }

    var from = (state.page - 1) * PV_CONFIG.PAGE_SIZE;
    var to   = state.page * PV_CONFIG.PAGE_SIZE - 1;

    var query = db
      .from(PV_CONFIG.PROMPTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (state.activeCategory !== 'all') query = query.eq('category', state.activeCategory);
    if (state.searchQuery.trim())       query = query.ilike('prompt_text', '%' + state.searchQuery.trim() + '%');

    query.then(function (res) {
      if (res.error) { showError(res.error.message); return; }
      if (res.data.length < PV_CONFIG.PAGE_SIZE) state.hasMore = false;
      state.page++;
      appendCards(res.data);
      updateCount(null, res.data.length);
      showLoading(false);
      state.loading = false;
    });
  }

  // ─── Local render (filter + paginate client-side) ────────────
  function renderFiltered(reset) {
    if (reset) {
      gallery.innerHTML = '';
      state.rendered = [];
      state.page = 1;
    }

    var filtered = state.allPrompts.filter(function (p) {
      var catMatch = state.activeCategory === 'all' || p.category === state.activeCategory;
      var srchMatch = !state.searchQuery.trim() ||
        p.prompt_text.toLowerCase().indexOf(state.searchQuery.toLowerCase()) !== -1;
      return catMatch && srchMatch;
    });

    var start = (state.page - 1) * PV_CONFIG.PAGE_SIZE;
    var slice = filtered.slice(start, start + PV_CONFIG.PAGE_SIZE);

    if (slice.length < PV_CONFIG.PAGE_SIZE) state.hasMore = false;
    else state.hasMore = true;

    appendCards(slice);
    state.rendered = state.rendered.concat(slice);
    updateCount(filtered.length, null);

    emptyEl.style.display = (filtered.length === 0) ? 'flex' : 'none';
  }

  // ─── Card Creation ───────────────────────────────────────────
  function appendCards(prompts) {
    for (var i = 0; i < prompts.length; i++) {
      (function(p, idx) {
        var card = buildCard(p);
        gallery.appendChild(card);
        setTimeout(function () { card.classList.add('card--visible'); }, idx * 55);
      })(prompts[i], i);
    }
  }

  function buildCard(p) {
    var card = document.createElement('article');
    card.className = 'prompt-card';
    card.setAttribute('data-id', p.id);
    card.setAttribute('role', 'listitem');

    var truncated  = truncate(p.prompt_text, 115);
    var catColor   = catColorOf(p.category);
    var dateStr    = niceDate(p.created_at);
    var safeImg    = esc(p.image_url);
    var safePrompt = esc(p.prompt_text);
    var safePromptAttr = p.prompt_text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    var jsPrompt   = p.prompt_text.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$');

    card.innerHTML =
      '<div class="card__image-wrap">' +
        '<img class="card__image" src="' + safeImg + '" alt="AI generated image" loading="lazy" decoding="async" ' +
          'onerror="this.src=\'data:image/svg+xml,' + placeholderSVG() + '\'" />' +
        '<div class="card__image-overlay">' +
          '<button class="card__expand-btn" aria-label="View full image" ' +
            'onclick="PV.openLightbox(\'' + safeImg + '\',`' + jsPrompt + '`)">' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="card__body">' +
        '<div class="card__meta">' +
          '<span class="card__category" style="--cat-color:' + catColor + '">' + esc(p.category || 'General') + '</span>' +
          '<span class="card__date">' + dateStr + '</span>' +
        '</div>' +
        '<p class="card__prompt" title="' + safePromptAttr + '">' + esc(truncated) + '</p>' +
        '<div class="card__actions">' +
          '<button class="btn-copy" onclick="PV.copyPrompt(this,`' + jsPrompt + '`)" aria-label="Copy prompt">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>' +
            '</svg>' +
            '<span>Copy Prompt</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    return card;
  }

  // ─── Lightbox ────────────────────────────────────────────────
  window.PV = window.PV || {};

  PV.openLightbox = function (src, text) {
    var lb = document.getElementById('lightbox');
    lb.querySelector('.lightbox__img').src   = src;
    lb.querySelector('.lightbox__prompt').textContent = text;
    lb.classList.add('lightbox--open');
    document.body.style.overflow = 'hidden';
  };

  PV.closeLightbox = function () {
    document.getElementById('lightbox').classList.remove('lightbox--open');
    document.body.style.overflow = '';
  };

  // ─── Copy to Clipboard ───────────────────────────────────────
  PV.copyPrompt = function (btn, text) {
    var span = btn.querySelector('span');
    var svg  = btn.querySelector('svg');

    function success() {
      span.textContent = 'Copied!';
      btn.classList.add('btn-copy--success');
      svg.innerHTML = '<polyline points="20 6 9 17 4 12" stroke-width="2.5"/>';
      setTimeout(function () {
        span.textContent = 'Copy Prompt';
        btn.classList.remove('btn-copy--success');
        svg.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>';
      }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(success).catch(function () {
        fallbackCopy(text); success();
      });
    } else {
      fallbackCopy(text); success();
    }
  };

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ─── Search ──────────────────────────────────────────────────
  function initSearch() {
    if (!searchInput) return;
    var deb;
    searchInput.addEventListener('input', function () {
      clearTimeout(deb);
      deb = setTimeout(function () {
        state.searchQuery = searchInput.value;
        resetAndLoad();
      }, 320);
    });
  }

  // ─── Category Filters ────────────────────────────────────────
  function initFilters() {
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) {
          b.classList.remove('filter-btn--active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('filter-btn--active');
        btn.setAttribute('aria-selected', 'true');
        state.activeCategory = btn.getAttribute('data-category');
        resetAndLoad();
      });
    });
  }

  function resetAndLoad() {
    state.page    = 1;
    state.hasMore = true;
    gallery.innerHTML = '';
    state.rendered = [];

    if (PV_CONFIG.USE_LOCAL_DATA) {
      renderFiltered(true);
      showLoading(false);
      state.loading = false;
    } else {
      state.loading = false;
      fetchData();
    }
  }

  // ─── Infinite Scroll ─────────────────────────────────────────
  function initInfiniteScroll() {
    var sentinel = document.getElementById('scroll-sentinel');
    if (!sentinel || !window.IntersectionObserver) return;

    var obs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && state.hasMore && !state.loading) {
        state.page++;
        if (PV_CONFIG.USE_LOCAL_DATA) {
          state.loading = true;
          renderFiltered(false);
          state.loading = false;
        } else {
          fetchData();
        }
      }
    }, { rootMargin: '250px' });

    obs.observe(sentinel);
  }

  // ─── Realtime (Supabase only) ─────────────────────────────────
  function initRealtime() {
    if (PV_CONFIG.USE_LOCAL_DATA) return;
    var db = pvInitSupabase();
    if (!db) return;

    db.channel('pv-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: PV_CONFIG.PROMPTS_TABLE },
        function (payload) {
          var card = buildCard(payload.new);
          gallery.insertBefore(card, gallery.firstChild);
          requestAnimationFrame(function () { card.classList.add('card--visible'); });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: PV_CONFIG.PROMPTS_TABLE },
        function (payload) {
          var el = gallery.querySelector('[data-id="' + payload.old.id + '"]');
          if (el) el.remove();
        })
      .subscribe();
  }

  // ─── Helpers ─────────────────────────────────────────────────
  function updateCount(total, appended) {
    if (!promptCountEl) return;
    if (total !== null) promptCountEl.textContent = total;
    else promptCountEl.textContent = parseInt(promptCountEl.textContent || 0, 10) + (appended || 0);
  }

  function showLoading(show) {
    if (loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
  }

  function showError(msg) {
    gallery.innerHTML = '<div class="error-state"><p>⚠ ' + esc(msg) + '</p></div>';
  }

  function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  function niceDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function catColorOf(cat) {
    var map = {
      'Portrait':     '#8b5cf6',
      'Landscape':    '#06b6d4',
      'Abstract':     '#f59e0b',
      'Architecture': '#10b981',
      'Fantasy':      '#ec4899',
      'Sci-Fi':       '#3b82f6',
      'Character':    '#a78bfa',
      'Product':      '#14b8a6',
      'General':      '#6366f1',
    };
    return map[cat] || '#6366f1';
  }

  function placeholderSVG() {
    return encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='450'>" +
      "<rect fill='%230d0b24'/>" +
      "<text fill='%23444' font-size='16' font-family='sans-serif' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'>No image</text>" +
      "</svg>"
    );
  }

  // ─── Hard-coded fallback (used when XHR fails on file://) ────
  function getSampleFallback() {
    return [
      {
        id: 'fb-1',
        image_url: 'https://picsum.photos/seed/aurora/600/450',
        prompt_text: 'A breathtaking aurora borealis over a snow-covered pine forest, long exposure photography, deep teal and violet hues, 8k cinematic.',
        category: 'Landscape',
        created_at: new Date().toISOString()
      },
      {
        id: 'fb-2',
        image_url: 'https://picsum.photos/seed/portrait1/600/450',
        prompt_text: 'Close-up portrait of a woman with iridescent butterfly wings, ethereal studio lighting, bokeh, hyper-realistic 85mm f/1.4.',
        category: 'Portrait',
        created_at: new Date().toISOString()
      },
      {
        id: 'fb-3',
        image_url: 'https://picsum.photos/seed/scifi99/600/450',
        prompt_text: 'Massive alien megastructure floating above a gas giant, cyberpunk neon lighting, volumetric clouds, concept art, artstation.',
        category: 'Sci-Fi',
        created_at: new Date().toISOString()
      },
      {
        id: 'fb-4',
        image_url: 'https://picsum.photos/seed/abstract77/600/450',
        prompt_text: 'Fluid abstract painting of liquid mercury and molten gold colliding in zero gravity, macro, deep black background.',
        category: 'Abstract',
        created_at: new Date().toISOString()
      },
      {
        id: 'fb-5',
        image_url: 'https://picsum.photos/seed/arch22/600/450',
        prompt_text: 'Futuristic concert hall at dusk, flowing organic curves in white concrete, dramatic uplighting, architectural photography.',
        category: 'Architecture',
        created_at: new Date().toISOString()
      },
      {
        id: 'fb-6',
        image_url: 'https://picsum.photos/seed/fantasy44/600/450',
        prompt_text: 'Ancient dragon curled around a glowing crystal spire, stormy sky with lightning, dramatic chiaroscuro, oil painting by Greg Rutkowski.',
        category: 'Fantasy',
        created_at: new Date().toISOString()
      }
    ];
  }

  // ─── Keyboard shortcuts ──────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') PV.closeLightbox();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (searchInput) { searchInput.focus(); searchInput.select(); }
    }
  });

  // ─── Boot ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    initCursorGlow();
    initBgCanvas();
    initFilters();
    initSearch();
    fetchData();
    initInfiniteScroll();
    initRealtime();
  });

})();

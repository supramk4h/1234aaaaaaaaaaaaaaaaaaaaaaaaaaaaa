/* ============================================================
   PROMPTVAULT — Admin Panel (no ES modules)
   ============================================================ */

(function () {
  'use strict';

  var db = null;   // Supabase client

  // ─── Auth check ─────────────────────────────────────────────
  function checkAuth() {
    if (PV_CONFIG.USE_LOCAL_DATA) {
      showOfflineAdmin();
      return;
    }

    db = pvInitSupabase();
    if (!db) {
      showConfigError();
      return;
    }

    db.auth.getSession().then(function (res) {
      if (res.data && res.data.session) {
        showAdminPanel(res.data.session.user);
      } else {
        showLogin();
      }
    });

    db.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_IN')  showAdminPanel(session.user);
      if (event === 'SIGNED_OUT') showLogin();
    });
  }

  // ─── Sections ────────────────────────────────────────────────
  function showLogin() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('offline-section').style.display = 'none';
    document.getElementById('admin-user-info').style.display = 'none';
  }

  function showAdminPanel(user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('offline-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'block';
    document.getElementById('admin-user-info').style.display = 'flex';
    document.getElementById('admin-user-email').textContent = user.email;
    loadPrompts();
  }

  function showOfflineAdmin() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('offline-section').style.display = 'flex';
  }

  function showConfigError() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
    var el = document.getElementById('offline-section');
    el.querySelector('.offline-title').textContent = 'Supabase Not Configured';
    el.querySelector('.offline-sub').textContent = 'Fill in SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js, then set USE_LOCAL_DATA: false.';
    el.style.display = 'flex';
  }

  // ─── Login form ──────────────────────────────────────────────
  function handleLogin(e) {
    e.preventDefault();
    var email    = document.getElementById('admin-email').value.trim();
    var password = document.getElementById('admin-password').value;
    var btn      = document.getElementById('login-btn');
    var errEl    = document.getElementById('login-error');

    btn.disabled    = true;
    btn.textContent = 'Signing in…';
    errEl.textContent = '';

    db.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) {
        errEl.textContent = res.error.message;
        btn.disabled    = false;
        btn.textContent = 'Sign In';
      }
    });
  }

  function handleLogout() {
    db.auth.signOut();
  }

  // ─── Dropzone / Preview ──────────────────────────────────────
  function initDropzone() {
    var input    = document.getElementById('image-input');
    var preview  = document.getElementById('image-preview');
    var dropzone = document.getElementById('dropzone');
    var placeholder = dropzone.querySelector('.dropzone__placeholder');

    function applyFile(file) {
      if (!file || !file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        preview.src = e.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }

    input.addEventListener('change', function () { applyFile(input.files[0]); });

    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dropzone--active');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dropzone--active');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dropzone--active');
      var file = e.dataTransfer.files[0];
      if (file) {
        // Assign to input so form can read it
        try {
          var dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
        } catch (err) {}
        applyFile(file);
      }
    });
  }

  // ─── Publish ─────────────────────────────────────────────────
  function handlePublish(e) {
    e.preventDefault();

    var fileInput  = document.getElementById('image-input');
    var promptText = document.getElementById('prompt-text').value.trim();
    var category   = document.getElementById('category-select').value;
    var btn        = document.getElementById('publish-btn');
    var progress   = document.getElementById('upload-progress');

    if (!fileInput.files || !fileInput.files[0]) return showStatus('Please select an image.', 'error');
    if (!promptText) return showStatus('Please enter a prompt.', 'error');

    btn.disabled = true;
    progress.style.display = 'block';

    var file = fileInput.files[0];
    var ext  = file.name.split('.').pop();
    var name = Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;

    db.storage.from(PV_CONFIG.STORAGE_BUCKET).upload(name, file, {
      cacheControl: '3600',
      upsert: false
    }).then(function (res) {
      if (res.error) throw res.error;

      var urlRes = db.storage.from(PV_CONFIG.STORAGE_BUCKET).getPublicUrl(name);
      var publicUrl = urlRes.data.publicUrl;

      return db.from(PV_CONFIG.PROMPTS_TABLE).insert([{
        image_url:   publicUrl,
        prompt_text: promptText,
        category:    category
      }]);
    }).then(function (res) {
      if (res && res.error) throw res.error;
      showStatus('✓ Prompt published!', 'success');
      resetForm();
      loadPrompts();
    }).catch(function (err) {
      showStatus('Error: ' + (err.message || err), 'error');
    }).finally(function () {
      btn.disabled = false;
      progress.style.display = 'none';
    });
  }

  // ─── Load prompts list ───────────────────────────────────────
  function loadPrompts() {
    var list = document.getElementById('prompts-list');
    list.innerHTML = '<div class="admin-loading">Loading…</div>';

    db.from(PV_CONFIG.PROMPTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) {
          list.innerHTML = '<div class="admin-error">' + res.error.message + '</div>';
          return;
        }

        var data = res.data;
        document.getElementById('total-prompts').textContent = data.length;
        document.getElementById('list-count').textContent = data.length + ' entries';

        var cats = new Set(data.map(function (p) { return p.category; }).filter(Boolean));
        document.getElementById('total-categories').textContent = cats.size;

        if (data[0]) {
          var d = new Date(data[0].created_at);
          document.getElementById('latest-date').textContent =
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        if (data.length === 0) {
          list.innerHTML = '<div class="admin-empty">No prompts yet. Publish your first one!</div>';
          return;
        }

        list.innerHTML = data.map(function (p) {
          return '<div class="prompt-row" data-id="' + p.id + '" role="listitem">' +
            '<img class="prompt-row__thumb" src="' + esc(p.image_url) + '" alt="" loading="lazy" />' +
            '<div class="prompt-row__info">' +
              '<span class="prompt-row__cat">' + esc(p.category || 'General') + '</span>' +
              '<p class="prompt-row__text">' + esc(trunc(p.prompt_text, 75)) + '</p>' +
              '<span class="prompt-row__date">' + new Date(p.created_at).toLocaleString() + '</span>' +
            '</div>' +
            '<div class="prompt-row__actions">' +
              '<button class="admin-btn admin-btn--edit" onclick="PVAdmin.openEdit(\'' + p.id + '\')">Edit</button>' +
              '<button class="admin-btn admin-btn--delete" onclick="PVAdmin.deletePrompt(\'' + p.id + '\')">Delete</button>' +
            '</div>' +
          '</div>';
        }).join('');
      });
  }

  // ─── Edit modal ──────────────────────────────────────────────
  var editingId = null;

  window.PVAdmin = window.PVAdmin || {};

  PVAdmin.openEdit = function (id) {
    db.from(PV_CONFIG.PROMPTS_TABLE).select('*').eq('id', id).single().then(function (res) {
      if (res.error || !res.data) return alert('Could not load prompt.');
      editingId = id;
      document.getElementById('edit-prompt-text').value = res.data.prompt_text;
      document.getElementById('edit-category').value    = res.data.category || 'General';
      document.getElementById('edit-modal').classList.add('modal--open');
    });
  };

  PVAdmin.closeEdit = function () {
    editingId = null;
    document.getElementById('edit-modal').classList.remove('modal--open');
  };

  function saveEdit() {
    var text = document.getElementById('edit-prompt-text').value.trim();
    var cat  = document.getElementById('edit-category').value;
    var btn  = document.getElementById('save-edit-btn');
    if (!text || !editingId) return;

    btn.disabled = true;
    db.from(PV_CONFIG.PROMPTS_TABLE)
      .update({ prompt_text: text, category: cat })
      .eq('id', editingId)
      .then(function (res) {
        if (res.error) alert(res.error.message);
        else { PVAdmin.closeEdit(); loadPrompts(); showStatus('✓ Updated.', 'success'); }
        btn.disabled = false;
      });
  }

  PVAdmin.deletePrompt = function (id) {
    if (!confirm('Delete this prompt permanently?')) return;
    db.from(PV_CONFIG.PROMPTS_TABLE).delete().eq('id', id).then(function (res) {
      if (res.error) alert(res.error.message);
      else loadPrompts();
    });
  };

  // ─── Helpers ─────────────────────────────────────────────────
  function resetForm() {
    document.getElementById('publish-form').reset();
    var prev = document.getElementById('image-preview');
    prev.src = '';
    prev.style.display = 'none';
    var ph = document.getElementById('dropzone').querySelector('.dropzone__placeholder');
    if (ph) ph.style.display = 'flex';
  }

  function showStatus(msg, type) {
    var el = document.getElementById('status-msg');
    el.textContent = msg;
    el.className   = 'status-msg status-msg--' + type;
    setTimeout(function () { el.textContent = ''; el.className = 'status-msg'; }, 4000);
  }

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function trunc(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
  }

  // ─── Boot ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    checkAuth();

    var loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    var publishForm = document.getElementById('publish-form');
    if (publishForm) publishForm.addEventListener('submit', handlePublish);

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    var saveBtn = document.getElementById('save-edit-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveEdit);

    var cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', PVAdmin.closeEdit);

    var editModal = document.getElementById('edit-modal');
    if (editModal) editModal.addEventListener('click', function (e) {
      if (e.target === editModal) PVAdmin.closeEdit();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') PVAdmin.closeEdit();
    });

    initDropzone();
  });

})();

/* GearUp Cloud Adapter - untuk mempertahankan index.html GearUp yang sudah dikustomisasi.
   Require: ./config.js, @supabase/supabase-js@2, lalu script ini SEBELUM </body>.
   Hanya publishable/anon key (tidak ada password rahasia di browser).
*/
(() => {
  'use strict';
  const config = window.GEARUP_CONFIG || {};
  const tables = { tools: 'gearup_tools', jobsheets: 'gearup_jobsheets' };
  let client = null;
  const $ = id => document.getElementById(id);
  const escapeHTML = val => String(val ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const notice = (msg, good = false) => {
    let el = $('gearupCloudNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gearupCloudNotice';
      el.className = 'mx-4 mt-3 px-3 py-2 rounded-xl text-xs font-semibold border';
      const header = document.querySelector('#appShell header');
      if (header) header.after(el);
    }
    el.textContent = msg;
    el.style.background = good ? '#e6ecd9' : '#fef3c7';
    el.style.borderColor = good ? '#8fbc36' : '#d97706';
    el.style.color = '#2a361e';
  };
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '')
    && typeof config.supabaseAnonKey === 'string'
    && config.supabaseAnonKey.length > 40
    && !config.supabaseAnonKey.includes('ISI_');

  function toCloud(type, obj) {
    if (type === 'tools') return {
      id: obj.id, session_id: obj.sessionId, name: obj.name,
      cls: obj.cls, spec: obj.spec || '', image: obj.image || ''
    };
    return {id: obj.id, session_id: obj.sessionId, title: obj.title,
      material: obj.material || '', k3: obj.k3 || '', steps: obj.steps || [], images: obj.images || [], pdfs: obj.pdfs || []};
  }
  function fromCloud(type, obj) {
    if (type === 'tools') return {
      id: obj.id, sessionId: obj.session_id, name: obj.name,
      cls: obj.cls, spec: obj.spec || '', image: obj.image || ''
    };
    return {id: obj.id, sessionId: obj.session_id, title: obj.title,
      material: obj.material || '', k3: obj.k3 || '', steps: obj.steps || [], images: obj.images || [], pdfs: obj.pdfs || []};
  }
  const authenticated = () => Boolean(client && appState.isAdminAuthenticated);
  const requireAdmin = () => {
    if (!authenticated()) throw new Error('Hanya dosen yang login sebagai admin online dapat mengubah materi.');
  };
  const setAdmin = value => {
    appState.isAdminAuthenticated = Boolean(value);
    document.body.classList.toggle('gearup-admin-online', Boolean(value));
    $('adminBadgeHeader')?.classList.toggle('hidden', !value);
    renderAllViews();
  };
  const fail = (label, error) => {
    console.error(label, error);
    showToast(`${label}: ${error.message || error}`);
  };
  async function fetchRows(type) {
    if (!client) throw new Error('Supabase belum terhubung.');
    const {data, error} = await client.from(tables[type]).select('*').limit(1000);
    if (error) throw error;
    return (data || []).map(row => fromCloud(type, row));
  }
  async function refreshData() {
    const [tools, jobsheets] = await Promise.all([fetchRows('tools'), fetchRows('jobsheets')]);
    appState.tools = tools.length ? tools : [...INITIAL_TOOLS];
    appState.jobsheets = jobsheets.length ? jobsheets : [...INITIAL_JOBSHEETS];
    renderAllViews();
  }
  window.idbGetAll = fetchRows;
  window.idbPut = async (type, item) => {
    requireAdmin();
    const {error} = await client.from(tables[type]).upsert(toCloud(type, item));
    if (error) throw error;
  };
  window.idbDelete = async (type, id) => {
    requireAdmin();
    const {error} = await client.from(tables[type]).delete().eq('id', id);
    if (error) throw error;
  };
  window.loadOrSeedDatabase = async () => {
    if (!configured || !window.supabase?.createClient) {
      appState.tools = [...INITIAL_TOOLS];
      appState.jobsheets = [...INITIAL_JOBSHEETS];
      notice('MODE CONTOH: koneksi Supabase belum aktif. Isi Project URL dan Publishable Key dalam config.js, lalu pastikan script Supabase termuat.');
      return;
    }
    try {
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      await refreshData();
      const {data: {session}, error: authErr} = await client.auth.getSession();
      if (authErr) throw authErr;
      if (session) {
        const {data, error} = await client.rpc('gearup_is_admin');
        if (error) throw error;
        if (data === true) setAdmin(true);
      }
      notice('Database online aktif. Materi dosen dapat diakses seluruh mahasiswa.', true);
    } catch (e) {
      appState.tools = [...INITIAL_TOOLS];
      appState.jobsheets = [...INITIAL_JOBSHEETS];
      notice('Koneksi Supabase gagal: ' + e.message + '. Cek config.js dan setup_database.sql.');
      console.error('GearUp Supabase:', e);
    }
  };
  window.updateStorageEstimate = async () => {
    if ($('idbStorageStatus')) $('idbStorageStatus').textContent = 'Supabase Storage - foto dibagikan ke seluruh mahasiswa';
  };

  // Jadikan UI login email + password, bukan password IndexedDB.
  const loginSection = $('adminLoginSection');
  if (loginSection && !$('gearupAdminEmail')) {
    // querySelector di atas hanya bantuan; perbarui seluruh paragraf deskripsi dengan aman.
    const prose = loginSection.querySelector('.bg-army-50 p:last-child');
    if (prose) prose.textContent = 'Masuk menggunakan akun email dosen yang telah didaftarkan sebagai admin pada Supabase. Tidak ada lagi password bawaan admin123.';
    const input = document.createElement('div');
    input.innerHTML = '<label class="text-xs font-bold text-slate-700 block mb-1" for="gearupAdminEmail">Email Admin</label><input id="gearupAdminEmail" type="email" autocomplete="username" placeholder="dosen@kampus.ac.id" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm">';
    const passWrapper = $('adminPasswordInput')?.parentElement;
    if (passWrapper) loginSection.insertBefore(input, passWrapper);
    $('adminPasswordInput')?.setAttribute('autocomplete', 'current-password');
  }
  const oldDeployGuide = $('deployGuideBox');
  if (oldDeployGuide) {
    oldDeployGuide.querySelectorAll('p').forEach(p => {
      if (p.textContent.includes('admin123')) {
        p.textContent = 'Akses admin: klik ikon perisai, lalu masuk dengan email dan password dosen yang telah didaftarkan di Supabase.';
      } else if (p.textContent.includes('IndexedDB')) {
        p.textContent = 'Penyimpanan materi bersama menggunakan database dan Storage Supabase. Mahasiswa melihat data setelah halaman dimuat ulang.';
      }
    });
  }
  const storageTitle = $('adminDashboardSection')?.querySelector('.bg-army-900 p:first-child');
  if (storageTitle) storageTitle.textContent = 'PENYIMPANAN ONLINE SUPABASE';

  window.verifyAdminLogin = async () => {
    if (!client) return showToast('Supabase belum terhubung; periksa config.js dan SQL.');
    const email = ($('gearupAdminEmail')?.value || '').trim();
    const password = $('adminPasswordInput')?.value || '';
    if (!email || !password) return showToast('Isi email dan password Supabase.');
    try {
      const {error} = await client.auth.signInWithPassword({email, password});
      if (error) throw error;
      const {data, error: roleErr} = await client.rpc('gearup_is_admin');
      if (roleErr) throw roleErr;
      if (data !== true) {
        await client.auth.signOut();
        return showToast('Email ini belum masuk tabel gearup_admins.');
      }
      setAdmin(true);
      $('adminLoginSection').classList.add('hidden');
      $('adminDashboardSection').classList.remove('hidden');
      $('adminPasswordInput').value = '';
      showToast('Login dosen berhasil. Penyimpanan online aktif.');
    } catch (e) { fail('Login gagal', e); }
  };
  window.logoutAdmin = async () => {
    if (client) await client.auth.signOut();
    setAdmin(false);
    closeAdminModal();
    showToast('Berhasil keluar dari mode admin.');
  };
  window.changeAdminPassword = async () => {
    if (!authenticated()) return showToast('Login dosen dahulu.');
    const next = $('newAdminPassInput')?.value || '';
    if (next.length < 10) return showToast('Password baru minimal 10 karakter.');
    try {
      const {error} = await client.auth.updateUser({password: next});
      if (error) throw error;
      $('newAdminPassInput').value = '';
      showToast('Password akun Supabase berhasil diubah.');
    } catch (e) { fail('Gagal mengubah password', e); }
  };

  async function uploadImages(files, folder) {
    requireAdmin();
    const urls = [];
    const mimeToExt = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
    for (const file of Array.from(files || [])) {
      if (!mimeToExt[file.type]) throw new Error('Gambar harus berupa JPG, PNG, WEBP, atau GIF.');
      if (file.size > 8 * 1024 * 1024) throw new Error('Ukuran maksimal 8 MB per gambar.');
      const unique = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const path = `${folder}/${unique}.${mimeToExt[file.type]}`;
      const {error} = await client.storage.from('gearup-media').upload(path, file, {contentType:file.type, upsert:false});
      if (error) throw error;
      urls.push(client.storage.from('gearup-media').getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }
  window.handleDirectJobImageUpload = async event => {
    try {
      requireAdmin();
      const files = event.target.files;
      if (!files?.length || !appState.currentViewingJobId) return;
      const job = appState.jobsheets.find(j => j.id === appState.currentViewingJobId);
      if (!job) return;
      const urls = await uploadImages(files, 'jobsheets');
      const onlyPlaceholder = job.images?.length === 1 && job.images[0].startsWith('data:image/svg+xml');
      const saved = {...job, images: onlyPlaceholder ? urls : [...(job.images || []), ...urls]};
      await idbPut('jobsheets', saved);
      Object.assign(job, saved);
      renderModalJobGallery(job);
      renderAllViews();
      showToast('Gambar tersimpan di Supabase.');
    } catch (e) { fail('Gagal mengunggah gambar', e); }
    finally { event.target.value = ''; }
  };
  window.quickReplaceJobImage = async (jobId, event) => {
    try {
      requireAdmin();
      const files = event.target.files;
      if (!files?.length) return;
      const job = appState.jobsheets.find(j => j.id === jobId);
      if (!job) return;
      const urls = await uploadImages(files, 'jobsheets');
      const saved = {...job, images:urls};
      await idbPut('jobsheets', saved);
      Object.assign(job, saved);
      renderAllViews();
      showToast('Gambar job sheet diganti secara online.');
    } catch (e) { fail('Gagal mengganti gambar', e); }
    finally { event.target.value = ''; }
  };
  window.removeSingleJobImage = async (jobId, idx) => {
    try {
      requireAdmin();
      const job = appState.jobsheets.find(j => j.id === jobId);
      if (!job) return;
      const next = {...job, images: (job.images || []).filter((_, i) => i !== idx)};
      await idbPut('jobsheets', next);
      Object.assign(job, next);
      renderModalJobGallery(job);
      renderAllViews();
      showToast('Gambar dihapus dari job sheet.');
    } catch (e) { fail('Gagal menghapus gambar', e); }
  };

  window.previewAdminJobImages = event => {
    if (!authenticated()) return showToast('Login admin diperlukan.');
    const files = Array.from(event.target.files || []);
    appState.pendingJobImages = files;
    $('admJobImagePreview').innerHTML = '';
    files.forEach(file => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      img.className = 'w-16 h-16 rounded-lg object-cover border';
      $('admJobImagePreview').append(img);
    });
  };
  window.previewAdminToolImage = event => {
    if (!authenticated()) return showToast('Login admin diperlukan.');
    appState.pendingToolImage = event.target.files?.[0] || null;
    $('admToolImagePreview').innerHTML = '';
    if (appState.pendingToolImage) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(appState.pendingToolImage);
      img.onload = () => URL.revokeObjectURL(img.src);
      img.className = 'w-20 h-20 rounded-lg object-cover border';
      $('admToolImagePreview').append(img);
    }
  };
  window.saveJobSheetFromAdmin = async () => {
    try {
      requireAdmin();
      const id = $('editJobId')?.value || ('job_' + Date.now());
      const title = $('admJobTitle').value.trim();
      if (!title) return showToast('Judul job sheet wajib diisi.');
      const existing = appState.jobsheets.find(j => j.id === id);
      let images = existing?.images || [];
      if (appState.pendingJobImages.length) images = await uploadImages(appState.pendingJobImages, 'jobsheets');
      if (!images.length) images = [createTechnicalBlueprintSVG(title, 'Job Sheet Praktik', id)];
      let pdfs = [...(existing?.pdfs || [])];
      if (pendingPdfFiles.length) {
        const uploaded = await uploadPdfFiles(pendingPdfFiles, id);
        pdfs = pdfs.concat(uploaded);
      }
      const job = {id, sessionId:$('admJobSession').value, title,
        material:$('admJobMaterial').value.trim() || 'Standar Bengkel',
        k3:$('admJobK3').value.trim() || 'APD Standar Bengkel Mesin',
        steps:$('admJobSteps').value.trim().split('\n').map(x=>x.trim()).filter(Boolean), images, pdfs};
      await idbPut('jobsheets', job);
      pendingPdfFiles = [];
      if ($('gearupPdfInput')) $('gearupPdfInput').value = '';
      if ($('gearupPdfPendingList')) $('gearupPdfPendingList').textContent = '';
      appState.pendingJobImages = [];
      $('editJobId').value = '';
      $('admJobTitle').value = '';
      $('admJobMaterial').value = '';
      $('admJobK3').value = '';
      $('admJobSteps').value = '';
      $('admJobImagesInput').value = '';
      $('admJobImagePreview').innerHTML = '';
      await refreshData();
      closeAdminModal();
      showToast('Materi job sheet tersimpan online.');
    } catch (e) { fail('Gagal menyimpan job sheet', e); }
  };
  window.saveToolFromAdmin = async () => {
    try {
      requireAdmin();
      const id = $('editToolId').value || ('tool_' + Date.now());
      const name = $('admToolName').value.trim();
      if (!name) return showToast('Nama alat wajib diisi.');
      const existing = appState.tools.find(t => t.id === id);
      let image = existing?.image || '';
      if (appState.pendingToolImage instanceof File) image = (await uploadImages([appState.pendingToolImage], 'tools'))[0];
      if (!image) image = createTechnicalBlueprintSVG(name, $('admToolClass').value, id);
      const tool = {id, sessionId:$('admToolSession').value, cls:$('admToolClass').value, name,
        spec:$('admToolDesc').value.trim() || 'Alat praktik standar bengkel.', image};
      await idbPut('tools', tool);
      appState.pendingToolImage = null;
      $('editToolId').value = '';
      $('admToolName').value = '';
      $('admToolDesc').value = '';
      $('admToolImageInput').value = '';
      $('admToolImagePreview').innerHTML = '';
      await refreshData();
      closeAdminModal();
      showToast('Alat praktik tersimpan online.');
    } catch (e) { fail('Gagal menyimpan alat', e); }
  };
  window.editJobInAdmin = jobId => {
    if (!authenticated()) return showToast('Login admin terlebih dahulu.');
    const job = appState.jobsheets.find(j => j.id === jobId);
    if (!job) return;
    openAdminModal('jobsheet');
    $('editJobId').value = job.id;
    $('admJobSession').value = job.sessionId;
    $('admJobTitle').value = job.title;
    $('admJobMaterial').value = job.material || '';
    $('admJobK3').value = job.k3 || '';
    $('admJobSteps').value = (job.steps || []).join('\n');
    $('admJobImagePreview').innerHTML = (job.images||[]).map(src=>`<img src="${escapeHTML(src)}" class="w-16 h-16 rounded-lg object-cover border">`).join('');
    appState.pendingJobImages = [];
    $('admJobImagesInput').value = '';
    pendingPdfFiles = [];
    if ($('gearupPdfInput')) $('gearupPdfInput').value = '';
    if ($('gearupPdfPendingList')) $('gearupPdfPendingList').textContent = '';
    renderAdminPdfAttachments(job);
    if ($('formJobHeading')) $('formJobHeading').textContent = 'Edit Data Job Sheet';
  };

  const originalEditTool = window.editToolInAdmin;
  window.editToolInAdmin = function(id) {
    if (!authenticated()) return showToast('Login dosen terlebih dahulu.');
    appState.pendingToolImage = null;
    originalEditTool(id);
  };
  const oldRenderJobs = window.renderJobsheetsView;
  window.renderJobsheetsView = function(...args) {
    oldRenderJobs(...args);
    document.querySelectorAll('#jobsListContainer label').forEach(label => {
      if (label.querySelector('input[type=file]')) label.style.display = authenticated() ? '' : 'none';
    });
    if (authenticated()) {
      document.querySelectorAll('#jobsListContainer button[onclick^="openJobDetailModal"]').forEach(btn => {
        const match = btn.getAttribute('onclick')?.match(/'([^']+)'/);
        if (!match) return;
        const row = btn.parentElement;
        if (!row || row.querySelector('.gearup-cloud-edit')) return;
        const edit = document.createElement('button');
        edit.className = 'gearup-cloud-edit bg-olive-100 text-army-800 px-3 py-2 rounded-xl text-xs font-bold';
        edit.textContent = 'Edit Materi';
        edit.addEventListener('click', () => window.editJobInAdmin(match[1]));
        row.append(edit);
      });
    }
  };
  const oldRenderGallery = window.renderModalJobGallery;
  window.renderModalJobGallery = function(job) {
    oldRenderGallery(job);
    if (!authenticated()) $('modalJobGallery')?.querySelectorAll('button').forEach(btn=>btn.style.display='none');
    $('jobDetailModal')?.querySelectorAll('label').forEach(label => {
      if (label.querySelector('input[type=file]')) label.style.display=authenticated()?'':'none';
    });
  };
  const oldOpenJobDetail = window.openJobDetailModal;
  window.openJobDetailModal = function(jobId) {
    oldOpenJobDetail(jobId);
    $('jobDetailModal')?.querySelectorAll('label').forEach(label => {
      if (label.querySelector('input[type=file]')) label.style.display=authenticated()?'':'none';
    });
    renderDetailPdfAttachments(jobId);
  };
  window.deleteToolItem = async id => {
    if (!authenticated() || !confirm('Hapus alat ini dari database online?')) return;
    try { await idbDelete('tools', id); await refreshData(); showToast('Alat terhapus online.'); }
    catch(e) { fail('Hapus alat gagal', e); }
  };
  window.deleteJobItem = async id => {
    if (!authenticated() || !confirm('Hapus job sheet ini dari database online?')) return;
    try { await idbDelete('jobsheets', id); await refreshData(); showToast('Job sheet terhapus online.'); }
    catch(e) { fail('Hapus job sheet gagal', e); }
  };
  window.importFullDatabase = event => {
    if (!authenticated()) return showToast('Login dosen terlebih dahulu.');
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const obj = JSON.parse(e.target.result);
        if (!Array.isArray(obj.tools) || !Array.isArray(obj.jobsheets)) throw new Error('Format backup harus memiliki tools dan jobsheets.');
        for (const tool of obj.tools) await idbPut('tools', tool);
        for (const job of obj.jobsheets) await idbPut('jobsheets', job);
        await refreshData();
        showToast('Backup diimpor ke database online.');
      } catch(err) { fail('Import gagal', err); }
    };
    reader.readAsText(file);
  };
  window.resetDatabaseToFactory = async () => showToast('Reset cloud dinonaktifkan demi keamanan data. Gunakan backup atau SQL Editor.');

  window.publishInitialCatalog = async () => {
    try {
      requireAdmin();
      for (const [type, items] of [['tools', INITIAL_TOOLS], ['jobsheets', INITIAL_JOBSHEETS]]) {
        const records = items.map(item => toCloud(type, item));
        const {error} = await client.from(tables[type]).upsert(records, {onConflict:'id', ignoreDuplicates:true});
        if (error) throw error;
      }
      await refreshData();
      showToast('25 alat dan 9 job sheet bawaan dipublikasikan.');
    } catch(e) { fail('Gagal mempublikasikan materi awal', e); }
  };
  const settings = $('adminSub-settings');
  if (settings && !$('gearupSeedWrapper')) {
    const div = document.createElement('div');
    div.id = 'gearupSeedWrapper';
    div.className = 'p-3 rounded-xl border bg-army-50 space-y-2';
    div.innerHTML = '<h4 class="font-bold">Publikasikan Data Awal ke Cloud</h4><p class="text-[11px]">Klik sekali setelah database aktif. Data yang sudah Anda ubah tidak akan ditimpa.</p><button id="gearupSeedNow" class="bg-olive-600 text-white font-bold px-3 py-2 rounded-lg">Publikasikan 25 Alat &amp; 9 Job Sheet</button>';
    settings.append(div);
    $('gearupSeedNow').addEventListener('click', window.publishInitialCatalog);
  }
  // ===================== JOB SHEET PDF EXTENSION =====================
  // Katalog PDF disimpan pada kolom gearup_jobsheets.pdfs (JSONB).
  // PDF diunggah sebagai file asli, bukan base64/IndexedDB.
  const PDF_MAX_BYTES = 10 * 1024 * 1024;
  let pendingPdfFiles = [];
  const pdfBucket = 'gearup-media';

  function validPdfUrl(value) {
    try {
      const u = new URL(value);
      const apiOrigin = new URL(config.supabaseUrl).origin;
      return u.protocol === 'https:' && u.origin === apiOrigin &&
        u.pathname.startsWith('/storage/v1/object/public/gearup-media/');
    } catch { return false; }
  }
  function pdfDownloadUrl(url, name) {
    const u = new URL(url);
    u.searchParams.set('download', name || 'Job-Sheet.pdf');
    return u.href;
  }
  function pdfLink(url, name, download) {
    const a = document.createElement('a');
    a.href = download ? pdfDownloadUrl(url, name) : url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = download ? 'Unduh PDF' : 'Buka PDF';
    a.className = download
      ? 'inline-flex bg-olive-600 text-white px-3 py-2 rounded-lg text-xs font-bold'
      : 'inline-flex bg-army-800 text-white px-3 py-2 rounded-lg text-xs font-bold';
    return a;
  }
  function getSavedJob(id) {
    return appState.jobsheets.find(j => j.id === id);
  }
  async function uploadPdfFiles(files, jobId) {
    requireAdmin();
    if (!client) throw new Error('Supabase belum tersambung.');
    const results = [];
    for (const file of Array.from(files || [])) {
      if (!file || !/\.pdf$/i.test(file.name) || !['', 'application/pdf'].includes(file.type)) {
        throw new Error('Hanya file dengan format PDF (.pdf) yang diperbolehkan.');
      }
      if (file.size <= 0 || file.size > PDF_MAX_BYTES) {
        throw new Error('Maksimum 10 MB per file PDF dan file tidak boleh kosong.');
      }
      // Periksa tanda tangan PDF agar berkas bukan sekadar file lain yang diubah ekstensinya.
      const header = await file.slice(0, 5).text();
      if (header !== '%PDF-') throw new Error('File bukan PDF yang valid.');
      const unique = crypto.randomUUID?.() || (`${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const safeId = String(jobId).replace(/[^a-z0-9_-]/gi, '_').slice(0, 90);
      const path = `job-pdf/${safeId}/${unique}.pdf`;
      const {error} = await client.storage.from(pdfBucket)
        .upload(path, file, {contentType:'application/pdf', cacheControl:'3600', upsert:false});
      if (error) throw error;
      const url = client.storage.from(pdfBucket).getPublicUrl(path).data.publicUrl;
      results.push({name:file.name.slice(0,180), size:file.size, url, path,
        uploadedAt:new Date().toISOString()});
    }
    return results;
  }
  function renderAdminPdfAttachments(job) {
    const host = $('gearupPdfExistingList');
    if (!host) return;
    host.replaceChildren();
    const entries = job?.pdfs || [];
    if (!entries.length) {
      host.textContent = 'Belum ada PDF pada job sheet ini.';
      return;
    }
    entries.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'flex gap-2 items-center justify-between bg-white rounded-lg p-2 border border-army-200';
      const label = document.createElement('span');
      label.className = 'text-xs text-army-900 min-w-0 break-all';
      label.textContent = '📄 ' + (entry.name || `PDF ${idx + 1}`);
      row.append(label);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'text-xs font-bold text-red-600 shrink-0';
      remove.textContent = 'Hapus';
      remove.addEventListener('click', () => removePdfAttachment(job.id, idx));
      row.append(remove);
      host.append(row);
    });
  }
  function renderDetailPdfAttachments(jobId) {
    const job = getSavedJob(jobId);
    const parent = $('printArea');
    if (!parent || !job) return;
    let section = $('gearupPdfDetail');
    if (!section) {
      section = document.createElement('section');
      section.id = 'gearupPdfDetail';
      section.className = 'bg-army-50 border border-army-200 rounded-xl p-3 space-y-2';
      parent.append(section);
    }
    section.replaceChildren();
    const title = document.createElement('h4');
    title.className = 'font-extrabold text-army-900 text-xs';
    title.textContent = '📄 Lampiran File PDF';
    section.append(title);
    const items = (job.pdfs || []).filter(pdf => validPdfUrl(pdf.url));
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'text-xs text-slate-500';
      empty.textContent = 'Belum ada lampiran PDF untuk job sheet ini.';
      section.append(empty);
    }
    items.forEach((pdf, idx) => {
      const row = document.createElement('div');
      row.className = 'bg-white border border-army-200 rounded-xl p-2.5 space-y-2';
      const name = document.createElement('p');
      name.className = 'font-semibold text-xs text-army-900 break-all';
      name.textContent = `${idx + 1}. ${pdf.name || 'Job-Sheet.pdf'}`;
      const actions = document.createElement('div');
      actions.className = 'flex flex-wrap gap-2';
      actions.append(pdfLink(pdf.url, pdf.name, false), pdfLink(pdf.url, pdf.name, true));
      row.append(name, actions);
      section.append(row);
    });
    if (authenticated()) {
      const uploadLabel = document.createElement('label');
      uploadLabel.className = 'block bg-olive-100 p-3 rounded-xl border border-army-200 text-xs font-bold text-army-900 cursor-pointer';
      uploadLabel.textContent = '+ Admin: Tambah PDF ke Job Sheet Ini (maks. 10 MB/file)';
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.pdf,application/pdf';
      input.className = 'block w-full mt-2 text-xs font-normal';
      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;
        input.disabled = true;
        try {
          const added = await uploadPdfFiles(files, jobId);
          const next = {...job, pdfs: [...(job.pdfs || []), ...added]};
          await idbPut('jobsheets', next);
          Object.assign(job, next);
          renderAllViews();
          renderDetailPdfAttachments(jobId);
          showToast('PDF berhasil diunggah dan tersedia untuk mahasiswa.');
        } catch (error) {
          fail('Gagal mengunggah PDF', error);
        } finally { input.disabled = false; input.value=''; }
      });
      uploadLabel.append(input);
      section.append(uploadLabel);
    }
  }
  async function removePdfAttachment(jobId, index) {
    if (!authenticated()) return showToast('Login sebagai dosen terlebih dahulu.');
    const job = getSavedJob(jobId);
    const attachment = job?.pdfs?.[index];
    if (!attachment || !confirm(`Hapus lampiran PDF "${attachment.name || 'tanpa nama'}"?`)) return;
    try {
      const updated = {...job, pdfs: job.pdfs.filter((_, i) => i !== index)};
      await idbPut('jobsheets', updated);
      Object.assign(job, updated);
      let deletionFailed = false;
      if (attachment.path?.startsWith('job-pdf/')) {
        const {error} = await client.storage.from(pdfBucket).remove([attachment.path]);
        deletionFailed = Boolean(error);
      }
      renderAdminPdfAttachments(job);
      renderAllViews();
      if ($('jobDetailModal') && !$('jobDetailModal').classList.contains('hidden')) renderDetailPdfAttachments(jobId);
      showToast(deletionFailed
        ? 'Lampiran terlepas dari materi, tetapi file di Storage gagal dihapus.'
        : 'Lampiran PDF berhasil dihapus.');
    } catch (error) { fail('Gagal menghapus PDF', error); }
  }
  // Sisipkan input PDF ke formulir Job Sheet TANPA perlu mengubah HTML aslinya.
  const formJobPanel = $('adminSub-formJob');
  if (formJobPanel && !$('gearupPdfInput')) {
    const panel = document.createElement('div');
    panel.id = 'gearupPdfFormSection';
    panel.className = 'p-3 rounded-xl border border-army-200 bg-army-50 space-y-2';
    const heading = document.createElement('label');
    heading.className = 'block text-xs font-extrabold text-army-900';
    heading.textContent = '📄 Lampiran PDF (opsional, bisa beberapa PDF)';
    heading.htmlFor = 'gearupPdfInput';
    const input = document.createElement('input');
    input.id = 'gearupPdfInput';
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.multiple = true;
    input.className = 'w-full text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:bg-olive-600 file:text-white';
    const help = document.createElement('p');
    help.className = 'text-[11px] text-slate-600';
    help.textContent = 'Maksimum 10 MB per PDF. Jika mengedit, PDF lama tetap ada kecuali Anda menghapusnya.';
    const pending = document.createElement('div');
    pending.id = 'gearupPdfPendingList';
    pending.className = 'text-[11px] text-olive-700 break-words';
    const existingTitle = document.createElement('p');
    existingTitle.className = 'text-[11px] font-bold text-army-700 mt-2';
    existingTitle.textContent = 'PDF yang sudah terpasang:';
    const existing = document.createElement('div');
    existing.id = 'gearupPdfExistingList';
    existing.className = 'space-y-1 text-[11px] text-slate-500';
    existing.textContent = 'Pilih Edit Materi untuk melihat lampiran PDF sebelumnya.';
    input.addEventListener('change', () => {
      pendingPdfFiles = Array.from(input.files || []);
      pending.textContent = pendingPdfFiles.length
        ? `Siap diunggah: ${pendingPdfFiles.map(x=>x.name).join(', ')}` : '';
    });
    panel.append(heading, input, help, pending, existingTitle, existing);
    const saveButton = formJobPanel.querySelector('button[onclick="saveJobSheetFromAdmin()"]');
    if (saveButton) formJobPanel.insertBefore(panel, saveButton);
    else formJobPanel.append(panel);
  }
  // Saat admin membuka form Job Sheet baru, jangan tampilkan berkas milik edit sebelumnya.
  const originalOpenAdminModal = window.openAdminModal;
  window.openAdminModal = function(targetTab = null) {
    originalOpenAdminModal(targetTab);
    if (targetTab === 'jobsheet' && !$('editJobId')?.value) {
      pendingPdfFiles = [];
      if ($('gearupPdfInput')) $('gearupPdfInput').value = '';
      if ($('gearupPdfPendingList')) $('gearupPdfPendingList').textContent='';
      if ($('gearupPdfExistingList')) $('gearupPdfExistingList').textContent='Belum ada PDF.';
    }
  };
  window.GEARUP_PDF_READY = true;

  window.GEARUP_CLOUD_ADAPTER_READY = true;
})();

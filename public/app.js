/* CATS FROST — lógica de la web: intro → acceso → concepto → galaxia con carpetas → ventanas */
(() => {
	'use strict';

	const C = window.CONTENT;
	const body = document.body;
	const $ = (s, r = document) => r.querySelector(s);

	/* Crea elementos sin usar innerHTML con datos (los nombres de archivo nunca se interpretan como HTML) */
	const el = (tag, props = {}, ...kids) => {
		const n = document.createElement(tag);
		for (const [k, v] of Object.entries(props)) {
			if (v === false || v == null) continue;
			if (k === 'class') n.className = v;
			else if (k === 'text') n.textContent = v;
			else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
			else n.setAttribute(k, v === true ? '' : v);
		}
		kids.flat().forEach((c) => c != null && n.append(c));
		return n;
	};

	const fmtSize = (b) => {
		if (!Number.isFinite(b)) return '';
		if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
		if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
		return Math.max(1, Math.round(b / 1024)) + ' KB';
	};
	const fmtDate = (iso) => {
		try { return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; }
	};

	/* ===================== Estado y API ===================== */
	const state = {
		online: false,
		admin: false,
		role: null, // 'user' | 'admin' | null
		maxMB: 2048,
		lib: { videos: [], trailer: [], descargas: [] },
		local: { videos: [], trailer: [], descargas: [] }, // vistas previas locales (solo si no hay servidor)
	};

	const api = async (path, opts = {}) => {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), opts.timeout || 10000);
		try {
			const res = await fetch(path, {
				credentials: 'same-origin',
				signal: ctrl.signal,
				method: opts.method || 'GET',
				body: opts.body,
				headers: { 'X-CF': '1', ...(opts.headers || {}) },
			});
			if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('no-api');
			const data = await res.json();
			if (!res.ok) {
				const e = new Error(data.error || 'Error');
				e.status = res.status;
				throw e;
			}
			return data;
		} finally {
			clearTimeout(timer);
		}
	};

	const checkServer = async () => {
		try {
			const d = await api('/api/me', { timeout: 4000 });
			state.online = true;
			state.admin = !!d.admin;
			state.maxMB = d.maxMB || 2048;
		} catch {
			state.online = false;
			state.admin = false;
			if (fbOn()) {
				try { await fbRefresh(); } catch { /* sin Firebase: se queda vacío */ }
				return;
			}
			try {
				const base = cloudBase();
				const r = await fetch(base ? `${base}/library.json?v=${Date.now()}` : `media/library.json?v=${Date.now()}`, { cache: 'no-store' });
				if (r.ok) {
					const d = await r.json();
					['videos', 'trailer', 'descargas'].forEach((k) => { state.lib[k] = Array.isArray(d[k]) ? d[k] : []; });
				}
			} catch { /* sin biblioteca publicada */ }
		}
	};

	const refreshLib = async () => {
		if (!state.online) return;
		try {
			const d = await api('/api/library');
			state.lib = d.sections;
		} catch { /* se queda con lo último que había */ }
		updateFolderCounts();
	};

	/* ===================== Pantallas ===================== */
	let winOpen = false;
	let view = 'gate';

	const updateScene = () => {
		body.dataset.scene = body.dataset.screen === 'galaxy' && !winOpen ? 'on' : 'off';
	};

	const updateChip = () => {
		const chip = $('#chip');
		const screen = body.dataset.screen;
		const show = !!state.role && !winOpen && (screen === 'galaxy' || (screen === 'home' && view === 'concept'));
		chip.classList.toggle('hidden', !show);
		chip.classList.toggle('admin', state.role === 'admin');
		$('#chipText').textContent = state.role === 'admin' ? 'Modo administrador' : 'Modo usuario';
		$('#chipBtn').textContent = state.role === 'admin' ? 'Cerrar sesión' : 'Cambiar modo';
	};

	const setScreen = (name) => {
		body.dataset.screen = name;
		$('#home').classList.toggle('active', name === 'home');
		$('#galaxy').classList.toggle('active', name === 'galaxy');
		updateScene();
		updateChip();
		if (name === 'home') playBg();
		else pauseBg();
		if (name === 'galaxy') startOrbit();
	};

	const showView = (name) => {
		view = name;
		$('#gate').classList.toggle('hidden', name !== 'gate');
		$('#concept').classList.toggle('hidden', name !== 'concept');
		$('#panel').scrollTop = 0;
		updateChip();
	};

	/* ===================== Video de fondo del inicio ===================== */
	const bg = $('#bgvideo');
	const ambient = $('#ambient');
	let bgFailed = false;
	let waitingGesture = false;

	const stageVisible = () => getComputedStyle($('#stage')).display !== 'none';

	const playBg = () => {
		if (body.dataset.screen !== 'home' || bgFailed || document.hidden) return;
		const p = bg.play();
		if (p && p.catch) {
			p.catch(() => {
				if (waitingGesture) return;
				waitingGesture = true;
				const retry = () => { waitingGesture = false; playBg(); };
				addEventListener('pointerdown', retry, { once: true });
				addEventListener('keydown', retry, { once: true });
			});
		}
		if (stageVisible()) {
			const q = ambient.play();
			if (q && q.catch) q.catch(() => {});
		}
	};
	const pauseBg = () => { bg.pause(); ambient.pause(); };

	bg.addEventListener('error', () => { bgFailed = true; $('#soundBtn').classList.add('hidden'); });
	bg.addEventListener('timeupdate', () => {
		if (Math.abs(ambient.currentTime - bg.currentTime) > 0.4) ambient.currentTime = bg.currentTime;
	});
	document.addEventListener('visibilitychange', () => (document.hidden ? pauseBg() : playBg()));
	$('#soundBtn').addEventListener('click', () => {
		bg.muted = !bg.muted;
		if (!bg.muted) bg.volume = 1;
		$('#soundBtn').textContent = bg.muted ? 'Sonido: no' : 'Sonido: sí';
		playBg();
	});

	/* ===================== Acceso: usuario / administrador ===================== */
	$('#brand').textContent = C.name;
	$('#brand2').textContent = C.name;
	$('#tagline').textContent = C.tagline;
	$('#lead').textContent = C.lead;
	$('#gxTitle').textContent = C.name;
	document.title = `${C.name} — Tráiler y descargas`;

	const gateMsg = (text, kind = 'err') => {
		const m = $('#gateMsg');
		m.textContent = text;
		m.className = `msg ${text ? kind : ''}`;
	};

	const refreshGate = () => {
		$('#adminTitle').textContent = state.admin ? 'Continuar como administrador' : 'Administrador';
		$('#adminForm').classList.add('hidden');
		gateMsg(state.online ? '' : 'Servidor no iniciado: puedes ver la web, pero el modo administrador y las descargas necesitan que el servidor esté activo (npm start).', 'warn');
	};

	const setRole = (role) => {
		state.role = role;
		showView('concept');
	};

	$('#btnUser').addEventListener('click', () => setRole('user'));
	$('#btnAdmin').addEventListener('click', () => {
		if (state.online && state.admin) { setRole('admin'); return; }
		gateMsg('');
		$('#adminForm').classList.remove('hidden');
		$('#adminPass').focus();
	});
	$('#adminForm').addEventListener('submit', async (e) => {
		e.preventDefault();
		const pass = $('#adminPass').value;
		if (!pass) return;
		const btn = $('#adminSubmit');
		btn.disabled = true;
		gateMsg('');
		if (!state.online) {
			if (fbOn()) {
				gateMsg('Comprobando…', 'warn');
				try {
					await fbLogin(pass);
					state.admin = true;
					$('#adminPass').value = '';
					gateMsg('');
					setRole('admin');
				} catch (err) {
					gateMsg(err.message);
					$('#adminPass').select();
				}
				btn.disabled = false;
				return;
			}
			// Sin servidor (Live Preview): se pide la contraseña igual y se entra en modo vista previa
			if (pass === 'GATO') {
				state.admin = true;
				$('#adminPass').value = '';
				setRole('admin');
			} else {
				gateMsg('Contraseña incorrecta.');
				$('#adminPass').select();
			}
			btn.disabled = false;
			return;
		}
		try {
			await api('/api/login', { method: 'POST', body: JSON.stringify({ password: pass }), headers: { 'Content-Type': 'application/json' } });
			state.admin = true;
			$('#adminPass').value = '';
			refreshGate();
			setRole('admin');
		} catch (err) {
			gateMsg(err.message === 'no-api' ? 'No se pudo contactar con el servidor.' : err.message);
			$('#adminPass').select();
		} finally {
			btn.disabled = false;
		}
	});

	const logout = async () => {
		try { await api('/api/logout', { method: 'POST' }); } catch { /* da igual */ }
		if (fbOn() && fb.p) { try { const f = await fb.p; await f.auth.signOut(f.authI); } catch { /* da igual */ } }
		state.admin = false;
		goGate();
	};

	const goGate = () => {
		state.role = null;
		closeWin();
		setScreen('home');
		refreshGate();
		showView('gate');
	};

	$('#chipBtn').addEventListener('click', () => (state.role === 'admin' ? logout() : goGate()));
	$('#backGate').addEventListener('click', goGate);

	/* ===================== Concepto ===================== */
	C.concepts.forEach((c) => {
		$('#cards').append(el('article', { class: 'card' },
			el('span', { class: 'ic', 'aria-hidden': 'true', text: c.icon }),
			el('h3', { text: c.title }),
			el('p', { text: c.text })));
	});

	const art = $('#art');
	art.append(el('span', { class: 'art-label', text: 'Galería' }));
	C.gallery.forEach((g, i) => {
		art.append(el('button', { class: 'art-thumb', type: 'button', 'aria-label': g.caption, onclick: () => openLightbox(i) },
			el('img', { src: g.thumb, alt: g.caption, loading: 'lazy' })));
	});

	$('#goGalaxy').addEventListener('click', () => {
		setScreen('galaxy');
		refreshLib();
	});
	$('#gxBack').addEventListener('click', () => setScreen('home'));

	/* ===================== Galaxia: carpetas que giran ===================== */
	const orbit = $('#orbit');
	const folders = [];

	// Degradados compartidos por los iconos de carpeta
	document.body.append((() => {
		const wrap = document.createElement('div');
		wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
		wrap.innerHTML = '<svg width="0" height="0" aria-hidden="true"><defs>' +
			'<linearGradient id="fgBack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b6dff"/><stop offset="1" stop-color="#0a2a80"/></linearGradient>' +
			'<linearGradient id="fgFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ff7ff"/><stop offset="1" stop-color="#2f7bff"/></linearGradient>' +
			'</defs></svg>';
		return wrap;
	})());

	const folderIcon = (glyph) => {
		const wrap = document.createElement('span');
		wrap.className = 'f-icon';
		wrap.innerHTML = '<svg viewBox="0 0 140 112" aria-hidden="true">' +
			'<path d="M10 22a10 10 0 0 1 10-10h32l14 14h54a10 10 0 0 1 10 10v62a10 10 0 0 1-10 10H20A10 10 0 0 1 10 98z" fill="url(#fgBack)"/>' +
			'<path d="M10 42a10 10 0 0 1 10-10h100a10 10 0 0 1 10 10v56a10 10 0 0 1-10 10H20A10 10 0 0 1 10 98z" fill="url(#fgFront)"/>' +
			'<text x="70" y="88" text-anchor="middle" font-size="36" font-family="system-ui,sans-serif" fill="#03163a"></text></svg>';
		wrap.querySelector('text').textContent = glyph;
		return wrap;
	};

	C.folders.forEach((f) => {
		const btn = el('button', { class: 'folder', type: 'button', 'data-section': f.id, 'aria-label': `${f.name}: ${f.sub}` },
			folderIcon(f.glyph),
			el('span', { class: 'f-name', text: f.name }),
			el('span', { class: 'f-sub', text: f.sub }),
			el('span', { class: 'f-count', text: '' }));
		orbit.append(btn);
		folders.push({ f, btn, count: $('.f-count', btn) });
	});

	const updateFolderCounts = () => {
		folders.forEach(({ f, count }) => {
			const n = itemsFor(f.id).length;
			count.textContent = n ? String(n) : '';
			count.classList.toggle('hidden', !n);
		});
	};

	let orbitRAF = 0;
	let angle = 0;
	let speed = 0.22;
	let dragVel = 0;
	let hovering = false;
	let emerge = 0;
	let orbitStart = 0;
	let lastT = 0;
	const BASE_SPEED = 0.22;
	const easeOut = (t) => 1 - (1 - t) ** 3;

	const layoutOrbit = (now) => {
		const W = orbit.clientWidth;
		const H = orbit.clientHeight;
		const portrait = H > W;
		const R = Math.min(portrait ? W * 0.32 : W * 0.33, 400) * easeOut(emerge);
		const Ry = portrait ? Math.min(H * 0.2, 190) * easeOut(emerge) : Math.min(H * 0.13, 120) * easeOut(emerge);
		folders.forEach((it, i) => {
			const a = angle + (i * Math.PI * 2) / folders.length;
			const z = Math.cos(a);
			const depth = (z + 1) / 2;
			const x = Math.sin(a) * R;
			const y = -z * Ry + Math.sin(now / 900 + i * 2) * 7;
			const s = (0.7 + 0.32 * depth) * (0.55 + 0.45 * emerge);
			it.btn.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
			it.btn.style.opacity = (emerge * (0.5 + 0.5 * depth)).toFixed(3);
			it.btn.style.zIndex = String(Math.round(depth * 50));
			it.btn.style.pointerEvents = emerge > 0.55 ? 'auto' : 'none';
		});
	};

	const orbitFrame = (now) => {
		if (body.dataset.screen !== 'galaxy') { orbitRAF = 0; return; }
		orbitRAF = requestAnimationFrame(orbitFrame);
		const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
		lastT = now;
		if (winOpen) return;
		// Primero gira solo el espacio; las carpetas aparecen un momento después
		const since = (now - orbitStart) / 1000;
		if (since > 1.1) emerge = Math.max(emerge, Math.min(1, (since - 1.1) / 1.5));
		speed += ((hovering ? 0.03 : BASE_SPEED) - speed) * Math.min(1, dt * 4);
		angle += (speed + dragVel) * dt;
		dragVel *= 0.03 ** dt;
		layoutOrbit(now);
	};

	function startOrbit() {
		emerge = 0;
		orbitStart = performance.now();
		lastT = orbitStart;
		layoutOrbit(orbitStart);
		if (!orbitRAF) orbitRAF = requestAnimationFrame(orbitFrame);
	}

	// Arrastrar una carpeta hace girar el anillo; un toque la abre
	let drag = null;
	orbit.addEventListener('pointerdown', (e) => {
		const btn = e.target.closest('.folder');
		if (!btn) return;
		drag = { btn, x: e.clientX, moved: false, id: e.pointerId, t: performance.now(), v: 0 };
		btn.setPointerCapture(e.pointerId);
	});
	orbit.addEventListener('pointermove', (e) => {
		if (!drag || e.pointerId !== drag.id) return;
		const dx = e.clientX - drag.x;
		if (Math.abs(dx) > 5) drag.moved = true;
		if (drag.moved) {
			angle += dx * 0.008;
			const now = performance.now();
			drag.v = (dx * 0.008) / Math.max(0.008, (now - drag.t) / 1000);
			drag.t = now;
			drag.x = e.clientX;
		}
	});
	const endDrag = (e) => {
		if (!drag || e.pointerId !== drag.id) return;
		const d = drag;
		drag = null;
		if (d.moved) dragVel = Math.max(-2.5, Math.min(2.5, d.v));
		else if (e.type === 'pointerup') openWin(d.btn.dataset.section);
	};
	orbit.addEventListener('pointerup', endDrag);
	orbit.addEventListener('pointercancel', endDrag);
	orbit.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse' && e.target.closest('.folder')) hovering = true; });
	orbit.addEventListener('pointerout', (e) => { if (e.target.closest('.folder')) hovering = false; });
	// Con teclado: Enter / espacio abren la carpeta enfocada
	orbit.addEventListener('keydown', (e) => {
		const btn = e.target.closest('.folder');
		if (btn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openWin(btn.dataset.section); }
	});

	/* ===================== Ventana gigante de cada carpeta ===================== */
	const win = { section: null, video: null, selectId: null, items: [] };

	const itemsFor = (section) => {
		const items = (state.lib[section] || []).map((x) => ({ ...x, remote: true }));
		if (section === 'videos') items.unshift({ ...C.builtinVideo, builtin: true });
		items.push(...(state.local[section] || []));
		return items;
	};

	const stopWinVideo = () => {
		if (win.video) {
			win.video.pause();
			win.video.removeAttribute('src');
			win.video.load();
		}
	};

	async function openWin(section) {
		const meta = C.folders.find((f) => f.id === section);
		win.section = section;
		win.selectId = null;
		winOpen = true;
		body.classList.add('win-open');
		$('#win').classList.add('open');
		updateScene();
		updateChip();
		$('#winTitle').textContent = meta.name;
		$('#winSub').textContent = meta.sub;
		const pill = $('#winRole');
		pill.textContent = state.role === 'admin' ? 'Administrador' : 'Usuario';
		pill.classList.toggle('admin', state.role === 'admin');
		renderWin(true);
		$('#winClose').focus();
		await refreshLib();
		if (win.section === section && winOpen) renderWin();
	}

	function closeWin() {
		if (!winOpen) return;
		stopWinVideo();
		win.video = null;
		winOpen = false;
		body.classList.remove('win-open');
		$('#win').classList.remove('open');
		$('#winBody').replaceChildren();
		updateScene();
		updateChip();
		folders.find((x) => x.f.id === win.section)?.btn.focus();
	}
	$('#winClose').addEventListener('click', closeWin);

	/* ---- Subida (el administrador) ---- */
	const uploadFile = (file, section, onProgress) => new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', `/api/upload?section=${encodeURIComponent(section)}&name=${encodeURIComponent(file.name)}`);
		xhr.setRequestHeader('X-CF', '1');
		xhr.setRequestHeader('Content-Type', 'application/octet-stream');
		xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
		xhr.onload = () => {
			let data = {};
			try { data = JSON.parse(xhr.responseText); } catch { /* sin JSON */ }
			if (xhr.status >= 200 && xhr.status < 300) resolve(data);
			else reject(new Error(data.error || `Error ${xhr.status}`));
		};
		xhr.onerror = () => reject(new Error('No se pudo subir: se cortó la conexión o el archivo supera el máximo permitido.'));
		xhr.onabort = () => reject(new Error('Subida cancelada'));
		xhr.send(file);
	});

	const uploadPanel = (section) => {
		const isFiles = section === 'descargas';
		const input = el('input', { type: 'file', class: 'hidden', multiple: true });
		if (!isFiles) input.setAttribute('accept', 'video/*,.mp4,.webm,.mov,.m4v,.ogv');
		const bar = el('i');
		const prog = el('div', { class: 'prog hidden' }, bar);
		const msg = el('p', { class: 'msg' });
		const zone = el('label', { class: 'dz' },
			el('strong', { text: isFiles ? 'Subir archivo (APK, ZIP…)' : 'Subir video' }),
			el('span', { text: `Haz clic o arrastra aquí · máx. ${state.maxMB >= 1024 ? (state.maxMB / 1024).toFixed(0) + ' GB' : state.maxMB + ' MB'}` }),
			input);

		const handle = async (files) => {
			msg.className = 'msg';
			msg.textContent = '';
			let lastId = null;
			for (const f of files) {
				if (f.size > state.maxMB * 1048576) {
					msg.className = 'msg err';
					msg.textContent = `"${f.name}" supera el máximo de ${state.maxMB} MB.`;
					continue;
				}
				prog.classList.remove('hidden');
				bar.style.width = '0%';
				msg.className = 'msg';
				msg.textContent = `Subiendo ${f.name}…`;
				try {
					const item = await uploadFile(f, section, (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
					lastId = item.id;
				} catch (e) {
					msg.className = 'msg err';
					msg.textContent = e.message;
					prog.classList.add('hidden');
					return;
				}
			}
			prog.classList.add('hidden');
			if (lastId) {
				win.selectId = lastId;
				await refreshLib();
				renderWin();
			}
		};
		input.addEventListener('change', () => { const files = [...input.files]; input.value = ''; handle(files); });
		['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
		['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
		zone.addEventListener('drop', (e) => handle([...e.dataTransfer.files]));
		return el('div', { class: 'upload' }, zone, prog, msg);
	};

	const deleteItem = async (item) => {
		if (!window.confirm(`¿Borrar "${item.name}"? Esto lo quita para todos.`)) return;
		if (!state.online) {
			try {
				if (fbOn()) await fbDelete(item); else if (item.key || (useCloud() && cloudBase())) await cloudDelete(item); else await ghDelete(item);
				renderWin();
			} catch (e) {
				window.alert(e.message);
			}
			return;
		}
		try {
			await api(`/api/files/${item.id}`, { method: 'DELETE' });
			await refreshLib();
			renderWin();
		} catch (e) {
			window.alert(e.message);
		}
	};


	/* ---- Modo GitHub Pages (sin servidor): "Guardar" sube el archivo al repositorio ---- */
	const GH_KEY = 'cf_gh';
	const ghDefaults = () => {
		const d = { repo: '', token: '', branch: 'main', dir: location.pathname.includes('/public/') ? 'public' : '' };
		const m = location.hostname.match(/^([^.]+)\.github\.io$/);
		if (m) d.repo = `${m[1]}/${location.pathname.split('/')[1] || ''}`;
		return d;
	};
	const ghLoad = () => {
		try { return { ...ghDefaults(), ...JSON.parse(localStorage.getItem(GH_KEY) || '{}') }; } catch { return ghDefaults(); }
	};
	const ghSave = (c) => { try { localStorage.setItem(GH_KEY, JSON.stringify(c)); } catch { /* sin almacenamiento */ } };
	const ghReady = (c) => /^[\w.-]+\/[\w.-]+$/.test(c.repo) && c.token.length > 10;

	const ghCall = async (c, path, opts = {}) => {
		const url = `https://api.github.com/repos/${c.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${opts.method && opts.method !== 'GET' ? '' : `?ref=${encodeURIComponent(c.branch)}`}`;
		let res;
		try {
			res = await fetch(url, {
				method: opts.method || 'GET',
				headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
				body: opts.body ? JSON.stringify(opts.body) : undefined,
				cache: 'no-store',
			});
		} catch {
			throw new Error('No hay conexión con GitHub.');
		}
		if (res.status === 404 && (opts.method || 'GET') === 'GET') return null;
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			if (res.status === 401) throw new Error('GitHub rechazó el token (401). Revisa que sea correcto y no haya vencido.');
			if (res.status === 403 || res.status === 404) throw new Error('El token no tiene permiso de escritura en este repositorio (Contents: Read and write) o el nombre del repositorio es incorrecto.');
			if (res.status === 409 || res.status === 422) throw new Error('conflict');
			if (res.status === 413) throw new Error('El archivo es demasiado grande para GitHub.');
			throw new Error(data.message || `Error de GitHub (${res.status})`);
		}
		return data;
	};

	const toBase64 = (file) => new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result).split(',')[1] || '');
		r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
		r.readAsDataURL(file);
	});

	const ghMediaPath = (c, rel) => (c.dir ? `${c.dir.replace(/^\/+|\/+$/g, '')}/` : '') + rel;

	// Actualiza media/library.json con reintentos (por si cambió mientras tanto)
	const ghUpdateManifest = async (c, mutate) => {
		const mp = ghMediaPath(c, 'media/library.json');
		for (let i = 0; i < 3; i++) {
			const cur = await ghCall(c, mp);
			let lib = { videos: [], trailer: [], descargas: [] };
			if (cur) { try { lib = { ...lib, ...JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\n/g, ''))))) }; } catch { /* manifiesto vacío */ } }
			mutate(lib);
			const content = btoa(unescape(encodeURIComponent(JSON.stringify(lib, null, 2) + '\n')));
			try {
				await ghCall(c, mp, { method: 'PUT', body: { message: 'Actualizar biblioteca', content, branch: c.branch, ...(cur ? { sha: cur.sha } : {}) } });
				return lib;
			} catch (e) {
				if (e.message !== 'conflict' || i === 2) throw e.message === 'conflict' ? new Error('No se pudo actualizar la biblioteca (conflicto). Intenta de nuevo.') : e;
			}
		}
		return null;
	};

	const ghSaveFile = async (c, section, file, onStatus) => {
		if (file.size > 90 * 1048576) throw new Error('GitHub no admite archivos de más de 100 MB por la web. Comprime el video (por ejemplo a 720p) o reduce el archivo.');
		const safe = `${Date.now().toString(36)}-${file.name.replace(/[^\w.-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '') || 'archivo'}`;
		const rel = `media/${section}/${safe}`;
		onStatus('Leyendo archivo…');
		const content = await toBase64(file);
		onStatus('Subiendo a GitHub… (puede tardar)');
		await ghCall(c, ghMediaPath(c, rel), { method: 'PUT', body: { message: `Agregar ${file.name}`, content, branch: c.branch } });
		onStatus('Registrando en la biblioteca…');
		const item = { id: safe, name: file.name, url: rel, size: file.size, createdAt: new Date().toISOString() };
		const lib = await ghUpdateManifest(c, (l) => { (l[section] = l[section] || []).push(item); });
		['videos', 'trailer', 'descargas'].forEach((k) => { state.lib[k] = lib[k] || []; });
		return { ...item, preview: URL.createObjectURL(file) };
	};

	async function ghDelete(item) {
		const c = ghLoad();
		if (!ghReady(c)) throw new Error('Primero configura GitHub (repositorio y token).');
		const rel = item.path || item.url;
		const fp = ghMediaPath(c, rel);
		const cur = await ghCall(c, fp);
		if (cur) await ghCall(c, fp, { method: 'DELETE', body: { message: `Borrar ${item.name}`, sha: cur.sha, branch: c.branch } });
		const lib = await ghUpdateManifest(c, (l) => { Object.keys(l).forEach((k) => { l[k] = (l[k] || []).filter((x) => x.id !== item.id); }); });
		['videos', 'trailer', 'descargas'].forEach((k) => { state.lib[k] = lib[k] || []; });
	}

	const ghPanel = (section) => {
		const isFiles = section === 'descargas';
		let c = ghLoad();
		const box = el('div', { class: 'note gh' });

		const draw = () => {
			box.replaceChildren();
			if (!ghReady(c)) { drawConfig(true); return; }
			const input = el('input', { type: 'file', class: 'hidden' });
			if (!isFiles) input.setAttribute('accept', 'video/*,.mp4,.webm,.mov,.m4v,.ogv');
			const msg = el('p', { class: 'msg' });
			let chosen = null;
			const pick = el('span', { class: 'gh-pick', text: 'Ningún archivo elegido' });
			const save = el('button', { class: 'btn primary', type: 'button', text: 'Guardar', disabled: true });
			input.addEventListener('change', () => {
				chosen = input.files[0] || null;
				pick.textContent = chosen ? `${chosen.name} · ${fmtSize(chosen.size)}` : 'Ningún archivo elegido';
				save.disabled = !chosen;
				msg.className = 'msg'; msg.textContent = '';
			});
			save.addEventListener('click', async () => {
				if (!chosen) return;
				save.disabled = true;
				msg.className = 'msg';
				try {
					const item = await ghSaveFile(c, section, chosen, (t) => { msg.textContent = t; });
					const mine = state.lib[section].find((x) => x.id === item.id);
					if (mine) { mine.path = mine.url; mine.url = item.preview; mine.local = true; }
					win.selectId = item.id;
					renderWin();
				} catch (e) {
					msg.className = 'msg err';
					msg.textContent = e.message === 'conflict' ? 'No se pudo guardar (conflicto). Intenta de nuevo.' : e.message;
					save.disabled = false;
				}
			});
			box.append(
				el('p', { text: isFiles ? 'Elige el APK o archivo y pulsa Guardar para publicarlo en tu GitHub.' : 'Elige el video y pulsa Guardar para publicarlo en tu GitHub.' }),
				el('div', { class: 'gh-row' },
					el('label', { class: 'btn' }, isFiles ? 'Elegir archivo' : 'Elegir video', input),
					save),
				pick, msg,
				el('p', { class: 'gh-small' }, el('a', { href: '#', text: 'Usar almacenamiento en la nube', onclick: (e) => { e.preventDefault(); try { localStorage.removeItem('cf_mode'); } catch { /* nada */ } renderWin(); } }), ` · Repositorio: ${c.repo} · `, el('a', { href: '#', text: 'Cambiar', onclick: (e) => { e.preventDefault(); drawConfig(false); } })),
				el('p', { class: 'gh-small', text: 'Después de guardar, GitHub Pages tarda 1–2 minutos en mostrarlo a los demás.' }));
		};

		const drawConfig = (first) => {
			box.replaceChildren();
			const f = (label, key, type = 'text', ph = '') => {
				const i = el('input', { type, class: 'gh-in', value: c[key] || '', placeholder: ph, autocomplete: 'off', spellcheck: 'false' });
				i.addEventListener('input', () => { c[key] = i.value.trim(); });
				return el('label', { class: 'gh-f' }, el('span', { text: label }), i);
			};
			const msg = el('p', { class: 'msg' });
			box.append(
				el('p', { text: first ? 'Para guardar en GitHub necesito conectar tu repositorio (se hace una sola vez en este navegador):' : 'Conexión con GitHub:' }),
				f('Repositorio (usuario/nombre)', 'repo', 'text', 'tuusuario/cats-frost'),
				f('Token de GitHub', 'token', 'password', 'github_pat_…'),
				f('Rama', 'branch', 'text', 'main'),
				f('Carpeta donde está index.html (vacío si está en la raíz)', 'dir', 'text', 'public'),
				el('p', { class: 'gh-small', text: 'Crea el token en GitHub → Settings → Developer settings → Fine-grained tokens, solo para este repositorio, con permiso Contents: Read and write. Se guarda solo en este navegador; no lo compartas.' }),
				msg,
				el('button', { class: 'btn primary', type: 'button', text: 'Conectar', onclick: () => {
					c.dir = (c.dir || '').replace(/^\/+|\/+$/g, '');
					if (!ghReady(c)) { msg.className = 'msg err'; msg.textContent = 'Revisa el repositorio (usuario/nombre) y pega el token.'; return; }
					ghSave(c); draw();
				} }));
		};

		draw();
		return box;
	};


	/* ---- Almacenamiento en la nube (Cloudflare R2 / S3): subida directa de archivos pesados ---- */
	const CLOUD_KEY = 'cf_cloud';
	const cloudLoad = () => {
		let c = {};
		try { c = JSON.parse(localStorage.getItem(CLOUD_KEY) || '{}'); } catch { /* vacío */ }
		return { endpoint: '', bucket: '', ak: '', sk: '', publicUrl: (C.cloud && C.cloud.publicUrl) || '', ...c };
	};
	const cloudBase = () => {
		const u = (C.cloud && C.cloud.publicUrl) || cloudLoad().publicUrl || '';
		return u.replace(/\/+$/, '');
	};
	const cloudReady = (c) => /^https:\/\/.+/.test(c.endpoint) && c.bucket && c.ak && c.sk && /^https:\/\/.+/.test(c.publicUrl);
	const useCloud = () => { try { return localStorage.getItem('cf_mode') !== 'github'; } catch { return true; } };

	const cloudFetchJSON = async (c, key) => {
		const url = await window.S3Presign(c, 'GET', key);
		let res;
		try { res = await fetch(url, { cache: 'no-store' }); } catch { throw new Error('No se pudo contactar con el almacenamiento. Revisa la configuración CORS del bucket.'); }
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(res.status === 403 ? 'Claves rechazadas (403). Revisa Access Key, Secret y permisos del token.' : `Error del almacenamiento (${res.status})`);
		return res.json();
	};
	const cloudPutJSON = async (c, key, obj) => {
		const url = await window.S3Presign(c, 'PUT', key);
		let res;
		try {
			res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
		} catch { throw new Error('No se pudo guardar la biblioteca. Revisa la configuración CORS del bucket.'); }
		if (!res.ok) throw new Error(`No se pudo guardar la biblioteca (${res.status})`);
	};
	const cloudUpdateManifest = async (c, mutate) => {
		const lib = { videos: [], trailer: [], descargas: [], ...((await cloudFetchJSON(c, 'library.json')) || {}) };
		mutate(lib);
		await cloudPutJSON(c, 'library.json', lib);
		['videos', 'trailer', 'descargas'].forEach((k) => { state.lib[k] = lib[k] || []; });
	};
	const cloudUpload = (c, key, file, disposition, onProgress) => new Promise((resolve, reject) => {
		window.S3Presign(c, 'PUT', key, 6 * 3600).then((url) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
			if (disposition) xhr.setRequestHeader('Content-Disposition', disposition);
			xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
			xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 403 ? 'Claves rechazadas (403). Revisa Access Key, Secret y permisos.' : `No se pudo subir (error ${xhr.status}).`)));
			xhr.onerror = () => reject(new Error('No se pudo subir: revisa tu conexión y la configuración CORS del bucket.'));
			xhr.send(file);
		}).catch(reject);
	});
	const cloudSaveFile = async (c, section, file, onProgress, onStatus) => {
		const safe = `${Date.now().toString(36)}-${file.name.replace(/[^\w.-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '') || 'archivo'}`;
		const key = `${section}/${safe}`;
		const disp = section === 'descargas' ? `attachment; filename="${file.name.replace(/[^\w. -]+/g, '_')}"` : '';
		await cloudUpload(c, key, file, disp, onProgress);
		onStatus('Registrando en la biblioteca…');
		const item = { id: safe, key, name: file.name, url: `${c.publicUrl.replace(/\/+$/, '')}/${key}`, size: file.size, createdAt: new Date().toISOString() };
		await cloudUpdateManifest(c, (l) => { (l[section] = l[section] || []).push(item); });
		return item;
	};
	async function cloudDelete(item) {
		const c = cloudLoad();
		if (!cloudReady(c)) throw new Error('Primero conecta el almacenamiento.');
		if (item.key) {
			const url = await window.S3Presign(c, 'DELETE', item.key);
			const res = await fetch(url, { method: 'DELETE' }).catch(() => null);
			if (!res || (!res.ok && res.status !== 404)) throw new Error('No se pudo borrar el archivo del almacenamiento.');
		}
		await cloudUpdateManifest(c, (l) => { Object.keys(l).forEach((k) => { l[k] = (l[k] || []).filter((x) => x.id !== item.id); }); });
	}

	const cloudPanel = (section) => {
		const isFiles = section === 'descargas';
		let c = cloudLoad();
		const box = el('div', { class: 'note gh' });

		const toGithub = el('a', { href: '#', text: 'Usar GitHub en su lugar', onclick: (e) => { e.preventDefault(); try { localStorage.setItem('cf_mode', 'github'); } catch { /* nada */ } renderWin(); } });

		const draw = () => {
			box.replaceChildren();
			if (!cloudReady(c)) { drawConfig(true); return; }
			const input = el('input', { type: 'file', class: 'hidden' });
			if (!isFiles) input.setAttribute('accept', 'video/*,.mp4,.webm,.mov,.m4v,.ogv');
			const bar = el('i');
			const prog = el('div', { class: 'prog hidden' }, bar);
			const msg = el('p', { class: 'msg' });
			let chosen = null;
			const pick = el('span', { class: 'gh-pick', text: 'Ningún archivo elegido' });
			const save = el('button', { class: 'btn primary', type: 'button', text: 'Guardar', disabled: true });
			input.addEventListener('change', () => {
				chosen = input.files[0] || null;
				pick.textContent = chosen ? `${chosen.name} · ${fmtSize(chosen.size)}` : 'Ningún archivo elegido';
				save.disabled = !chosen;
				msg.className = 'msg'; msg.textContent = '';
			});
			save.addEventListener('click', async () => {
				if (!chosen) return;
				save.disabled = true;
				prog.classList.remove('hidden');
				bar.style.width = '0%';
				msg.className = 'msg';
				msg.textContent = 'Subiendo… no cierres esta ventana.';
				try {
					const item = await cloudSaveFile(c, section, chosen, (p) => { bar.style.width = `${Math.round(p * 100)}%`; }, (t) => { msg.textContent = t; });
					win.selectId = item.id;
					renderWin();
				} catch (e) {
					msg.className = 'msg err';
					msg.textContent = e.message;
					prog.classList.add('hidden');
					save.disabled = false;
				}
			});
			const needLine = !(C.cloud && C.cloud.publicUrl);
			box.append(
				el('p', { text: isFiles ? 'Elige el APK o archivo y pulsa Guardar.' : 'Elige el video (puede ser pesado) y pulsa Guardar.' }),
				el('div', { class: 'gh-row' }, el('label', { class: 'btn' }, isFiles ? 'Elegir archivo' : 'Elegir video', input), save),
				pick, prog, msg,
				needLine ? el('p', { class: 'gh-small' }, 'Para que los usuarios lo vean, en content.js pon: ', el('code', { text: `cloud: { publicUrl: '${c.publicUrl}' },` }), ' y vuelve a publicar la página.') : null,
				el('p', { class: 'gh-small' }, `Bucket: ${c.bucket} · `, el('a', { href: '#', text: 'Cambiar', onclick: (e) => { e.preventDefault(); drawConfig(false); } }), ' · ', toGithub));
		};

		const drawConfig = (first) => {
			box.replaceChildren();
			const f = (label, key, type = 'text', ph = '') => {
				const i = el('input', { type, class: 'gh-in', value: c[key] || '', placeholder: ph, autocomplete: 'off', spellcheck: 'false' });
				i.addEventListener('input', () => { c[key] = i.value.trim(); });
				return el('label', { class: 'gh-f' }, el('span', { text: label }), i);
			};
			const msg = el('p', { class: 'msg' });
			box.append(
				el('p', { text: first ? 'Conecta tu almacenamiento (Cloudflare R2) una sola vez. Los datos quedan solo en este navegador:' : 'Conexión con el almacenamiento:' }),
				f('Endpoint S3', 'endpoint', 'text', 'https://xxxx.r2.cloudflarestorage.com'),
				f('Nombre del bucket', 'bucket', 'text', 'cats-frost'),
				f('Access Key ID', 'ak', 'text', ''),
				f('Secret Access Key', 'sk', 'password', ''),
				f('URL pública del bucket', 'publicUrl', 'text', 'https://pub-xxxx.r2.dev'),
				msg,
				el('div', { class: 'gh-row' },
					el('button', { class: 'btn primary', type: 'button', text: 'Conectar', onclick: () => {
						c.endpoint = c.endpoint.replace(/\/+$/, '');
						c.publicUrl = c.publicUrl.replace(/\/+$/, '');
						if (!cloudReady(c)) { msg.className = 'msg err'; msg.textContent = 'Completa todos los campos (los enlaces empiezan con https://).'; return; }
						try { localStorage.setItem(CLOUD_KEY, JSON.stringify(c)); } catch { /* nada */ }
						draw();
					} }),
					toGithub));
		};

		draw();
		return box;
	};


	/* ---- Firebase (Storage + Auth): subida directa de archivos pesados ---- */
	const FB_VER = '10.12.2';
	const FB_ADMIN_EMAIL = 'admin@catsfrost.app';
	const fbOn = () => !!(C.firebase && C.firebase.apiKey && C.firebase.storageBucket);
	const fb = { p: null };
	const fbInit = () => {
		if (!fb.p) {
			fb.p = (async () => {
				const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
				const [app, auth, st] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-storage.js`)]);
				const a = app.initializeApp(C.firebase);
				return { app, auth, st, authI: auth.getAuth(a), storage: st.getStorage(a) };
			})();
			fb.p.catch(() => { fb.p = null; });
		}
		return fb.p;
	};
	const fbPass = (typed) => (typed.length >= 6 ? typed : `${typed}#cf2`); // Firebase exige 6+ caracteres
	const fbLogin = async (typed) => {
		const f = await fbInit();
		try {
			await f.auth.signInWithEmailAndPassword(f.authI, FB_ADMIN_EMAIL, fbPass(typed));
		} catch (e) {
			const code = String(e.code || '');
			if (code.includes('network')) throw new Error('Sin conexión con Firebase.');
			throw new Error('Contraseña incorrecta.');
		}
	};
	const fbList = async () => {
		const f = await fbInit();
		const out = { videos: [], trailer: [], descargas: [] };
		await Promise.all(Object.keys(out).map(async (sec) => {
			let res;
			try { res = await f.st.listAll(f.st.ref(f.storage, sec)); } catch { return; }
			const items = await Promise.all(res.items.map(async (r) => {
				try {
					const [meta, url] = await Promise.all([f.st.getMetadata(r), f.st.getDownloadURL(r)]);
					return { id: r.fullPath, key: r.fullPath, name: (meta.customMetadata && meta.customMetadata.name) || r.name, url, size: meta.size, createdAt: meta.timeCreated };
				} catch { return null; }
			}));
			out[sec] = items.filter(Boolean).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
		}));
		return out;
	};
	const fbRefresh = async () => {
		const lib = await fbList();
		['videos', 'trailer', 'descargas'].forEach((k) => { state.lib[k] = lib[k]; });
	};
	const fbUpload = (section, file, onProgress) => new Promise((resolve, reject) => {
		fbInit().then((f) => {
			if (!f.authI.currentUser) { reject(new Error('Tu sesión de administrador venció. Sal y vuelve a entrar.')); return; }
			const safe = `${Date.now().toString(36)}-${file.name.replace(/[^\w.-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '') || 'archivo'}`;
			const r = f.st.ref(f.storage, `${section}/${safe}`);
			const meta = { contentType: file.type || 'application/octet-stream', customMetadata: { name: file.name } };
			if (section === 'descargas') meta.contentDisposition = `attachment; filename="${file.name.replace(/[^\w. -]+/g, '_')}"`;
			const task = f.st.uploadBytesResumable(r, file, meta);
			task.on('state_changed', (sn) => onProgress(sn.bytesTransferred / sn.totalBytes), (e) => {
				const code = String(e.code || '');
				reject(new Error(code.includes('unauthorized') ? 'Sin permiso para subir: revisa las reglas de Storage y que hayas entrado como administrador.' : code.includes('quota') ? 'Se agotó la cuota de almacenamiento.' : `No se pudo subir (${code || 'error'}).`));
			}, () => resolve(`${section}/${safe}`));
		}).catch(() => reject(new Error('No se pudo cargar Firebase. Revisa tu conexión.')));
	});
	async function fbDelete(item) {
		const f = await fbInit();
		await f.st.deleteObject(f.st.ref(f.storage, item.key));
		await fbRefresh();
	}

	const fbPanel = (section) => {
		const isFiles = section === 'descargas';
		const input = el('input', { type: 'file', class: 'hidden' });
		if (!isFiles) input.setAttribute('accept', 'video/*,.mp4,.webm,.mov,.m4v,.ogv');
		const bar = el('i');
		const prog = el('div', { class: 'prog hidden' }, bar);
		const msg = el('p', { class: 'msg' });
		let chosen = null;
		const pick = el('span', { class: 'gh-pick', text: 'Ningún archivo elegido' });
		const save = el('button', { class: 'btn primary', type: 'button', text: 'Guardar', disabled: true });
		input.addEventListener('change', () => {
			chosen = input.files[0] || null;
			pick.textContent = chosen ? `${chosen.name} · ${fmtSize(chosen.size)}` : 'Ningún archivo elegido';
			save.disabled = !chosen;
			msg.className = 'msg'; msg.textContent = '';
		});
		save.addEventListener('click', async () => {
			if (!chosen) return;
			save.disabled = true;
			prog.classList.remove('hidden');
			bar.style.width = '0%';
			msg.className = 'msg';
			msg.textContent = 'Subiendo… no cierres esta ventana.';
			try {
				const key = await fbUpload(section, chosen, (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
				msg.textContent = 'Guardado. Actualizando…';
				await fbRefresh();
				win.selectId = key;
				renderWin();
			} catch (e) {
				msg.className = 'msg err';
				msg.textContent = e.message;
				prog.classList.add('hidden');
				save.disabled = false;
			}
		});
		return el('div', { class: 'note gh' },
			el('p', { text: isFiles ? 'Elige el APK o archivo y pulsa Guardar.' : 'Elige el video (puede ser pesado) y pulsa Guardar.' }),
			el('div', { class: 'gh-row' }, el('label', { class: 'btn' }, isFiles ? 'Elegir archivo' : 'Elegir video', input), save),
			pick, prog, msg);
	};

	const adminOfflinePanel = (section) => (state.role === 'admin' && state.admin ? (fbOn() ? fbPanel(section) : useCloud() ? cloudPanel(section) : ghPanel(section)) : null);

	const offlineNote = (section) => {
		const note = el('div', { class: 'note' },
			el('p', { text: 'Estás en vista previa (sin servidor): lo que pruebes aquí solo lo ves tú y no se publica. Para publicar de verdad, inicia el servidor con npm start.' }));
		{
			const input = el('input', { type: 'file', accept: section === 'descargas' ? '' : 'video/*', class: 'hidden' });
			input.addEventListener('change', () => {
				const f = input.files[0];
				if (!f) return;
				const item = { id: `local-${Date.now()}`, name: f.name, url: URL.createObjectURL(f), size: f.size, createdAt: Date.now(), local: true };
				state.local[section].push(item);
				win.selectId = item.id;
				renderWin();
			});
			note.append(el('label', { class: 'btn' }, section === 'descargas' ? 'Probar un archivo de mi PC' : 'Probar un video de mi PC', input));
		}
		return note;
	};

	/* ---- Contenido de la ventana ---- */
	function renderWin(loading = false) {
		const section = win.section;
		const host = $('#winBody');
		host.replaceChildren();
		if (loading) {
			host.append(el('p', { class: 'empty', text: 'Cargando…' }));
			return;
		}
		stopWinVideo();
		win.video = null;
		const items = itemsFor(section);
		win.items = items;
		const admin = state.role === 'admin' && state.admin;
		const emptyText = section === 'descargas'
			? 'Todavía no hay archivos publicados.'
			: section === 'trailer'
				? 'El tráiler aún no está publicado. ¡Vuelve pronto!'
				: 'No hay videos todavía.';

		if (section === 'descargas') {
			const wrap = el('div', { class: 'dwin' });
			if (admin && state.online) wrap.append(uploadPanel(section));
			if (!state.online) wrap.append(adminOfflinePanel(section));
			const grid = el('div', { class: 'dgrid' });
			if (!items.length) grid.append(el('p', { class: 'empty', text: emptyText }));
			items.forEach((it) => {
				const ext = (it.name.split('.').pop() || 'file').slice(0, 4).toUpperCase();
				grid.append(el('article', { class: 'dcard' },
					el('span', { class: 'badge', text: ext }),
					el('div', { class: 'dmeta' },
						el('strong', { text: it.name }),
						el('span', { text: `${fmtSize(it.size)} · ${fmtDate(it.createdAt)}` })),
					el('div', { class: 'dact' },
						el('a', { class: 'btn primary', href: it.local ? it.url : `${it.url}?download=1`, download: it.name, text: 'Descargar' }),
						admin ? el('button', { class: 'btn danger', type: 'button', text: 'Borrar', onclick: () => deleteItem(it) }) : null)));
			});
			wrap.append(grid);
			host.append(wrap);
			return;
		}

		// Carpetas de video: reproductor grande + lista
		const video = el('video', { controls: true, playsinline: true, preload: 'metadata' });
		const empty = el('p', { class: 'empty over', text: emptyText });
		const stage = el('div', { class: 'vstage' }, video, empty);
		const list = el('div', { class: 'vlist' });
		const side = el('aside', { class: 'vside' });
		if (admin && state.online) side.append(uploadPanel(section));
		if (!state.online) side.append(adminOfflinePanel(section));
		side.append(list);
		win.video = video;

		const select = (it) => {
			win.selectId = it.id;
			video.src = it.url;
			video.muted = false;
			video.play().catch(() => {});
			[...list.children].forEach((c) => c.classList.toggle('on', c.dataset.id === it.id));
		};
		items.forEach((it) => {
			list.append(el('div', { class: 'vitem', 'data-id': it.id },
				el('button', { class: 'vpick', type: 'button', onclick: () => select(it) },
					el('span', { class: 'play', 'aria-hidden': 'true', text: '▶' }),
					el('span', { class: 'vtext' },
						el('strong', { text: it.name }),
						el('small', { text: it.builtin ? 'Incluido' : it.local ? 'Vista previa local' : `${fmtSize(it.size)} · ${fmtDate(it.createdAt)}` }))),
				admin && it.remote ? el('button', { class: 'btn danger mini', type: 'button', text: 'Borrar', onclick: () => deleteItem(it) }) : null));
		});
		empty.classList.toggle('hidden', items.length > 0);
		video.classList.toggle('hidden', items.length === 0);
		host.append(el('div', { class: 'vwin' }, stage, side));
		const first = items.find((x) => x.id === win.selectId) || items[0];
		if (first) select(first);
	}

	/* ===================== Galería (visor) ===================== */
	const lightbox = $('#lightbox');
	let current = 0;
	const showImage = (i) => {
		current = (i + C.gallery.length) % C.gallery.length;
		const g = C.gallery[current];
		$('#lbImg').src = g.full;
		$('#lbImg').alt = g.caption;
		$('#lbCap').textContent = g.caption;
	};
	function openLightbox(i) {
		showImage(i);
		lightbox.classList.add('open');
		$('#lbClose').focus();
	}
	const closeLightbox = () => lightbox.classList.remove('open');
	$('#lbClose').addEventListener('click', closeLightbox);
	$('#lbPrev').addEventListener('click', () => showImage(current - 1));
	$('#lbNext').addEventListener('click', () => showImage(current + 1));
	lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

	addEventListener('keydown', (e) => {
		if (lightbox.classList.contains('open')) {
			if (e.key === 'Escape') closeLightbox();
			else if (e.key === 'ArrowLeft') showImage(current - 1);
			else if (e.key === 'ArrowRight') showImage(current + 1);
			return;
		}
		if (e.key === 'Escape') {
			if (winOpen) closeWin();
			else if (!introDone) window.introFinished();
		}
	});

	/* ===================== Intro → inicio (desvanecido en degradé) ===================== */
	let introDone = false;
	window.introFinished = () => {
		if (introDone) return;
		introDone = true;
		try { window.__introTl && window.__introTl.pause(); } catch { /* ya terminó */ }
		const intro = $('#intro');
		$('#skip')?.remove();
		setScreen('home');
		refreshGate();
		showView('gate');
		intro.classList.add('wiping');
		intro.style.pointerEvents = 'none';
		const cleanup = () => {
			if (window.__stopRain) window.__stopRain();
			intro.remove();
		};
		if (intro.animate) {
			const anim = intro.animate([
				{ maskPosition: '0 100%', WebkitMaskPosition: '0 100%', opacity: 1, offset: 0 },
				{ maskPosition: '0 0%', WebkitMaskPosition: '0 0%', opacity: 1, offset: 0.88 },
				{ maskPosition: '0 0%', WebkitMaskPosition: '0 0%', opacity: 0, offset: 1 },
			], { duration: 1900, easing: 'ease-in-out', fill: 'forwards' });
			anim.onfinish = cleanup;
			setTimeout(cleanup, 2600);
		} else {
			setTimeout(cleanup, 300);
		}
	};
	$('#skip').addEventListener('click', () => window.introFinished());
	setTimeout(() => window.introFinished(), 45000); // red de seguridad: la intro dura unos 20 s

	/* ===================== Arranque ===================== */
	(async () => {
		await checkServer();
		refreshGate();
		await refreshLib();
	})();
})();

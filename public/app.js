const $app = document.getElementById('app');
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const x of kids.flat()) if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x)));
  return e;
};
const mount = (...n) => $app.replaceChildren(...n);
const toast = (msg, type = 'ok') => {
  const t = h('div', { class: `t ${type}` }, msg);
  document.getElementById('toast').append(t);
  setTimeout(() => t.remove(), 3500);
};
const api = async (path, opts = {}) => {
  const r = await fetch('/api' + path, {
    credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    ...opts, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
};
const fmt = (n) => Number(n).toLocaleString('es-ES');
const when = (d) => (d ? new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'err'); } };
const guildIcon = (g) => h('div', { class: 'gicon' },
  g.icon ? h('img', { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`, alt: '' }) : g.name.slice(0, 2).toUpperCase());
const table = (heads, rows) => h('div', { style: 'overflow:auto' }, h('table', {},
  h('thead', {}, h('tr', {}, heads.map((x) => h('th', {}, x)))),
  h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))) : h('tr', {}, h('td', { colspan: heads.length, class: 'muted' }, 'Sin datos')))));
const statCards = (pairs) => h('div', { class: 'stats' }, pairs.map(([l, v]) => h('div', { class: 'glass stat' }, h('b', {}, typeof v === 'number' ? fmt(v) : v), h('span', {}, l))));
const actionBtn = (label, fn, cls = 'btn') => h('button', { class: cls, onclick: guard(fn) }, label);

let me;

/* ---------- Pantallas base ---------- */
function loginView() {
  mount(h('div', { class: 'center' }, h('div', { class: 'glass login fade' },
    h('div', { class: 'logo' }, 'AFTER DARK'), h('p', { class: 'sub' }, 'Panel de control · AFTER ON TOP'),
    h('a', { class: 'btn', href: '/auth/login' }, 'Iniciar sesión con Discord'))));
}
const topbar = () => h('div', { class: 'top' },
  h('div', { class: 'logo', style: 'font-size:20px;cursor:pointer', onclick: guildsView }, 'AFTER DARK'),
  h('div', { class: 'user' }, me.username,
    h('button', { class: 'btn ghost', onclick: async () => { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); location.reload(); } }, 'Salir')));

async function guildsView() {
  const guilds = await api('/guilds');
  mount(topbar(), h('div', { class: 'wrap fade' }, h('h2', {}, 'Tus servidores'),
    guilds.length ? h('div', { class: 'grid' }, guilds.map((g) => h('div', { class: `glass card ${g.botPresent ? 'click' : ''}`, onclick: g.botPresent ? () => guildView(g.id) : null },
      guildIcon(g), h('div', {}, g.name), h('div', { style: 'margin-top:12px' },
        g.botPresent ? h('span', { class: 'muted' }, 'Gestionar →') : h('a', { class: 'btn ghost', href: g.inviteUrl, target: '_blank', rel: 'noopener' }, 'Invitar bot')))))
      : h('p', { class: 'muted' }, 'No administras ningún servidor.')));
}

async function guildView(id, active = 'stats') {
  const g = await api(`/guilds/${id}`);
  const content = h('div', { class: 'glass panel fade' });
  const render = (key) => {
    const m = g.modules.find((x) => x.key === key);
    if (key === 'stats') {
      content.replaceChildren(h('h2', {}, `📊 ${g.name}`), statCards([['Miembros', g.memberCount], ['Canales', g.channels], ['Roles', g.roles], ['Módulos activos', g.modules.filter((x) => x.enabled).length]]),
        h('h3', {}, 'Módulos'), h('div', { class: 'chips' }, g.modules.filter((x) => x.schema).map((x) => h('span', { class: `chip ${x.enabled ? 'on' : ''}` }, `${x.icon} ${x.name}`))));
    } else if (key === 'personalizacion') presenceView(content).catch((e) => toast(e.message, 'err'));
    else modulePanel(m, g, content).catch((e) => toast(e.message, 'err'));
  };
  const side = h('div', { class: 'glass side' }, g.modules.map((m) => {
    const b = h('button', { class: `item ${m.key === active ? 'on' : ''}`, onclick: () => { side.querySelectorAll('.item').forEach((x) => x.classList.remove('on')); b.classList.add('on'); render(m.key); } },
      m.icon, m.name, m.schema && m.enabled ? h('small', { class: 'dot' }, '●') : null);
    return b;
  }));
  mount(topbar(), h('div', { class: 'layout' }, side, content));
  render(active);
}

/* ---------- Entradas de formulario reutilizables ---------- */
const listsCache = new Map();
async function getLists(gid) {
  const c = listsCache.get(gid);
  if (c && Date.now() - c.t < 15000) return c.v;
  const [ch, ro, ca] = await Promise.all([api(`/guilds/${gid}/channels`), api(`/guilds/${gid}/roles`), api(`/guilds/${gid}/categories`)]);
  const v = { channel: ch.map((x) => [x.id, '#' + x.name]), role: ro.map((x) => [x.id, '@' + x.name]), category: ca.map((x) => [x.id, x.name]) };
  listsCache.set(gid, { t: Date.now(), v });
  return v;
}
function selectEl(opts, val, { multiple = false, empty = '— ninguno —' } = {}) {
  const sel = h('select', multiple ? { multiple: 'multiple', size: Math.min(6, Math.max(3, opts.length)) } : {});
  if (!multiple) sel.append(h('option', { value: '' }, empty));
  for (const [id, name] of opts) sel.append(h('option', { value: id, selected: multiple ? (val || []).includes(id) : id === val }, name));
  return sel;
}
function mkInput(f, val, lists) {
  const t = f.type;
  if (t === 'bool') { const e = h('input', { type: 'checkbox', class: 'sw' }); e.checked = !!val; return e; }
  if (t === 'channel' || t === 'role' || t === 'category') return selectEl(lists[t], val);
  if (t === 'roles') return selectEl(lists.role, val, { multiple: true });
  if (t === 'select') return selectEl(f.options, val, { empty: '—' });
  if (t === 'int' || t === 'number') return h('input', { type: 'number', min: f.min, max: f.max, value: val ?? '' });
  if (t === 'color') return h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val ?? '') ? val : '#8b5cf6' });
  if (t === 'lines') return h('textarea', { rows: 4, placeholder: f.placeholder }, (val || []).join('\n'));
  if (t === 'textarea' || (t === 'string' && f.max >= 150)) return h('textarea', { rows: 3, maxlength: f.max }, val ?? '');
  return h('input', { value: val ?? '', maxlength: f.max, placeholder: f.placeholder });
}
function readInput(f, el) {
  const t = f.type;
  if (t === 'bool') return el.checked;
  if (t === 'int' || t === 'number') return el.value === '' ? null : Number(el.value);
  if (t === 'roles') return [...el.selectedOptions].map((o) => o.value);
  if (t === 'channel' || t === 'role' || t === 'category' || t === 'select') return el.value || null;
  if (t === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  return el.value;
}
const fieldRow = (f, el) => (f.type === 'bool' ? h('label', { class: 'chk' }, el, f.label) : h('div', { class: 'field' }, h('label', {}, f.label), el));

/* ---------- Panel genérico de módulo (formulario desde el esquema) ---------- */
async function modulePanel(m, g, content) {
  const lists = await getLists(g.id);
  const sw = h('input', { type: 'checkbox', class: 'sw' }); sw.checked = m.enabled;
  const form = h('div'); const inputs = {};
  for (const f of m.schema || []) {
    if (f.section) form.append(h('h3', {}, f.section));
    const el = mkInput(f, m.config[f.key], lists);
    inputs[f.key] = [f, el];
    form.append(fieldRow(f, el));
  }
  const read = () => Object.fromEntries(Object.entries(inputs).map(([k, [f, el]]) => [k, readInput(f, el)]));
  const save = actionBtn('Guardar cambios', async () => {
    await api(`/guilds/${g.id}/modules/${m.key}`, { method: 'PUT', body: { enabled: sw.checked, config: m.schema?.length ? read() : undefined } });
    toast('Guardado'); guildView(g.id, m.key);
  });
  content.replaceChildren(
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, h('h2', { style: 'margin:0' }, `${m.icon} ${m.name}`), h('label', { class: 'chk', style: 'margin:0' }, sw, 'Activado')),
    form, h('div', { style: 'margin-top:18px' }, save));
  const extra = EXTRAS[m.key];
  if (extra) content.append(await extra(g, { lists, m }));
}

/* ---------- CRUD genérico ---------- */
function crudPanel(g, lists, o) {
  const box = h('div'); let editing = null;
  const idOf = (r) => r[o.idKey || 'id'];
  async function draw() {
    const rows = await api(`/guilds/${g.id}${o.base}`);
    const inputs = o.fields.map((f) => {
      let val = editing ? (f.fromRow ? f.fromRow(editing) : editing[f.key]) : f.def;
      const el = mkInput(f, val, lists);
      return [f, el];
    });
    const reset = () => { editing = null; draw().catch((e) => toast(e.message, 'err')); };
    const submit = guard(async () => {
      const body = {};
      for (const [f, el] of inputs) { const v = readInput(f, el); body[f.bodyKey || f.key] = f.toBody ? f.toBody(v) : v; }
      await api(`/guilds/${g.id}${o.base}${editing ? '/' + idOf(editing) : ''}`, { method: editing ? 'PUT' : 'POST', body });
      toast('Guardado'); reset();
    });
    box.replaceChildren(h('h3', {}, o.title),
      table([...o.cols.map((c) => c[0]), ''], rows.map((r) => [...o.cols.map((c) => c[1](r)), h('span', { class: 'row', style: 'margin:0' },
        ...(o.extraActions ? o.extraActions(r) : []),
        o.editable === false ? null : h('button', { class: 'btn ghost', onclick: () => { editing = r; draw().catch(() => {}); } }, 'Editar'),
        h('button', { class: 'btn ghost', onclick: guard(async () => { if (!confirm('¿Eliminar?')) return; await api(`/guilds/${g.id}${o.base}/${idOf(r)}`, { method: 'DELETE' }); toast('Eliminado'); reset(); }) }, '🗑'))])),
      h('h3', {}, editing ? 'Editando' : 'Añadir'),
      inputs.map(([f, el]) => fieldRow(f, el)),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: submit }, editing ? 'Actualizar' : 'Crear'), editing ? h('button', { class: 'btn ghost', onclick: reset }, 'Cancelar') : null));
  }
  draw().catch((e) => toast(e.message, 'err'));
  return box;
}

/* ---------- Extras por módulo ---------- */
const sg = (g, path) => `/guilds/${g.id}${path}`;

async function economyExtras(g) {
  const [top, tx] = await Promise.all([api(sg(g, '/economy/top')), api(sg(g, '/economy/transactions'))]);
  const uid = h('input', { placeholder: 'ID de usuario' }), amt = h('input', { type: 'number', placeholder: 'Cantidad (negativa = quitar)' });
  return h('div', {},
    h('h3', {}, '🏆 Top 10'), table(['#', 'Usuario', 'Saldo'], top.map((r, i) => [i + 1, r.name, fmt(r.balance)])),
    h('h3', {}, 'Ajustar saldo'), h('div', { class: 'row' }, uid, amt, actionBtn('Aplicar', async () => {
      const r = await api(sg(g, '/economy/adjust'), { method: 'POST', body: { userId: uid.value.trim(), amount: Number(amt.value) } }); toast(`Nuevo saldo: ${fmt(r.balance)}`);
    })),
    h('h3', {}, '📒 Últimas transacciones'), table(['Fecha', 'Usuario', 'Tipo', 'Monto', 'Nota'], tx.map((t) => [when(t.at), t.name, t.type, fmt(t.amount), t.note ?? ''])));
}
const storeExtras = (g, { lists }) => crudPanel(g, lists, {
  title: '🛒 Artículos', base: '/store/items',
  cols: [['ID', (r) => r.id], ['Nombre', (r) => r.name], ['Tipo', (r) => r.type], ['Precio', (r) => fmt(r.price)], ['Stock', (r) => r.stock ?? '∞'], ['Activo', (r) => (r.enabled ? 'Sí' : 'No')]],
  fields: [
    { key: 'name', label: 'Nombre', type: 'string', max: 64 }, { key: 'description', label: 'Descripción', type: 'string', max: 100 },
    { key: 'price', label: 'Precio', type: 'int', min: 0, max: 1e9 }, { key: 'stock', label: 'Stock (vacío = ilimitado)', type: 'int', min: 0, max: 1e6 },
    { key: 'type', label: 'Tipo', type: 'select', options: [['role', 'Rol'], ['nickname', 'Apodo'], ['item', 'Objeto']], def: 'role' },
    { key: 'roleId', label: 'Rol a entregar (tipo Rol)', type: 'role' },
    { key: 'hours', bodyKey: 'durationSeconds', label: 'Duración en horas (vacío = permanente)', type: 'int', min: 0, max: 8760, fromRow: (r) => (r.durationSeconds ? r.durationSeconds / 3600 : ''), toBody: (v) => (v ? Math.round(v * 3600) : null) },
    { key: 'requiredRoleId', label: 'Rol requerido para comprar', type: 'role' }, { key: 'enabled', label: 'Visible en la tienda', type: 'bool', def: true },
  ],
});
async function counterExtras(g, { m }) {
  const s = await api(sg(g, '/counter'));
  const next = h('input', { type: 'number', min: 0, value: m.config.startNumber });
  return h('div', {}, h('h3', {}, 'Estado actual'), statCards([['Último número', s.current ?? '—'], ['Récord', s.highScore], ['Aciertos', s.totalOk], ['Errores', s.totalFail]]),
    h('h3', {}, 'Reiniciar / modificar'), h('label', {}, 'Próximo número esperado'),
    h('div', { class: 'row' }, next, actionBtn('Aplicar', async () => { await api(sg(g, '/counter/set'), { method: 'POST', body: { next: Number(next.value) } }); toast('Contador actualizado'); guildView(g.id, 'contador'); })));
}

async function ticketsExtras(g, { lists }) {
  const list = await api(sg(g, '/tickets/list'));
  return h('div', {},
    h('div', { class: 'row', style: 'margin-top:18px' }, actionBtn('📨 Enviar panel de tickets', async () => { await api(sg(g, '/tickets/panel'), { method: 'POST', body: {} }); toast('Panel enviado'); }),
      h('span', { class: 'muted' }, 'Guarda antes los cambios de configuración.')),
    crudPanel(g, lists, {
      title: '📂 Categorías', base: '/tickets/categories',
      cols: [['Nombre', (r) => `${r.emoji} ${r.name}`], ['Preguntas', (r) => r.questions.length], ['Activa', (r) => (r.enabled ? 'Sí' : 'No')]],
      fields: [
        { key: 'name', label: 'Nombre', type: 'string', max: 80 }, { key: 'emoji', label: 'Emoji (ej: 🎫)', type: 'string', max: 60 },
        { key: 'description', label: 'Descripción (se muestra en el panel)', type: 'string', max: 100 },
        { key: 'parentId', label: 'Categoría de Discord donde se crean', type: 'category' },
        { key: 'supportRoleIds', label: 'Roles de soporte extra', type: 'roles' },
        { key: 'welcomeMessage', label: 'Mensaje de bienvenida (vacío = el general)', type: 'textarea' },
        { key: 'questions', label: 'Preguntas del formulario (una por línea, máx. 5)', type: 'lines' },
        { key: 'enabled', label: 'Activa', type: 'bool', def: true },
      ],
    }),
    h('h3', {}, '🎟️ Últimos tickets'),
    table(['#', 'Dueño', 'Categoría', 'Estado', 'Valoración', 'Fecha', ''], list.map((t) => [t.number, t.ownerName, t.category ?? '—', t.status, t.rating ? '⭐'.repeat(t.rating) : '—', when(t.at),
      t.hasTranscript ? h('a', { class: 'btn ghost', href: `/api${sg(g, `/tickets/${t.id}/transcript`)}`, download: '' }, 'Transcripción') : ''])));
}

async function moderationExtras(g) {
  const cases = await api(sg(g, '/moderation/cases'));
  return h('div', {}, h('h3', {}, '📋 Últimos casos'), table(['#', 'Usuario', 'Acción', 'Motivo', 'Fecha'], cases.map((c) => [c.number, c.userName, c.action, c.reason || '—', when(c.at)])));
}
const whitelistExtras = (g, { lists }) => crudPanel(g, lists, {
  title: '✅ Usuarios autorizados', base: '/whitelist', idKey: 'userId', editable: false,
  cols: [['Usuario', (r) => r.name || r.userId], ['ID', (r) => r.userId], ['Nota', (r) => r.note || '—'], ['Desde', (r) => when(r.at)]],
  fields: [{ key: 'userId', label: 'ID de usuario de Discord', type: 'string', max: 20 }, { key: 'note', label: 'Nota', type: 'string', max: 100 }],
});
async function invitesExtras(g, { lists }) {
  const [top, recent] = await Promise.all([api(sg(g, '/invites/top')), api(sg(g, '/invites/recent'))]);
  return h('div', {},
    h('h3', {}, '🏆 Ranking de invitadores'), table(['#', 'Invitador', 'Válidas', 'Totales', 'Se fueron', 'Falsas'], top.map((r, i) => [i + 1, r.name, r.valid, r.total, r.left, r.fake])),
    crudPanel(g, lists, {
      title: '🎁 Recompensas por invitaciones', base: '/invites/rewards',
      cols: [['Invitaciones', (r) => r.invitesRequired], ['Rol', (r) => (lists.role.find(([id]) => id === r.roleId)?.[1] ?? r.roleId)]],
      fields: [{ key: 'invitesRequired', label: 'Invitaciones válidas necesarias', type: 'int', min: 1, max: 100000 }, { key: 'roleId', label: 'Rol que se entrega', type: 'role' }],
    }),
    h('h3', {}, '🕘 Historial reciente'), table(['Miembro', 'Invitado por', 'Código', 'Estado', 'Entró'], recent.map((r) => [r.memberName, r.inviterName, r.code ?? '—', r.fake ? 'Falsa' : r.leftAt ? 'Se fue' : 'Activa', when(r.joinedAt)])));
}
const testExtras = (key) => (g) => h('div', { style: 'margin-top:18px' }, actionBtn('🧪 Enviar mensaje de prueba', async () => { await api(sg(g, `/modules/${key}/test`), { method: 'POST', body: {} }); toast('Mensaje de prueba enviado'); }),
  h('p', { class: 'muted' }, 'Guarda los cambios antes de probar. Usa tu propio usuario como ejemplo.'));
const autorolesExtras = (g, { lists }) => crudPanel(g, lists, {
  title: '🏷️ Paneles de roles', base: '/autoroles/panels',
  cols: [['Nombre', (r) => r.name], ['Roles', (r) => r.roleIds.length], ['Enviado', (r) => (r.messageId ? 'Sí' : 'No')]],
  extraActions: (r) => [h('button', { class: 'btn', onclick: guard(async () => { await api(sg(g, `/autoroles/panels/${r.id}/send`), { method: 'POST', body: {} }); toast('Panel enviado'); }) }, 'Enviar')],
  fields: [
    { key: 'name', label: 'Nombre interno', type: 'string', max: 60 }, { key: 'channelId', label: 'Canal donde se publica', type: 'channel' },
    { key: 'title', label: 'Título', type: 'string', max: 256 }, { key: 'description', label: 'Descripción', type: 'string', max: 1500 },
    { key: 'color', label: 'Color', type: 'color', def: '#8b5cf6' }, { key: 'exclusive', label: 'Solo un rol a la vez', type: 'bool' },
    { key: 'roleIds', label: 'Roles del panel (máx. 25)', type: 'roles' },
  ],
});
async function suggestionsExtras(g) {
  const list = await api(sg(g, '/suggestions'));
  const decide = (n, status) => guard(async () => {
    const reason = prompt('Motivo (opcional):') ?? '';
    await api(sg(g, `/suggestions/${n}/decide`), { method: 'POST', body: { status, reason } }); toast('Actualizada'); guildView(g.id, 'sugerencias');
  });
  const LABEL = { pending: '⏳ Pendiente', approved: '✅ Aprobada', rejected: '❌ Rechazada' };
  return h('div', {}, h('h3', {}, '💡 Sugerencias'), table(['#', 'Autor', 'Sugerencia', 'Estado', 'Fecha', ''],
    list.map((s) => [s.number, s.name, s.content.slice(0, 90), LABEL[s.status], when(s.at),
      s.status === 'pending' ? h('span', { class: 'row', style: 'margin:0' }, h('button', { class: 'btn', onclick: decide(s.number, 'approved') }, 'Aprobar'), h('button', { class: 'btn ghost', onclick: decide(s.number, 'rejected') }, 'Rechazar')) : ''])));
}
async function aiExtras(g) {
  const s = await api(sg(g, '/ai/status'));
  return h('div', {}, h('h3', {}, 'Estado'), h('p', { class: s.configured ? 'muted' : 'warn' }, s.configured ? `✅ IA conectada (${s.provider === 'gemini' ? 'Gemini' : 'Anthropic'}).` : '⚠️ Falta GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en Render: la IA no responderá hasta añadir una.'),
    statCards([['Mensajes hoy', s.usage.messages], ['Usuarios hoy', s.usage.users]]));
}
const feedExtras = (path, text) => (g) => h('div', { style: 'margin-top:18px' },
  actionBtn('▶️ Publicar ahora', async () => { const r = await api(sg(g, path), { method: 'POST', body: {} }); toast(`Publicaciones enviadas: ${r.posted}`); }),
  h('p', { class: 'muted' }, text));
const anime18Extras = (g) => h('div', {}, h('p', { class: 'warn', style: 'margin-top:16px' }, '🔞 Solo para canales restringidos por edad (NSFW) con miembros mayores de 18 años. El bot rechaza automáticamente cualquier contenido con etiquetas de menores o de apariencia infantil y no permite desactivar ese filtro.'),
  feedExtras('/anime18/run', 'Publica ahora usando la configuración guardada (requiere confirmar la restricción de edad).')(g));

/* ---------- Editor de embeds ---------- */
async function embedsExtras(g, { lists }) {
  const blank = () => ({ title: '', description: '', color: '#8b5cf6', url: '', author: { name: '', iconUrl: '' }, thumbnail: '', image: '', footer: { text: '', iconUrl: '' }, timestamp: false, fields: [], buttons: [] });
  let d = blank();
  const https = (u) => /^https:\/\/\S+$/.test(u || '');
  const preview = h('div', { class: 'ep' });
  const btnPrev = h('div');
  const refresh = () => {
    const kids = [];
    if (d.author.name) kids.push(h('div', { class: 'ep-a' }, d.author.name));
    if (d.title) kids.push(h('div', { class: 'ep-t' }, d.title));
    if (d.description) kids.push(h('div', { class: 'ep-d' }, d.description));
    const fs = d.fields.filter((f) => f.name && f.value);
    if (fs.length) kids.push(h('div', { class: 'ep-fs' }, fs.map((f) => h('div', { class: f.inline ? 'ep-f inl' : 'ep-f' }, h('b', {}, f.name), h('div', {}, f.value)))));
    if (https(d.image)) kids.push(h('img', { src: d.image, class: 'ep-i', alt: '' }));
    if (d.footer.text || d.timestamp) kids.push(h('div', { class: 'ep-ft' }, [d.footer.text, d.timestamp ? new Date().toLocaleString('es-ES') : ''].filter(Boolean).join(' • ')));
    preview.replaceChildren(h('div', { class: 'ep-bar', style: `background:${/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#8b5cf6'}` }),
      h('div', { class: 'ep-body' }, kids.length ? kids : h('span', { class: 'muted' }, 'Vista previa')), https(d.thumbnail) ? h('img', { src: d.thumbnail, class: 'ep-th', alt: '' }) : null);
    const btns = d.buttons.filter((b) => b.label && https(b.url));
    btnPrev.replaceChildren(btns.length ? h('div', { class: 'ep-btns' }, btns.map((b) => h('span', { class: 'ep-btn' }, `🔗 ${b.label}`))) : '');
  };
  const bind = (label, get, set, type = 'text', big = false) => {
    if (type === 'checkbox') {
      const el = h('input', { type: 'checkbox', class: 'sw' }); el.checked = !!get();
      el.addEventListener('change', () => { set(el.checked); refresh(); });
      return h('label', { class: 'chk' }, el, label);
    }
    const el = big ? h('textarea', { rows: 5 }, get()) : h('input', { type, value: get() });
    el.addEventListener('input', () => { set(el.value); refresh(); });
    return [h('label', {}, label), el];
  };
  const listBox = (key, max, blankItem, mkRow, addLabel) => {
    const box = h('div');
    const redraw = () => box.replaceChildren(...d[key].map((it, i) => h('div', { class: 'row' }, mkRow(it),
      h('button', { class: 'btn ghost', onclick: () => { d[key].splice(i, 1); redraw(); refresh(); } }, '✕'))));
    redraw();
    return h('div', {}, box, h('button', { class: 'btn ghost', onclick: () => { if (d[key].length < max) { d[key].push(blankItem()); redraw(); } } }, addLabel));
  };
  const txt = (it, k, ph) => Object.assign(h('input', { placeholder: ph, value: it[k] }), { oninput() { it[k] = this.value; refresh(); } });
  const formBox = h('div');
  const buildForm = () => formBox.replaceChildren(
    bind('Título', () => d.title, (v) => (d.title = v)), bind('URL del título (https)', () => d.url, (v) => (d.url = v)),
    bind('Descripción', () => d.description, (v) => (d.description = v), 'text', true), bind('Color', () => d.color, (v) => (d.color = v), 'color'),
    bind('Autor', () => d.author.name, (v) => (d.author.name = v)), bind('Miniatura (URL https)', () => d.thumbnail, (v) => (d.thumbnail = v)),
    bind('Imagen grande (URL https)', () => d.image, (v) => (d.image = v)), bind('Pie de página', () => d.footer.text, (v) => (d.footer.text = v)),
    bind('Mostrar fecha y hora', () => d.timestamp, (v) => (d.timestamp = v), 'checkbox'),
    h('h3', {}, 'Campos'),
    listBox('fields', 25, () => ({ name: '', value: '', inline: false }), (f) => [txt(f, 'name', 'Nombre'), txt(f, 'value', 'Valor'),
      h('label', { class: 'chk', style: 'margin:0' }, Object.assign(h('input', { type: 'checkbox', class: 'sw' }), { checked: !!f.inline, onchange() { f.inline = this.checked; refresh(); } }), 'En línea')], '+ Campo'),
    h('h3', {}, 'Botones con enlace (máx. 5)'),
    listBox('buttons', 5, () => ({ label: '', url: '' }), (b) => [txt(b, 'label', 'Texto del botón'), txt(b, 'url', 'https://…')], '+ Botón'));
  const loadInto = (data) => { const b = blank(); d = { ...b, ...data, author: { ...b.author, ...data.author }, footer: { ...b.footer, ...data.footer }, fields: data.fields ?? [], buttons: data.buttons ?? [] }; buildForm(); refresh(); };

  const channel = selectEl(lists.channel, null, { empty: '— elige un canal —' });
  const tplSel = h('select'); const tplName = h('input', { placeholder: 'Nombre de la plantilla' }); let templates = [];
  const loadTpls = async () => {
    templates = await api(sg(g, '/embeds/templates'));
    tplSel.replaceChildren(h('option', { value: '' }, '— plantillas guardadas —'), templates.map((t) => h('option', { value: t.id }, t.name)));
  };
  await loadTpls();
  const top = h('div', {},
    h('h3', {}, 'Plantillas'),
    h('div', { class: 'row' }, tplSel,
      actionBtn('Cargar', async () => { const t = templates.find((x) => x.id === tplSel.value); if (t) { loadInto(t.data); tplName.value = t.name; } }, 'btn ghost'),
      actionBtn('🗑', async () => { if (!tplSel.value || !confirm('¿Eliminar plantilla?')) return; await api(sg(g, `/embeds/templates/${tplSel.value}`), { method: 'DELETE' }); await loadTpls(); toast('Eliminada'); }, 'btn ghost')),
    h('div', { class: 'row' }, tplName, actionBtn('Guardar plantilla', async () => { await api(sg(g, '/embeds/templates'), { method: 'POST', body: { name: tplName.value, data: d } }); await loadTpls(); toast('Plantilla guardada'); })),
    h('h3', {}, 'Enviar'),
    h('div', { class: 'row' }, channel, actionBtn('📤 Enviar embed', async () => { await api(sg(g, '/embeds/send'), { method: 'POST', body: { channelId: channel.value, data: d } }); toast('Embed enviado'); })),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => loadInto(blank()) }, 'Limpiar editor')));
  const root = h('div', { style: 'margin-top:18px' }, top,
    h('div', { class: 'embed-grid' }, formBox, h('div', { class: 'sticky' }, h('h3', {}, 'Vista previa'), preview, btnPrev)));
  buildForm(); refresh();
  return root;
}

const EXTRAS = {
  economia: economyExtras, store: storeExtras, contador: counterExtras, tickets: ticketsExtras, moderacion: moderationExtras,
  whitelist: whitelistExtras, invites: invitesExtras, bienvenidas: testExtras('bienvenidas'), despedidas: testExtras('despedidas'),
  autoroles: autorolesExtras, sugerencias: suggestionsExtras, embeds: embedsExtras, ia: aiExtras,
  manga: feedExtras('/manga/run', 'Revisa MangaDex y los RSS configurados y publica las novedades que aún no se hayan enviado.'), anime18: anime18Extras,
};

/* ---------- Presencia del bot ---------- */
async function presenceView(content) {
  if (!me.isOwner) return content.replaceChildren(h('h2', {}, '🎨 Personalización'), h('p', { class: 'muted' }, 'Solo los propietarios del bot (OWNER_IDS) pueden editar la presencia global.'));
  const p = await api('/presence'); const list = h('div');
  const addRow = (a = { type: 'Watching', text: '' }) => {
    const row = h('div', { class: 'row' }, h('select', {}, p.types.map((t) => h('option', { value: t, selected: t === a.type }, t))),
      h('input', { value: a.text, maxlength: 128, placeholder: 'Texto · usa {miembros} o {servidores}' }), h('button', { class: 'btn ghost', onclick: () => row.remove() }, '✕'));
    list.append(row);
  };
  p.activities.forEach(addRow);
  const interval = h('input', { type: 'number', min: 15, max: 3600, value: p.intervalSeconds });
  const status = h('select', {}, p.statuses.map((s) => h('option', { value: s, selected: s === p.status }, s)));
  content.replaceChildren(h('h2', {}, '🎨 Presencia del bot'), h('p', { class: 'muted' }, 'Los textos rotan automáticamente. "Custom" es el estado personalizado junto al avatar.'),
    h('label', {}, 'Segundos entre cambios (mín. 15)'), interval, h('label', {}, 'Estado'), status, h('label', {}, 'Rotación'), list,
    h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn ghost', onclick: () => addRow() }, '+ Añadir'), actionBtn('Guardar', async () => {
      const activities = [...list.children].map((r) => ({ type: r.querySelector('select').value, text: r.querySelector('input').value.trim() })).filter((a) => a.text);
      await api('/presence', { method: 'PUT', body: { intervalSeconds: Number(interval.value), status: status.value, activities } }); toast('Presencia guardada');
    })));
}

try { me = await api('/me'); await guildsView(); }
catch (e) { loginView(); if (e.status !== 401) toast(e.message, 'err'); }

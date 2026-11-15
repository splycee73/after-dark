const $app = document.getElementById('app');
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const x of kids.flat()) if (x != null) e.append(x.nodeType ? x : document.createTextNode(String(x)));
  return e;
};
const mount = (...n) => $app.replaceChildren(...n);
const toast = (msg, type = 'ok') => {
  const t = h('div', { class: `t ${type}` }, msg);
  document.getElementById('toast').append(t);
  setTimeout(() => t.remove(), 3200);
};
const api = async (path, opts = {}) => {
  const r = await fetch('/api' + path, {
    credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
};
const guildIcon = (g) => h('div', { class: 'gicon' },
  g.icon ? h('img', { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`, alt: '' }) : g.name.slice(0, 2).toUpperCase());

let me;

function loginView() {
  mount(h('div', { class: 'center' }, h('div', { class: 'glass login fade' },
    h('div', { class: 'logo' }, 'AFTER DARK'),
    h('p', { class: 'sub' }, 'Panel de control · AFTER ON TOP'),
    h('a', { class: 'btn', href: '/auth/login' }, 'Iniciar sesión con Discord'))));
}

function topbar() {
  return h('div', { class: 'top' },
    h('div', { class: 'logo', style: 'font-size:20px;cursor:pointer', onclick: guildsView }, 'AFTER DARK'),
    h('div', { class: 'user' }, me.username,
      h('button', { class: 'btn ghost', onclick: async () => { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); location.reload(); } }, 'Salir')));
}

async function guildsView() {
  const guilds = await api('/guilds');
  mount(topbar(), h('div', { class: 'wrap fade' },
    h('h2', {}, 'Tus servidores'),
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
      content.replaceChildren(h('h2', {}, `📊 ${g.name}`), h('div', { class: 'stats' },
        [['Miembros', g.memberCount], ['Canales', g.channels], ['Roles', g.roles], ['Módulos activos', g.modules.filter((x) => x.enabled).length]]
          .map(([l, v]) => h('div', { class: 'glass stat' }, h('b', {}, v.toLocaleString('es-ES')), h('span', {}, l)))));
    } else if (key === 'personalizacion') presenceView(content);
    else if (m.implemented) modulePanel(m, g, content).catch((e) => toast(e.message, 'err'));
    else content.replaceChildren(h('h2', {}, `${m.icon} ${m.name}`), h('p', { class: 'muted' }, `Este módulo se implementa en la Etapa ${m.stage}. Su estructura en base de datos y su API de configuración ya están listas.`));
  };
  const side = h('div', { class: 'glass side' }, g.modules.map((m) => {
    const b = h('button', { class: `item ${m.key === active ? 'on' : ''}`, onclick: () => { side.querySelectorAll('.item').forEach((x) => x.classList.remove('on')); b.classList.add('on'); render(m.key); } },
      m.icon, m.name, m.implemented ? null : h('small', {}, `Etapa ${m.stage}`));
    return b;
  }));
  mount(topbar(), h('div', { class: 'layout' }, side, content));
  render(active);
}

async function presenceView(content) {
  if (!me.isOwner) return content.replaceChildren(h('h2', {}, '🎨 Personalización'), h('p', { class: 'muted' }, 'Solo los propietarios del bot (OWNER_IDS) pueden editar la presencia global.'));
  const p = await api('/presence');
  const list = h('div');
  const addRow = (a = { type: 'Watching', text: '' }) => {
    const row = h('div', { class: 'row' },
      h('select', {}, p.types.map((t) => h('option', { value: t, selected: t === a.type }, t))),
      h('input', { value: a.text, maxlength: 128, placeholder: 'Texto · usa {miembros} o {servidores}' }),
      h('button', { class: 'btn ghost', onclick: () => row.remove() }, '✕'));
    list.append(row);
  };
  p.activities.forEach(addRow);
  const interval = h('input', { type: 'number', min: 15, max: 3600, value: p.intervalSeconds });
  const status = h('select', {}, p.statuses.map((s) => h('option', { value: s, selected: s === p.status }, s)));
  content.replaceChildren(h('h2', {}, '🎨 Presencia del bot'),
    h('p', { class: 'muted' }, 'Los textos rotan automáticamente. "Custom" es el estado personalizado junto al avatar.'),
    h('label', {}, 'Segundos entre cambios (mín. 15)'), interval, h('label', {}, 'Estado'), status,
    h('label', {}, 'Rotación'), list,
    h('div', { class: 'row', style: 'margin-top:14px' },
      h('button', { class: 'btn ghost', onclick: () => addRow() }, '+ Añadir'),
      h('button', { class: 'btn', onclick: async () => {
        const activities = [...list.children].map((r) => ({ type: r.querySelector('select').value, text: r.querySelector('input').value.trim() })).filter((a) => a.text);
        try { await api('/presence', { method: 'PUT', body: { intervalSeconds: Number(interval.value), status: status.value, activities } }); toast('Presencia guardada'); }
        catch (e) { toast(e.message, 'err'); }
      } }, 'Guardar')));
}


const fmt = (n) => Number(n).toLocaleString('es-ES');
const when = (d) => new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
const table = (heads, rows) => h('div', { style: 'overflow:auto' }, h('table', {},
  h('thead', {}, h('tr', {}, heads.map((x) => h('th', {}, x)))),
  h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))) : h('tr', {}, h('td', { colspan: heads.length, class: 'muted' }, 'Sin datos')))));
const selectOf = (list, val, empty = '— ninguno —') => h('select', {}, h('option', { value: '' }, empty),
  list.map(([id, name]) => h('option', { value: id, selected: id === val }, name)));

async function modulePanel(m, g, content) {
  const needs = (m.schema || []).some((f) => f.type === 'channel' || f.type === 'role') || m.key === 'store';
  const [channels, roles] = needs ? await Promise.all([api(`/guilds/${g.id}/channels`), api(`/guilds/${g.id}/roles`)]) : [[], []];
  const sw = h('input', { type: 'checkbox', class: 'sw' }); sw.checked = m.enabled;
  const form = h('div'); const inputs = {};
  for (const f of m.schema || []) {
    if (f.section) form.append(h('h3', {}, f.section));
    const val = m.config[f.key]; let el;
    if (f.type === 'bool') { el = h('input', { type: 'checkbox', class: 'sw' }); el.checked = !!val; }
    else if (f.type === 'channel') el = selectOf(channels.map((c) => [c.id, '#' + c.name]), val);
    else if (f.type === 'role') el = selectOf(roles.map((r) => [r.id, '@' + r.name]), val);
    else if (f.type === 'int') el = h('input', { type: 'number', min: f.min, max: f.max, value: val });
    else el = f.max >= 150 ? h('textarea', { rows: 3, maxlength: f.max }, val ?? '') : h('input', { value: val ?? '', maxlength: f.max });
    inputs[f.key] = [f, el];
    form.append(f.type === 'bool' ? h('label', { class: 'chk' }, el, f.label) : [h('label', {}, f.label), el]);
  }
  const read = () => Object.fromEntries(Object.entries(inputs).map(([k, [f, el]]) =>
    [k, f.type === 'bool' ? el.checked : f.type === 'int' ? Number(el.value) : f.type === 'string' ? el.value : (el.value || null)]));
  const save = h('button', { class: 'btn', onclick: async () => {
    try {
      await api(`/guilds/${g.id}/modules/${m.key}`, { method: 'PUT', body: { enabled: sw.checked, config: m.schema?.length ? read() : undefined } });
      toast('Guardado'); guildView(g.id, m.key);
    } catch (e) { toast(e.message, 'err'); }
  } }, 'Guardar cambios');
  content.replaceChildren(h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
    h('h2', { style: 'margin:0' }, `${m.icon} ${m.name}`), h('label', { class: 'chk', style: 'margin:0' }, sw, 'Activado')),
    form, h('div', { style: 'margin-top:18px' }, save));
  const extra = { economia: economyExtras, store: storeExtras, contador: counterExtras, tickets: ticketsExtras }[m.key];
  if (extra) content.append(await extra(g, { channels, roles, m }));
}

async function economyExtras(g) {
  const [top, tx] = await Promise.all([api(`/guilds/${g.id}/economy/top`), api(`/guilds/${g.id}/economy/transactions`)]);
  const uid = h('input', { placeholder: 'ID de usuario' }), amt = h('input', { type: 'number', placeholder: 'Cantidad (negativa = quitar)' });
  return h('div', {},
    h('h3', {}, '🏆 Top 10'), table(['#', 'Usuario', 'Saldo'], top.map((r, i) => [i + 1, r.name, fmt(r.balance)])),
    h('h3', {}, 'Ajustar saldo'), h('div', { class: 'row' }, uid, amt, h('button', { class: 'btn', onclick: async () => {
      try { const r = await api(`/guilds/${g.id}/economy/adjust`, { method: 'POST', body: { userId: uid.value.trim(), amount: Number(amt.value) } }); toast(`Nuevo saldo: ${fmt(r.balance)}`); }
      catch (e) { toast(e.message, 'err'); }
    } }, 'Aplicar')),
    h('h3', {}, '📒 Últimas transacciones'), table(['Fecha', 'Usuario', 'Tipo', 'Monto', 'Nota'], tx.map((t) => [when(t.at), t.name, t.type, fmt(t.amount), t.note ?? ''])));
}


async function ticketsExtras(g) {
  const data = await api(`/guilds/${g.id}/tickets`);
  return h('div', {},
    h('h3', {}, 'Resumen de tickets'),
    h('div', { class: 'stats' },
      h('div', { class: 'glass stat' }, h('b', {}, fmt(data.counts.open)), h('span', {}, 'Abiertos ahora')),
      h('div', { class: 'glass stat' }, h('b', {}, fmt(data.counts.total)), h('span', {}, 'Tickets registrados'))),
    h('h3', {}, 'Actividad reciente'),
    table(['Ticket', 'Canal', 'Usuario', 'Estado', 'Creado'], data.tickets.map((t) =>
      [`#${t.id}`, h('a', { href: `https://discord.com/channels/${g.id}/${t.channelId}`, target: '_blank', rel: 'noopener' }, 'Abrir canal'), t.openerId, t.status === 'open' ? '🟢 Abierto' : '⚫ Cerrado', when(t.createdAt)])));
}

async function storeExtras(g, { roles }) {
  const box = h('div'); let editing = null;
  const roleList = roles.map((r) => [r.id, '@' + r.name]);
  async function draw() {
    const items = await api(`/guilds/${g.id}/store/items`);
    const f = { name: h('input', { maxlength: 64 }), description: h('input', { maxlength: 200 }), price: h('input', { type: 'number', min: 0 }),
      stock: h('input', { type: 'number', min: 0, placeholder: 'vacío = ilimitado' }),
      type: h('select', {}, [['role', 'Rol'], ['nickname', 'Apodo'], ['item', 'Objeto']].map(([v, n]) => h('option', { value: v }, n))),
      role: selectOf(roleList, null, '— rol a entregar —'), hours: h('input', { type: 'number', min: 0, step: 'any', placeholder: 'vacío = permanente' }),
      req: selectOf(roleList, null, '— sin requisito —'), enabled: h('input', { type: 'checkbox', class: 'sw' }) };
    f.enabled.checked = true;
    if (editing) {
      f.name.value = editing.name; f.description.value = editing.description; f.price.value = editing.price; f.stock.value = editing.stock ?? '';
      f.type.value = editing.type; f.role.value = editing.roleId ?? ''; f.hours.value = editing.durationSeconds ? editing.durationSeconds / 3600 : '';
      f.req.value = editing.requiredRoleId ?? ''; f.enabled.checked = editing.enabled;
    }
    const reset = () => { editing = null; draw(); };
    const submit = async () => {
      const body = { name: f.name.value, description: f.description.value, price: Number(f.price.value), stock: f.stock.value === '' ? null : Number(f.stock.value),
        type: f.type.value, roleId: f.role.value || null, durationSeconds: f.hours.value ? Math.round(Number(f.hours.value) * 3600) : null,
        requiredRoleId: f.req.value || null, enabled: f.enabled.checked };
      try {
        await api(`/guilds/${g.id}/store/items${editing ? '/' + editing.id : ''}`, { method: editing ? 'PUT' : 'POST', body });
        toast('Artículo guardado'); reset();
      } catch (e) { toast(e.message, 'err'); }
    };
    box.replaceChildren(h('h3', {}, '🛒 Artículos'),
      table(['ID', 'Nombre', 'Tipo', 'Precio', 'Stock', 'Activo', ''], items.map((i) => [i.id, i.name, i.type, fmt(i.price), i.stock ?? '∞', i.enabled ? 'Sí' : 'No',
        h('span', { class: 'row', style: 'margin:0' },
          h('button', { class: 'btn ghost', onclick: () => { editing = i; draw(); } }, 'Editar'),
          h('button', { class: 'btn ghost', onclick: async () => { if (!confirm(`¿Eliminar "${i.name}"?`)) return; try { await api(`/guilds/${g.id}/store/items/${i.id}`, { method: 'DELETE' }); toast('Eliminado'); draw(); } catch (e) { toast(e.message, 'err'); } } }, '🗑'))])),
      h('h3', {}, editing ? `Editando: ${editing.name}` : 'Nuevo artículo'),
      h('label', {}, 'Nombre'), f.name, h('label', {}, 'Descripción'), f.description, h('label', {}, 'Precio'), f.price, h('label', {}, 'Stock'), f.stock,
      h('label', {}, 'Tipo'), f.type, h('label', {}, 'Rol a entregar (solo tipo Rol)'), f.role, h('label', {}, 'Duración en horas (solo tipo Rol)'), f.hours,
      h('label', {}, 'Rol requerido para comprar'), f.req, h('label', { class: 'chk' }, f.enabled, 'Visible en la tienda'),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: submit }, editing ? 'Actualizar' : 'Crear artículo'), editing ? h('button', { class: 'btn ghost', onclick: reset }, 'Cancelar') : null));
  }
  await draw();
  return box;
}

async function counterExtras(g, { m }) {
  const s = await api(`/guilds/${g.id}/counter`);
  const next = h('input', { type: 'number', min: 0, value: m.config.startNumber });
  return h('div', {}, h('h3', {}, 'Estado actual'),
    h('div', { class: 'stats' }, [['Último número', s.current ?? '—'], ['Récord', s.highScore], ['Aciertos', s.totalOk], ['Errores', s.totalFail]]
      .map(([l, v]) => h('div', { class: 'glass stat' }, h('b', {}, typeof v === 'number' ? fmt(v) : v), h('span', {}, l)))),
    h('h3', {}, 'Reiniciar / modificar'), h('label', {}, 'Próximo número esperado'),
    h('div', { class: 'row' }, next, h('button', { class: 'btn', onclick: async () => {
      try { await api(`/guilds/${g.id}/counter/set`, { method: 'POST', body: { next: Number(next.value) } }); toast('Contador actualizado'); guildView(g.id, 'contador'); }
      catch (e) { toast(e.message, 'err'); }
    } }, 'Aplicar')));
}

try { me = await api('/me'); await guildsView(); }
catch (e) { if (e.status === 401) loginView(); else { loginView(); toast(e.message, 'err'); } }

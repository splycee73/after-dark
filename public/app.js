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
  mount(h('div', { class: 'auth-shell fade' },
    h('section', { class: 'auth-copy' },
      h('div', { class: 'logo' }, 'AFTER DARK'),
      h('p', { class: 'auth-kicker' }, 'CONTROL CENTER · DISCORD'),
      h('h1', {}, 'Tu comunidad.\nTus reglas.\nUn solo lugar.'),
      h('p', { class: 'auth-description' }, 'Administra tus servidores, automatiza tareas y personaliza cada módulo desde un panel diseñado para tenerlo todo bajo control.'),
      h('div', { class: 'auth-points' },
        h('span', {}, '✦ Gestión centralizada'),
        h('span', {}, '✦ Configuración por servidor'),
        h('span', {}, '✦ Herramientas de moderación y comunidad'))),
    h('div', { class: 'glass auth-card' },
      h('div', { class: 'auth-mark' }, 'AD'),
      h('h2', {}, 'Bienvenido a AFTER DARK'),
      h('p', { class: 'muted' }, 'Conecta tu cuenta de Discord para elegir y administrar tus servidores.'),
      h('a', { class: 'btn auth-login', href: '/auth/login' }, 'Continuar con Discord'),
      h('p', { class: 'auth-footnote' }, 'La autorización se realiza mediante Discord OAuth2. Tu contraseña nunca se comparte con AFTER DARK.'))));
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
    h('div',{class:'guild-heading'},h('div',{},h('p',{class:'auth-kicker'},'WORKSPACE · SERVIDORES'),h('h2',{},'Tus servidores'),h('p',{class:'muted'},'Selecciona una comunidad para abrir su centro de control.')),h('span',{class:'guild-count'},`${guilds.length} disponibles`)),
    guilds.length ? h('div', { class: 'grid' }, guilds.map((g) => h('div', { class: `glass card guild-card ${g.botPresent ? 'click' : ''}`, onclick: g.botPresent ? () => guildView(g.id) : null },
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
    if (f.type === 'bool') form.append(h('label', { class: 'chk' }, el, f.label));
    else { form.append(h('label', {}, f.label)); form.append(el); }
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


async function ticketsExtras(g, { channels, roles }) {
  const [data, panels, categories] = await Promise.all([
    api(`/guilds/${g.id}/tickets`), api(`/guilds/${g.id}/tickets/panels`), api(`/guilds/${g.id}/ticket-categories`),
  ]);
  const box = h('div');
  let editing = null;
  const channelOptions = channels.map((x) => [x.id, '#' + x.name]);
  const roleOptions = roles.map((x) => [x.id, '@' + x.name]);
  const categoryOptions = categories.map((x) => [x.id, x.name]);
  const fieldRows = h('div');
  const categoryRows = h('div');
  const readonlyRoles = h('select', { multiple: true, size: 4 }, roleOptions.map(([v,n]) => h('option',{value:v},n)));
  const addCategory = (cat = {}) => {
    const label = h('input',{maxlength:80,placeholder:'Ej. Soporte general',value:cat.label||''});
    const description = h('input',{maxlength:100,placeholder:'Breve descripción',value:cat.description||''});
    const emoji = h('input',{maxlength:32,placeholder:'Emoji opcional',value:cat.emoji||''});
    const welcomeTitle = h('input',{maxlength:256,placeholder:'Título del mensaje dentro del ticket',value:cat.welcomeTitle||''});
    const welcomeMessage = h('textarea',{rows:3,placeholder:'Mensaje personalizado al abrir esta categoría'}); welcomeMessage.value=cat.welcomeMessage||'';
    const channel = selectOf(categoryOptions,cat.channelId||null,'— categoría de Discord —');
    const team = h('select',{multiple:true,size:3},roleOptions.map(([v,n])=>h('option',{value:v,selected:(cat.supportRoleIds||[]).includes(v)},n)));
    const subs = h('textarea',{rows:3,placeholder:'Subcategorías, una por línea. Ej. Problema técnico\\nConsulta general'});
    subs.value=(cat.subcategories||[]).map(x=>x.label).join('\\n');
    const row=h('div',{class:'glass',style:'padding:14px;margin:10px 0;display:grid;gap:8px'},
      h('div',{class:'row'},h('strong',{},'Categoría'),h('button',{class:'btn ghost',onclick:()=>row.remove()},'Eliminar')),
      h('label',{},'Nombre'),label,h('label',{},'Descripción'),description,h('label',{},'Emoji'),emoji,
      h('label',{},'Categoría de Discord donde crear tickets'),channel,
      h('label',{},'Roles que atenderán esta categoría (puedes seleccionar varios)'),team,
      h('label',{},'Subcategorías (una por línea)'),subs);
    row.readCategory=()=>({id:cat.id||('cat-'+Math.random().toString(36).slice(2,10)),label:label.value.trim(),description:description.value.trim(),emoji:emoji.value.trim(),welcomeTitle:welcomeTitle.value.trim(),welcomeMessage:welcomeMessage.value.trim(),channelId:channel.value||null,supportRoleIds:[...team.selectedOptions].map(x=>x.value),subcategories:subs.value.split('\\n').map((v,i)=>v.trim()).filter(Boolean).slice(0,25).map((v,i)=>({id:'sub-'+i+'-'+v.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,16),label:v}))});
    categoryRows.append(row);
  };
  const addField = (f = {}) => {
    const label = h('input', { maxlength: 45, placeholder: 'Pregunta (ej. ¿En qué podemos ayudarte?)', value: f.label || '' });
    const placeholder = h('input', { maxlength: 100, placeholder: 'Texto de ayuda', value: f.placeholder || '' });
    const style = h('select', {}, [['short','Respuesta corta'],['paragraph','Respuesta larga']].map(([v,n])=>h('option',{value:v,selected:(f.style||'short')===v},n)));
    const required = h('input', { type: 'checkbox', class: 'sw' }); required.checked = f.required !== false;
    const maxLength = h('input', { type: 'number', min: 1, max: 1000, value: f.maxLength || 300 });
    const row = h('div', { class: 'glass', style: 'padding:12px;margin:8px 0;display:grid;gap:8px' },
      h('div', { class: 'row' }, label, h('button', { class: 'btn ghost', onclick: () => row.remove() }, 'Quitar')),
      placeholder, style, h('label', { class: 'chk' }, required, 'Obligatoria'), h('label', {}, 'Máximo de caracteres'), maxLength);
    row.readField = () => ({ label: label.value.trim(), placeholder: placeholder.value.trim(), style: style.value, required: required.checked, maxLength: Number(maxLength.value) || 300 });
    fieldRows.append(row);
  };
  const controls = {
    name: h('input', { maxlength: 60, placeholder: 'Ej. Soporte general' }),
    panelChannelId: selectOf(channelOptions, null, '— canal donde publicar —'),
    categoryId: selectOf(categoryOptions, null, '— categoría de tickets —'),
    supportRoleId: selectOf(roleOptions, null, '— rol de soporte —'),
    panelTitle: h('input', { maxlength: 256 }), panelDescription: h('textarea', { rows: 3, maxlength: 4000 }),
    buttonLabel: h('input', { maxlength: 80 }), buttonEmoji: h('input', { maxlength: 32, placeholder: 'Emoji opcional: 🎫' }),
    color: h('input', { type: 'color' }), panelImageUrl: h('input',{maxlength:500,placeholder:'https://...'}), panelFooter: h('input',{maxlength:200,placeholder:'Pie del panel'}),
    welcomeTitle: h('input', { maxlength: 256 }), welcomeMessage: h('textarea', { rows: 4, maxlength: 3000 }),
    closeMessage: h('textarea', { rows: 2, maxlength: 1000 }),
    active: h('input', { type: 'checkbox', class: 'sw' }),
  };
  const defaults = { name:'Soporte general', panelTitle:'Centro de soporte', panelDescription:'¿Necesitas ayuda? Pulsa el botón para abrir un ticket privado.', buttonLabel:'Abrir ticket', color:'#8b5cf6', welcomeTitle:'🎫 Ticket abierto', welcomeMessage:'Hola {user}, gracias por contactar con el equipo de {server}. Describe tu consulta y te atenderemos pronto.', closeMessage:'🔒 Ticket cerrado por {user}.', active:true };
  const setValues = (p = defaults) => {
    for (const k of Object.keys(controls)) {
      if (k === 'panelChannelId' || k === 'categoryId' || k === 'supportRoleId') controls[k].value = p[k] || '';
      else if (controls[k].type === 'checkbox') controls[k].checked = p[k] !== false;
      else controls[k].value = p[k] ?? '';
    }
    fieldRows.replaceChildren();
    (p.formFields || []).forEach(addField);
    categoryRows.replaceChildren();
    (p.panelCategories || []).forEach(addCategory);
    [...readonlyRoles.options].forEach(o => { o.selected = (p.readonlyRoleIds || []).includes(o.value); });
  };
  const readValues = () => ({
    ...Object.fromEntries(Object.entries(controls).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value])),
    categoryId: controls.categoryId.value || null, supportRoleId: controls.supportRoleId.value || null,
    formFields: [...fieldRows.children].map((x) => x.readField()).filter((x) => x.label).slice(0,5),
    panelCategories: [...categoryRows.children].map(x=>x.readCategory()).filter(x=>x.label).slice(0,25),
    readonlyRoleIds: [...readonlyRoles.selectedOptions].map(x=>x.value),
  });
  const draw = () => {
    box.replaceChildren(
      h('h3', {}, '🎫 Paneles de tickets'),
      h('p', { class: 'muted' }, 'Crea paneles distintos para soporte, reportes, compras o cualquier departamento. Cada panel puede tener su propio canal, categoría, equipo, mensaje y formulario.'),
      panels.length ? table(['Panel','Canal','Estado','Acciones'], panels.map((p) => [
        p.name, '#' + (channels.find((x) => x.id === p.panelChannelId)?.name || p.panelChannelId),
        p.active ? '🟢 Activo' : '⚫ Pausado',
        h('div', { class: 'row', style: 'margin:0' },
          h('button', { class: 'btn ghost', onclick: () => { editing = p; setValues(p); draw(); } }, 'Editar'),
          h('button', { class: 'btn ghost', onclick: async () => { try { await api(`/guilds/${g.id}/tickets/panels/${p.id}/publish`, { method:'POST', body:{} }); toast('Panel publicado en Discord'); } catch(e) { toast(e.message,'err'); } } }, 'Publicar'),
          h('button', { class: 'btn ghost', onclick: async () => { if (!confirm(`¿Eliminar el panel "${p.name}"?`)) return; try { await api(`/guilds/${g.id}/tickets/panels/${p.id}`,{method:'DELETE'}); const i=panels.findIndex(x=>x.id===p.id); if(i>=0) panels.splice(i,1); editing=null; setValues(); draw(); toast('Panel eliminado'); } catch(e){toast(e.message,'err');} } }, '🗑'))
      ])) : h('p', { class:'muted' }, 'Todavía no has creado paneles.'),
      h('h3', {}, editing ? `Editando: ${editing.name}` : 'Crear panel'),
      h('div', { class:'glass', style:'padding:14px;display:grid;gap:8px' },
        h('label',{},'Nombre interno'), controls.name,
        h('label',{},'Canal donde aparecerá el panel'), controls.panelChannelId,
        h('label',{},'Categoría donde se crearán los tickets'), controls.categoryId,
        h('label',{},'Rol que atenderá los tickets'), controls.supportRoleId,
        h('h3',{},'Categorías que verá el usuario'),
        h('p',{class:'muted'},'El usuario podrá elegir una categoría y, si la defines, una subcategoría. Cada categoría puede usar su propia categoría de Discord y varios roles de atención.'),
        categoryRows,
        h('button',{class:'btn ghost',onclick:()=>{if(categoryRows.children.length>=25)return toast('Máximo 25 categorías','err');addCategory();}},'+ Añadir categoría'),
        h('label',{},'Roles adicionales de solo lectura (pueden ver el ticket, pero no escribir)'), readonlyRoles,
        h('h3',{},'Diseño del panel'),
        h('label',{},'Título'), controls.panelTitle, h('label',{},'Descripción'), controls.panelDescription,
        h('label',{},'Texto del botón'), controls.buttonLabel, h('label',{},'Emoji del botón'), controls.buttonEmoji,
        h('label',{},'Color del embed'), controls.color, h('label',{},'Imagen del panel (URL HTTPS)'), controls.panelImageUrl, h('label',{},'Pie del panel'), controls.panelFooter,
        h('h3',{},'Mensaje al abrir ticket'),
        h('label',{},'Título de bienvenida'), controls.welcomeTitle,
        h('label',{},'Mensaje de bienvenida'), controls.welcomeMessage,
        h('p',{class:'muted'},'Variables: {user}, {username}, {server}, {ticket}.'),
        h('label',{},'Mensaje al cerrar'), controls.closeMessage,
        h('h3',{},'Formulario previo a abrir'),
        h('p',{class:'muted'},'Hasta 5 preguntas. Si no agregas preguntas, el botón abrirá el ticket directamente.'),
        fieldRows,
        h('button',{class:'btn ghost',onclick:()=>{if(fieldRows.children.length>=5)return toast('Máximo 5 preguntas','err');addField();}},'+ Añadir pregunta'),
        h('label',{class:'chk'},controls.active,'Panel activo'),
        h('div',{class:'row',style:'margin-top:12px'},
          h('button',{class:'btn',onclick:async()=>{
            const body=readValues();
            try {
              const saved=await api(`/guilds/${g.id}/tickets/panels${editing?'/'+editing.id:''}`,{method:editing?'PUT':'POST',body});
              if(editing){const ix=panels.findIndex(x=>x.id===editing.id);if(ix>=0)panels[ix]=saved;}else panels.push(saved);
              editing=saved; toast('Configuración guardada'); draw();
            } catch(e){toast(e.message,'err');}
          }}, editing?'Guardar cambios':'Crear panel'),
          h('button',{class:'btn ghost',onclick:()=>{editing=null;setValues();draw();}},'Nuevo / limpiar'),
          editing?h('button',{class:'btn ghost',onclick:async()=>{try{await api(`/guilds/${g.id}/tickets/panels/${editing.id}/publish`,{method:'POST',body:{}});toast('Panel publicado en Discord');}catch(e){toast(e.message,'err');}}},'Publicar en Discord'):null
        )
      ),
      h('h3', {}, 'Resumen de tickets'),
      h('div', { class: 'stats' },
        h('div', { class: 'glass stat' }, h('b', {}, fmt(data.counts.open)), h('span', {}, 'Abiertos ahora')),
        h('div', { class: 'glass stat' }, h('b', {}, fmt(data.counts.total)), h('span', {}, 'Tickets registrados'))),
      h('h3', {}, 'Actividad reciente'),
      table(['Ticket','Canal','Usuario','Estado','Prioridad','Responsable','Notas','Transcripción','Creado'],data.tickets.map(t=>[`#${t.id}`,h('a',{href:`https://discord.com/channels/${g.id}/${t.channelId}`,target:'_blank',rel:'noopener'},'Abrir canal'),t.openerId,t.archivedAt?'🗄️ Archivado':t.status==='open'?'🟢 Abierto':'⚫ Cerrado',t.priority||'normal',t.claimedBy||'—',h('button',{class:'btn ghost',onclick:async()=>{try{const notes=await api(`/guilds/${g.id}/tickets/${t.id}/notes`);const previous=notes.map(n=>`${when(n.createdAt)} · ${n.authorId}: ${n.content}`).join('\n');const content=prompt(previous?`Notas internas:\n${previous}\n\nNueva nota:`:'Nueva nota interna:');if(!content?.trim())return;await api(`/guilds/${g.id}/tickets/${t.id}/notes`,{method:'POST',body:{content}});toast('Nota interna guardada');}catch(e){toast(e.message,'err');}}},'Ver / añadir'),h('a',{href:`/api/guilds/${g.id}/tickets/${t.id}/transcript`,download:`ticket-${t.id}.html`},'Descargar HTML'),when(t.createdAt)]))
    );
  };
  setValues(); draw();
  return box;
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

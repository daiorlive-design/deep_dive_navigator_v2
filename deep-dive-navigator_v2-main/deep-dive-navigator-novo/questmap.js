// ==========================================
// QUEST MAP — mapa do tesouro desenhado em SVG
// O pergaminho, a trilha e as ilustrações são gerados aqui; os marcos
// (fases) são elementos HTML posicionados por cima, nas mesmas coordenadas.
// ==========================================
const QuestMap = (() => {
    const H = 232;
    const MARGIN = 96;
    const MIN_SPACING = 140;
    const INK = '#5B4226';

    const ICONS = {
        check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
        compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><g class="needle"><path d="M12 4.5 L14.2 12 L9.8 12 Z" fill="#FF6B5B"/><path d="M12 19.5 L14.2 12 L9.8 12 Z" fill="currentColor"/></g><circle cx="12" cy="12" r="1.4" fill="#0F3E7A"/></svg>',
        flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M7 4h11l-2.5 4L18 12H7z" fill="currentColor"/></svg>'
    };

    // Gerador pseudoaleatório com semente: o mapa sai igual a cada renderização
    function rng(seed) {
        return () => {
            seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const r1 = (n) => Math.round(n * 10) / 10;

    function layout(n, avail) {
        const spacing = n > 1 ? Math.max(MIN_SPACING, (avail - MARGIN * 2) / (n - 1)) : 0;
        const width = n > 1 ? MARGIN * 2 + spacing * (n - 1) : Math.max(avail, MARGIN * 2);
        const pts = [];
        for (let i = 0; i < n; i++) {
            pts.push({
                x: r1(n > 1 ? MARGIN + i * spacing : width / 2),
                y: r1(118 + 16 * Math.sin(i * 1.7 + 0.5))
            });
        }
        return { width: Math.round(width), spacing, pts };
    }

    // --- Pergaminho com bordas rasgadas ---
    function parchmentPath(w, h) {
        const r = rng(42);
        const step = 22;
        const jit = () => r1(4 + r() * 7);
        let d = 'M 6 8';
        for (let x = 6 + step; x < w - 6; x += step) d += ` L ${x} ${jit()}`;
        d += ` L ${w - 6} 8`;
        for (let y = 8 + step; y < h - 8; y += step) d += ` L ${r1(w - jit())} ${y}`;
        d += ` L ${w - 6} ${h - 8}`;
        for (let x = w - 6 - step; x > 6; x -= step) d += ` L ${x} ${r1(h - jit())}`;
        d += ` L 6 ${h - 8}`;
        for (let y = h - 8 - step; y > 8; y -= step) d += ` L ${jit()} ${y}`;
        return d + ' Z';
    }

    function stains(w, h) {
        const r = rng(7);
        let s = '';
        const count = Math.max(3, Math.round(w / 260));
        for (let i = 0; i < count; i++) {
            s += `<ellipse cx="${r1(40 + r() * (w - 80))}" cy="${r1(30 + r() * (h - 60))}" rx="${r1(30 + r() * 60)}" ry="${r1(18 + r() * 30)}" fill="url(#qm-stain)"/>`;
        }
        return s;
    }

    function segment(a, b, i) {
        const dir = i % 2 === 0 ? 1 : -1;
        const dx = r1((b.x - a.x) * 0.4);
        return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y + 26 * dir}, ${b.x - dx} ${b.y - 26 * dir}, ${b.x} ${b.y}`;
    }

    // --- Ilustrações (coordenadas locais, base em y = 0) ---
    const at = (x, y, body) => `<g transform="translate(${r1(x)} ${r1(y)})">${body}</g>`;

    function compassRose(x, y) {
        const point = (rot, len, w) => `
            <g transform="rotate(${rot})">
                <path d="M0 ${-len} L${w} -3 L0 0 Z" fill="${INK}"/>
                <path d="M0 ${-len} L${-w} -3 L0 0 Z" fill="#EAD9B0" stroke="${INK}" stroke-width=".6"/>
            </g>`;
        let body = `<circle r="24" fill="none" stroke="${INK}" stroke-width="1.2"/>
            <circle r="19" fill="none" stroke="${INK}" stroke-width=".6" stroke-dasharray="1.5 2.5"/>`;
        [45, 135, 225, 315].forEach(a => { body += point(a, 13, 2.6); });
        [0, 90, 180, 270].forEach(a => { body += point(a, 22, 3.6); });
        body += `<circle r="2" fill="${INK}"/>
            <text y="-28" text-anchor="middle" font-size="10" font-weight="700" font-family="Fraunces, Georgia, serif" fill="${INK}">N</text>`;
        return at(x, y, body);
    }

    function mountains(x, y) {
        const peak = (px, h, w) => {
            const top = -h;
            return `<path d="M${px - w} 0 L${px} ${top} L${px + w} 0 Z" fill="#CDAE78" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
                <path d="M${px} ${top} L${px + w} 0 L${r1(px + w * 0.15)} 0 Z" fill="#A9864F" opacity=".55"/>
                <path d="M${px} ${top} L${r1(px - w * 0.3)} ${r1(top + h * 0.3)} L${r1(px - w * 0.1)} ${r1(top + h * 0.24)} L${r1(px + w * 0.05)} ${r1(top + h * 0.33)} L${r1(px + w * 0.3)} ${r1(top + h * 0.3)} Z" fill="#F4EBD6" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>`;
        };
        return at(x, y, peak(34, 40, 26) + peak(-30, 36, 24) + peak(2, 60, 34));
    }

    function palms(x, y) {
        return at(x, y, `
            <ellipse cx="0" cy="0" rx="26" ry="5.5" fill="#DCC38C" stroke="${INK}" stroke-width="1"/>
            <path d="M-3 -1 q 1 -14 7 -27" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M12 -2 q 0 -10 -3 -18" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
            <g fill="none" stroke="#4E6B3A" stroke-width="2.6" stroke-linecap="round">
                <path d="M4 -28 q -9 -5 -17 3"/><path d="M4 -28 q 10 -6 17 2"/>
                <path d="M4 -28 q -4 -9 -12 -11"/><path d="M4 -28 q 6 -9 14 -8"/>
                <path d="M9 -20 q 6 -5 12 0"/><path d="M9 -20 q -5 -4 -10 1"/>
            </g>
            <path d="M-36 6 q 4 -3 8 0 t 8 0 M24 6 q 4 -3 8 0 t 8 0" fill="none" stroke="#5E7F8C" stroke-width="1.1"/>`);
    }

    function seaMonster(x, y) {
        return at(x, y, `
            <g fill="#6F8B6A" stroke="${INK}" stroke-width="1.1">
                <path d="M-26 0 a 7 7 0 0 1 14 0 Z"/>
                <path d="M-8 0 a 8 8 0 0 1 16 0 Z"/>
                <path d="M12 0 q 2 -20 12 -20 q 7 0 7 6 q -4 3 -9 1 q -2 5 -1 13 Z"/>
            </g>
            <circle cx="26" cy="-15" r="1.4" fill="${INK}"/>
            <path d="M-26 0 q -6 -1 -8 -7 q 3 1 5 -1" fill="#6F8B6A" stroke="${INK}" stroke-width="1"/>
            <path d="M-40 3 q 5 -4 10 0 t 10 0 t 10 0 t 10 0 t 10 0 t 10 0 t 10 0 t 10 0" fill="none" stroke="#5E7F8C" stroke-width="1.2"/>
            <path d="M-30 9 q 5 -3 10 0 t 10 0 M8 9 q 5 -3 10 0 t 10 0" fill="none" stroke="#5E7F8C" stroke-width=".9"/>`);
    }

    function hills(x, y) {
        const pine = (px, py, s) => `<path d="M${px} ${py - 14 * s} L${px + 6 * s} ${py} L${px - 6 * s} ${py} Z" fill="#56703F" stroke="${INK}" stroke-width=".8"/><path d="M${px} ${py} v${3 * s}" stroke="${INK}" stroke-width="1"/>`;
        return at(x, y, `
            <path d="M-32 0 Q -16 -24 0 0 Q 14 -17 30 0 Z" fill="#CBB47E" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
            <path d="M-20 -8 q 4 -3 8 -2 M8 -6 q 4 -3 8 -1" fill="none" stroke="${INK}" stroke-width=".7"/>
            ${pine(-24, -3, 1)}${pine(-12, -1, 0.8)}${pine(20, -2, 0.9)}`);
    }

    function skull(x, y) {
        return at(x, y, `
            <g stroke="${INK}" stroke-width="2.4" stroke-linecap="round">
                <path d="M-11 -2 L11 -20"/><path d="M-11 -20 L11 -2"/>
            </g>
            <g fill="#EFE4CC" stroke="${INK}" stroke-width="1">
                <circle cx="-12" cy="-1" r="2"/><circle cx="12" cy="-1" r="2"/>
                <circle cx="-12" cy="-21" r="2"/><circle cx="12" cy="-21" r="2"/>
                <path d="M-8 -14 a 8 8 0 1 1 16 0 v 3 h -3 v 3 h -10 v -3 h -3 Z"/>
            </g>
            <circle cx="-3" cy="-15" r="2" fill="${INK}"/><circle cx="3" cy="-15" r="2" fill="${INK}"/>
            <path d="M-3 -9 v2 M0 -9 v2 M3 -9 v2" stroke="${INK}" stroke-width=".8"/>`);
    }

    function camp(x, y) {
        return at(x, y, `
            <path d="M-26 0 L-10 -26 L6 0 Z" fill="#B5482D" fill-opacity=".85" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
            <path d="M-10 -26 L-14 0 L-6 0 Z" fill="#5B2A1B" opacity=".7"/>
            <path d="M-10 -26 v -6 l 6 2 l -6 2" fill="#E2B54A" stroke="${INK}" stroke-width=".7"/>
            <path d="M14 1 l 14 -5 M14 -4 l 14 5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
            <path d="M21 -3 q -7 -7 0 -16 q 1 6 5 8 q 2 5 -5 8 Z" fill="#E08A2E" stroke="${INK}" stroke-width=".8"/>
            <path d="M21 -5 q -3 -4 0 -8 q 2 4 0 8 Z" fill="#F6D06B"/>`);
    }

    function waves(x, y) {
        const row = (dx, dy, n) => {
            let d = `M${dx} ${dy}`;
            for (let i = 0; i < n; i++) d += ' q 4 -4 8 0';
            return `<path d="${d}" fill="none" stroke="#5E7F8C" stroke-width="1.3" stroke-linecap="round"/>`;
        };
        return at(x, y, row(-28, -16, 4) + row(-10, -6, 5) + row(-34, 3, 4));
    }

    function chest(x, y) {
        return at(x, y, `
            <ellipse cx="0" cy="1" rx="26" ry="4" fill="#000" opacity=".12"/>
            <circle cx="-21" cy="-2" r="3.2" fill="#E2B54A" stroke="${INK}" stroke-width=".7"/>
            <circle cx="21" cy="-1" r="3" fill="#E2B54A" stroke="${INK}" stroke-width=".7"/>
            <rect x="-15" y="-15" width="30" height="16" rx="1.5" fill="#9A6B2F" stroke="${INK}" stroke-width="1.1"/>
            <path d="M-15 -15 Q 0 -30 15 -15 Z" fill="#B27C38" stroke="${INK}" stroke-width="1.1"/>
            <path d="M-8 -21 L-8 1 M8 -21 L8 1" stroke="#E2B54A" stroke-width="2.2"/>
            <rect x="-3" y="-17" width="6" height="7" rx="1" fill="#F2CF6B" stroke="${INK}" stroke-width=".8"/>
            <path d="M0 -40 l 2 5 l 5 2 l -5 2 l -2 5 l -2 -5 l -5 -2 l 5 -2 Z" fill="#F2CF6B"/>
            <path d="M18 -30 l 1.2 3 l 3 1.2 l -3 1.2 l -1.2 3 l -1.2 -3 l -3 -1.2 l 3 -1.2 Z" fill="#F2CF6B"/>`);
    }

    const GAP_DECORATIONS = [palms, seaMonster, hills, skull, camp, waves];

    function buildSvg(width, pts, current) {
        const n = pts.length;
        let trail = '';
        for (let i = 0; i < n - 1; i++) {
            const done = i < current;
            trail += `<path d="${segment(pts[i], pts[i + 1], i)}" class="${done ? 'qm-trail-done' : 'qm-trail-todo'}"/>`;
        }

        let decor = compassRose(46, 186);
        for (let i = 0; i < n - 1; i++) {
            const mid = (pts[i].x + pts[i + 1].x) / 2;
            const isLastGap = i === n - 2;
            decor += isLastGap ? chest(mid, 202) : GAP_DECORATIONS[i % GAP_DECORATIONS.length](mid, 202);
        }
        if (n > 0) decor = mountains(pts[n - 1].x + 18, 212) + decor;

        const parchment = parchmentPath(width, H);
        return `
        <svg width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" aria-hidden="true" focusable="false">
            <defs>
                <radialGradient id="qm-paper-fill" cx="50%" cy="45%" r="75%">
                    <stop offset="0" stop-color="#F1E2BD"/>
                    <stop offset=".65" stop-color="#E3CB96"/>
                    <stop offset="1" stop-color="#C39E62"/>
                </radialGradient>
                <radialGradient id="qm-stain">
                    <stop offset="0" stop-color="#8A6431" stop-opacity=".16"/>
                    <stop offset="1" stop-color="#8A6431" stop-opacity="0"/>
                </radialGradient>
                <filter id="qm-grain" x="0" y="0" width="100%" height="100%">
                    <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 .36  0 0 0 0 .25  0 0 0 0 .12  0 0 0 .22 0"/>
                    <feComposite in2="SourceGraphic" operator="in"/>
                </filter>
                <filter id="qm-shadow" x="-5%" y="-10%" width="110%" height="130%">
                    <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".5"/>
                </filter>
                <clipPath id="qm-clip"><path d="${parchment}"/></clipPath>
            </defs>
            <path d="${parchment}" fill="url(#qm-paper-fill)" stroke="#8C6A3A" stroke-width="1.5" filter="url(#qm-shadow)"/>
            <g clip-path="url(#qm-clip)">
                ${stains(width, H)}
                <path d="${parchment}" fill="#fff" filter="url(#qm-grain)"/>
            </g>
            <rect x="16" y="16" width="${width - 32}" height="${H - 32}" rx="4" fill="none" stroke="#8B6A3E" stroke-width="1.6" opacity=".75"/>
            <rect x="21" y="21" width="${width - 42}" height="${H - 42}" rx="3" fill="none" stroke="#8B6A3E" stroke-width=".7" opacity=".6"/>
            ${decor}
            ${trail}
        </svg>`;
    }

    function buildNode(fase, i, n, current, pt, phasePct) {
        const state = i < current ? 'done' : i === current ? 'current' : 'locked';
        const isFinal = i === n - 1;
        const title = fase.titulo_fase || `Phase ${i + 1}`;
        const stateText = { done: 'completed', current: 'in progress', locked: 'locked' }[state];

        const node = document.createElement('div');
        node.className = `map-node is-${state}${isFinal ? ' is-final' : ''}`;
        node.style.left = `${pt.x}px`;
        node.style.top = `${pt.y}px`;
        node.setAttribute('role', 'listitem');
        node.setAttribute('aria-label', `Phase ${i + 1}: ${title} — ${stateText}`);

        const label = document.createElement('span');
        label.className = 'map-node-label';
        label.textContent = title;

        const circle = document.createElement('span');
        circle.className = 'map-node-circle';
        const icon = state === 'done' ? 'check' : state === 'current' ? 'compass' : (isFinal ? 'flag' : 'lock');
        circle.innerHTML = ICONS[icon];

        node.append(label, circle);

        if (state === 'current') {
            const pct = document.createElement('span');
            pct.className = 'map-node-pct';
            pct.textContent = `${phasePct}%`;
            node.appendChild(pct);
        }
        return node;
    }

    return {
        // canvas: elemento onde o mapa é desenhado; wrap: área com rolagem horizontal
        render(canvas, wrap, fases, current, phasePct) {
            const avail = Math.min(wrap.clientWidth || 900, 1060) - 8;
            const { width, pts } = layout(fases.length, avail);

            canvas.style.width = `${width}px`;
            canvas.innerHTML = buildSvg(width, pts, current);
            canvas.setAttribute('role', 'list');
            canvas.setAttribute('aria-label', 'Quest map');

            fases.forEach((fase, i) => {
                canvas.appendChild(buildNode(fase, i, fases.length, current, pts[i], phasePct));
            });

            // Mantém a fase atual visível quando o mapa é maior que a tela
            const alvo = pts[Math.min(current, pts.length - 1)];
            if (alvo && width > wrap.clientWidth) {
                wrap.scrollLeft = Math.max(0, alvo.x - wrap.clientWidth / 2);
            }
        },

        setPhaseProgress(canvas, pct) {
            const el = canvas.querySelector('.map-node-pct');
            if (el) el.textContent = `${pct}%`;
        }
    };
})();

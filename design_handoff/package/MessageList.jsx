
function OrigamiLoader() {
  // zigzag strip of interlocking paper facets that fold over in sequence
  const facets = ['#0db5cc', '#22c7dd', '#0d8ba0', '#66d7e6', '#f47920'];
  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', perspective: 200 } },
      facets.map((c, i) => React.createElement('div', {
        key: i,
        style: {
          width: 11, height: 9, flexShrink: 0, opacity: .45,
          marginLeft: i === 0 ? 0 : -4,
          clipPath: i % 2 === 0 ? 'polygon(50% 0, 100% 100%, 0 100%)' : 'polygon(0 0, 100% 0, 50% 100%)',
          background: c,
          transformOrigin: i % 2 === 0 ? '50% 100%' : '50% 0%',
          animation: 'ocFold 1.6s ease-in-out ' + (i * 0.16) + 's infinite',
        },
      }))
    ),
    React.createElement('span', { style: { fontSize: 12.5, color: '#b0ada8', fontStyle: 'italic' } }, 'Folding\u2026')
  );
}

function renderBold(text) {
  const parts = String(text).split(/\*\*(.*?)\*\*/);
  return parts.map((p, i) => i % 2 ? React.createElement('strong', { key: i }, p) : p);
}

function CarouselCard({ label }) {
  const [hover, setHover] = React.useState(false);
  return React.createElement('div', {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: hover ? 'linear-gradient(135deg, #fff 0%, #fff 50%, #eefafc 50%)' : '#fff', border: '1px solid ' + (hover ? '#9fdde8' : '#e0ddd6'), borderRadius: 9, fontSize: 13, fontWeight: 500, color: '#1a1918', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, boxShadow: hover ? '0 2px 0 #cdeef3, 0 3px 6px rgba(13,181,204,.12)' : '0 1px 0 #e8e5de', transform: hover ? 'translateY(-1px)' : 'none', transition: 'all .13s ease' },
  },
    React.createElement('svg', { width: 10, height: 9, viewBox: '0 0 10 9' }, React.createElement('polygon', { points: '5,0 10,9 0,9', fill: '#0db5cc', opacity: .6 })),
    label
  );
}

function Citation({ tc, sc, sc2, c }) {
  const [hover, setHover] = React.useState(false);
  return React.createElement('div', {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: { position: 'relative', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', background: '#fff', border: '1px solid #e8e5de', borderLeft: '2.5px solid ' + tc.color, borderRadius: '0 7px 7px 0', flexWrap: 'wrap', marginBottom: 5, overflow: 'hidden', cursor: 'pointer' },
  },
    // folded paper corner — appears on hover
    React.createElement('div', { style: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, background: 'linear-gradient(225deg, #f5f2ec 0%, #f5f2ec 50%, #dedad2 50%, #ece9e3 100%)', borderBottomLeftRadius: 3, boxShadow: '-1px 1px 1.5px rgba(0,0,0,.07)', pointerEvents: 'none', transformOrigin: '100% 0', transform: hover ? 'scale(1)' : 'scale(0)', opacity: hover ? 1 : 0, transition: 'transform .18s cubic-bezier(.3,1.2,.4,1), opacity .14s ease' } }),
    React.createElement('span', { style: { fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: tc.bg, color: tc.color, fontFamily: "'DM Mono',monospace", flexShrink: 0 } }, c.id),
    React.createElement('span', { style: { fontSize: 12.5, color: '#3a3835', flex: 1, minWidth: 0 } }, c.title),
    React.createElement('span', { style: { fontSize: 11, padding: '2px 6px', borderRadius: 3, background: sc.bg, color: sc.color, flexShrink: 0 } }, c.scope),
    React.createElement('code', { style: { fontFamily: "'DM Mono',monospace", fontSize: 11, color: '#9a9690', flexShrink: 0 } }, c.source),
    sc2 ? React.createElement('span', { style: { fontSize: 11, padding: '2px 7px', borderRadius: 3, border: '1px solid ' + sc2, color: sc2, flexShrink: 0 } }, c.status) : null
  );
}

function MessageList({ messages = [], thinking = false }) {
  const scopeColors = {
    org:     { bg: '#e8e8e4', color: '#4a4845' },
    dept:    { bg: '#fef0d0', color: '#7a5010' },
    project: { bg: '#e0f0e8', color: '#1a5c38' },
    personal:{ bg: '#fce8e4', color: '#c1392b' },
  };
  const typeColors = {
    R: { bg: '#ddeeff', color: '#1d4d8a' },
    P: { bg: '#fef0d0', color: '#7a5010' },
    A: { bg: '#d8f0e4', color: '#1a5c38' },
    Ag: { bg: '#d9f4f8', color: '#0a94a7' },
  };
  const statusColors = {
    applied: '#9a6b2a', done: '#2a7d4f', pending: '#c1392b', resolved: '#8a8682',
  };

  return React.createElement('div', null,
    messages.map(msg => {
      if (msg.role === 'user') {
        return React.createElement('div', {
          key: msg.id,
          style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 28 },
        },
          React.createElement('div', {
            style: { background: '#1a1918', color: '#fff', borderRadius: '14px 14px 3px 14px', padding: '11px 16px', maxWidth: '72%', fontSize: 14.5, lineHeight: 1.6, fontFamily: 'inherit' },
          }, msg.text)
        );
      }

      const cits = (msg.citations || []).map(c => {
        const tc = typeColors[c.type] || typeColors.R;
        const sc = scopeColors[c.scope] || scopeColors.org;
        const sc2 = c.status ? statusColors[c.status] : null;
        return React.createElement(Citation, { key: c.id, tc, sc, sc2, c });
      });

      return React.createElement('div', { key: msg.id, style: { marginBottom: 32 } },
        React.createElement('div', { style: { fontSize: 15, lineHeight: 1.7, color: '#1a1918', whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginBottom: (cits.length || msg.carousel) ? 12 : 0 } }, renderBold(msg.text)),
        msg.carousel ? React.createElement('div', { style: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 14, marginBottom: cits.length ? 10 : 0 } }, msg.carousel.map((label, i) => React.createElement(CarouselCard, { key: i, label }))) : null,
        ...cits
      );
    }),
    thinking ? React.createElement(OrigamiLoader, { key: '__thinking' }) : null
  );
}

window.MessageList = MessageList;

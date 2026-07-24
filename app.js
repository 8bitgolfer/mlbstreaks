let DATA = { hits: [], hr: [], pitcherKs: [], updated: null };
let view = 'hits';
let sortKey = 'games';
let sortDir = -1;

const columns = {
  hits: ['player', 'games', 'atBats', 'runs', 'hits', 'hr', 'rbi', 'bb', 'k', 'ba', 'oba', 'slug', 'lastGameDate'],
  hr: ['player', 'games', 'hr', 'lastGameDate'],
  pitcherKs: ['player', 'team', 'opponent', 'line', 'last10Avg', 'last5Avg', 'h2hAvg', 'projection', 'edge']
};

async function loadData() {
  try {
    const res = await fetch('./data/streaks.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('streaks.json missing');

    const json = await res.json();

    DATA = {
      hits: Array.isArray(json.hits) ? json.hits : [],
      hr: Array.isArray(json.hr) ? json.hr : [],
      pitcherKs: Array.isArray(json.pitcherKs) ? json.pitcherKs : [],
      updated: json.updated || 'Unknown'
    };
  } catch (e) {
    try {
      const res = await fetch('./data/sample.json', { cache: 'no-store' });
      const json = await res.json();

      DATA = {
        hits: Array.isArray(json.hits) ? json.hits : [],
        hr: Array.isArray(json.hr) ? json.hr : [],
        pitcherKs: Array.isArray(json.pitcherKs) ? json.pitcherKs : [],
        updated: json.updated || 'Sample Data'
      };
    } catch (fallbackError) {
      DATA = { hits: [], hr: [], pitcherKs: [], updated: 'No data available' };
    }
  }

  document.getElementById('updated').textContent = DATA.updated || 'Unknown';
  createPitcherModal();
  render();
}

function pretty(key) {
  return ({
    player: 'Player',
    team: 'Team',
    opponent: 'Opponent',
    line: 'Line',
    games: 'Games',
    atBats: 'AB',
    runs: 'R',
    hits: 'H',
    hr: 'HR',
    rbi: 'RBI',
    bb: 'BB',
    k: 'K',
    ba: 'BA',
    oba: 'OBA',
    slug: 'SLG',
    lastGameDate: 'Last Game',
    last10Avg: 'L10 Avg',
    last5Avg: 'L5 Avg',
    h2hAvg: 'H2H Avg',
    projection: 'Proj',
    edge: 'Edge'
  })[key] || key;
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number') return Number.isInteger(value) ? value : value.toFixed(1);
  return value;
}

function render() {
  view = document.getElementById('view').value;

  const q = document.getElementById('search').value.toLowerCase().trim();
  const thead = document.getElementById('thead');
  const tbody = document.getElementById('tbody');
  const cols = columns[view];

  let rows = [...(DATA[view] || [])].filter(r =>
    String(r.player || '').toLowerCase().includes(q)
  );

  if (!columns[view].includes(sortKey)) {
    sortKey = view === 'pitcherKs' ? 'edge' : 'games';
    sortDir = -1;
  }

  rows.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];

    const aNum = Number(av);
    const bNum = Number(bv);

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      return (aNum - bNum) * sortDir;
    }

    return String(av || '').localeCompare(String(bv || '')) * sortDir;
  });

  thead.innerHTML = `
    <tr>
      ${cols.map(c => `<th data-key="${c}">${pretty(c)}</th>`).join('')}
    </tr>
  `;

  tbody.innerHTML = rows.map((r, index) => `
    <tr class="${view === 'pitcherKs' ? 'clickable-row' : ''}" data-index="${index}">
      ${cols.map(c => `
        <td>
          ${c === 'games'
            ? `<span class="badge">${formatValue(r[c])}</span>`
            : formatValue(r[c])}
        </td>
      `).join('')}
    </tr>
  `).join('');

  document.querySelectorAll('th').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.key;

      if (sortKey === key) {
        sortDir *= -1;
      } else {
        sortKey = key;
        sortDir = key === 'player' ? 1 : -1;
      }

      render();
    };
  });

  if (view === 'pitcherKs') {
    document.querySelectorAll('tbody tr').forEach((tr, index) => {
      tr.onclick = () => openPitcherModal(rows[index]);
    });
  }

  document.getElementById('empty').hidden = rows.length > 0;
  document.getElementById('rowsCount').textContent = rows.length;
  document.getElementById('leaderName').textContent = rows[0]?.player || '--';

  if (view === 'pitcherKs') {
    document.getElementById('leaderGames').textContent = rows[0]?.projection ?? '--';
  } else {
    document.getElementById('leaderGames').textContent = rows[0]?.games || '--';
  }
}

function createPitcherModal() {
  if (document.getElementById('pitcherModal')) return;

  const modal = document.createElement('div');
  modal.id = 'pitcherModal';
  modal.className = 'modal-backdrop';
  modal.hidden = true;

  modal.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" id="closePitcherModal">×</button>
      <div class="modal-header">
        <div>
          <p class="modal-label">Pitcher strikeout model</p>
          <h2 id="modalPitcherName">--</h2>
          <p id="modalMatchup">--</p>
        </div>
        <div class="line-box">
          <span>Line</span>
          <strong id="modalLine">--</strong>
        </div>
      </div>

      <div class="modal-grid">
        <div>
          <span>Projection</span>
          <strong id="modalProjection">--</strong>
        </div>
        <div>
          <span>Edge</span>
          <strong id="modalEdge">--</strong>
        </div>
        <div>
          <span>L10 Over %</span>
          <strong id="modalL10Over">--</strong>
        </div>
        <div>
          <span>H2H Over %</span>
          <strong id="modalH2HOver">--</strong>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="last10">Last 10</button>
        <button class="tab" data-tab="last5">Last 5</button>
        <button class="tab" data-tab="h2h">H2H</button>
      </div>

      <div id="modalBars" class="bars"></div>
      <p id="modalNote" class="modal-note"></p>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closePitcherModal').onclick = closePitcherModal;
  modal.onclick = (e) => {
    if (e.target.id === 'pitcherModal') closePitcherModal();
  };
}

function openPitcherModal(pitcher) {
  if (!pitcher) return;

  const modal = document.getElementById('pitcherModal');
  modal.hidden = false;

  const hasLine = pitcher.line !== null && pitcher.line !== undefined && pitcher.line !== '';
  const threshold = hasLine ? Number(pitcher.line) : Number(pitcher.projection || 0);

  document.getElementById('modalPitcherName').textContent = pitcher.player || '--';
  document.getElementById('modalMatchup').textContent = `${pitcher.team || '--'} vs ${pitcher.opponent || '--'}`;
  document.getElementById('modalLine').textContent = hasLine ? pitcher.line : 'No line';
  document.getElementById('modalProjection').textContent = formatValue(pitcher.projection);
  document.getElementById('modalEdge').textContent = formatValue(pitcher.edge);

  document.getElementById('modalL10Over').textContent = `${calcOverPct(pitcher.last10 || [], threshold)}%`;
  document.getElementById('modalH2HOver').textContent = `${calcOverPct(pitcher.h2h || [], threshold)}%`;

  const tabs = modal.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.classList.remove('active');

    if (tab.dataset.tab === 'last10') {
      tab.classList.add('active');
    }

    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPitcherBars(pitcher, tab.dataset.tab);
    };
  });

  renderPitcherBars(pitcher, 'last10');
}

function closePitcherModal() {
  document.getElementById('pitcherModal').hidden = true;
}

function calcOverPct(games, threshold) {
  if (!games.length || !threshold) return 0;

  const overs = games.filter(g => Number(g.k || 0) > threshold).length;
  return Math.round((overs / games.length) * 100);
}

function renderPitcherBars(pitcher, tab) {
  const bars = document.getElementById('modalBars');
  const note = document.getElementById('modalNote');

  let games = [];

  if (tab === 'last10') games = pitcher.last10 || [];
  if (tab === 'last5') games = pitcher.last5 || [];
  if (tab === 'h2h') games = pitcher.h2h || [];

  const hasLine = pitcher.line !== null && pitcher.line !== undefined && pitcher.line !== '';
  const threshold = hasLine ? Number(pitcher.line) : Number(pitcher.projection || 0);

  const maxK = Math.max(
    10,
    threshold + 2,
    ...games.map(g => Number(g.k || 0))
  );

  bars.innerHTML = games.map(g => {
    const k = Number(g.k || 0);

    // Example: 6.5 threshold = 7+ green, 6 and under red
    const hitOver = threshold ? k > threshold : false;

    const width = Math.max(8, (k / maxK) * 100);

    return `
      <div class="bar-row">
        <div class="bar-date">${g.date || ''}</div>
        <div class="bar-track">
          <div class="bar-fill ${hitOver ? 'over' : 'under'}" style="width:${width}%"></div>
        </div>
        <div class="bar-k">${k} K</div>
      </div>
    `;
  }).join('');

  if (games.length === 0) {
    bars.innerHTML = `<p class="modal-note">No games found for this split.</p>`;
  }

  note.textContent = hasLine
    ? `Green means the pitcher went over the listed strikeout line of ${pitcher.line}.`
    : `No PrizePicks line found. Green means the pitcher went over the model projection of ${formatValue(pitcher.projection)}.`;
}

document.getElementById('search').addEventListener('input', render);

document.getElementById('view').addEventListener('change', () => {
  if (document.getElementById('view').value === 'pitcherKs') {
    sortKey = 'edge';
  } else {
    sortKey = 'games';
  }

  sortDir = -1;
  render();
});

loadData();

let DATA = { hits: [], hr: [], pitcherKs: [], updated: null, dailyHitsDate: null };
let view = 'hits';
let sortKey = 'games';
let sortDir = -1;
let pitcherFilter = 'all';
let showNoLine = false;

const columns = {
  hits: ['player', 'gameTime', 'games', 'atBats', 'hits', 'hr', 'ba', 'lastGameDate'],
  hr: ['player', 'games', 'hr', 'lastGameDate'],
  pitcherKs: ['player', 'gameTime', 'line', 'last10Avg', 'last5Avg', 'h2hAvg', 'projection', 'edge', 'opponentKMatchupRank', 'pick']
};

async function loadData() {
  try {
    const res = await fetch('./data/streaks.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('streaks.json missing');
    const json = await res.json();
    DATA = normalizeData(json);
  } catch (e) {
    try {
      const res = await fetch('./data/sample.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('sample.json missing');
      DATA = normalizeData(await res.json());
    } catch (fallbackError) {
      DATA = { hits: [], hr: [], pitcherKs: [], updated: 'No data available', dailyHitsDate: null };
    }
  }

  document.getElementById('updated').textContent = formatUpdated(DATA.updated);
  const slate = document.getElementById('slateDate');
  if (slate) slate.textContent = formatSlateDate(DATA.dailyHitsDate);
  createPitcherModal();
  render();
}

function normalizeData(json) {
  return {
    hits: Array.isArray(json.dailyHits) ? json.dailyHits : (Array.isArray(json.hits) ? json.hits : []),
    hr: Array.isArray(json.hr) ? json.hr : [],
    pitcherKs: Array.isArray(json.pitcherKs) ? json.pitcherKs : [],
    updated: json.updated || 'Unknown',
    dailyHitsDate: json.dailyHitsDate || json.throughDate || null
  };
}

function formatSlateDate(value) {
  if (!value) return 'Today';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatUpdated(value) {
  if (!value || value === 'Unknown' || value === 'Sample Data' || value === 'No data available') return value || 'Unknown';
  const parsed = new Date(String(value).replace(' UTC', 'Z'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York', timeZoneName: 'short'
  });
}

function formatUpdatedTime(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(String(value).replace(' UTC', 'Z'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short'
  });
}

function formatGameTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
  });
}

function pretty(key) {
  return ({
    player: 'Player', gameTime: 'Time', line: 'Line', games: 'Games', atBats: 'AB',
    hits: 'H', hr: 'HR', ba: 'BA', lastGameDate: 'Last Game', last10Avg: 'L10',
    last5Avg: 'L5', h2hAvg: 'H2H', opponentKMatchupRank: 'Opp K Rank', projection: 'Proj', edge: 'Edge', pick: 'Side'
  })[key] || key;
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number') return Number.isInteger(value) ? value : value.toFixed(1);
  return value;
}

function hasLine(row) {
  return row.line !== null && row.line !== undefined && row.line !== '' && Number.isFinite(Number(row.line));
}

function absoluteEdge(row) {
  return row.edge === null || row.edge === undefined || row.edge === '' ? -1 : Math.abs(Number(row.edge));
}

// Converts the opponent's team-strikeout matchup rank into a -1..+1 signal.
// 30/30 = strongest push toward OVER, 1/30 = strongest push toward UNDER.
function opponentKSignal(row) {
  const rank = Number(row.opponentKMatchupRank);
  const totalTeams = Number(row.opponentKTeamCount) || 30;
  if (!Number.isFinite(rank) || totalTeams <= 1) return 0;
  const normalized = (rank - 1) / (totalTeams - 1);
  return (normalized * 2) - 1;
}

function matchupAdjustment(row) {
  if (row.matchupAdjustment !== null && row.matchupAdjustment !== undefined && Number.isFinite(Number(row.matchupAdjustment))) {
    return Number(row.matchupAdjustment);
  }
  // At the extremes, matchup can move the recommendation by up to 0.8 strikeouts.
  return opponentKSignal(row) * 0.8;
}

function recommendationEdge(row) {
  if (!hasLine(row)) return null;
  if (row.recommendationEdge !== null && row.recommendationEdge !== undefined && Number.isFinite(Number(row.recommendationEdge))) {
    return Number(row.recommendationEdge);
  }
  const rawEdge = Number(row.edge);
  if (!Number.isFinite(rawEdge)) return null;
  return rawEdge + matchupAdjustment(row);
}

function recommendedPitcherPick(row) {
  if (!hasLine(row)) return 'NO LINE';
  const adjusted = recommendationEdge(row);
  if (!Number.isFinite(adjusted)) return String(row.pick || 'NO LINE').toUpperCase();
  return adjusted >= 0 ? 'OVER' : 'UNDER';
}

function getPitcherFilterBar() {
  const bar = document.getElementById('pitcherTools');
  if (!bar) return;
  bar.hidden = view !== 'pitcherKs';
  if (view !== 'pitcherKs') return;

  bar.querySelectorAll('[data-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === pitcherFilter);
  });
  const toggle = document.getElementById('showNoLine');
  if (toggle) toggle.checked = showNoLine;
  const source = document.getElementById('lineSourceMeta');
  if (source) source.textContent = `FanDuel • Updated ${formatUpdatedTime(DATA.updated)}`;
}

function applyPitcherFilters(rows) {
  let filtered = [...rows];
  if (!showNoLine) filtered = filtered.filter(hasLine);

  if (pitcherFilter === 'overs') filtered = filtered.filter(r => recommendedPitcherPick(r) === 'OVER');
  if (pitcherFilter === 'unders') filtered = filtered.filter(r => recommendedPitcherPick(r) === 'UNDER');
  if (pitcherFilter === 'edge05') filtered = filtered.filter(r => hasLine(r) && absoluteEdge(r) >= 0.5);
  if (pitcherFilter === 'edge10') filtered = filtered.filter(r => hasLine(r) && absoluteEdge(r) >= 1.0);
  return filtered;
}

function emptyMessage() {
  if (view === 'pitcherKs') {
    if (!showNoLine && DATA.pitcherKs.length && !DATA.pitcherKs.some(hasLine)) {
      return 'No live FanDuel pitcher strikeout lines are available yet. Turn on “Show no-line pitchers” to view projections.';
    }
    if (pitcherFilter !== 'all') return 'No pitcher props match this filter.';
    return 'No pitcher strikeout props are available for today.';
  }
  if (view === 'hr') return 'No active home run streaks are available.';
  return 'No qualifying hit streaks are available for today.';
}

function render() {
  view = document.getElementById('view').value;
  getPitcherFilterBar();

  const q = document.getElementById('search').value.toLowerCase().trim();
  const thead = document.getElementById('thead');
  const tbody = document.getElementById('tbody');
  const cols = columns[view];

  let rows = [...(DATA[view] || [])].filter(r => String(r.player || '').toLowerCase().includes(q));
  if (view === 'pitcherKs') rows = applyPitcherFilters(rows);

  if (!cols.includes(sortKey) && sortKey !== 'absoluteEdge') {
    sortKey = view === 'pitcherKs' ? 'absoluteEdge' : 'games';
    sortDir = -1;
  }

  rows.sort((a, b) => {
    const av = sortKey === 'absoluteEdge' ? absoluteEdge(a) : a[sortKey];
    const bv = sortKey === 'absoluteEdge' ? absoluteEdge(b) : b[sortKey];
    const aNum = Number(av);
    const bNum = Number(bv);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return (aNum - bNum) * sortDir;
    return String(av || '').localeCompare(String(bv || '')) * sortDir;
  });

  thead.innerHTML = `<tr>${cols.map(c => `<th data-key="${c}" class="${c === 'player' ? 'player-col' : ''}">${pretty(c)}</th>`).join('')}</tr>`;

  tbody.innerHTML = rows.map((r, index) => `
    <tr class="${view === 'pitcherKs' ? 'clickable-row' : ''}" data-index="${index}">
      ${cols.map(c => `<td class="${c === 'player' ? 'player-col' : ''}">${renderCell(r, c)}</td>`).join('')}
    </tr>
  `).join('');

  thead.querySelectorAll('th').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.key;
      const effectiveKey = view === 'pitcherKs' && key === 'edge' ? 'absoluteEdge' : key;
      if (sortKey === effectiveKey) sortDir *= -1;
      else {
        sortKey = effectiveKey;
        sortDir = effectiveKey === 'player' ? 1 : -1;
      }
      render();
    };
  });

  if (view === 'pitcherKs') {
    tbody.querySelectorAll('tr').forEach((tr, index) => {
      tr.onclick = () => openPitcherModal(rows[index]);
    });
  }

  const empty = document.getElementById('empty');
  empty.hidden = rows.length > 0;
  empty.textContent = emptyMessage();
}

function renderCell(row, key) {
  if (key === 'games') return `<span class="badge">${formatValue(row[key])}</span>`;
  if (key === 'gameTime') return formatGameTime(row[key]);
  if (key === 'opponentKMatchupRank') {
    const rank = Number(row.opponentKMatchupRank);
    const totalTeams = Number(row.opponentKTeamCount) || 30;
    if (!Number.isFinite(rank)) return '--';
    const normalized = Math.max(0, Math.min(1, (rank - 1) / Math.max(1, totalTeams - 1)));
    const hue = Math.round(normalized * 120);
    const opponent = row.opponent || 'Opponent';
    const strikeouts = Number.isFinite(Number(row.opponentStrikeouts)) ? Number(row.opponentStrikeouts).toLocaleString() : '--';
    const title = `${opponent}: ${strikeouts} team strikeouts. ${rank}/${totalTeams} matchup score — higher is more favorable for a pitcher K over.`;
    return `<span class="opp-k-pill" style="--opp-k-hue:${hue}" title="${title.replace(/"/g, '&quot;')}">${rank}</span>`;
  }
  if (key === 'edge') {
    if (row[key] === null || row[key] === undefined || row[key] === '') return '--';
    return `${Number(row[key]) > 0 ? '+' : ''}${formatValue(row[key])}`;
  }
  if (key === 'pick') {
    const value = recommendedPitcherPick(row);
    const css = String(value).toLowerCase().replace(/\s+/g, '-');
    const rawEdge = Number(row.edge);
    const adj = matchupAdjustment(row);
    const finalEdge = recommendationEdge(row);
    const rank = Number(row.opponentKMatchupRank);
    const totalTeams = Number(row.opponentKTeamCount) || 30;
    let title = 'No live strikeout line available.';
    if (hasLine(row) && Number.isFinite(finalEdge)) {
      const edgeText = Number.isFinite(rawEdge) ? `${rawEdge > 0 ? '+' : ''}${rawEdge.toFixed(1)}` : '--';
      const adjText = `${adj >= 0 ? '+' : ''}${adj.toFixed(2)}`;
      const finalText = `${finalEdge >= 0 ? '+' : ''}${finalEdge.toFixed(2)}`;
      const matchupText = Number.isFinite(rank) ? `${rank}/${totalTeams}` : 'unavailable';
      title = `Recommendation combines model edge (${edgeText}) + opponent K matchup adjustment (${adjText}, rank ${matchupText}) = ${finalText}.`;
    }
    return `<span class="pick-pill ${css}" title="${title.replace(/"/g, '&quot;')}">${formatValue(value)}</span>`;
  }
  return formatValue(row[key]);
}

function createPitcherModal() {
  if (document.getElementById('pitcherModal')) return;
  const modal = document.createElement('div');
  modal.id = 'pitcherModal';
  modal.className = 'modal-backdrop';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" id="closePitcherModal" aria-label="Close">×</button>
      <div class="modal-header">
        <div>
          <p class="modal-label">Pitcher strikeout model</p>
          <h2 id="modalPitcherName">--</h2>
          <p id="modalMatchup">--</p>
          <p id="modalLineSource" class="modal-source">--</p>
        </div>
        <div class="line-box"><span>Line</span><strong id="modalLine">--</strong></div>
      </div>
      <div class="modal-grid">
        <div><span>Opponent K Rank</span><strong id="modalOpponentKRank">--</strong></div>
        <div><span>Opponent Team Ks</span><strong id="modalOpponentKs">--</strong></div>
        <div><span>Projection</span><strong id="modalProjection">--</strong></div>
        <div><span>Edge</span><strong id="modalEdge">--</strong></div>
        <div><span>L10 Avg</span><strong id="modalL10Avg">--</strong></div>
        <div><span>L5 Avg</span><strong id="modalL5Avg">--</strong></div>
        <div><span>H2H Avg</span><strong id="modalH2HAvg">--</strong></div>
        <div><span>L10 Median</span><strong id="modalMedian">--</strong></div>
        <div><span>L10 Over %</span><strong id="modalL10Over">--</strong></div>
        <div><span>L5 Over %</span><strong id="modalL5Over">--</strong></div>
        <div><span>H2H Over %</span><strong id="modalH2HOver">--</strong></div>
        <div><span>Trend</span><strong id="modalTrend">--</strong></div>
        <div><span>Consistency</span><strong id="modalConsistency">--</strong></div>
      </div>
      <div class="tabs">
        <button class="tab active" data-tab="last10">Last 10</button>
        <button class="tab" data-tab="last5">Last 5</button>
        <button class="tab" data-tab="h2h">H2H</button>
      </div>
      <div id="modalBars" class="bars"></div>
      <p id="modalNote" class="modal-note"></p>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('closePitcherModal').onclick = closePitcherModal;
  modal.onclick = e => { if (e.target.id === 'pitcherModal') closePitcherModal(); };
}

function openPitcherModal(pitcher) {
  if (!pitcher) return;
  const modal = document.getElementById('pitcherModal');
  modal.hidden = false;
  const liveLine = hasLine(pitcher);
  const threshold = liveLine ? Number(pitcher.line) : Number(pitcher.projection || 0);

  document.getElementById('modalPitcherName').textContent = pitcher.player || '--';
  document.getElementById('modalMatchup').textContent = `${pitcher.team || '--'} vs ${pitcher.opponent || '--'} • ${formatGameTime(pitcher.gameTime)}`;
  const oppRank = Number(pitcher.opponentKMatchupRank);
  const oppCount = Number(pitcher.opponentKTeamCount) || 30;
  const oppKs = Number(pitcher.opponentStrikeouts);
  document.getElementById('modalOpponentKRank').textContent = Number.isFinite(oppRank) ? `${oppRank}/${oppCount}` : '--';
  document.getElementById('modalOpponentKs').textContent = Number.isFinite(oppKs) ? oppKs.toLocaleString() : '--';
  document.getElementById('modalLineSource').textContent = `${pitcher.lineSource || 'No live line'} • Updated ${formatUpdatedTime(DATA.updated)}`;
  document.getElementById('modalLine').textContent = liveLine ? pitcher.line : 'No line';
  document.getElementById('modalProjection').textContent = formatValue(pitcher.projection);
  document.getElementById('modalEdge').textContent = pitcher.edge == null ? '--' : `${pitcher.edge > 0 ? '+' : ''}${formatValue(pitcher.edge)} (${pitcher.pick || '--'})`;
  document.getElementById('modalL10Avg').textContent = formatValue(pitcher.last10Avg);
  document.getElementById('modalL5Avg').textContent = formatValue(pitcher.last5Avg);
  document.getElementById('modalH2HAvg').textContent = formatValue(pitcher.h2hAvg);
  document.getElementById('modalMedian').textContent = formatValue(pitcher.last10Median);
  document.getElementById('modalTrend').textContent = pitcher.trend || '--';
  document.getElementById('modalConsistency').textContent = pitcher.consistency || '--';
  document.getElementById('modalL10Over').textContent = `${calcOverPct(pitcher.last10 || [], threshold)}%`;
  document.getElementById('modalL5Over').textContent = `${calcOverPct(pitcher.last5 || [], threshold)}%`;
  document.getElementById('modalH2HOver').textContent = `${calcOverPct(pitcher.h2h || [], threshold)}%`;

  const tabs = modal.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === 'last10');
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
  if (!games.length || !Number.isFinite(Number(threshold))) return 0;
  const overs = games.filter(g => Number(g.k || 0) > Number(threshold)).length;
  return Math.round((overs / games.length) * 100);
}

function renderPitcherBars(pitcher, tab) {
  const bars = document.getElementById('modalBars');
  const note = document.getElementById('modalNote');
  const games = tab === 'last5' ? (pitcher.last5 || []) : tab === 'h2h' ? (pitcher.h2h || []) : (pitcher.last10 || []);
  const liveLine = hasLine(pitcher);
  const threshold = liveLine ? Number(pitcher.line) : Number(pitcher.projection || 0);
  const maxK = Math.max(10, threshold + 2, ...games.map(g => Number(g.k || 0)));

  bars.innerHTML = games.length ? games.map(g => {
    const k = Number(g.k || 0);
    const width = Math.max(8, (k / maxK) * 100);
    return `<div class="bar-row">
      <div class="bar-date">${g.date || ''}</div>
      <div class="bar-track"><div class="bar-fill ${k > threshold ? 'over' : 'under'}" style="width:${width}%"></div></div>
      <div class="bar-k">${k} K</div>
    </div>`;
  }).join('') : '<p class="modal-note">No games found for this split.</p>';

  note.textContent = liveLine
    ? `Green means the pitcher went over the listed strikeout line of ${pitcher.line}.`
    : `No live FanDuel line was available. Green means the pitcher went over the model projection of ${formatValue(pitcher.projection)}.`;
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('view').addEventListener('change', () => {
  view = document.getElementById('view').value;
  sortKey = view === 'pitcherKs' ? 'absoluteEdge' : 'games';
  sortDir = -1;
  render();
});

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    pitcherFilter = button.dataset.filter;
    render();
  });
});

document.getElementById('showNoLine').addEventListener('change', event => {
  showNoLine = event.target.checked;
  render();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('pitcherModal') && !document.getElementById('pitcherModal').hidden) closePitcherModal();
});

loadData();

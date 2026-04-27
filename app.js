let DATA = { hits: [], hr: [], updated: null };
let view = 'hits';
let sortKey = 'games';
let sortDir = -1;

const columns = {
  hits: ['player','games','atBats','runs','hits','hr','rbi','bb','k','ba','oba','slug','lastGameDate'],
  hr: ['player','games','hr','lastGameDate']
};

async function loadData(){
  try {
    const res = await fetch('data/streaks.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('data missing');
    DATA = await res.json();
  } catch(e) {
    const res = await fetch('data/sample.json');
    DATA = await res.json();
  }
  document.getElementById('updated').textContent = DATA.updated || 'Unknown';
  render();
}

function pretty(key){
  return ({player:'Player', games:'Games', atBats:'AB', runs:'R', hits:'H', hr:'HR', rbi:'RBI', bb:'BB', k:'K', ba:'BA', oba:'OBA', slug:'SLG', lastGameDate:'Last Game'})[key] || key;
}

function render(){
  view = document.getElementById('view').value;
  const q = document.getElementById('search').value.toLowerCase().trim();
  const thead = document.getElementById('thead');
  const tbody = document.getElementById('tbody');
  const cols = columns[view];
  let rows = [...(DATA[view] || [])].filter(r => r.player.toLowerCase().includes(q));

  rows.sort((a,b) => {
    const av = a[sortKey], bv = b[sortKey];
    if(!isNaN(Number(av)) && !isNaN(Number(bv))) return (Number(av)-Number(bv))*sortDir;
    return String(av).localeCompare(String(bv))*sortDir;
  });

  thead.innerHTML = `<tr>${cols.map(c=>`<th data-key="${c}">${pretty(c)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(r => `<tr>${cols.map(c => `<td>${c==='games' ? `<span class="badge">${r[c]}</span>` : (r[c] ?? '')}</td>`).join('')}</tr>`).join('');

  document.querySelectorAll('th').forEach(th => th.onclick = () => {
    const key = th.dataset.key;
    if(sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'player' ? 1 : -1; }
    render();
  });

  document.getElementById('empty').hidden = rows.length > 0;
  document.getElementById('rowsCount').textContent = rows.length;
  document.getElementById('leaderName').textContent = rows[0]?.player || '--';
  document.getElementById('leaderGames').textContent = rows[0]?.games || '--';
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('view').addEventListener('change', () => { sortKey = 'games'; sortDir = -1; render(); });
loadData();

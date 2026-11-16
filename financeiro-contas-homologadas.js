/* FR Motors · Contas a pagar do Excel homologado.
   Consulta somente o lote conferido mais recente. Não grava baixas,
   não alimenta o caixa e não altera as parcelas manuais de teste. */
(function () {
  'use strict';

  const el = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const dateBR = value => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não informado';
  const isoToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const plusDays = (ymd, count) => {
    const d = new Date(ymd + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + count);
    return d.toISOString().slice(0, 10);
  };

  let rows = [];
  let currentLot = null;
  let ongoing = null;
  const getStatus = (row, today) => {
    if (!row.data_evento) return 'sem_data';
    return row.data_evento < today ? 'vencido' : 'a_vencer';
  };
  const statusHTML = (row, today) => {
    const status = getStatus(row, today);
    if (status === 'vencido') return '<span class="state overdue">Vencido</span>';
    if (status === 'sem_data') return '<span class="state">Sem vencimento</span>';
    if (row.data_evento === today) return '<span class="state open">Vence hoje</span>';
    return '<span class="state open">A vencer</span>';
  };
  const write = (id, value) => { const node = el(id); if (node) node.textContent = value; };

  function draw() {
    const today = isoToday();
    const nextWeek = plusDays(today, 7);
    const search = (el('fin-homolog-search')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const filter = el('fin-homolog-filter')?.value || 'todos';

    const overdue = rows.filter(item => getStatus(item, today) === 'vencido');
    const next7 = rows.filter(item => item.data_evento && item.data_evento >= today && item.data_evento <= nextWeek);
    const undated = rows.filter(item => !item.data_evento);

    write('fin-homolog-count', String(rows.length));
    write('fin-homolog-total', money(rows.reduce((sum, item) => sum + Number(item.valor), 0)));
    write('fin-homolog-overdue', money(overdue.reduce((sum, item) => sum + Number(item.valor), 0)));
    write('fin-homolog-soon', String(next7.length));
    write('fin-homolog-undated', undated.length ? undated.length + ' sem vencimento informado' : 'Todos os vencimentos informados');
    write('fin-homolog-source', currentLot
      ? 'Arquivo: ' + currentLot.arquivo_nome + ' · ' + currentLot.esperado_linhas + ' registros na homologação'
      : 'Nenhuma planilha homologada selecionada.');

    const filtered = rows.filter(item => {
      if (filter !== 'todos' && getStatus(item, today) !== filter) return false;
      const info = [
        item.dados?.fornecedor, item.descricao, item.dados?.categoria,
        item.data_evento, item.dados?.linha_original, item.codigo_origem
      ].join(' ').toLocaleLowerCase('pt-BR');
      return info.includes(search);
    });
    const tbody = el('fin-homolog-rows');
    if (tbody) {
      tbody.innerHTML = filtered.length ? filtered.map(item => {
        const supplier = item.dados?.fornecedor || item.descricao || 'Não informado';
        const detail = item.descricao && item.descricao !== supplier ? item.descricao : '';
        return '<tr>' +
          '<td><span class="row-main">' + escapeHTML(dateBR(item.data_evento)) + '</span></td>' +
          '<td><span class="row-main">' + escapeHTML(supplier) + '</span>' +
          (detail ? '<span class="row-sub">' + escapeHTML(detail) + '</span>' : '') + '</td>' +
          '<td>' + escapeHTML(item.dados?.categoria || 'Não informada') + '</td>' +
          '<td class="money" title="Não informado na aba ABERTOS FLUXO">—</td>' +
          '<td class="money" title="Não informado na aba ABERTOS FLUXO">—</td>' +
          '<td class="money"><strong>' + money(item.valor) + '</strong></td>' +
          '<td>' + statusHTML(item, today) + '</td>' +
          '<td><span class="row-sub">ABERTOS FLUXO · linha ' + escapeHTML(item.linha_excel) + '</span></td>' +
          '</tr>';
      }).join('') : '<tr><td colspan="8" class="empty">' +
        (rows.length ? 'Nenhum compromisso corresponde aos filtros.' : 'Nenhuma conta em aberto registrada na cópia homologada.') +
        '</td></tr>';
    }
    write('fin-homolog-shown', filtered.length + ' de ' + rows.length + ' compromisso(s) · somente leitura');
  }

  async function refresh() {
    if (ongoing) return ongoing;
    ongoing = (async () => {
      write('fin-homolog-status', 'Consultando o lote homologado...');
      try {
        if (typeof db === 'undefined' || !db) throw Error('Conexão com o Supabase indisponível.');
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError || !auth?.user) throw Error('Faça login para consultar a homologação.');

        const { data: lot, error: lotError } = await db.from('fin_teste_excel_lotes')
          .select('id,arquivo_nome,esperado_linhas,resumo_excel,criado_em')
          .eq('status', 'conferido').order('criado_em', { ascending: false }).limit(1).maybeSingle();
        if (lotError) throw lotError;
        if (!lot) {
          rows = []; currentLot = null; draw();
          write('fin-homolog-status', 'Nenhuma planilha conferida. Importe o Financeiro Unificado em Importações.');
          return;
        }

        const all = [];
        const pageSize = 500;
        for (let start = 0; start < 10000; start += pageSize) {
          const { data, error } = await db.from('fin_teste_excel_linhas')
            .select('id,lote_id,grupo,linha_excel,codigo_origem,data_evento,descricao,valor,dados')
            .eq('lote_id', lot.id).eq('grupo', 'abertos_fluxo')
            .order('linha_excel', { ascending: true })
            .range(start, start + pageSize - 1);
          if (error) throw error;
          all.push(...(data || []));
          if ((data || []).length < pageSize) break;
          if (start + pageSize >= 10000) throw Error('Limite de 10.000 compromissos excedido.');
        }
        const expected = lot.resumo_excel?.grupos?.abertos_fluxo;
        const sumCents = all.reduce((sum, item) => sum + Math.round(Number(item.valor) * 100), 0);
        if (!expected || all.length !== Number(expected.quantidade) ||
            sumCents !== Math.round(Number(expected.soma) * 100)) {
          throw Error('Divergência entre ABERTOS FLUXO e o resumo da homologação. Confira o lote antes de utilizar os dados.');
        }
        currentLot = lot;
        rows = all;
        draw();
        write('fin-homolog-status', 'Conferido: ' + rows.length + ' compromissos e ' + money(sumCents / 100) +
          '. Nenhuma baixa ou movimentação foi gerada.');
      } catch (error) {
        currentLot = null; rows = []; draw();
        write('fin-homolog-status', 'Não foi possível atualizar Contas a Pagar (Teste): ' + (error.message || error));
      }
    })();
    try { await ongoing; } finally { ongoing = null; }
  }

  function init() {
    if (!el('fin-homolog-rows')) return;
    el('fin-homolog-search')?.addEventListener('input', draw);
    el('fin-homolog-filter')?.addEventListener('change', draw);
    el('fin-homolog-refresh')?.addEventListener('click', refresh);
    document.querySelectorAll('[data-view="payables"]').forEach(button =>
      button.addEventListener('click', () => { refresh().catch(() => {}); }));
    if (!document.querySelector('[data-view-panel="payables"]')?.hidden) refresh().catch(() => {});
  }
  window.frHomologPayablesUI = { refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

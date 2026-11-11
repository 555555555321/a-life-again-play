#!/usr/bin/env node
// Parse data/standing_points.csv and apply x / floor_y onto a cast member
// or a DEV-screen version. Works in the browser and in node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StandingPoints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parse(text) {
    if (text == null) return [];
    const lines = String(text).split(/\r?\n/);
    let header = null;
    const rows = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(',').map((s) => s.trim());
      if (!header) {
        header = cols;
        continue;
      }
      const rec = {};
      header.forEach((k, i) => { rec[k] = cols[i] == null ? '' : cols[i]; });
      rec.x = Number(rec.x);
      rec.floor_y = Number(rec.floor_y);
      rec.day_B_excl_pct = Number(rec.day_B_excl_pct);
      if (!rec.group_id || !Number.isFinite(rec.x)) continue;
      rows.push(rec);
    }
    return rows;
  }

  function lookup(rows, groupId) {
    if (!groupId || !rows) return null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].group_id === groupId) return rows[i];
    }
    return null;
  }

  // pending_redraw / pending_scene are recorded only; do not move the cast.
  function isPendingStatus(status) {
    return status === 'pending_redraw' || status === 'pending_scene';
  }

  function warnPendingIfDev(row) {
    let dev = false;
    try {
      if (typeof DEV !== 'undefined') dev = !!DEV;
      else if (typeof location !== 'undefined' && typeof URLSearchParams !== 'undefined') {
        const qs = new URLSearchParams(location.search || '');
        dev = qs.has('dev') && qs.get('dev') !== '0';
      }
    } catch (_) {}
    if (!dev) return;
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('StandingPoints: not applying standing_group "' + row.group_id + '" because status is ' + row.status);
    }
  }

  function applyToCastMember(member, rows) {
    if (!member) return member;
    const id = member.standing_group || member.standingGroup;
    const row = lookup(rows, id);
    if (!row) return member;
    if (isPendingStatus(row.status)) {
      warnPendingIfDev(row);
      return member;
    }
    const out = Object.assign({}, member);
    out.x = row.x;
    if (Number.isFinite(row.floor_y)) {
      out.feet = row.floor_y;
      out.floor_y = row.floor_y;
    }
    out._standing_group = row.group_id;
    out._standing_source = row.source_report;
    out._standing_status = row.status;
    return out;
  }

  function applyToVersion(version, groupId, rows) {
    const row = lookup(rows, groupId);
    if (!row || !version) return version;
    if (isPendingStatus(row.status)) {
      warnPendingIfDev(row);
      return version;
    }
    const out = Object.assign({}, version);
    out.x = row.x;
    if (Number.isFinite(row.floor_y)) out.feet = row.floor_y;
    out.standing_group = groupId;
    return out;
  }

  const api = {
    parse,
    lookup,
    applyToCastMember,
    applyToVersion,
    rows: [],
    install(rows) {
      api.rows = rows || [];
      return api.rows;
    },
  };
  return api;
});

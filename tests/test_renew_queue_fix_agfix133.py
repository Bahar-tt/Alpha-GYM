"""Frontend build assertions for the renewals queue id-normalization fix (AGFIX133)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import deploy_renew_queue_fix_agfix133 as deploy  # noqa: E402


def test_pending_queue_matches_renewed_ids_regardless_of_type():
    text = deploy.build_frontend()
    assert "C=new Set(d.map(String))" in text
    assert "C.add(String(G.member_id))" in text
    assert "!C.has(String(Z.id))" in text
    assert "[o,d,agServerRenewals]" in text


def test_archive_reads_and_writes_use_string_ids():
    text = deploy.build_frontend()
    assert "new Set(Kt(Zl,[]).map(String))" in text
    assert "C.has(String(g.id))" in text
    assert "js(Zl,[...agArc,String(agQuick.id)])" in text
    assert "js(Zl,[...agArc,String(v.id)])" in text


def test_index_points_to_new_immutable_asset():
    assert 'src="/assets/index-AGFIX133.js"' in deploy.build_index()
    assert "index-AGFIX132.js" not in deploy.build_index()

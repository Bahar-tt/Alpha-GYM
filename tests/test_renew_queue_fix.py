"""Frontend build assertions for the renewals pending-queue fix (AGFIX132)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import deploy_renew_queue_fix_agfix132 as deploy  # noqa: E402


def test_pending_queue_excludes_renewed_member_ids():
    text = deploy.build_frontend()
    assert "for(const G of agServerRenewals){" in text
    assert "C.add(G.member_id)" in text
    assert "[o,d,agServerRenewals]" in text
    assert text.count("if(!agArc.includes(") == 2


def test_index_points_to_new_immutable_asset():
    assert 'src="/assets/index-AGFIX132.js"' in deploy.build_index()
    assert "index-AGFIX131.js" not in deploy.build_index()

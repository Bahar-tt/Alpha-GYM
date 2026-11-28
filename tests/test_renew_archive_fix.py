"""Frontend build assertions for the renewals archive fix (AGFIX130)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import deploy_renew_archive_fix_agfix130 as deploy  # noqa: E402


def test_both_renewal_paths_archive_the_member():
    text = deploy.build_frontend()
    assert text.count("if(!agArc.includes(") == 2
    assert "js(Zl,[...agArc,agQuick.id])" in text
    assert "js(Zl,[...agArc,v.id])" in text
    assert "alpha_gym_archived_members" in text


def test_index_points_to_new_immutable_asset():
    assert 'src="/assets/index-AGFIX130.js"' in deploy.build_index()
    assert "index-AGFIX129.js" not in deploy.build_index()

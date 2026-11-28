"""Frontend build assertions for the member-info-completion feature (AGFIX134)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import deploy_member_info_agfix134 as deploy  # noqa: E402

RULES_JS = deploy.HELPERS.split("const agInfoSeen")[0]


def run_js(code: str) -> str:
    proc = subprocess.run(["node", "-e", code], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr
    return proc.stdout.strip()


def test_birth_rules_values():
    code = RULES_JS + r"""
const assert=(cond,msg)=>{if(!cond){console.error("FAIL "+msg);process.exit(1)}};
const has=v=>agBirthIssue(v)!=="";
assert(has(""), "empty");
assert(has("0"), "zero");
assert(has("1310/01/01"), "age95");
assert(!has("1370/05/12"), "age35 ok");
assert(!has("1360/01/01"), "age45 ok");
assert(!has("1335/01/01"), "age70 boundary ok");
assert(has("1334/01/01"), "age71 bad");
assert(!has("1399/01/01"), "age6 boundary ok");
assert(has("1400/01/01"), "age5 bad");
assert(has("95"), "two-digit 95 above 70 -> bad");
assert(!has("70"), "two-digit 70 ok");
assert(has("71"), "two-digit 71 bad");
assert(has("5"), "two-digit 5 bad");
assert(!has("6"), "two-digit 6 ok");
assert(!has("1988-05-27"), "gregorian ok");
assert(has("1950-01-01"), "gregorian old");
assert(has("garbage"), "garbage");
console.log("BIRTH_OK");
"""
    assert run_js(code) == "BIRTH_OK"


def test_phone_rules():
    code = RULES_JS + r"""
const assert=(cond,msg)=>{if(!cond){console.error("FAIL "+msg);process.exit(1)}};
const has=(v,c)=>agPhoneIssue(v,c)!=="";
assert(has("",""), "empty");
assert(has("0",""), "zero");
assert(has("696","696"), "same-as-code");
assert(!has("09121234567","696"), "mobile ok");
assert(!has("02133445566","696"), "landline ok");
assert(has("091212345","696"), "short");
assert(has("091212345678","696"), "long");
assert(has("abc","696"), "alpha");
console.log("PHONE_OK");
"""
    assert run_js(code) == "PHONE_OK"


def test_build_contains_feature():
    text = deploy.build_frontend()
    for must in ["agInfoFixModal", "agInfoPanel", "agInfoAutoCheck", "agBirthIssue", "agPhoneIssue"]:
        assert must in text
    assert text.count("agInfoPanel") >= 2
    assert "agSetInfoAuto" in text


def test_index_points_to_new_immutable_asset():
    assert 'src="/assets/index-AGFIX136.js"' in deploy.build_index()
    assert "index-AGFIX135.js" not in deploy.build_index()

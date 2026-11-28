"""Frontend build assertions for AGFIX137 (compact banner, modal list, Jalali calendar)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import deploy_member_info_agfix137 as deploy  # noqa: E402


def run_js(code: str) -> str:
    proc = subprocess.run(["node", "-e", code], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr
    return proc.stdout.strip()


def test_parse_birth_rules():
    helpers = deploy.PANEL_AND_HELPERS_NEW.split("function agInfoListModal")[0]
    parse_src = helpers[helpers.find("function agParseBirth") :]
    code = (
        "function Jn(s){return{year:1367,month:3,day:6}}\n"
        + parse_src
        + r"""
const assert=(cond,msg)=>{if(!cond){console.error("FAIL "+msg);process.exit(1)}};
assert(agParseBirth("")===null,"empty");
assert(agParseBirth(null)===null,"null");
assert(agParseBirth("1310/01/01").year===1310,"jalali y");
assert(agParseBirth("1310/01/01").month===1,"jalali m");
assert(agParseBirth("1370/05/12").day===12,"jalali d");
assert(agParseBirth("1988-05-27").year===1367,"gregorian via Jn");
assert(agParseBirth("95")===null,"two-digit not a date");
assert(agParseBirth("garbage")===null,"garbage");
console.log("PARSE_OK");
"""
    )
    assert run_js(code) == "PARSE_OK"


def test_build_shape():
    text = deploy.build_frontend()
    assert "agInfoPanel({total,onOpen})" in text
    assert "agInfoListModal" in text
    assert "agParseBirth" in text
    assert 'n.jsx(Jt,{label:"تاریخ تولد"' in text
    assert "min:Fl(Lt(),-840)" in text
    assert "max:Fl(Lt(),-72)" in text
    assert "b1=bdJ?cf(bdJ):\"\"" in text
    assert "F=Array.from({length:110},(S,C)=>x.year-100+C)" in text
    # removed artifacts
    assert "value:bd,onChange:e=>agSetBd" not in text
    assert 'is.join(" • ")' not in text
    assert "rows,total,q,setQ,lim,setLim,onFix}){" not in text
    # old helpers still active for detection + scanner auto dialog
    assert "agInfoAutoCheck" in text
    assert "agInfoFixModal" in text


def test_index_points_to_new_immutable_asset():
    assert 'src="/assets/index-AGFIX137.js"' in deploy.build_index()
    assert "index-AGFIX136.js" not in deploy.build_index()

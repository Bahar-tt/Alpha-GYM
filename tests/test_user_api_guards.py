"""Pytest coverage for the Node guards used by member/personnel APIs.

The backend is Express/Node, so pytest calls a tiny stdin/stdout harness around
backend/userApiGuards.js. No server, DB, network or secret is needed.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts" / "user_api_guards_harness.cjs"


def call_guard(action: str, args):
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not on PATH")
    proc = subprocess.run(
        [node, str(HARNESS)],
        input=json.dumps({"action": action, "args": args}),
        capture_output=True,
        text=True,
        timeout=20,
        cwd=ROOT,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True, payload
    return payload["result"]


def test_validation_error_stays_400():
    out = call_guard("classifyCreateError", {"err": {"status": 400, "message": "نامعتبر"}, "fallbackMessage": "bad"})
    assert out["status"] == 400
    assert out["body"]["error_code"] == "VALIDATION_ERROR"
    assert out["body"]["error"] == "نامعتبر"


@pytest.mark.parametrize(
    "args, expected_status, expected_code",
    [
        ({"err": {"code": "SQLITE_CONSTRAINT_UNIQUE"}}, 409, "DUPLICATE"),
        ({"err": {"message": "کد عضویت قبلاً استفاده شده است"}}, 409, "DUPLICATE"),
        ({"err": {"code": "SQLITE_BUSY"}}, 422, "DB_ERROR"),
        ({"err": {}}, 500, "INTERNAL_ERROR"),
    ],
)
def test_create_error_mapping(args, expected_status, expected_code):
    out = call_guard("classifyCreateError", args)
    assert out["status"] == expected_status
    assert out["body"]["error_code"] == expected_code


def test_member_fingerprint_enrolled_wins_over_pending():
    out = call_guard("buildFingerprintSummary", {
        "subject_type": "member",
        "member": {"id": 12, "member_code": "2077", "legacy_person_id": None},
        "credential": {"id": 3, "value": "800077"},
        "pending": {"id": 9, "foh_member_id": "900012", "expires_at": "2026-11-29 00:00:00"},
    })
    assert out["status"] == "enrolled"
    assert out["credential_value"] == "800077"
    assert out["foh_member_id"] == "800077"
    assert out["subject_type"] == "member"


def test_member_pending_has_no_attendee_credential():
    out = call_guard("buildFingerprintSummary", {
        "subject_type": "member",
        "member": {"id": 590, "member_code": "1390", "legacy_person_id": None},
        "credential": None,
        "pending": {"id": 71, "foh_member_id": "900590", "expires_at": "2026-11-29 00:00:00"},
    })
    assert out["status"] == "pending"
    assert out["credential_value"] is None
    assert out["foh_member_id"] == "900590"
    assert out["enrollment_id"] == 71


def test_personnel_enrolled_and_pending():
    enrolled = call_guard("buildFingerprintSummary", {
        "subject_type": "personnel",
        "personnel": {"id": 21, "fingerprint_id": "800021"},
        "pending": None,
    })
    assert enrolled["status"] == "enrolled"
    assert enrolled["foh_member_id"] == "800021"

    pending = call_guard("buildFingerprintSummary", {
        "subject_type": "personnel",
        "personnel": {"id": 8, "fingerprint_id": None},
        "pending": {"id": 69, "foh_member_id": "800008", "expires_at": "2026-11-29 00:00:00"},
    })
    assert pending["status"] == "pending"
    assert pending["credential_value"] is None
    assert pending["foh_member_id"] == "800008"


def test_personnel_not_enrolled_has_professional_persian_message():
    out = call_guard("buildFingerprintSummary", {
        "subject_type": "personnel",
        "personnel": {"id": 9, "fingerprint_id": None},
        "pending": None,
    })
    assert out["status"] == "not_enrolled"
    assert out["message_code"] == "FINGERPRINT_NOT_ENROLLED"
    assert out["tone"] == "warning"
    assert "پرسنل" in out["message"]
    assert "800009" in out["message"]
    assert "ثبت نشده" in out["message"]


def test_enrolled_and_pending_messages():
    ready = call_guard("fingerprintMessage", {
        "summary": {"status": "enrolled"},
        "subjectType": "personnel",
    })
    assert ready["message_code"] == "FINGERPRINT_READY"
    assert ready["tone"] == "success"

    pending = call_guard("fingerprintMessage", {
        "summary": {"status": "pending"},
        "subjectType": "personnel",
    })
    assert pending["message_code"] == "FINGERPRINT_PENDING"
    assert "سنسور" in pending["message"]


def test_missing_summary_message_is_safe():
    out = call_guard("fingerprintMessage", {"summary": None, "subjectType": "personnel"})
    assert out["message_code"] == "FINGERPRINT_UNAVAILABLE"
    assert "دوباره تلاش" in out["message"]


def test_missing_subject_returns_null():
    assert call_guard("buildFingerprintSummary", {"subject_type": "member", "member": None}) is None
    assert call_guard("buildFingerprintSummary", {"subject_type": "personnel", "personnel": None}) is None


def test_enroll_failure_missing_returns_404():
    out = call_guard("decideEnrollFailure", {"row": None, "nowText": "2026-11-28 08:00:00"})
    assert out["status"] == 404
    assert out["body"]["error_code"] == "ENROLLMENT_NOT_FOUND"


def test_enroll_failure_completed_is_conflict_not_overwritten():
    out = call_guard("decideEnrollFailure", {
        "row": {"id": 5, "status": "completed", "expires_at": "2026-11-29 00:00:00"},
        "nowText": "2026-11-28 08:00:00",
    })
    assert out["status"] == 409
    assert out["action"] == "none"
    assert out["body"]["status"] == "completed"


def test_enroll_failure_expired_is_410_with_expire_action():
    out = call_guard("decideEnrollFailure", {
        "row": {"id": 6, "status": "pending", "expires_at": "2026-11-28 07:00:00"},
        "nowText": "2026-11-28 08:00:00",
    })
    assert out["status"] == 410
    assert out["action"] == "expire"
    assert out["body"]["error_code"] == "ENROLLMENT_EXPIRED"


def test_enroll_failure_fresh_pending_cleanly_fails():
    out = call_guard("decideEnrollFailure", {
        "row": {"id": 7, "status": "pending", "expires_at": "2026-11-29 07:00:00"},
        "nowText": "2026-11-28 08:00:00",
    })
    assert out["status"] == 200
    assert out["action"] == "fail"
    assert out["body"] == {"ok": True, "enrollment_id": 7}
